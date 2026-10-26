/* Shared by the content script, settings page and service worker. No dependencies. */
(() => {
  const defaults = Object.freeze({
    enabled: true, pinned: false, theme: "dark", surface: "glass", rootId: "auto",
    openNewTab: true, hoverDelay: 100, hideDelay: 450, triggerHeight: 4,
    topOffset: 2, menuGap: 2,
    excludedHosts: []
  });
  function normalizeSettings(input = {}) {
    if (!input || typeof input !== "object") input = {};
    const result = { ...defaults };
    for (const key of ["enabled", "pinned", "openNewTab"]) {
      if (typeof input[key] === "boolean") result[key] = input[key];
    }
    if (["dark", "light", "system"].includes(input.theme)) result.theme = input.theme;
    if (["solid", "glass"].includes(input.surface)) result.surface = input.surface;
    if (typeof input.rootId === "string" && input.rootId.length < 128) result.rootId = input.rootId;
    for (const [key, min, max] of [["hoverDelay", 0, 700], ["hideDelay", 150, 2000], ["triggerHeight", 2, 12], ["topOffset", 0, 24], ["menuGap", 0, 16]]) {
      if (Number.isFinite(input[key])) result[key] = Math.min(max, Math.max(min, Math.round(input[key])));
    }
    if (Array.isArray(input.excludedHosts)) {
      result.excludedHosts = [...new Set(input.excludedHosts.filter(h => typeof h === "string")
        .map(h => h.trim().toLowerCase()).filter(h => /^[a-z0-9.-]+$/.test(h)))].slice(0, 200);
    }
    return result;
  }
  function findNode(nodes, id) {
    for (const node of nodes || []) {
      if (node.id === id) return node;
      const child = findNode(node.children, id);
      if (child) return child;
    }
    return null;
  }
  function roots(tree) { return tree?.[0]?.children || []; }
  function selectRoot(tree, id) {
    const selected = id !== "auto" && findNode(tree, id);
    if (selected && !selected.url) return selected;
    // New Chrome profiles can have both account and local bookmark bars.
    const top = roots(tree);
    return top.find(n => n.folderType === "bookmarks-bar" && n.children?.length)
      || top.find(n => n.folderType === "bookmarks-bar")
      || top.find(n => n.id === "1") || top[0] || { children: [] };
  }
  function flatten(tree) {
    const result = [];
    function visit(nodes, path) {
      for (const node of nodes || []) {
        if (node.url) result.push({ ...node, path: path.join(" / ") });
        else visit(node.children, node.title ? [...path, node.title] : path);
      }
    }
    visit(tree, []);
    return result;
  }
  function search(index, query, limit = 100) {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return index.filter(node => {
      const haystack = `${node.title} ${node.url} ${node.path}`.toLocaleLowerCase();
      return terms.every(term => haystack.includes(term));
    }).slice(0, limit);
  }
  function isOpenable(url) {
    try { return ["http:", "https:", "ftp:", "file:", "chrome:", "edge:", "about:"].includes(new URL(url).protocol); }
    catch { return false; }
  }
  globalThis.FloatingBookmarks = Object.freeze({ defaults, normalizeSettings, findNode, roots, selectRoot, flatten, search, isOpenable });
})();
