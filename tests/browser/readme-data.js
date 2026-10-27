// Screenshot-only data. Loaded by the local harness with ?demo=readme, never by the extension.
(() => {
  const link = (id, title, host) => ({ id, title, url: `https://${host}.example/` });
  const folder = (id, title, children) => ({ id, title, children });
  fixture.tree[0].children = [
    { ...folder('1', '书签栏', [
      folder('demo-daily', '常用', [link('demo-mail', '邮箱', 'mail'), link('demo-calendar', '日历', 'calendar')]),
      folder('demo-design', '设计', [
        link('demo-inspiration', '设计灵感', 'inspiration'), link('demo-palette', '色彩工具', 'palette'),
        link('demo-icons', '图标资源', 'icons'), link('demo-type', '字体排版', 'type'),
        link('demo-motion', '交互案例', 'motion'), folder('demo-components', '组件规范', [link('demo-system', '设计系统', 'system')])
      ]),
      folder('demo-development', '开发', [link('demo-docs', '开发文档', 'docs'), link('demo-code', '代码仓库', 'code')]),
      folder('demo-reading', '阅读', [link('demo-articles', '技术文章', 'articles'), link('demo-books', '在线书架', 'books')]),
      folder('demo-tools', '工具', [link('demo-convert', '格式转换', 'convert'), link('demo-notes', '在线笔记', 'notes')]),
      folder('demo-learning', '学习', [link('demo-course', '课程收藏', 'course'), link('demo-language', '语言学习', 'language')])
    ]), folderType: 'bookmarks-bar' },
    folder('2', '其他书签', [])
  ];
  chrome.runtime.sendMessage({ type: 'SET_SETTINGS', patch: {
    ...FloatingBookmarks.defaults, theme: new URLSearchParams(location.search).get('theme') || 'dark',
    pinned: location.pathname !== '/popup.html'
  } });
})();
