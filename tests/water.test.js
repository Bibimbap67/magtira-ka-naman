const test = require('node:test');
const assert = require('node:assert/strict');

const { estimateTokens } = require('../src/tokens.js');
const water = require('../src/water.js');
const store = require('../src/store.js');

test('estimateTokens uses ~4 characters per token', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens('   \n  '), 0);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('abcde'), 2);
  // Runs of whitespace count as one character.
  assert.equal(estimateTokens('ab    \n\n  cd'), estimateTokens('ab cd'));
});

test('tokensToMl gives a low–high range', () => {
  assert.deepEqual(water.tokensToMl(0), { low: 0, high: 0 });
  const { low, high } = water.tokensToMl(1000);
  assert.ok(Math.abs(low - 0.5) < 1e-9);
  assert.ok(Math.abs(high - 50) < 1e-9);
  assert.deepEqual(water.tokensToMl(-5), { low: 0, high: 0 });
});

test('water is measured in mL and L only', () => {
  assert.equal(water.UNITS, undefined);
  assert.equal(water.formatWater, undefined);
  assert.equal(water.formatRange(10000), '5–500 mL'); // 10,000 tokens
  assert.equal(water.formatRange(40000), '20 mL – 2 L');
  assert.equal(water.formatRange(0), '0 mL');
});

test('rice comparison', () => {
  assert.equal(water.riceCups(150000), 1);
  assert.equal(water.riceLine(0), 'No water used yet. 🍚');
  assert.equal(water.riceLine(1500), 'A cup of rice still uses 100× more water. 🍚');
  assert.equal(water.riceLine(300000), "That's as much water as 2 cups of rice. 🍚");
});

test('quip follows the container', () => {
  assert.equal(water.quip(0), 'Nothing yet. Nice and thrifty! 🌱');
  assert.equal(water.quip(100), 'Just a little. Still okay.'); // glass
  assert.equal(water.quip(5000), 'Enough for a bath. Magtira ka naman! 🛁');
  assert.equal(water.quip(1e9), 'You found the lost city of Atlantis. 🏛️');
});

test('formatMl shows plain mL, or liters from 1,000 mL up', () => {
  assert.equal(water.formatMl(0), '0 mL');
  assert.equal(water.formatMl(0.05), '0.05 mL');
  assert.equal(water.formatMl(0.6005), '0.6 mL');
  assert.equal(water.formatMl(60.05), '60 mL');
  assert.equal(water.formatMl(1500), '1.5 L');
  assert.equal(water.formatMl(45000), '45 L');
  assert.equal(water.formatMl(2500000), '2,500 L');
});

test('dropsFor scales with how much was added', () => {
  assert.equal(water.dropsFor(0), 0);
  assert.equal(water.dropsFor(50), 1);
  assert.equal(water.dropsFor(199), 1);
  assert.equal(water.dropsFor(200), 2);
  assert.equal(water.dropsFor(1000), 3);
  assert.equal(water.dropsFor(99999), 3);
});

test('the water moves to a bigger container each time one is full', () => {
  assert.deepEqual(
    water.TIERS.map((t) => t.name),
    ['Glass', 'Tumbler', 'Bucket', 'Bathtub', 'Swimming pool', 'Dam', 'Flood', 'Mariana Trench', 'Atlantis'],
  );
  assert.equal(water.DAILY_GLASS_ML, undefined);
  const at = (ml) => {
    const { index, level } = water.tierFor(ml);
    return [index, Math.round(level * 1000) / 1000];
  };
  assert.deepEqual(at(0), [0, 0]);
  assert.deepEqual(at(125), [0, 0.5]);
  assert.deepEqual(at(250), [0, 1]); // a full glass is still the glass
  assert.deepEqual(at(500), [1, 0.5]); // poured into the 1 L tumbler: half full
  assert.deepEqual(at(1e12), [8, 1]); // Atlantis is the last one
});

test('tierUp names the new container only when moving up', () => {
  assert.equal(water.levelUp, undefined);
  assert.equal(water.tierUp(200, 300).name, 'Tumbler');
  assert.equal(water.tierUp(100, 5000).name, 'Bathtub'); // skipping some names the last
  assert.equal(water.tierUp(300, 400), null);
  assert.equal(water.tierUp(5000, 100), null); // going down is never a level-up
});

test('store sums today and this month per site', () => {
  const now = new Date(2026, 9, 19, 12); // Oct 19, 2026 (local time)
  const days = {
    '2026-10-19': { chatgpt: 100, claude: 50 },
    '2026-10-01': { chatgpt: 10 },
    '2026-09-30': { gemini: 999 },
  };
  assert.equal(store.dateKey(now), '2026-10-19');
  assert.deepEqual(store.todayTotals(days, now), { total: 150, bySite: { chatgpt: 100, claude: 50 } });
  assert.deepEqual(store.monthTotals(days, now), { total: 160, bySite: { chatgpt: 110, claude: 50 } });
  assert.deepEqual(store.todayTotals({}, now), { total: 0, bySite: {} });
});
