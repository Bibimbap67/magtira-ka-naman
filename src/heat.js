// Turns the saved day totals into what the popup draws: the Mon–Sun bars for "This week"
// and the GitHub-style grid of squares for "All time". Pure functions, no DOM.
(function (root) {
  const store = (root.MKN && root.MKN.store) || require('./store.js');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const LABELS = ['M', 'T', 'W', 'Th', 'F', 'S', 'S'];

  // Days are stepped with the Date constructor, not + 86400000, so daylight saving can't skip or repeat one.
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const sameDay = (a, b) => store.dateKey(a) === store.dateKey(b);

  function weekBars(days, now = new Date()) {
    const monday = addDays(now, -((now.getDay() + 6) % 7));
    return LABELS.map((label, i) => {
      const date = addDays(monday, i);
      const key = store.dateKey(date);
      return {
        key,
        label,
        tokens: store.sumDays(days, (day) => day === key).total,
        today: sameDay(date, now),
        future: key > store.dateKey(now),
      };
    });
  }

  // 0 = no water; 1–4 by share of the busiest day.
  function level(tokens, max) {
    if (!(tokens > 0)) return 0;
    const share = tokens / max;
    return share <= 0.25 ? 1 : share <= 0.5 ? 2 : share <= 0.75 ? 3 : 4;
  }

  // `weeks` columns of 7 (Sunday on top), the last column being the week that holds `now`.
  function heatCells(history, now = new Date(), weeks = 53) {
    const first = addDays(now, -now.getDay() - (weeks - 1) * 7);
    const todayKey = store.dateKey(now);
    const days = Array.from({ length: weeks * 7 }, (_, i) => store.dateKey(addDays(first, i)));
    const max = Math.max(0, ...days.filter((key) => key <= todayKey).map((key) => (history || {})[key] || 0));
    const cells = days.map((key) => {
      const future = key > todayKey;
      const tokens = future ? 0 : (history || {})[key] || 0;
      return { key, tokens, level: level(tokens, max), future, today: key === todayKey };
    });
    return { cells, max };
  }

  // The month name above each column whose first square starts a new month. Names need 3 columns
  // of room, so a month that is only 1–2 columns wide at the left edge goes unnamed.
  function heatMonths(cells) {
    const starts = [];
    for (let col = 0; col * 7 < cells.length; col++) {
      const label = MONTHS[Number(cells[col * 7].key.slice(5, 7)) - 1];
      if (!starts.length || starts[starts.length - 1].label !== label) starts.push({ col, label });
    }
    return starts.filter((m, i) => i === starts.length - 1 || starts[i + 1].col - m.col >= 3);
  }

  const api = { weekBars, heatCells, heatMonths };
  root.MKN = root.MKN || {};
  root.MKN.heat = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
