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

  // The switch hides the widget on chat pages (counting goes on).
  const showWidget = $('show-widget');
  chrome.storage.local.get('mknHidden').then((r) => (showWidget.checked = !r.mknHidden));
  showWidget.addEventListener('change', () => chrome.storage.local.set({ mknHidden: !showWidget.checked }));

  MKN.store.getDays().then((days) => show(totalsFrom(days)));
  MKN.store.onChange((days) => show(totalsFrom(days)));
})();
