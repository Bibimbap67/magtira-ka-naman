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
