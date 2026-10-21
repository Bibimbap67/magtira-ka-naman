// Saves token totals in chrome.storage.local as { days: { "YYYY-MM-DD": { siteId: tokens } } },
// plus { lifetime: tokens }, an all-time total for the leaderboard that "Reset bill" keeps,
// plus { history: { "YYYY-MM-DD": tokens } }, the day totals behind the heatmap, which "Reset bill" also keeps.
// Numbers only — chat text is never stored.
(function (root) {
  const KEY = 'days';
  const LIFETIME = 'lifetime';
  const HISTORY = 'history';
  const HISTORY_DAYS = 400; // about 13 months; older days are dropped on write

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

  // Monday to Sunday of the week that holds `now`.
  function weekTotals(days, now = new Date()) {
    const back = (now.getDay() + 6) % 7;
    const monday = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
    const sunday = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back + 6));
    return sumDays(days, (day) => day >= monday && day <= sunday);
  }

  // { day: tokens } from { day: { site: tokens } }.
  function historyFrom(days) {
    return Object.fromEntries(Object.entries(days || {}).map(([day, sites]) => [day, sumDays({ [day]: sites }).total]));
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

  // Installs from before the history existed start it from the days they saved.
  async function getHistory() {
    const { [KEY]: days = {}, [HISTORY]: history } = await chrome.storage.local.get([KEY, HISTORY]);
    return history ?? historyFrom(days);
  }

  // Writes are chained so two quick adds in one tab can't overwrite each other.
  let queue = Promise.resolve();
  function addTokens(siteId, tokens) {
    if (!(tokens > 0)) return queue;
    queue = queue.then(async () => {
      const lifetime = await getLifetime();
      const days = await getDays();
      const history = await getHistory();
      const day = dateKey();
      history[day] = (history[day] || 0) + tokens; // before `days` changes, so a backfill can't count it twice
      const now = new Date();
      const oldest = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - HISTORY_DAYS));
      for (const key of Object.keys(history)) if (key < oldest) delete history[key];
      days[day] = days[day] || {};
      days[day][siteId] = (days[day][siteId] || 0) + tokens;
      await chrome.storage.local.set({ [KEY]: days, [HISTORY]: history, [LIFETIME]: lifetime + tokens });
    });
    return queue;
  }

  // Clears the bill only; the lifetime total and the heatmap history stay.
  function reset() {
    return chrome.storage.local.remove(KEY);
  }

  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]) callback(changes[KEY].newValue || {});
    });
  }

  const api = { KEY, LIFETIME, HISTORY, dateKey, sumDays, todayTotals, monthTotals, weekTotals, historyFrom, getDays, getHistory, getLifetime, addTokens, reset, onChange };
  root.MKN = root.MKN || {};
  root.MKN.store = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
