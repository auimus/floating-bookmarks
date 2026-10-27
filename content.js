(() => {
  if (document.getElementById("floating-bookmarks-extension")) return;
  const FB = globalThis.FloatingBookmarks;
  const chrome = globalThis.FloatingBookmarksPreviewAPI || globalThis.chrome;
  const host = document.createElement("div");
  host.id = "floating-bookmarks-extension";
  host.style.cssText = "all:initial!important;position:fixed!important;top:0!important;left:0!important;width:100%!important;height:0!important;z-index:2147483647!important;pointer-events:none!important;color-scheme:normal!important";
  host.style.setProperty("font", '13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif', "important");
  host.style.setProperty("color", "var(--fg)", "important");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = globalThis.FloatingBookmarksStyles;
  shadow.append(style);
  const paths = {
    folder: '<path d="M2.5 6a2 2 0 0 1 2-2h3.3l2 2h5.7a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/>',
    link: '<circle cx="10" cy="10" r="8"/><path d="M2 10h16M10 2c4 4 4 12 0 16-4-4-4-12 0-16z"/>',
    search: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/>',
    pin: '<path d="m7 3 7 0-1 5 3 3v2H5v-2l3-3zM10.5 13v5"/>',
    settings: '<path d="M3 5h14M3 10h14M3 15h14"/><circle cx="7" cy="5" r="2" fill="var(--bg)"/><circle cx="13" cy="10" r="2" fill="var(--bg)"/><circle cx="8" cy="15" r="2" fill="var(--bg)"/>',
    arrow: '<path d="m8 5 5 5-5 5"/>',
    all: '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="12" y="3" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><rect x="12" y="12" width="5" height="5" rx="1"/>',
    close: '<path d="m5 5 10 10M15 5 5 15"/>',
    notice: '<circle cx="10" cy="10" r="7.5"/><path d="M10 6v5M10 14h.01"/>'
  };
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = paths[name]; // Only static, extension-owned paths; never bookmark data.
    return svg;
  }
  function bookmarkGlyph(node) {
    const glyph = el("span", "glyph");
    const fallback = icon(node.url ? "link" : "folder");
    glyph.append(fallback);
    if (!node.url) return glyph;
    try {
      const page = new URL(node.url);
      if (!["https:", "http:"].includes(page.protocol)) return glyph;
      const url = new URL(chrome.runtime.getURL("/_favicon/"));
      url.searchParams.set("pageUrl", node.url);
      url.searchParams.set("size", "32");
      const image = el("img", "favicon");
      image.alt = ""; image.width = 16; image.height = 16;
      image.draggable = false; image.hidden = true; image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("load", () => {
        if (!image.naturalWidth) return;
        image.hidden = false; fallback.setAttribute("hidden", "");
      }, { once: true });
      image.addEventListener("error", () => {
        image.remove(); fallback.removeAttribute("hidden");
      }, { once: true });
      glyph.append(image); image.src = url.href;
    } catch { /* Keep the local glyph if the URL or extension context is unavailable. */ }
    return glyph;
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  async function request(type, data = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...data });
    if (!response?.ok) throw new Error(response?.error || "扩展连接已断开，请刷新网页。");
    return response;
  }
  const trigger = el("div", "trigger");
  trigger.append(el("span", "hint"));
  trigger.title = "浮签 · 鼠标靠近展开，Alt+Shift+B 切换";
  const bar = el("nav", "bar");
  bar.setAttribute("aria-label", "悬浮书签栏");
  const list = el("div", "bookmarks");
  const selection = el("span", "bookmark-selection"); selection.setAttribute("aria-hidden", "true");
  list.append(selection);
  const tools = el("div", "tools");
  bar.append(list, tools);
  shadow.append(trigger, bar);
  document.documentElement.append(host);

  let prefs = FB.normalizeSettings(), tree = [], index = [], panels = [];
  let showTimer, hideTimer, toastTimer, shown = false, keyboardHeld = false, ready = false;
  let lastFocused, toast;
  const media = matchMedia("(prefers-color-scheme: light)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const motion = globalThis.FloatingBookmarksMotion.create({ shadow, bar, reducedMotion, getSettings: () => prefs, onBarHover: () => clearTimeout(hideTimer), onBarLeave: scheduleHide });
  function theme() { host.dataset.theme = prefs.theme === "system" ? (media.matches ? "light" : "dark") : prefs.theme; }
  media.addEventListener("change", theme);
  function isDisabled() { return !prefs.enabled || prefs.excludedHosts.includes(location.hostname.toLowerCase()) || !!document.fullscreenElement; }
  function applySettings(next) {
    prefs = FB.normalizeSettings(next);
    theme();
    host.dataset.surface = prefs.surface;
    host.dataset.showHint = String(prefs.showHint);
    host.style.setProperty("--trigger", `${prefs.triggerHeight}px`);
    host.style.setProperty("--bar-top", `${prefs.topOffset}px`);
    host.style.setProperty("--menu-gap", `${prefs.menuGap}px`);
    host.style.setProperty("--selection-move", `${prefs.openDuration * 280 / 440}ms`);
    host.style.setProperty("--selection-in", `${prefs.openDuration * 120 / 440}ms`);
    host.style.setProperty("--selection-out", `${prefs.closeDuration * 120 / 220}ms`);
    host.hidden = isDisabled();
    // The host has important inline positioning; explicitly override display as well.
    host.style.setProperty("display", isDisabled() ? "none" : "block", "important");
    pinButton.setAttribute("aria-pressed", String(prefs.pinned));
    pinButton.title = prefs.pinned ? "取消固定" : "固定显示";
    pinButton.setAttribute("aria-label", pinButton.title);
    if (isDisabled()) collapse();
    else if (prefs.pinned) reveal();
    else if (shown) scheduleHide();
    if (ready) renderBookmarks();
  }
  function reveal() {
    if (isDisabled()) return;
    clearTimeout(showTimer); clearTimeout(hideTimer);
    const opening = !shown;
    shown = true;
    host.setAttribute("data-open", "");
    if (opening) motion.enterBar();
  }
  function syncSelection() {
    const anchor = panels[0]?.anchor;
    if (!anchor?.classList.contains("bookmark") || anchor.parentElement !== list) {
      selection.removeAttribute("data-visible"); return;
    }
    const first = !selection.hasAttribute("data-visible");
    if (first) selection.style.transition = "none";
    selection.style.transform = `translateX(${anchor.offsetLeft}px)`;
    selection.style.width = `${anchor.offsetWidth}px`;
    if (first) { selection.getBoundingClientRect(); selection.style.removeProperty("transition"); }
    selection.setAttribute("data-visible", "");
  }
  function closePanels(from = 0, updateSelection = true, animate = false) {
    const closing = panels.splice(from);
    const retiring = new Set();
    for (const [offset, item] of closing.entries()) {
      motion.cancelPanel(from + offset);
      if (animate && motion.leavePanel(item.panel, item.anchor, from + offset)) retiring.add(item.panel);
    }
    for (const item of closing) {
      if (!retiring.has(item.panel)) {
        for (const animation of item.panel.getAnimations({ subtree: true })) animation.cancel();
        item.panel.remove();
      }
      item.anchor?.setAttribute("aria-expanded", "false");
    }
    if (updateSelection) syncSelection();
  }
  function collapse(force = false) {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    const closingBar = shown && (force || !prefs.pinned) && !isDisabled();
    const box = closingBar ? bar.getBoundingClientRect() : null;
    if (isDisabled()) motion.clear();
    if (closingBar) motion.leaveBar(box);
    closePanels(0, true, !isDisabled());
    keyboardHeld = false;
    shown = !force && prefs.pinned && !isDisabled();
    host.toggleAttribute("data-open", shown);
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    if (chrome.preview?.keepOpen) return;
    if (!prefs.pinned && !keyboardHeld) hideTimer = setTimeout(() => {
      // Recheck the pointer: a queued leave event must not hide a surface it has re-entered.
      if (trigger.matches(":hover") || bar.matches(":hover") || panels.some(({ panel }) => panel.matches(":hover"))) return;
      collapse();
    }, prefs.hideDelay);
  }
  trigger.addEventListener("pointerenter", () => {
    clearTimeout(hideTimer);
    showTimer = setTimeout(reveal, prefs.hoverDelay);
  });
  trigger.addEventListener("pointerleave", () => { clearTimeout(showTimer); scheduleHide(); });
  trigger.addEventListener("click", reveal);
  bar.addEventListener("pointerenter", () => { clearTimeout(hideTimer); });
  bar.addEventListener("pointerleave", scheduleHide);
  list.addEventListener("wheel", event => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && list.scrollWidth > list.clientWidth) {
      list.scrollLeft += event.deltaY; event.preventDefault();
    }
  }, { passive: false });
  function tool(name, title, action) {
    const button = el("button", "icon");
    button.type = "button"; button.title = title; button.setAttribute("aria-label", title);
    button.append(icon(name)); button.addEventListener("click", action);
    tools.append(button); return button;
  }
  const allButton = tool("all", "全部书签", () => toggleFolder({ children: FB.roots(tree) }, allButton, 0));
  allButton.setAttribute("aria-haspopup", "menu");
  const searchButton = tool("search", "搜索书签", openSearch);
  const pinButton = tool("pin", "固定显示", async () => {
    pinButton.disabled = true;
    try { applySettings((await request("SET_SETTINGS", { patch: { pinned: !prefs.pinned } })).settings); }
    catch (error) { report(error.message); }
    finally { pinButton.disabled = false; }
  });
  tool("settings", "设置", () => request("OPEN_OPTIONS").catch(error => report(error.message)));
  function report(message) {
    toast?.remove(); clearTimeout(toastTimer);
    toast = el("div", "toast"); toast.setAttribute("role", "status");
    const symbol = icon("notice"); symbol.classList.add("notice-icon");
    const dismiss = el("button", "dismiss"); dismiss.type = "button"; dismiss.setAttribute("aria-label", "关闭提示"); dismiss.append(icon("close"));
    const current = toast;
    dismiss.addEventListener("click", () => { clearTimeout(toastTimer); current.remove(); });
    toast.append(symbol, el("span", "message", message), dismiss); shadow.append(toast);
    toastTimer = setTimeout(() => current.remove(), 5000);
  }
  function bookmarkButton(node, className, depth) {
    const button = el("button", `${className} ${node.url ? "link" : "folder"}`);
    button.type = "button";
    const glyph = bookmarkGlyph(node);
    button.append(glyph, el("span", "label", node.title || (node.url ? node.url : "未命名文件夹")));
    button.title = node.url ? `${node.title}\n${node.url}` : (node.title || "文件夹");
    if (className === "row") button.setAttribute("role", "menuitem");
    if (!node.url) {
      button.setAttribute("aria-haspopup", "menu"); button.setAttribute("aria-expanded", "false");
      if (className === "row") { const arrow = icon("arrow"); arrow.classList.add("arrow"); button.append(arrow); }
      button.addEventListener("click", () => toggleFolder(node, button, depth));
      button.addEventListener("pointerenter", () => {
        if (panels.length && panels[depth]?.anchor !== button) openFolder(node, button, depth);
      });
    } else {
      button.addEventListener("click", event => openBookmark(node, event));
      button.addEventListener("auxclick", event => { if (event.button === 1) { event.preventDefault(); openBookmark(node, event); } });
      button.addEventListener("pointerenter", () => { if (panels.length > depth) closePanels(depth); });
    }
    button.addEventListener("keydown", event => {
      if (event.key === "ArrowRight" && !node.url || event.key === "ArrowDown" && className === "bookmark" && !node.url) {
        event.preventDefault(); openFolder(node, button, depth); focusFirst(panels[depth]?.panel);
      }
    });
    return button;
  }
  async function openBookmark(node, event) {
    try {
      await request("OPEN_BOOKMARK", { id: node.id, newTab: event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey,
        active: event.button !== 1 && (!(event.ctrlKey || event.metaKey) || event.shiftKey) });
      collapse();
    } catch (error) { report(error.message); }
  }
  function renderBookmarks() {
    motion.cancelPanel(0);
    closePanels();
    selection.style.transition = "none";
    selection.style.width = "0px"; selection.style.transform = "translateX(0)";
    selection.getBoundingClientRect(); selection.style.removeProperty("transition");
    list.replaceChildren(selection);
    const root = FB.selectRoot(tree, prefs.rootId);
    for (const node of root.children || []) list.append(bookmarkButton(node, "bookmark", 0));
    if (!root.children?.length) list.append(el("span", "empty", "此文件夹还没有书签"));
  }
  function place(panel, anchor, depth) {
    const box = anchor.getBoundingClientRect();
    const width = panel.getBoundingClientRect().width;
    let left = depth ? box.right + 5 : box.left;
    if (depth && left + width > innerWidth - 8) left = box.left - width - 5;
    left = Math.max(8, Math.min(left, innerWidth - width - 8));
    const height = panel.getBoundingClientRect().height;
    // Use the final layout position, even while the bar is sliding into view.
    const minTop = prefs.topOffset + bar.offsetHeight + prefs.menuGap;
    const top = Math.max(minTop, Math.min(depth ? box.top : minTop, innerHeight - height - 8));
    panel.style.left = `${left}px`; panel.style.top = `${top}px`;
  }
  function attachPanel(panel, anchor, depth) {
    const previous = panels[depth]?.panel;
    // Read the current frame before cancellation, including an interrupted transition.
    const previousBounds = previous?.getBoundingClientRect();
    const previousClip = previous && getComputedStyle(previous).clipPath;
    closePanels(depth, false);
    const body = el("div", "panel-body"); body.setAttribute("role", "presentation"); body.append(...panel.childNodes); panel.append(body);
    if (previousBounds) panel.style.animation = "none";
    shadow.append(panel); panels.push({ panel, anchor });
    anchor.setAttribute("aria-expanded", "true"); place(panel, anchor, depth);
    syncSelection();
    if (previousBounds) motion.switchPanel(panel, body, previousBounds, previousClip);
    else motion.enterPanel(panel, anchor, depth);
    panel.addEventListener("pointerenter", () => clearTimeout(hideTimer));
    panel.addEventListener("pointerleave", scheduleHide);
    panel.addEventListener("keydown", event => {
      const buttons = [...panel.querySelectorAll('[role="menuitem"]')];
      const current = buttons.indexOf(shadow.activeElement);
      let target;
      if (event.key === "ArrowDown") target = buttons[(current + 1) % buttons.length];
      if (event.key === "ArrowUp") target = current < 0 ? buttons.at(-1) : buttons[(current - 1 + buttons.length) % buttons.length];
      if (event.key === "Home" && event.target.tagName !== "INPUT") target = buttons[0];
      if (event.key === "End" && event.target.tagName !== "INPUT") target = buttons.at(-1);
      if (target) { event.preventDefault(); target.focus(); }
      if (event.key === "ArrowLeft" && depth > 0) { event.preventDefault(); closePanels(depth); anchor.focus(); }
    });
  }
  function toggleFolder(node, anchor, depth) {
    if (panels[depth]?.anchor === anchor) closePanels(depth, true, true);
    else openFolder(node, anchor, depth);
  }
  function openFolder(node, anchor, depth) {
    const panel = el("div", "panel"); panel.setAttribute("role", "menu"); panel.setAttribute("aria-label", node.title || "全部书签");
    const heading = el("div", "menu-heading"); heading.setAttribute("role", "presentation");
    heading.append(el("span", "", node.title || "全部书签"), el("span", "menu-total", String(node.children?.length || 0)));
    panel.append(heading);
    for (const child of node.children || []) panel.append(bookmarkButton(child, "row", depth + 1));
    if (!node.children?.length) { const empty = el("div", "empty"); empty.append(icon("folder"), el("span", "", "空文件夹")); panel.append(empty); }
    attachPanel(panel, anchor, depth);
  }
  function focusFirst(panel) { panel?.querySelector("button")?.focus(); }
  function openSearch() {
    reveal(); keyboardHeld = true;
    const panel = el("section", "panel search-panel"); panel.setAttribute("aria-label", "搜索书签");
    const wrap = el("div", "search-wrap"), input = el("input");
    input.type = "search"; input.placeholder = "搜索名称、网址或文件夹"; input.setAttribute("aria-label", "搜索所有书签");
    const clear = el("button", "search-clear"); clear.type = "button"; clear.hidden = true;
    clear.setAttribute("aria-label", "清空搜索"); clear.append(icon("close"));
    clear.addEventListener("click", () => { input.value = ""; input.dispatchEvent(new Event("input")); input.focus(); });
    wrap.append(icon("search"), input, clear, el("kbd", "keycap", "Esc"));
    const results = el("div"), count = el("div", "count", `全部书签 · ${index.length}`);
    panel.append(wrap, count, results);
    input.addEventListener("input", () => {
      results.replaceChildren();
      clear.hidden = !input.value;
      const found = FB.search(index, input.value);
      count.textContent = input.value.trim() ? (found.length >= 100 ? "前 100 项 · 可增加关键词筛选" : `${found.length} 项结果`) : `全部书签 · ${index.length}`;
      for (const node of found) {
        const button = bookmarkButton(node, "row", 1);
        button.querySelector(".label").append(el("small", "description", node.path || node.url));
        results.append(button);
      }
      if (input.value.trim() && !found.length) { const empty = el("div", "empty"); empty.append(icon("search"), el("span", "", "没有匹配的书签")); results.append(empty); }
      place(panel, searchButton, 0);
    });
    attachPanel(panel, searchButton, 0); input.focus();
  }
  shadow.addEventListener("focusin", () => { keyboardHeld = true; clearTimeout(hideTimer); });
  shadow.addEventListener("focusout", () => {
    queueMicrotask(() => { if (!shadow.activeElement) { keyboardHeld = false; scheduleHide(); } });
  });
  shadow.addEventListener("pointerdown", event => {
    keyboardHeld = false;
    // Mouse clicks should not leave the bar pinned by keyboard focus.
    if (event.target.closest("button")) event.preventDefault();
  });
  shadow.addEventListener("keydown", event => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault(); collapse(); shadow.activeElement?.blur(); lastFocused?.focus?.();
    }
  });
  document.addEventListener("pointerdown", event => {
    if (shown && !event.composedPath().includes(host)) collapse();
  }, true);
  document.addEventListener("fullscreenchange", () => applySettings(prefs));
  window.addEventListener("resize", () => { motion.clear(); closePanels(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) applySettings(changes.settings.newValue);
  });
  chrome.runtime.onMessage.addListener(message => {
    if (message.type === "BOOKMARKS_CHANGED") load();
    if (message.type === "PREVIEW_VISIBILITY" && chrome.preview) {
      if (message.open) reveal();
      else collapse(message.force === true);
    }
    if (message.type === "TOGGLE_BAR") {
      if (shown) collapse();
      else { lastFocused = document.activeElement; reveal(); keyboardHeld = true; (list.querySelector("button") || searchButton).focus(); }
    }
  });
  let loadVersion = 0;
  async function load() {
    const version = ++loadVersion;
    try {
      const response = await request("GET_STATE");
      if (version !== loadVersion) return;
      tree = response.tree; index = FB.flatten(tree); ready = true; applySettings(response.settings);
    } catch (error) {
      list.replaceChildren(el("span", "empty", "书签读取失败，请刷新网页重试"));
      report(error.message);
    }
  }
  load();
})();
