const test = require('node:test');
const assert = require('node:assert/strict');

const store = require('../src/store.js');

// A tiny in-memory chrome.storage.local.
function fakeChrome(initial = {}) {
  const data = structuredClone(initial);
  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in data).map((k) => [k, structuredClone(data[k])])),
        set: async (items) => Object.assign(data, structuredClone(items)),
        remove: async (keys) => [].concat(keys).forEach((k) => delete data[k]),
      },
    },
  };
  return data;
}

test('the lifetime total counts every token and survives "Reset bill"', async () => {
  fakeChrome();
  await store.addTokens('chatgpt', 100);
  await store.addTokens('claude', 50);
  assert.equal(await store.getLifetime(), 150);
  await store.reset();
  assert.deepEqual(await store.getDays(), {});
  assert.equal(await store.getLifetime(), 150);
  await store.addTokens('gemini', 10);
  assert.equal(await store.getLifetime(), 160);
});

test('an older install starts its lifetime total from the days it already saved', async () => {
  fakeChrome({ days: { '2026-10-01': { chatgpt: 400 } } });
  assert.equal(await store.getLifetime(), 400);
  await store.addTokens('claude', 5);
  await store.reset();
  assert.equal(await store.getLifetime(), 405);
});

test('weekTotals sums Monday to Sunday of the current week only', () => {
  const days = {
    '2026-10-18': { chatgpt: 1000 }, // the Sunday before: not this week
    '2026-10-19': { chatgpt: 10, claude: 1 },
    '2026-10-22': { chatgpt: 20 },
    '2026-10-25': { claude: 5 },
    '2026-10-26': { chatgpt: 1000 }, // next Monday: not this week
  };
  const week = store.weekTotals(days, new Date(2026, 9, 22));
  assert.equal(week.total, 36);
  assert.deepEqual(week.bySite, { chatgpt: 30, claude: 6 });
});

test('weekTotals on a Sunday still includes that week\'s Monday', () => {
  const days = { '2026-10-19': { chatgpt: 7 }, '2026-10-25': { chatgpt: 3 } };
  assert.equal(store.weekTotals(days, new Date(2026, 9, 25)).total, 10);
});

test('addTokens keeps a per-day history that "Reset bill" does not clear', async () => {
  fakeChrome();
  await store.addTokens('chatgpt', 100);
  await store.addTokens('claude', 50);
  assert.equal((await store.getHistory())[store.dateKey()], 150);
  await store.reset();
  assert.deepEqual(await store.getDays(), {});
  assert.equal((await store.getHistory())[store.dateKey()], 150);
});

test('history starts from the days already saved, without double counting', async () => {
  fakeChrome({ days: { '2026-10-01': { chatgpt: 400 } } });
  assert.deepEqual(await store.getHistory(), { '2026-10-01': 400 });
  await store.addTokens('claude', 5);
  assert.deepEqual(await store.getHistory(), { '2026-10-01': 400, [store.dateKey()]: 5 });
});

test('history older than 400 days is dropped on the next write', async () => {
  fakeChrome({ history: { '2020-01-01': 9 } });
  await store.addTokens('claude', 1);
  assert.equal((await store.getHistory())['2020-01-01'], undefined);
});
