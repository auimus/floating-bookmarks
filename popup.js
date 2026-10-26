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
    });
  }
  form.elements.theme.addEventListener("change", previewTheme);
  systemTheme.addEventListener("change", previewTheme);
  function previewSurface() {
    const value = form.elements.surface.value;
    const choices = [...styleOptions.querySelectorAll("button")];
    for (const button of choices) button.setAttribute("aria-pressed", String(button.dataset.surfaceChoice === value));
    styleOptions.style.setProperty("--theme-index", choices.findIndex(button => button.dataset.surfaceChoice === value));
  }
  for (const button of styleOptions.querySelectorAll("button")) {
    button.addEventListener("click", () => { form.elements.surface.value = button.dataset.surfaceChoice; previewSurface(); });
  }
  form.elements.surface.addEventListener("change", previewSurface);
  async function request(type, data = {}) {
    const response = await chrome.runtime.sendMessage({ type, ...data });
    if (!response?.ok) throw new Error(response?.error || "无法连接扩展，请在扩展管理页面重新加载。");
    return response;
  }
  function tell(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function fill(prefs) {
    for (const key of ["enabled", "pinned", "openNewTab"]) form.elements[key].checked = prefs[key];
    for (const key of ["theme", "surface", "rootId", "hoverDelay", "hideDelay", "triggerHeight", "topOffset", "menuGap"]) form.elements[key].value = prefs[key];
    form.elements.excludedHosts.value = prefs.excludedHosts.join("\n");
    previewTheme();
    previewSurface();
  }
  form.addEventListener("submit", async event => {
    event.preventDefault(); save.disabled = true;
    const patch = {};
    for (const key of ["enabled", "pinned", "openNewTab"]) patch[key] = form.elements[key].checked;
    for (const key of ["theme", "surface", "rootId"]) patch[key] = form.elements[key].value;
    for (const key of ["hoverDelay", "hideDelay", "triggerHeight", "topOffset", "menuGap"]) patch[key] = Number(form.elements[key].value);
    const hosts = form.elements.excludedHosts.value.split(/\s+/).filter(Boolean);
    if (hosts.length > 200 || hosts.some(h => !/^[a-z0-9.-]+$/i.test(h))) {
      tell("请输入域名，不含协议、路径或通配符；最多 200 个。", true);
      save.disabled = false; return;
    }
    patch.excludedHosts = hosts;
    fields.disabled = true; saveLabel.textContent = "保存中…";
    try { fill((await request("SET_SETTINGS", { patch })).settings); tell("已保存"); }
    catch (error) { tell(error.message, true); }
    finally { fields.disabled = false; save.disabled = false; saveLabel.textContent = "保存设置"; }
  });
  document.getElementById("manager").addEventListener("click", () => {
    request("OPEN_MANAGER").catch(error => tell(error.message, true));
  });
  async function load() {
    try {
      const response = await request("GET_STATE");
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
      fill(prefs); fields.disabled = false; tell("");
      requestAnimationFrame(() => { themeOptions.dataset.ready = "true"; styleOptions.dataset.ready = "true"; });
    } catch (error) { tell(error.message, true); }
  }
  load();
})();
