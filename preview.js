// This adapter belongs only to preview.html. Saves and navigation never reach Chrome.
(() => {
  const FB = globalThis.FloatingBookmarks;
  const listeners = [];
  const triggerGuide = document.createElement("div");
  triggerGuide.id = "trigger-guide"; triggerGuide.className = "trigger-guide";
  triggerGuide.setAttribute("aria-hidden", "true"); triggerGuide.hidden = true;
  let state = { tree: [], settings: FB.normalizeSettings() }, revision = 0, noticeTimer, replayTimer;
  let initialized = false, mode = "appearance", viewport;
  const renderer = () => document.getElementById("floating-bookmarks-extension");
  async function settle(shadow) {
    await Promise.all(shadow.getAnimations().map(animation => animation.finished.catch(() => {})));
  }
  async function show(current, active = -1) {
    const host = renderer(), shadow = host?.shadowRoot;
    if (!shadow || !state.settings.enabled || current !== revision) return;
    // Use the webpage's trigger and wait for its complete pull-out before showing a menu.
    if (!host.hasAttribute("data-open")) shadow.querySelector(".trigger").click();
    await settle(shadow);
    if (current !== revision || mode !== "appearance" || shadow.querySelector(".panel")) return;
    const buttons = [...shadow.querySelectorAll(".bar .bookmark")];
    const folder = buttons[active]?.classList.contains("folder") ? buttons[active] : buttons.find(button => button.classList.contains("folder"));
    (folder || shadow.querySelector('[aria-label="全部书签"]')).click();
  }
  async function replay() {
    clearTimeout(replayTimer);
    const current = ++revision, host = renderer(), shadow = host?.shadowRoot;
    if (!shadow || !state.settings.enabled) return;
    const active = [...shadow.querySelectorAll(".bar .bookmark")].findIndex(button => button.getAttribute("aria-expanded") === "true");
    notify({ type: "PREVIEW_VISIBILITY", open: false, force: true });
    await settle(shadow);
    if (current === revision) await show(current, active);
  }
  function notify(message) { for (const listener of listeners) listener(message); }
  function notice(text) {
    const node = document.getElementById("preview-notice");
    node.textContent = text; node.hidden = false; clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { node.hidden = true; }, 2000);
  }
  globalThis.FloatingBookmarksPreviewAPI = {
    preview: { keepOpen: true },
    storage: { onChanged: { addListener() {} } },
    runtime: {
      getURL: path => globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL(path) : new URL(path, location.href).href,
      onMessage: { addListener: listener => listeners.push(listener) },
      async sendMessage(message) {
        if (message.type === "GET_STATE") return { ok: true, ...state };
        if (message.type === "SET_SETTINGS") {
          notice("请在左侧调整固定显示。");
          return { ok: true, settings: state.settings };
        }
        if (message.type === "OPEN_BOOKMARK") notice("预览中的书签不会打开网页。");
        if (message.type === "OPEN_OPTIONS") notice("在左侧调整设置即可。");
        return { ok: true };
      }
    }
  };
  globalThis.FloatingBookmarksPreview = {
    replay,
    async update(next) {
      const settings = FB.normalizeSettings(next.settings);
      const settingsChanged = JSON.stringify(state.settings) !== JSON.stringify(settings);
      const treeChanged = state.tree !== next.tree, modeChanged = mode !== next.mode;
      const nextViewport = `${innerWidth}x${innerHeight}`, layoutChanged = viewport !== nextViewport;
      viewport = nextViewport;
      const durationChanged = initialized && (settings.openDuration !== state.settings.openDuration || settings.closeDuration !== state.settings.closeDuration);
      const host = renderer(), shadow = host?.shadowRoot;
      const rootChanged = state.settings.rootId !== settings.rootId;
      const active = rootChanged ? -1 : [...(shadow?.querySelectorAll(".bar .bookmark") || [])].findIndex(button => button.getAttribute("aria-expanded") === "true");
      state = { tree: next.tree, settings }; mode = next.mode;
      triggerGuide.style.height = `${state.settings.triggerHeight}px`;
      triggerGuide.hidden = !next.highlightTrigger;
      document.documentElement.append(triggerGuide);
      FloatingBookmarksPreviewAPI.preview.keepOpen = mode === "appearance";
      document.documentElement.dataset.theme = state.settings.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : state.settings.theme;
      document.getElementById("preview-disabled").hidden = state.settings.enabled;
      // Focus, trigger highlighting and ResizeObserver notifications must not restart motion.
      if (initialized && !settingsChanged && !treeChanged && !modeChanged && !layoutChanged) return;
      const current = ++revision;
      initialized = true; clearTimeout(replayTimer);
      document.getElementById("preview-notice").hidden = true;
      if (settingsChanged || treeChanged) notify({ type: "BOOKMARKS_CHANGED" });
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (current !== revision || !shadow) return;
      if (!state.settings.enabled) { document.documentElement.dataset.previewReady = String(current); return; }
      if (mode === "behavior") {
        if (host.hasAttribute("data-open") && !state.settings.pinned) notify({ type: "PREVIEW_VISIBILITY", open: false });
      } else if (durationChanged) {
        replayTimer = setTimeout(() => { if (current === revision) replay(); }, 180);
      } else {
        await show(current, active);
      }
      document.documentElement.dataset.previewReady = String(current);
    }
  };
})();
