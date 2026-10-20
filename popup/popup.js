(function () {
  const MKN = globalThis.MKN;
  const $ = (id) => document.getElementById(id);

  const FILL_MS = 900; // water rising and numbers counting up
  const easeOut = (p) => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const glass = MKN.glass.create('glass');
  glass.setWaves(!reducedMotion());
  $('glass-wrap').append(glass.node);

  $('period').textContent = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const siteIds = Object.keys(MKN.SITES);

  // One row per AI, built once; paint() only updates them.
  const rows = {};
  for (const id of siteIds) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'site-name';
    name.textContent = MKN.SITES[id].name;
    const track = document.createElement('span');
    track.className = 'bar';
    const bar = document.createElement('span');
    bar.className = 'bar-fill';
    bar.style.background = MKN.SITES[id].color;
    track.append(bar);
    const value = document.createElement('span');
    value.className = 'site-value';
    li.append(name, track, value);
    $('sites').append(li);
    rows[id] = { bar, value };
  }

  function totalsFrom(days) {
    const month = MKN.store.monthTotals(days);
    const sites = Object.fromEntries(siteIds.map((id) => [id, month.bySite[id] || 0]));
    return { today: MKN.store.todayTotals(days).total, month: month.total, sites };
  }

  // One step per container. Reached: its emoji. Next one: faded. Further: "?".
  const steps = MKN.TIERS.map(() => {
    const li = document.createElement('li');
    $('ladder').append(li);
    return li;
  });
  let ladderAt = -1;
  function paintLadder(index) {
    if (index === ladderAt) return;
    ladderAt = index;
    MKN.TIERS.forEach((tier, i) => {
      const known = i <= index + 1;
      steps[i].textContent = known ? tier.emoji : '?';
      steps[i].title = known ? tier.name : 'Keep chatting to find out';
      steps[i].className = i === index ? 'now' : i < index ? 'done' : known ? 'next' : '';
    });
  }

  // Bar widths in %, relative to the AI used most this month.
  function barPercents(sites) {
    const most = Math.max(...Object.values(sites));
    return Object.fromEntries(siteIds.map((id) => [id, most ? (sites[id] / most) * 100 : 0]));
  }

  // Draws one frame. moving: the water is animating, so a new container bounces in.
  function paint(v, bars, moving = false) {
    const today = MKN.tokensToMl(v.today);
    const [num, unit] = MKN.formatMl(today.high).split(' ');
    const { index, tier, level } = MKN.tierFor(today.high);
    const next = MKN.TIERS[index + 1];
    $('today-num').textContent = num;
    $('today-unit').textContent = unit;
    $('today-low').textContent = `or as little as ${MKN.formatMl(today.low)}`;
    $('tokens').textContent = `~${compact.format(Math.round(v.today))} tokens`;
    $('glass-pct').textContent = `${Math.round(level * 100)}% full`;
    $('vessel-line').textContent = next ? `${tier.name} · next: ${next.name}` : `${tier.name} · the last level`;
    $('month-high').textContent = `up to ${MKN.formatMl(MKN.tokensToMl(v.month).high)}`;
    for (const id of siteIds) {
      rows[id].bar.style.width = `${bars[id]}%`;
      rows[id].value.textContent = MKN.formatMl(MKN.tokensToMl(v.sites[id]).high);
    }
    glass.setVessel(index, moving);
    glass.setLevel(level);
    paintLadder(index);
  }

  // The little lines beside the glass flick once when water lands.
  function flickTicks() {
    for (const tick of document.querySelectorAll('.ticks')) {
      tick.animate(
        [
          { opacity: 0.35, transform: 'scale(0.85)' },
          { opacity: 1, transform: 'scale(1.1)' },
          { opacity: 0.35, transform: 'scale(1)' },
        ],
        { duration: 600, easing: 'ease-out' },
      );
    }
  }

  let shown = null;
  let shownBars = null;
  let frame = 0;

  // Animates from what's on screen to `next`. On first open that's from zero: the one "fill up" moment.
  // Later increases (while the popup is open) drip into the glass first.
  function show(next) {
    $('today-quip').textContent = MKN.quip(MKN.tokensToMl(next.today).high);
    $('month-rice').textContent = MKN.riceLine(MKN.tokensToMl(next.month).high);
    cancelAnimationFrame(frame);

    const zeros = Object.fromEntries(siteIds.map((id) => [id, 0]));
    const from = shown || { today: 0, month: 0, sites: zeros };
    const fromBars = shownBars || zeros;
    const nextBars = barPercents(next.sites);
    if (reducedMotion()) {
      shown = next;
      shownBars = nextBars;
      paint(next, nextBars);
      return;
    }

    let delay = 0;
    if (shown && next.today > shown.today) {
      const count = MKN.dropsFor(next.today - shown.today);
      for (let i = 0; i < count; i++) glass.drip(i * 140);
      delay = MKN.glass.FALL_MS;
    }

    const start = performance.now() + delay;
    const lerp = (a, b, p) => a + (b - a) * p;
    let flicked = false;
    const step = (t) => {
      const p = easeOut((t - start) / FILL_MS);
      const sites = {};
      const bars = {};
      for (const id of siteIds) {
        sites[id] = lerp(from.sites[id], next.sites[id], p);
        bars[id] = lerp(fromBars[id], nextBars[id], p); // animate % so a reset drains the bars too
      }
      shown = { today: lerp(from.today, next.today, p), month: lerp(from.month, next.month, p), sites };
      shownBars = bars;
      paint(shown, bars, p < 1);
      if (!flicked && p > 0.6 && next.today > from.today) {
        flicked = true;
        flickTicks();
      }
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  // Reset needs two clicks, since a confirm() dialog can close the popup.
  const resetBtn = $('reset');
  let armed = null;
  resetBtn.addEventListener('click', async () => {
    if (!armed) {
      resetBtn.textContent = 'Are you sure? Click again';
      resetBtn.classList.add('armed');
      armed = setTimeout(() => {
        armed = null;
        resetBtn.textContent = 'Reset bill';
        resetBtn.classList.remove('armed');
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    await MKN.store.reset();
    resetBtn.textContent = 'Bill reset';
    resetBtn.classList.remove('armed');
  });

  // Share: draws today's water as a story-sized PNG and saves it, ready to send to a friend.
  const shareBtn = $('share');
  shareBtn.addEventListener('click', async () => {
    const days = await MKN.store.getDays();
    const blob = await MKN.story.make(MKN.tokensToMl(totalsFrom(days).today));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `magtira-ka-naman-${new Date().toLocaleDateString('en-CA')}.png`;
    link.click();
    shareBtn.textContent = 'Saved to your Downloads ✓';
    setTimeout(() => (shareBtn.textContent = 'Share it with friends 📸'), 2500);
  });

  // The switch hides the widget on chat pages (counting goes on).
  const showWidget = $('show-widget');
  chrome.storage.local.get('mknHidden').then((r) => (showWidget.checked = !r.mknHidden));
  showWidget.addEventListener('change', () => chrome.storage.local.set({ mknHidden: !showWidget.checked }));

  MKN.store.getDays().then((days) => show(totalsFrom(days)));
  MKN.store.onChange((days) => show(totalsFrom(days)));

  // --- Tabs ---

  const tabs = { bill: $('tab-bill'), board: $('tab-board') };
  function showTab(name) {
    for (const [key, tab] of Object.entries(tabs)) {
      const on = key === name;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
      $(key).hidden = !on;
    }
    if (name === 'board') openBoard();
    else clearInterval(refresh);
  }
  for (const [key, tab] of Object.entries(tabs)) {
    tab.addEventListener('click', () => showTab(key));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const other = key === 'bill' ? 'board' : 'bill';
      showTab(other);
      tabs[other].focus();
    });
  }

  // --- Leaderboard (the service worker does the talking to the server) ---

  const ERRORS = {
    too_short: `Use at least ${MKN.nickname.MIN} characters.`,
    too_long: `Use at most ${MKN.nickname.MAX} characters.`,
    bad_chars: 'Use only letters, numbers, spaces and _ - .',
    not_allowed: "That nickname isn't allowed. Try another one.",
    taken: 'Someone already has that nickname.',
    too_many: 'Too many players joined from this network today. Try again tomorrow.',
    network: "Can't reach the leaderboard right now. Try again in a bit.",
    server_error: 'Something went wrong on the leaderboard. Try again in a bit.',
  };
  const say = (el, error) => (el.textContent = error ? ERRORS[error] || ERRORS.server_error : '');
  const ask = (action, nickname) =>
    chrome.runtime
      .sendMessage({ type: 'board', action, nickname })
      .then((res) => res || { ok: false, error: 'server_error' }, () => ({ ok: false, error: 'network' }));

  let refresh = 0;
  async function openBoard() {
    const { mknBoard } = await chrome.storage.local.get('mknBoard');
    $('board-join').hidden = !!mknBoard;
    $('board-list').hidden = !mknBoard;
    clearInterval(refresh);
    if (!mknBoard) return $('join-name').focus();
    $('me-name').textContent = mknBoard.nickname;
    $('rename-name').value = mknBoard.nickname;
    loadTop();
    refresh = setInterval(loadTop, 60000);
  }

  async function loadTop() {
    const res = await ask('top');
    if (!res.ok) return res.error === 'not_joined' ? openBoard() : say($('board-error'), res.error);
    say($('board-error'));
    drawBoard(res);
  }

  const MEDALS = ['🥇', '🥈', '🥉'];
  function cell(className, text, title) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    if (title) span.title = title;
    return span;
  }
  function boardRow(p, mine) {
    const ml = MKN.tokensToMl(p.tokens).high;
    const { tier } = MKN.tierFor(ml);
    const li = document.createElement('li');
    if (mine) li.className = 'mine';
    li.append(
      cell('board-rank', MEDALS[p.rank - 1] || String(p.rank)),
      cell('board-name', p.nickname),
      cell('board-tier', tier.emoji, tier.name),
      cell('board-ml', MKN.formatMl(ml)),
    );
    return li;
  }
  function drawBoard({ top, me, players }) {
    $('board-count').textContent = `${players.toLocaleString('en-US')} ${players === 1 ? 'player' : 'players'}`;
    const isMe = (p) => me && p.nickname === me.nickname;
    const rows = top.map((p) => boardRow(p, isMe(p)));
    if (me && !top.some(isMe)) {
      const gap = document.createElement('li');
      gap.className = 'board-gap';
      gap.textContent = '···';
      rows.push(gap, boardRow(me, true));
    }
    $('board-rows').replaceChildren(...rows);
  }

  // Join and rename share the same steps: check here first, then ask the server.
  function nicknameForm(form, input, errorEl, action, done) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const local = MKN.nickname.check(input.value);
      if (!local.ok) return say(errorEl, local.reason);
      const button = form.querySelector('button');
      button.disabled = true;
      const res = await ask(action, local.nickname);
      button.disabled = false;
      say(errorEl, res.ok ? null : res.error);
      if (res.ok) done();
    });
    input.addEventListener('input', () => say(errorEl));
  }
  nicknameForm($('join-form'), $('join-name'), $('join-error'), 'join', openBoard);
  nicknameForm($('rename-form'), $('rename-name'), $('rename-error'), 'rename', () => {
    $('board-list').querySelector('details').open = false;
    openBoard();
  });

  // Leaving needs two clicks, like "Reset bill".
  const leaveBtn = $('leave');
  let leaveArmed = null;
  leaveBtn.addEventListener('click', async () => {
    if (!leaveArmed) {
      leaveBtn.textContent = 'Are you sure? Click again';
      leaveArmed = setTimeout(() => {
        leaveArmed = null;
        leaveBtn.textContent = 'Leave the leaderboard';
      }, 3000);
      return;
    }
    clearTimeout(leaveArmed);
    leaveArmed = null;
    leaveBtn.textContent = 'Leave the leaderboard';
    const res = await ask('leave');
    if (res.ok) openBoard();
    else say($('rename-error'), res.error);
  });
})();
