const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(path.join(root, 'shared.js'), 'utf8'), context);
const FB = context.FloatingBookmarks;
const tree = [{ id: '0', children: [
  { id: '10', folderType: 'bookmarks-bar', title: '账号书签栏', children: [] },
  { id: '11', folderType: 'bookmarks-bar', title: '本地书签栏', children: [
    { id: '20', title: '开发', children: [
      { id: '30', title: 'Chrome 文档', url: 'https://developer.chrome.com/docs/extensions' },
      { id: '31', title: '<img src=x onerror=alert(1)>', url: 'https://example.com/' },
      { id: '32', title: '脚本', url: 'javascript:alert(1)' }
    ] },
    { id: '21', title: '空文件夹', children: [] }
  ] },
  { id: '2', title: '其他书签', children: [{ id: '40', title: 'Bilibili', url: 'https://www.bilibili.com' }] }
] }];
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS', name); }
check('invalid persisted settings fall back and numeric bounds hold', () => {
  assert.equal(FB.normalizeSettings(null).enabled, true);
  const p = FB.normalizeSettings({ theme: 'weird', enabled: 'false', hideDelay: -2, triggerHeight: 100, hoverDelay: NaN, excludedHosts: [' A.COM ', 'a.com', 'https://b.com', null] });
  assert.equal(p.theme, 'dark'); assert.equal(p.enabled, true); assert.equal(p.hideDelay, 150);
  assert.equal(p.triggerHeight, 12); assert.equal(p.hoverDelay, 100); assert.deepEqual(plain(p.excludedHosts), ['a.com']);
});
check('account/local bookmark bars and explicit folder selection', () => {
  assert.equal(FB.selectRoot(tree, 'auto').id, '11');
  assert.equal(FB.selectRoot(tree, '20').id, '20');
  assert.equal(FB.selectRoot(tree, 'missing').id, '11');
  assert.equal(FB.selectRoot(tree, '30').id, '11');
  assert.deepEqual(plain(FB.selectRoot([], 'auto')), {children: []});
});
check('old Chrome tree uses ID 1 without relying on localized title', () => {
  assert.equal(FB.selectRoot([{id:'0', children:[{id:'2', children:[]},{id:'1', title:'Bookmarks bar', children:[]}]}], 'auto').id, '1');
});
check('search spans all roots, path and URL, supports AND and limit', () => {
  const index = FB.flatten(tree);
  assert.equal(FB.search(index, '开发 CHROME')[0].id, '30');
  assert.equal(FB.search(index, 'BILIBILI')[0].id, '40');
  assert.equal(FB.search(index, 'no match').length, 0); assert.equal(FB.search(index, ' ').length, 0);
  assert.equal(FB.search(Array(150).fill(index[0]), 'chrome').length, 100);
});
check('unsafe bookmark protocols are rejected', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'not a url']) assert.equal(FB.isOpenable(url), false);
  for (const url of ['https://example.com', 'chrome://bookmarks', 'file:///C:/test.txt']) assert.equal(FB.isOpenable(url), true);
});
check('surface styles default safely and survive normalization', () => {
  assert.equal(FB.normalizeSettings({}).surface, 'glass');
  assert.equal(FB.normalizeSettings({surface:'solid'}).surface, 'solid');
  assert.equal(FB.normalizeSettings({surface:'invalid'}).surface, 'glass');
});
check('spacing migrates old settings and accepts zero with bounded integer values', () => {
  const old = FB.normalizeSettings({ pinned: true, theme: 'light' });
  assert.equal(old.topOffset, 2); assert.equal(old.menuGap, 2);
  assert.equal(old.pinned, true); assert.equal(old.theme, 'light');
  const zero = FB.normalizeSettings({ topOffset: 0, menuGap: 0 });
  assert.equal(zero.topOffset, 0); assert.equal(zero.menuGap, 0);
  const bounded = FB.normalizeSettings({ topOffset: 99, menuGap: -1 });
  assert.equal(bounded.topOffset, 24); assert.equal(bounded.menuGap, 0);
  const invalid = FB.normalizeSettings({ topOffset: '8', menuGap: Infinity });
  assert.equal(invalid.topOffset, 2); assert.equal(invalid.menuGap, 2);
  assert.equal(FB.normalizeSettings({ menuGap: 3.7 }).menuGap, 4);
});
const events = {};
const event = name => ({ addListener: fn => { events[name] = fn; } });
let stored = {}, failWrite = false, created = [], updated = [], broadcasts = [];
const chrome = {
  runtime: { id: 'test-extension', onMessage: event('message'), openOptionsPage: async () => {} },
  storage: { local: {
    get: async () => structuredClone(stored),
    set: async value => { if (failWrite) throw new Error('disk write failed'); stored = structuredClone(value); }
  } },
  bookmarks: {
    getTree: async () => tree,
    get: async id => { const node = FB.findNode(tree, id); if (!node) throw new Error('missing bookmark'); return [node]; },
    ...Object.fromEntries(['onCreated','onRemoved','onChanged','onMoved','onChildrenReordered','onImportEnded'].map(name => [name,event(name)]))
  },
  tabs: {
    create: async props => { created.push(props); },
    update: async (id, props) => { updated.push({id,...props}); },
    query: async () => [{id:77}],
    sendMessage: async (id, message) => { broadcasts.push({id,message}); }
  }, commands: {onCommand:event('command')}
};
Object.assign(context, { chrome, setTimeout, clearTimeout, importScripts: () => {} });
vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), context);
const sender = {id:'test-extension', tab:{id:7}};
const request = (message, who = sender) => new Promise((resolve, reject) => {
  const kept = events.message(message, who, resolve);
  if (kept !== true) reject(new Error('rejected sender'));
});
(async () => {
  let response = await request({type:'GET_STATE'});
  assert.equal(response.ok,true); assert.equal(response.tree[0].id,'0'); checks++; console.log('PASS background reads through mocked Chrome API');
  await Promise.all([request({type:'SET_SETTINGS',patch:{pinned:true}}),request({type:'SET_SETTINGS',patch:{theme:'light'}})]);
  assert.equal(stored.settings.pinned,true); assert.equal(stored.settings.theme,'light'); checks++; console.log('PASS concurrent settings patches preserve both writes');
  await request({type:'SET_SETTINGS',patch:{topOffset:8,menuGap:4}});
  response = await request({type:'GET_STATE'});
  assert.equal(stored.settings.topOffset,8); assert.equal(stored.settings.menuGap,4);
  assert.equal(response.settings.topOffset,8); assert.equal(response.settings.menuGap,4);
  assert.equal(response.settings.theme,'light'); checks++; console.log('PASS spacing persists through background settings and readback');
  failWrite = true;
  response = await request({type:'SET_SETTINGS',patch:{theme:'dark'}});
  assert.equal(response.ok,false); assert.match(response.error,/disk/); assert.equal(stored.settings.theme,'light');
  failWrite = false;
  response = await request({type:'SET_SETTINGS',patch:{openNewTab:false}});
  assert.equal(response.ok,true); checks++; console.log('PASS failed write surfaces error and queue recovers');
  await request({type:'OPEN_BOOKMARK',id:'30',url:'https://attacker.invalid'});
  assert.equal(updated[0].id,7); assert.equal(updated[0].url,'https://developer.chrome.com/docs/extensions');
  await request({type:'OPEN_BOOKMARK',id:'40',newTab:true,active:false});
  assert.equal(created[0].active,false); assert.equal(created[0].openerTabId,7);
  response = await request({type:'OPEN_BOOKMARK',id:'32'});
  assert.equal(response.ok,false);
  response = await request({type:'OPEN_BOOKMARK',id:'deleted'}); assert.equal(response.ok,false);
  checks++; console.log('PASS navigation resolves bookmark ID, foreground/background/current-tab, invalid IDs and scripts');
  assert.equal(events.message({type:'GET_STATE'},{id:'other'},()=>{}),false); checks++; console.log('PASS sender validation');
  events.onCreated();
  await new Promise(resolve=>setTimeout(resolve,150));
  assert.equal(broadcasts[0].message.type,'BOOKMARKS_CHANGED'); checks++; console.log('PASS bookmark change broadcasts');
  console.log(`${checks} checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
