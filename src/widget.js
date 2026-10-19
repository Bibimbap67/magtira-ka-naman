// The floating water glass on the chat page. Added tokens drip in, the water rises,
// the numbers count up and the joke line types itself out. Drag it anywhere.
// Built with DOM calls instead of innerHTML because Gemini blocks innerHTML (Trusted Types).
(function (root) {
  const DROP_GAP_MS = 140; // between drops
  const RISE_MS = 700; // water rising + numbers counting up
  const DRAIN_MS = 500; // water going down (reset, new day)
  const TYPE_MS = 22; // per character of the joke line
  const BADGE_MS = 2200; // "Level 2: Tumbler" on screen
  const DRAG_PX = 4; // less movement than this is a click, not a drag

  const easeOut = (p) => 1 - (1 - p) ** 3;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    for (const child of children) node.append(child);
    return node;
  }

  function mount() {
    const MKN = root.MKN;
    const FALL_MS = MKN.glass.FALL_MS;

    // --- DOM ---

    const glass = MKN.glass.create('mkn-glass');
    glass.setWaves(!reducedMotion());
    const toggle = el(
      'button',
      { type: 'button', class: 'mkn-toggle', title: 'Hide / show', 'aria-label': 'Hide or show the water glass' },
      [glass.node],
    );

    const highNum = el('span', { class: 'mkn-num' });
    const low = el('div', { class: 'mkn-low' });
    // The untyped rest of the line is there but invisible, so the widget doesn't widen as it types.
    const quipText = el('span');
    const quipRest = el('span', { class: 'mkn-rest', 'aria-hidden': 'true' });
    const quip = el('div', { class: 'mkn-quip' }, [
      quipText,
      el('span', { class: 'mkn-caret', 'aria-hidden': 'true' }),
      quipRest,
    ]);
    const body = el('div', { class: 'mkn-body' }, [
      el('div', { class: 'mkn-high' }, [el('span', { class: 'mkn-pre' }, ['up to ']), highNum]),
      low,
      quip,
    ]);
    const badge = el('div', { class: 'mkn-badge', 'aria-hidden': 'true' });
    const box = el('div', { id: 'mkn-widget', role: 'complementary', 'aria-label': 'Magtira Ka Naman water meter' }, [
      toggle,
      body,
      badge,
    ]);
    // On <html>, not <body>, so it isn't counted as chat text.
    document.documentElement.append(box);

    // --- Drawing: one tween on the token count drives both the water and the numbers ---

    let shown = null; // tokens currently drawn (fractional while animating)
    let target = 0;
    let tween = null; // { from, to, start, dur }
    let frame = 0;

    const setText = (node, text) => {
      if (node.textContent !== text) node.textContent = text;
    };

    function draw(tokens) {
      const { low: lowMl, high: highMl } = MKN.tokensToMl(tokens);
      const { index, level } = MKN.tierFor(highMl);
      glass.setVessel(index, !!tween && !reducedMotion()); // bounces in while the water moves
      glass.setLevel(level);
      setText(highNum, MKN.formatMl(highMl));
      setText(low, `as little as ${MKN.formatMl(lowMl)} today`);
    }

    function tick(now) {
      frame = 0;
      let tokens = target;
      if (tween) {
        const p = Math.min(1, (now - tween.start) / tween.dur);
        tokens = tween.from + (tween.to - tween.from) * easeOut(Math.max(0, p));
        if (p >= 1) tween = null;
      }
      shown = tokens;
      draw(tokens);
      if (tween) frame = requestAnimationFrame(tick);
    }

    function play() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    // --- "Level 2: Tumbler 🧋" badge ---

    function showBadge(tier) {
      badge.textContent = `Level ${MKN.TIERS.indexOf(tier) + 1}: ${tier.name} ${tier.emoji}`;
      badge.getAnimations().forEach((a) => a.cancel());
      badge.animate(
        [
          { opacity: 0, transform: 'translateY(6px) scale(0.7)' },
          { opacity: 1, transform: 'translateY(0) scale(1.1)', offset: 0.1 },
          { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.18 },
          { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.85 },
          { opacity: 0, transform: 'translateY(-6px) scale(1)' },
        ],
        { duration: BADGE_MS, easing: 'ease-out' },
      );
    }

    // --- Typing joke line ---

    let quipFull = null;
    let typing = 0;
    let typeRun = 0;

    function setQuip(tokens, animate) {
      const text = MKN.quip(MKN.tokensToMl(tokens).high);
      if (text === quipFull) return;
      quipFull = text;
      clearInterval(typing);
      const run = ++typeRun;
      if (!animate || reducedMotion() || collapsed) {
        quipText.textContent = text;
        quipRest.textContent = '';
        quip.classList.remove('mkn-typing');
        return;
      }
      const chars = [...text]; // keeps emoji whole
      let i = 0;
      quipText.textContent = '';
      quipRest.textContent = text;
      quip.classList.add('mkn-typing');
      typing = setInterval(() => {
        i++;
        quipText.textContent = chars.slice(0, i).join('');
        quipRest.textContent = chars.slice(i).join('');
        if (i < chars.length) return;
        clearInterval(typing);
        setTimeout(() => run === typeRun && quip.classList.remove('mkn-typing'), 700);
      }, TYPE_MS);
    }

    // --- Render: called with the saved totals whenever they change ---

    function render(days) {
      const { total } = MKN.store.todayTotals(days);
      if (shown === null || reducedMotion()) {
        // First paint, or reduced motion: show the value right away.
        target = shown = total;
        tween = null;
        draw(total);
        setQuip(total, false);
        return;
      }
      if (total === target) return;

      const added = total - target;
      const bigger = MKN.tierUp(MKN.tokensToMl(target).high, MKN.tokensToMl(total).high);
      const now = performance.now();
      target = total;

      if (added > 0) {
        const count = MKN.dropsFor(added);
        for (let i = 0; i < count; i++) glass.drip(i * DROP_GAP_MS);
        // The water starts rising when the first drop lands.
        tween = { from: shown, to: total, start: now + FALL_MS, dur: RISE_MS };
        if (bigger) setTimeout(() => showBadge(bigger), FALL_MS + RISE_MS * 0.6);
        setTimeout(() => setQuip(target, true), FALL_MS); // target: a later change may have landed
      } else {
        tween = { from: shown, to: total, start: now, dur: DRAIN_MS };
        setQuip(total, true);
      }
      play();
    }

    // --- Collapse ---

    let collapsed = false;
    let pos = null; // { right, bottom } in px, once moved
    let dragged = false;

    function setCollapsed(value) {
      collapsed = value;
      box.classList.toggle('mkn-collapsed', value);
      toggle.setAttribute('aria-expanded', String(!value));
    }

    toggle.addEventListener('click', () => {
      if (dragged) return;
      setCollapsed(!collapsed);
      chrome.storage.local.set({ mknCollapsed: collapsed }).catch(() => {});
    });

    // --- Drag ---

    function place(right, bottom) {
      const { width, height } = box.getBoundingClientRect();
      const clamp = (v, max) => Math.max(0, Math.floor(Math.min(max, v)));
      pos = { right: clamp(right, innerWidth - width), bottom: clamp(bottom, innerHeight - height) };
      box.style.right = `${pos.right}px`;
      box.style.bottom = `${pos.bottom}px`;
    }

    // Moves are followed on the whole window: a quick drag leaves the widget
    // before the widget itself would see a move.
    let drag = null;
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = box.getBoundingClientRect();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, right: innerWidth - r.right, bottom: innerHeight - r.bottom, moving: false };
      addEventListener('pointermove', onDragMove, true);
      addEventListener('pointerup', endDrag, true);
      addEventListener('pointercancel', endDrag, true);
    });
    function onDragMove(e) {
      if (e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moving) {
        if (Math.hypot(dx, dy) < DRAG_PX) return;
        drag.moving = true;
        box.classList.add('mkn-dragging');
      }
      place(drag.right - dx, drag.bottom - dy);
    }
    function endDrag(e) {
      if (e.pointerId !== drag.id) return;
      removeEventListener('pointermove', onDragMove, true);
      removeEventListener('pointerup', endDrag, true);
      removeEventListener('pointercancel', endDrag, true);
      if (drag.moving) {
        dragged = true; // the click that follows a drag must not toggle
        setTimeout(() => (dragged = false), 0);
        box.classList.remove('mkn-dragging');
        chrome.storage.local.set({ mknPos: pos }).catch(() => {});
      }
      drag = null;
    }
    // Keep it on screen when the window shrinks or the widget grows (text, expand).
    const keepOnScreen = () => pos && place(pos.right, pos.bottom);
    addEventListener('resize', keepOnScreen);
    new ResizeObserver(keepOnScreen).observe(box);

    // Hidden from the popup's "Show the glass on chat pages" switch. Counting goes on.
    const setHidden = (value) => box.classList.toggle('mkn-hidden', !!value);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.mknHidden) setHidden(changes.mknHidden.newValue);
    });

    chrome.storage.local.get(['mknCollapsed', 'mknPos', 'mknHidden']).then((r) => {
      if (r.mknPos) place(r.mknPos.right, r.mknPos.bottom);
      setCollapsed(!!r.mknCollapsed);
      setHidden(r.mknHidden);
    }, () => {});

    return { render, el: box };
  }

  root.MKN = root.MKN || {};
  root.MKN.widget = { mount };
})(globalThis);
