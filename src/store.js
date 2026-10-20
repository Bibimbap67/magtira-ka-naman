// Saves token totals in chrome.storage.local as { days: { "YYYY-MM-DD": { siteId: tokens } } },
// plus { lifetime: tokens }, an all-time total for the leaderboard that "Reset bill" keeps.
// Numbers only — chat text is never stored.
(function (root) {
  const KEY = 'days';
  const LIFETIME = 'lifetime';

  function dateKey(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  // Sums the days whose key passes `keep`, overall and per site.
  function sumDays(days, keep = () => true) {
    const bySite = {};
    let total = 0;
    for (const [day, sites] of Object.entries(days || {})) {
      if (!keep(day)) continue;
      for (const [site, tokens] of Object.entries(sites)) {
        bySite[site] = (bySite[site] || 0) + tokens;
        total += tokens;
      }
    }
    return { total, bySite };
  }

  function todayTotals(days, now = new Date()) {
    const today = dateKey(now);
    return sumDays(days, (day) => day === today);
  }

  function monthTotals(days, now = new Date()) {
    const month = dateKey(now).slice(0, 7);
    return sumDays(days, (day) => day.startsWith(month));
  }

  async function getDays() {
    const { [KEY]: days = {} } = await chrome.storage.local.get(KEY);
    return days;
  }

  // Installs from before the lifetime total existed start it from the days they saved.
  async function getLifetime() {
    const { [KEY]: days = {}, [LIFETIME]: lifetime } = await chrome.storage.local.get([KEY, LIFETIME]);
    return lifetime ?? sumDays(days).total;
  }

  // Writes are chained so two quick adds in one tab can't overwrite each other.
  let queue = Promise.resolve();
  function addTokens(siteId, tokens) {
    if (!(tokens > 0)) return queue;
    queue = queue.then(async () => {
      const lifetime = await getLifetime();
      const days = await getDays();
      const day = dateKey();
      days[day] = days[day] || {};
      days[day][siteId] = (days[day][siteId] || 0) + tokens;
      await chrome.storage.local.set({ [KEY]: days, [LIFETIME]: lifetime + tokens });
    });
    return queue;
  }

  // Clears the bill only; the lifetime total stays.
  function reset() {
    return chrome.storage.local.remove(KEY);
  }

  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]) callback(changes[KEY].newValue || {});
    });
  }

  const api = { KEY, LIFETIME, dateKey, sumDays, todayTotals, monthTotals, getDays, getLifetime, addTokens, reset, onChange };
  root.MKN = root.MKN || {};
  root.MKN.store = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
