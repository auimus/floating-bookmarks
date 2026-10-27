(() => {
  const FB = globalThis.FloatingBookmarks;
  const form = document.getElementById("settings");
  const fields = document.getElementById("fields");
  const status = document.getElementById("status");
  const save = document.getElementById("save");
  const saveLabel = save.querySelector("span");
  const themeOptions = document.querySelector(".theme-options");
  const styleOptions = document.querySelector(".style-options");
  const systemTheme = matchMedia("(prefers-color-scheme: light)");
  const preview = document.getElementById("preview");
  const previewState = document.getElementById("preview-state");
  document.getElementById("extension-version").textContent = `v${chrome.runtime.getManifest().version}`;
  const numberKeys = ["hoverDelay", "hideDelay", "triggerHeight", "topOffset", "menuGap", "openDuration", "closeDuration"];
  const booleanKeys = ["enabled", "pinned", "openNewTab", "showHint"];
  let highlightTrigger = false;
  let tree = [], savedSettings, lastDraft, previewMode = "appearance", previewFrame;
  function draftSettings() {
    const draft = { ...(lastDraft || savedSettings || FB.defaults) };
    for (const key of booleanKeys) draft[key] = form.elements[key].checked;
    for (const key of ["theme", "surface", "rootId"]) draft[key] = form.elements[key].value;
    for (const key of numberKeys) {
      const input = form.elements[key];
      if (input.value !== "" && input.checkValidity()) draft[key] = Number(input.value);
    }
    draft.excludedHosts = form.elements.excludedHosts.value.split(/\s+/).filter(Boolean);
    return FB.normalizeSettings(draft);
  }
  function updatePreview() {
    if (!savedSettings) return;
    const settings = lastDraft = draftSettings();
    const hosts = form.elements.excludedHosts.value.split(/\s+/).filter(Boolean);
    const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings) || !form.checkValidity() || hosts.length > 200 || hosts.some(host => !/^[a-z0-9.-]+$/i.test(host));
    previewState.textContent = dirty ? "未保存" : "已保存";
    previewState.dataset.dirty = String(dirty);
    if (dirty && status.textContent === "已保存") tell("");
    for (const slider of document.querySelectorAll("[data-setting]")) slider.value = settings[slider.dataset.setting];
    for (const [id, key] of [["preview-top", "topOffset"], ["preview-gap", "menuGap"], ["preview-trigger", "triggerHeight"]]) document.getElementById(id).textContent = `${settings[key]} px`;
    document.getElementById("preview-hint").textContent = highlightTrigger ? `蓝色区域为顶部触发区，当前 ${settings.triggerHeight} 像素。` : !settings.enabled ? "启用书签栏后可预览。" : previewMode === "appearance" ? "调整后即时预览，保存后应用到网页。" : settings.pinned ? "当前已固定显示，关闭左侧开关可测试自动收起。" : "鼠标移到预览网页顶部展开，移开后收起。";
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      preview.contentWindow?.FloatingBookmarksPreview?.update({ tree, settings, mode: previewMode, highlightTrigger }).catch(() => { previewState.textContent = "预览不可用"; });
    });
  }
  preview.addEventListener("load", updatePreview);
  document.getElementById("replay-preview").addEventListener("click", () => {
    preview.contentWindow?.FloatingBookmarksPreview?.replay().catch(() => { previewState.textContent = "预览不可用"; });
  });
  new ResizeObserver(updatePreview).observe(preview);
  form.addEventListener("input", event => {
    if (event.target.matches("[data-setting]")) form.elements[event.target.dataset.setting].value = event.target.value;
    highlightTrigger = isTriggerControl(event.target) || isTriggerControl(document.activeElement);
    updatePreview();
  });
  function isTriggerControl(node) { return node?.name === "triggerHeight" || node?.dataset?.setting === "triggerHeight"; }
  function syncTriggerHighlight() {
    const next = isTriggerControl(document.activeElement);
    if (highlightTrigger !== next) { highlightTrigger = next; updatePreview(); }
  }
  form.addEventListener("focusin", syncTriggerHighlight);
  form.addEventListener("focusout", () => queueMicrotask(syncTriggerHighlight));
  form.addEventListener("change", updatePreview);
  for (const button of document.querySelectorAll("[data-preview-mode]")) {
    button.addEventListener("click", () => {
      previewMode = button.dataset.previewMode;
      for (const choice of document.querySelectorAll("[data-preview-mode]")) choice.setAttribute("aria-pressed", String(choice === button));
      updatePreview();
    });
  }
  function previewTheme() {
    const value = form.elements.theme.value;
    document.documentElement.dataset.theme = value === "system" ? (systemTheme.matches ? "light" : "dark") : value;
    const choices = [...themeOptions.querySelectorAll("button")];
    for (const button of choices) button.setAttribute("aria-pressed", String(button.dataset.themeChoice === value));
    themeOptions.style.setProperty("--theme-index", choices.findIndex(button => button.dataset.themeChoice === value));
  }
  for (const button of themeOptions.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      form.elements.theme.value = button.dataset.themeChoice;
      previewTheme();
      updatePreview();
    });
  }
  form.elements.theme.addEventListener("change", () => { previewTheme(); updatePreview(); });
  systemTheme.addEventListener("change", () => { previewTheme(); updatePreview(); });
  function previewSurface() {
    const value = form.elements.surface.value;
    const choices = [...styleOptions.querySelectorAll("button")];
    for (const button of choices) button.setAttribute("aria-pressed", String(button.dataset.surfaceChoice === value));
    styleOptions.style.setProperty("--theme-index", choices.findIndex(button => button.dataset.surfaceChoice === value));
  }
  for (const button of styleOptions.querySelectorAll("button")) {
    button.addEventListener("click", () => { form.elements.surface.value = button.dataset.surfaceChoice; previewSurface(); updatePreview(); });
  }
  form.elements.surface.addEventListener("change", () => { previewSurface(); updatePreview(); });
  async function request(type, data = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...data });
    if (!response?.ok) throw new Error(response?.error || "无法连接扩展，请在扩展管理页面重新加载。");
    return response;
  }
  function tell(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function fill(prefs) {
    for (const key of booleanKeys) form.elements[key].checked = prefs[key];
    for (const key of ["theme", "surface", "rootId", ...numberKeys]) form.elements[key].value = prefs[key];
    form.elements.excludedHosts.value = prefs.excludedHosts.join("\n");
    previewTheme();
    previewSurface();
    lastDraft = prefs;
    updatePreview();
  }
  form.addEventListener("submit", async event => {
    event.preventDefault(); save.disabled = true;
    const patch = {};
    for (const key of booleanKeys) patch[key] = form.elements[key].checked;
    for (const key of ["theme", "surface", "rootId"]) patch[key] = form.elements[key].value;
    for (const key of numberKeys) patch[key] = Number(form.elements[key].value);
    const hosts = form.elements.excludedHosts.value.split(/\s+/).filter(Boolean);
    if (hosts.length > 200 || hosts.some(h => !/^[a-z0-9.-]+$/i.test(h))) {
      tell("请输入域名，不含协议、路径或通配符；最多 200 个。", true);
      save.disabled = false; return;
    }
    patch.excludedHosts = hosts;
    fields.disabled = true; saveLabel.textContent = "保存中…";
    try { savedSettings = FB.normalizeSettings((await request("SET_SETTINGS", { patch })).settings); fill(savedSettings); tell("已保存"); }
    catch (error) { tell(error.message, true); }
    finally { fields.disabled = false; save.disabled = false; saveLabel.textContent = "保存设置"; }
  });
  document.getElementById("manager").addEventListener("click", () => {
    request("OPEN_MANAGER").catch(error => tell(error.message, true));
  });
  async function load() {
    try {
      const response = await request("GET_STATE");
      tree = response.tree;
      function visit(nodes, depth) {
        for (const node of nodes || []) {
          if (node.url) continue;
          const option = document.createElement("option");
          option.value = node.id; option.textContent = `${"　".repeat(depth)}${node.title || "未命名文件夹"}`;
          form.elements.rootId.append(option); visit(node.children, depth + 1);
        }
      }
      visit(FB.roots(response.tree), 0);
      const prefs = FB.normalizeSettings(response.settings);
      if (![...form.elements.rootId.options].some(option => option.value === prefs.rootId)) prefs.rootId = "auto";
      savedSettings = prefs;
      fill(prefs); fields.disabled = false; tell("");
      requestAnimationFrame(() => { themeOptions.dataset.ready = "true"; styleOptions.dataset.ready = "true"; });
    } catch (error) { tell(error.message, true); }
  }
  load();
})();
