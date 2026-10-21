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

  // What the card shows (main) and what the "by AI" list adds up to (list, sites), for the chosen view.
  // All time has no list: the lifetime total isn't split by AI.
  function totalsFrom({ days, lifetime }, view) {
    const store = MKN.store;
    const listed = view === 'week' ? store.weekTotals(days) : view === 'all' ? { total: 0, bySite: {} } : store.monthTotals(days);
    const main = view === 'week' ? listed.total : view === 'all' ? lifetime : store.todayTotals(days).total;
    const sites = Object.fromEntries(siteIds.map((id) => [id, listed.bySite[id] || 0]));
    return { main, list: listed.total, sites };
  }

  const VIEWS = {
    today: { label: 'Today', list: 'This month by AI', when: 'today' },
    week: { label: 'This week', list: 'This week by AI', when: 'this week' },
    all: { label: 'All time', list: '', when: 'in total' },
  };
  let view = 'today';
  let state = { days: {}, history: {}, lifetime: 0 };

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
    const today = MKN.tokensToMl(v.main);
    const [num, unit] = MKN.formatMl(today.high).split(' ');
    const { index, tier, level } = MKN.tierFor(today.high);
    const next = MKN.TIERS[index + 1];
    $('today-num').textContent = num;
    $('today-unit').textContent = unit;
    $('today-low').textContent = `or as little as ${MKN.formatMl(today.low)}`;
    $('tokens').textContent = `~${compact.format(Math.round(v.main))} tokens`;
    $('glass-pct').textContent = `${Math.round(level * 100)}% full`;
    $('vessel-line').textContent = next ? `${tier.name} · next: ${next.name}` : `${tier.name} · the last level`;
    $('month-high').textContent = `up to ${MKN.formatMl(MKN.tokensToMl(v.list).high)}`;
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
  // Later increases (while the popup is open) drip into the glass first; switching view doesn't (drips: false).
  function show(next, drips = true) {
    $('today-quip').textContent = MKN.quip(MKN.tokensToMl(next.main).high);
    $('month-rice').textContent = MKN.riceLine(MKN.tokensToMl(next.list).high);
    cancelAnimationFrame(frame);

    const zeros = Object.fromEntries(siteIds.map((id) => [id, 0]));
    const from = shown || { main: 0, list: 0, sites: zeros };
    const fromBars = shownBars || zeros;
    const nextBars = barPercents(next.sites);
    if (reducedMotion()) {
      shown = next;
      shownBars = nextBars;
      paint(next, nextBars);
      return;
    }

    let delay = 0;
    if (drips && shown && next.main > shown.main) {
      const count = MKN.dropsFor(next.main - shown.main);
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
      shown = { main: lerp(from.main, next.main, p), list: lerp(from.list, next.list, p), sites };
      shownBars = bars;
      paint(shown, bars, p < 1);
      if (!flicked && p > 0.6 && next.main > from.main) {
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
    const blob = await MKN.story.make(MKN.tokensToMl(totalsFrom(state, view).main), VIEWS[view].when);
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

  // --- Views: Today | This week | All time ---

  // Week bars: Mon–Sun, one per day, built once.
  const weekEls = Array.from({ length: 7 }, () => {
    const day = document.createElement('div');
    day.className = 'week-day';
    const fill = document.createElement('span');
    fill.className = 'week-fill';
    const name = document.createElement('span');
    day.append(fill, name);
    $('week-bars').append(day);
    return { day, fill, name };
  });

  const dayText = (key) => new Date(`${key}T00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  function paintWeek() {
    const bars = MKN.heat.weekBars(state.days);
    const most = Math.max(...bars.map((b) => b.tokens));
    bars.forEach((b, i) => {
      const el = weekEls[i];
      el.name.textContent = b.label;
      el.fill.style.height = b.tokens ? `${(b.tokens / most) * 100}%` : '';
      el.day.classList.toggle('today', b.today);
      el.day.classList.toggle('empty', !b.tokens);
      el.day.title = b.future ? dayText(b.key) : `${dayText(b.key)} · ${MKN.formatMl(MKN.tokensToMl(b.tokens).high)}`;
    });
  }

  // Heatmap: 53 weeks of squares, built once; paintHeat only changes their colours.
  const heatGrid = $('heat-grid');
  const heatEls = Array.from({ length: 53 * 7 }, (_, i) => {
    const cell = document.createElement('span');
    cell.dataset.i = String(i);
    heatGrid.append(cell);
    return cell;
  });
  let heatCells = [];

  function paintHeat() {
    const { cells } = MKN.heat.heatCells(state.history);
    heatCells = cells;
    cells.forEach((c, i) => {
      heatEls[i].className = `cell l${c.level}${c.future ? ' future' : ''}${c.today ? ' today' : ''}`;
    });
    const active = cells.filter((c) => c.tokens > 0);
    const busiest = active.reduce((a, c) => (c.tokens > (a?.tokens ?? 0) ? c : a), null);
    $('heat-count').textContent = `${active.length} active ${active.length === 1 ? 'day' : 'days'}`;
    heatGrid.setAttribute(
      'aria-label',
      busiest
        ? `${active.length} active days in the last 12 months, busiest day ${dayText(busiest.key)}`
        : 'No active days in the last 12 months',
    );
    $('heat-months').replaceChildren(
      ...MKN.heat.heatMonths(cells).map(({ col, label }) => {
        const span = document.createElement('span');
        span.textContent = label;
        span.style.left = `${(col / 53) * 100}%`;
        return span;
      }),
    );
  }

  // Hover or click a square: the line under the grid names that day.
  let picked = null;
  function pickDay(event) {
    const cell = heatCells[event.target.dataset?.i];
    if (!cell || cell.future) return;
    picked?.classList.remove('picked');
    picked = event.target;
    picked.classList.add('picked');
    const ml = MKN.tokensToMl(cell.tokens).high;
    $('heat-tip').textContent = cell.tokens
      ? `${dayText(cell.key)} · ${MKN.formatMl(ml)} · ${MKN.tierFor(ml).tier.name}`
      : `${dayText(cell.key)} · no AI that day`;
  }
  heatGrid.addEventListener('mouseover', pickDay);
  heatGrid.addEventListener('click', pickDay);

  // Reads everything that's saved, then draws the chosen view.
  async function load(drips = true) {
    const [days, history, lifetime] = await Promise.all([MKN.store.getDays(), MKN.store.getHistory(), MKN.store.getLifetime()]);
    state = { days, history, lifetime };
    show(totalsFrom(state, view), drips);
    paintWeek();
    paintHeat();
  }

  const rangeBtns = { today: $('range-today'), week: $('range-week'), all: $('range-all') };
  function setView(name) {
    view = name;
    for (const [key, btn] of Object.entries(rangeBtns)) btn.setAttribute('aria-pressed', String(key === name));
    $('view-label').textContent = VIEWS[name].label;
    $('ai-title').textContent = VIEWS[name].list;
    document.querySelector('.ai').hidden = name === 'all';
    $('week-bars').hidden = name !== 'week';
    $('heat').hidden = name !== 'all';
    load(false);
  }
  for (const [key, btn] of Object.entries(rangeBtns)) btn.addEventListener('click', () => setView(key));

  load();
  MKN.store.onChange(() => load());

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
