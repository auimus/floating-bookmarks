(async () => {
  const result = { suite: 'popup', run: new URLSearchParams(location.search).get('run') || 'preview-motion', checks: [], failures: [] };
  const wait = async (test, message) => {
    const deadline = Date.now() + 7000;
    while (!test()) { if (Date.now() > deadline) throw Error(message); await new Promise(resolve => setTimeout(resolve, 10)); }
  };
  const check = (name, value) => { if (!value) throw Error(name); result.checks.push(name); };
  const settle = async shadow => { await Promise.all(shadow.getAnimations().map(animation => animation.finished.catch(() => {}))); };
  let actual;
  try {
    const frame = document.getElementById('preview');
    await wait(() => frame.contentDocument?.documentElement?.dataset.previewReady, '初始预览未完成');
    const win = frame.contentWindow, host = frame.contentDocument.getElementById('floating-bookmarks-extension'), shadow = host.shadowRoot;
    const controller = win.FloatingBookmarksPreview;
    const settings = FloatingBookmarks.normalizeSettings({ pinned: false, rootId: 'auto', openDuration: 800, closeDuration: 600 });
    const update = patch => controller.update({ tree: fixture.tree, settings: { ...settings, ...patch }, mode: 'appearance', highlightTrigger: false });
    await update({});
    await wait(() => shadow.querySelector('.panel') && !shadow.getAnimations().length, '等待预览自动重播完成');
    const isolation = frame.contentDocument.createElement('style'); isolation.textContent = '*{pointer-events:none!important}'; shadow.append(isolation);
    actual = document.createElement('iframe'); actual.style.cssText = `position:fixed;left:0;bottom:0;width:${win.innerWidth}px;height:${win.innerHeight}px;border:0;pointer-events:none;opacity:0`;
    actual.src = '/?state=motion-reference'; document.body.append(actual);
    await wait(() => actual.contentWindow.fixture && actual.contentDocument.getElementById('floating-bookmarks-extension')?.shadowRoot.querySelector('.bookmark'), '网页参照未加载');
    const real = actual.contentWindow, realHost = actual.contentDocument.getElementById('floating-bookmarks-extension'), realShadow = realHost.shadowRoot;
    // Match layout viewports: the reference document normally has a vertical scrollbar.
    actual.contentDocument.documentElement.style.overflow = 'hidden';
    await real.chrome.runtime.sendMessage({ type: 'SET_SETTINGS', patch: settings });
    if (realHost.hasAttribute('data-open')) real.fixture.messages.fire({ type: 'TOGGLE_BAR' });
    await settle(realShadow);
    realShadow.querySelector('.trigger').click();
    const entry = root => root.querySelector('.bar').getAnimations().find(animation => animation.effect.getKeyframes().some(frame => 'clipPath' in frame));
    const reference = entry(realShadow);
    const referenceFrames = reference.effect.getKeyframes();
    const referenceText = realShadow.querySelector('.bookmarks').getAnimations()[0];
    const referenceTextFrames = referenceText.effect.getKeyframes(), referenceTextTiming = referenceText.effect.getTiming();
    await settle(realShadow);
    const replay = controller.replay();
    await wait(() => host.hasAttribute('data-closing'), '重播未先收起');
    check('重播先保留收起内容并停止交互',shadow.querySelector('.bar').inert && !!shadow.querySelector('.closing-panel'));
    await wait(() => host.hasAttribute('data-open') && entry(shadow), '重播未展开书签栏');
    check('预览先拉出书签栏再展开菜单',!shadow.querySelector('.panel'));
    check('相同视口和配置下预览与网页使用完全相同的拉出曲线和时长',JSON.stringify(entry(shadow).effect.getKeyframes()) === JSON.stringify(referenceFrames) && entry(shadow).effect.getTiming().duration === reference.effect.getTiming().duration);
    const previewText = shadow.querySelector('.bookmarks').getAnimations()[0];
    check('预览和网页的文字渐显曲线与节奏一致',JSON.stringify(previewText.effect.getKeyframes()) === JSON.stringify(referenceTextFrames) && JSON.stringify(previewText.effect.getTiming()) === JSON.stringify(referenceTextTiming));
    const runningEntry = entry(shadow);
    await controller.update({ tree: fixture.tree, settings, mode: 'appearance', highlightTrigger: true });
    check('动画中高亮触发区不会打断或重播展开',entry(shadow) === runningEntry && !frame.contentDocument.getElementById('trigger-guide').hidden);
    await replay;
    await wait(() => shadow.querySelector('.panel') && !shadow.getAnimations().length, '展开菜单未完成');
    await update({ pinned: true }); await settle(shadow);
    const pinnedReplay = controller.replay();
    check('固定显示仍可重播完整收起',host.hasAttribute('data-closing') && !host.hasAttribute('data-open'));
    await pinnedReplay; await settle(shadow);
    check('固定显示重播完成恢复栏和菜单',host.hasAttribute('data-open') && !!shadow.querySelector('.panel') && !shadow.querySelector('.closing-panel'));
    await update({ openDuration: 0, closeDuration: 0 });
    await wait(() => shadow.querySelector('.panel') && !shadow.getAnimations().length, '零时长预览未完成');
    await controller.replay();
    check('零时长重播直接完成且没有残留层',host.hasAttribute('data-open') && !!shadow.querySelector('.panel') && !shadow.querySelector('.goo-effect,.closing-panel') && !host.hasAttribute('data-closing'));
    await update({ openDuration: 700, closeDuration: 500 });
    const stale = controller.replay();
    await update({ enabled: false }); await stale;
    check('重播中禁用不会被旧回调重新展开',host.hidden && !host.hasAttribute('data-open') && !shadow.querySelector('.goo-effect,.closing-panel') && !host.hasAttribute('data-closing'));
  } catch (error) { result.failures.push(error.message); console.error(error); }
  actual?.remove();
  const proof = document.createElement('pre'); proof.id = 'test-proof'; proof.textContent = JSON.stringify(result, null, 2); document.body.append(proof);
  await fetch('/test-result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) });
})();
