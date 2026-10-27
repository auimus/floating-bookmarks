// Liquid surfaces and spring motion; no runtime library or remote assets.
(() => {
  const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
  function spring(t, stiffness = 240, damping = 22) {
    const decay = damping / 2, frequency = Math.sqrt(stiffness - decay * decay);
    return 1 - Math.exp(-decay * t) * (Math.cos(frequency * t) + decay / frequency * Math.sin(frequency * t));
  }
  function frames(duration, map, damping = 22) {
    return Array.from({ length: 33 }, (_, i) => {
      const offset = i / 32;
      return { ...map(i === 32 ? 1 : spring(offset * duration / 1000, 240, damping), offset), offset };
    });
  }
  const closeProgress = offset => offset * offset * (3 - 2 * offset);
  function ribbon(box, progress, originX = 0, originY = 0) {
    const p = clamp(progress, 0, 1), center = box.left + box.width / 2 - originX;
    const topWidth = 42 + (box.width - 42) * p ** 3, bottomWidth = 42 + (box.width - 42) * p;
    const top = box.top * p - originY, height = 2 + (box.height - 2) * p, bottom = top + height;
    const left = center - topWidth / 2, right = center + topWidth / 2;
    const lowerLeft = center - bottomWidth / 2, lowerRight = center + bottomWidth / 2;
    const radius = Math.min(11, height / 4);
    return `M ${left + radius} ${top} L ${right - radius} ${top} Q ${right} ${top} ${right} ${top + radius} C ${right} ${top + height * .4} ${lowerRight} ${top + height * .2} ${lowerRight} ${bottom - radius} Q ${lowerRight} ${bottom} ${lowerRight - radius} ${bottom} L ${lowerLeft + radius} ${bottom} Q ${lowerLeft} ${bottom} ${lowerLeft} ${bottom - radius} C ${lowerLeft} ${top + height * .2} ${left} ${top + height * .4} ${left} ${top + radius} Q ${left} ${top} ${left + radius} ${top} Z`;
  }
  let sequence = 0;
  function create({ shadow, bar, reducedMotion, getSettings, onBarHover, onBarLeave }) {
    const layers = new Map();
    const closing = new Map();
    let barOpening;
    function cancelLayer(key) {
      const layer = layers.get(key);
      if (layer) {
        layers.delete(key);
        for (const animation of layer.getAnimations({ subtree: true })) animation.cancel();
        layer.remove();
      }
      const retiring = closing.get(key);
      if (retiring) { closing.delete(key); retiring.finish(); }
    }
    function retire(key, animation, finish) {
      const item = { finish };
      closing.set(key, item);
      const settle = () => { if (closing.get(key) === item) { closing.delete(key); finish(); } };
      animation.finished.then(settle, settle);
    }
    function clear() {
      for (const key of new Set([...layers.keys(), ...closing.keys()])) cancelLayer(key);
      for (const animation of shadow.getAnimations()) animation.cancel();
      for (const panel of shadow.querySelectorAll('.is-switching')) panel.classList.remove('is-switching');
      for (const guard of shadow.querySelectorAll('.bar-hover-guard,.panel-hover-guard')) guard.remove();
    }
    reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) clear(); });
    function liquid(key, from, to, surface, leaving = false, startProgress = 1) {
      cancelLayer(key);
      const duration = leaving ? getSettings().closeDuration : getSettings().openDuration;
      if (reducedMotion.matches || !duration || !from.width || !to.width) return;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const id = `floating-bookmarks-goo-${++sequence}`;
      const color = getComputedStyle(surface).backgroundColor.match(/[\d.]+/g) || [32, 35, 40, 1];
      const alpha = Number(color[3] ?? 1), opacity = alpha < 1 && !leaving ? alpha * .5 : alpha;
      const x = Math.max(0, Math.min(from.left, to.left) - 24), y = Math.max(0, Math.min(from.top, to.top) - 24);
      const width = Math.min(innerWidth - x, Math.max(from.right ?? from.left + from.width, to.right ?? to.left + to.width) - x + 24);
      const height = Math.min(innerHeight - y, Math.max(from.bottom ?? from.top + from.height, to.bottom ?? to.top + to.height) - y + 24);
      svg.classList.add('goo-effect'); svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${width}px;height:${height}px;pointer-events:none;overflow:hidden;z-index:1;stroke:none;opacity:${opacity}`;
      // Filter only two opaque background shapes. Text and backdrop surfaces never enter it.
      svg.innerHTML = `<defs><filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="7"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 18 -9"/><feComposite in="SourceGraphic" operator="atop"/></filter></defs><g filter="url(#${id})" fill="rgb(${color.slice(0, 3).join(',')})"><rect/><rect/></g>`;
      const [seed, rectangle] = svg.querySelectorAll('rect');
      const barBox = key === 'bar' ? (leaving ? from : to) : null;
      const drop = barBox ? document.createElementNS('http://www.w3.org/2000/svg', 'path') : rectangle;
      if (barBox) rectangle.replaceWith(drop);
      function geometry(box) { return { x: `${box.left - x}px`, y: `${box.top - y}px`, width: `${box.width}px`, height: `${box.height}px`, rx: '18px', ry: '18px' }; }
      for (const [name, value] of Object.entries(geometry(leaving ? to : from))) seed.style.setProperty(name, value);
      const shapeFrames = frames(leaving ? 220 : 440, (progress, offset) => {
        const p = leaving ? closeProgress(offset) : progress;
        if (barBox) return { d: `path("${ribbon(barBox, leaving ? startProgress * (1 - p) : progress, x, y)}")` };
        const w = clamp(from.width + (to.width - from.width) * p, 2, innerWidth - 16);
        const h = clamp(from.height + (to.height - from.height) * p, 2, innerHeight - 8);
        return geometry({ left: clamp(from.left + (to.left - from.left) * p, 0, innerWidth - w), top: clamp(from.top + (to.top - from.top) * p, 0, innerHeight - h), width: w, height: h });
      }, leaving ? 24 : barBox ? 22 : 18);
      shadow.append(svg); layers.set(key, svg);
      drop.animate(shapeFrames, { duration, fill: 'both' });
      const fade = svg.animate([{ opacity }, { opacity, offset: leaving ? .72 : .65 }, { opacity: 0 }], { duration, fill: 'both' });
      const remove = () => { if (layers.get(key) === svg) layers.delete(key); svg.remove(); };
      fade.finished.then(remove, remove);
    }
    function rows(panel, delay = 70) {
      const scale = getSettings().openDuration / 440;
      if (!scale || reducedMotion.matches) return;
      const visible = Math.min(18, Math.ceil(panel.clientHeight / 39) + 2);
      [...panel.querySelectorAll('.menu-heading,.row,.search-wrap,.count,.empty')].slice(0, visible).forEach((row, i) => {
        const start = (delay + Math.min(i, 6) * 25) * scale;
        row.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }], {
          duration: 440 * scale - start, delay: start, fill: 'backwards', easing: 'cubic-bezier(.2,.75,.25,1)'
        });
      });
    }
    function hoverGuard(box, animation, depth) {
      const guard = document.createElement('div');
      guard.className = depth === undefined ? 'bar-hover-guard' : 'panel-hover-guard';
      if (depth !== undefined) guard.dataset.depth = String(depth);
      guard.setAttribute('aria-hidden', 'true');
      guard.style.cssText = `position:fixed;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;pointer-events:auto;z-index:0`;
      guard.addEventListener('pointerenter', onBarHover); guard.addEventListener('pointerleave', onBarLeave);
      shadow.append(guard);
      const remove = () => guard.remove(); animation.finished.then(remove, remove);
    }
    function enterBar() {
      for (const key of new Set([...layers.keys(), ...closing.keys()])) cancelLayer(key);
      const duration = getSettings().openDuration;
      if (reducedMotion.matches || !duration) return;
      const box = bar.getBoundingClientRect(), hint = { left: box.left + box.width / 2 - 21, top: 0, width: 42, height: 2 };
      liquid('bar', hint, box, bar);
      barOpening = bar.animate(frames(440, p => ({ clipPath: `path("${ribbon(box, p, box.left, box.top)}")` })), { duration });
      // Keep the final bar footprint hoverable while its visible outline is still narrow.
      hoverGuard(box, barOpening);
      for (const node of [bar.querySelector('.bookmarks'), bar.querySelector('.tools')]) node.animate([
        { opacity: 0 }, { opacity: .12, offset: .15 }, { opacity: .85, offset: .55 }, { opacity: 1 }
      ], { duration, fill: 'backwards' });
    }
    function leaveBar(box) {
      const duration = getSettings().closeDuration;
      const progress = barOpening && ['running', 'paused'].includes(barOpening.playState) ? clamp(spring(Number(barOpening.currentTime) / Number(barOpening.effect.getTiming().duration) * .44), 0, 1) : 1;
      const children = [bar.querySelector('.bookmarks'), bar.querySelector('.tools')];
      const opacity = children.map(node => Number(getComputedStyle(node).opacity));
      cancelLayer('bar');
      for (const animation of bar.getAnimations({ subtree: true })) animation.cancel();
      for (const guard of shadow.querySelectorAll('.bar-hover-guard')) guard.remove();
      if (reducedMotion.matches || !duration) return;
      liquid('bar', box, { left: box.left + box.width / 2 - 21, top: 0, width: 42, height: 2 }, bar, true, progress);
      const host = shadow.host;
      host.setAttribute('data-closing', ''); bar.inert = true; bar.setAttribute('aria-hidden', 'true');
      const absorption = bar.animate(frames(220, (_, offset) => ({ clipPath: `path("${ribbon(box, progress * (1 - closeProgress(offset)), box.left, box.top)}")` })), { duration, fill: 'both' });
      children.forEach((node, i) => node.animate([
        { opacity: opacity[i], transform: 'translateY(0)' },
        { opacity: opacity[i] * .85, transform: 'translateY(-7px)', offset: .5 },
        { opacity: opacity[i] * .45, transform: 'translateY(-13px)', offset: .78 },
        { opacity: 0, transform: 'translateY(-16px)' }
      ], { duration, fill: 'both' }));
      retire('bar', absorption, () => {
        for (const animation of bar.getAnimations({ subtree: true })) animation.cancel();
        host.removeAttribute('data-closing'); bar.inert = false; bar.removeAttribute('aria-hidden');
      });
    }
    function enterPanel(panel, anchor, depth) {
      cancelLayer(`panel-${depth}`);
      const duration = getSettings().openDuration;
      if (reducedMotion.matches || !duration) return;
      const box = panel.getBoundingClientRect(), seed = anchor.getBoundingClientRect();
      liquid(`panel-${depth}`, seed, box, panel);
      const entry = panel.animate(frames(440, progress => {
        const p = clamp(progress, 0, 1), horizontal = (1 - p) * Math.max(0, box.width - seed.width) / 2 - p * 48;
        return { clipPath: `inset(1px ${horizontal}px ${(1 - p) * Math.max(0, box.height - 20) - p * 48}px round ${12 + (1 - p) * 12}px)` };
      }), { duration });
      hoverGuard(box, entry, depth);
      rows(panel);
    }
    function switchPanel(panel, body, from, fromClip) {
      const scale = getSettings().openDuration / 440;
      if (reducedMotion.matches || !scale) return;
      const to = panel.getBoundingClientRect();
      panel.classList.add('is-switching');
      const motion = panel.animate(frames(340, p => {
        const width = clamp(from.width + (to.width - from.width) * p, 1, innerWidth - 16);
        const left = clamp(from.left + (to.left - from.left) * p, 8, innerWidth - width - 8);
        const top = clamp(from.top + (to.top - from.top) * p, 0, innerHeight - 8);
        const height = clamp(from.height + (to.height - from.height) * p, 1, innerHeight - top - 8);
        return { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, borderRadius: `${12 + Math.sin(clamp(p, 0, 1) * Math.PI) * 6}px` };
      }, 24), { duration: 340 * scale });
      const settle = () => panel.classList.remove('is-switching');
      motion.finished.then(settle, settle);
      if (fromClip && fromClip !== 'none') panel.animate([{ clipPath: fromClip }, { clipPath: 'inset(1px -48px -48px -48px)' }], { duration: 220 * scale, easing: 'ease-out' });
      const direction = Math.sign(to.left - from.left);
      body.animate([{ opacity: .25, transform: `translateX(${direction * 7}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 180 * scale, easing: 'cubic-bezier(.2,.75,.25,1)' });
      rows(panel, 20);
    }
    function leavePanel(panel, anchor, depth) {
      const duration = getSettings().closeDuration;
      if (reducedMotion.matches || !duration) return false;
      const box = panel.getBoundingClientRect();
      const clip = getComputedStyle(panel).clipPath;
      const target = anchor.getBoundingClientRect();
      const body = panel.querySelector('.panel-body');
      const bodyWidth = body.getBoundingClientRect().width;
      const frozen = [...new Set(panel.getAnimations({ subtree: true }).map(animation => animation.effect.target))].map(node => ({ node, opacity: getComputedStyle(node).opacity, transform: getComputedStyle(node).transform }));
      let from = box;
      let edges = [1, 0, 0, 0];
      if (clip.startsWith('inset(')) {
        const values = clip.slice(6).split('round')[0].replace(')', '').trim().split(/\s+/).map(Number.parseFloat);
        const top = Math.max(0, values[0] || 0), right = Math.max(0, values[1] ?? values[0] ?? 0);
        const bottom = Math.max(0, values[2] ?? values[0] ?? 0), left = Math.max(0, values[3] ?? values[1] ?? values[0] ?? 0);
        edges = [top, right, bottom, left];
        from = { left: box.left + left, top: box.top + top, width: Math.max(2, box.width - left - right), height: Math.max(2, box.height - top - bottom) };
      }
      liquid(`panel-${depth}`, from, anchor.getBoundingClientRect(), panel, true);
      for (const animation of panel.getAnimations({ subtree: true })) animation.cancel();
      for (const item of frozen) { item.node.style.opacity = item.opacity; item.node.style.transform = item.transform; }
      panel.classList.replace('panel', 'closing-panel'); panel.classList.remove('is-switching');
      panel.inert = true; panel.setAttribute('aria-hidden', 'true');
      body.style.width = `${bodyWidth}px`; body.style.minWidth = `${bodyWidth}px`;
      const absorption = panel.animate(frames(220, (_, offset) => {
        const p = closeProgress(offset);
        return {
          left: `${box.left + (target.left - box.left) * p}px`, top: `${box.top + (target.top - box.top) * p}px`,
          width: `${box.width + (target.width - box.width) * p}px`, height: `${box.height + (target.height - box.height) * p}px`,
          clipPath: `inset(${edges.map(edge => `${edge * (1 - p)}px`).join(' ')} round ${12 + p * 6}px)`
        };
      }), { duration, fill: 'both' });
      const startOpacity = Number(getComputedStyle(body).opacity);
      body.animate([
        { opacity: startOpacity }, { opacity: startOpacity * .85, offset: .5 },
        { opacity: startOpacity * .45, offset: .78 }, { opacity: 0 }
      ], { duration, fill: 'both' });
      retire(`panel-${depth}`, absorption, () => {
        for (const animation of panel.getAnimations({ subtree: true })) animation.cancel();
        panel.remove();
      });
      return true;
    }
    function cancelPanel(depth) {
      for (const key of new Set([...layers.keys(), ...closing.keys()])) if (key.startsWith('panel-') && Number(key.slice(6)) >= depth) cancelLayer(key);
      for (const guard of shadow.querySelectorAll('.panel-hover-guard')) if (Number(guard.dataset.depth) >= depth) guard.remove();
    }
    return { enterBar, leaveBar, enterPanel, switchPanel, leavePanel, cancelPanel, clear };
  }
  globalThis.FloatingBookmarksMotion = Object.freeze({ create });
})();
