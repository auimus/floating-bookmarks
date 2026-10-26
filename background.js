importScripts("shared.js");
const FB = globalThis.FloatingBookmarks;
let writeQueue = Promise.resolve();

async function settings() {
  return FB.normalizeSettings((await chrome.storage.local.get("settings")).settings);
}

async function handle(message, sender) {
  switch (message.type) {
    case "GET_STATE":
      return { tree: await chrome.bookmarks.getTree(), settings: await settings() };
    case "SET_SETTINGS": {
      // Serialize patches so a pin click cannot overwrite a simultaneous settings save.
      const operation = writeQueue.then(async () => {
        const next = FB.normalizeSettings({ ...await settings(), ...message.patch });
        await chrome.storage.local.set({ settings: next });
        return { settings: next };
      });
      writeQueue = operation.catch(() => {});
      return operation;
    }
    case "OPEN_BOOKMARK": {
      const [node] = await chrome.bookmarks.get(String(message.id));
      if (!node?.url || !FB.isOpenable(node.url)) {
        throw new Error("此书签的地址类型暂不支持，请从 Chrome 书签管理器打开。");
      }
      const prefs = await settings();
      if (message.newTab || prefs.openNewTab) {
        const props = { url: node.url, active: message.active !== false };
        if (sender.tab?.id != null) props.openerTabId = sender.tab.id;
        await chrome.tabs.create(props);
      } else {
        const target = sender.tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        if (target?.id == null) throw new Error("找不到可打开书签的标签页。");
        await chrome.tabs.update(target.id, { url: node.url });
      }
      return {};
    }
    case "OPEN_OPTIONS":
      await chrome.runtime.openOptionsPage();
      return {};
    case "OPEN_MANAGER":
      await chrome.tabs.create({ url: "chrome://bookmarks/" });
      return {};
    default:
      throw new Error("未知请求。");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== "string") return false;
  handle(message, sender).then(data => sendResponse({ ok: true, ...data }))
    .catch(error => sendResponse({ ok: false, error: error.message || "操作失败，请重试。" }));
  return true;
});

let updateTimer;
function notifyBookmarks() {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(async () => {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs.filter(tab => tab.id != null).map(tab =>
      chrome.tabs.sendMessage(tab.id, { type: "BOOKMARKS_CHANGED" }, { frameId: 0 })));
  }, 80);
}
for (const event of [chrome.bookmarks.onCreated, chrome.bookmarks.onRemoved,
  chrome.bookmarks.onChanged, chrome.bookmarks.onMoved, chrome.bookmarks.onChildrenReordered,
  chrome.bookmarks.onImportEnded]) event.addListener(notifyBookmarks);

chrome.commands.onCommand.addListener(async command => {
  if (command !== "toggle-bar") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) {
    try { await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_BAR" }, { frameId: 0 }); }
    catch { /* Browser-internal pages do not permit a content script. */ }
  }
});
