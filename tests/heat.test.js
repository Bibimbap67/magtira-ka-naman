const test = require('node:test');
const assert = require('node:assert/strict');

const heat = require('../src/heat.js');

const THU = new Date(2026, 9, 22); // Thursday 22 Oct 2026

test('weekBars gives Monday to Sunday, marks today, and later days are future', () => {
  const days = { '2026-10-19': { chatgpt: 10, claude: 5 }, '2026-10-22': { gemini: 7 } };
  const bars = heat.weekBars(days, THU);
  assert.deepEqual(bars.map((b) => b.label), ['M', 'T', 'W', 'Th', 'F', 'S', 'S']);
  assert.equal(bars[0].key, '2026-10-19');
  assert.equal(bars[0].tokens, 15);
  assert.equal(bars[3].today, true);
  assert.equal(bars[3].tokens, 7);
  assert.deepEqual(bars.map((b) => b.future), [false, false, false, false, true, true, true]);
});

test('weekBars on a Sunday has no future days', () => {
  const bars = heat.weekBars({}, new Date(2026, 9, 25));
  assert.equal(bars[6].today, true);
  assert.ok(bars.every((b) => !b.future));
});

test('heatCells is 53 columns of 7, ends with the week of today, and marks today', () => {
  const { cells } = heat.heatCells({}, THU);
  assert.equal(cells.length, 371);
  assert.equal(cells[0].key.slice(0, 4) >= '2025', true);
  assert.equal(cells[370].key, '2026-10-24'); // the Saturday of today's week
  assert.deepEqual(cells.filter((c) => c.today).map((c) => c.key), ['2026-10-22']);
  assert.deepEqual(cells.slice(-2).map((c) => c.future), [true, true]);
  assert.equal(cells.find((c) => c.key === '2026-10-22').future, false);
});

test('heatCells steps whole days across daylight-saving changes', () => {
  for (const now of [new Date(2026, 10, 5), new Date(2026, 2, 15), new Date(2026, 9, 30)]) {
    const { cells } = heat.heatCells({}, now);
    assert.equal(new Set(cells.map((c) => c.key)).size, 371);
    for (let i = 1; i < cells.length; i++) {
      const [y, m, d] = cells[i - 1].key.split('-').map(Number);
      const next = new Date(y, m - 1, d + 1);
      const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
      assert.equal(cells[i].key, key);
    }
  }
});

test('heatCells levels are relative to the busiest day', () => {
  const history = { '2026-10-20': 100, '2026-10-19': 20, '2026-10-18': 50, '2026-10-17': 75 };
  const { cells, max } = heat.heatCells(history, THU);
  const level = (key) => cells.find((c) => c.key === key).level;
  assert.equal(max, 100);
  assert.deepEqual([level('2026-10-20'), level('2026-10-19'), level('2026-10-18'), level('2026-10-17')], [4, 1, 2, 3]);
  assert.equal(level('2026-10-21'), 0);
});

test('heatCells with no history is all level 0 and max 0', () => {
  const { cells, max } = heat.heatCells({}, THU);
  assert.equal(max, 0);
  assert.ok(cells.every((c) => c.level === 0));
});

test('heatMonths labels each new month once, never closer than 3 columns apart', () => {
  const { cells } = heat.heatCells({}, THU);
  const months = heat.heatMonths(cells);
  assert.equal(months.at(-1).label, 'Oct');
  for (let i = 1; i < months.length; i++) {
    assert.notEqual(months[i].label, months[i - 1].label);
    assert.ok(months[i].col - months[i - 1].col >= 3);
  }
});

test('heatMonths drops a first label that would sit on top of the next one', () => {
  // The window for 2026-10-22 starts Sun 2025-10-19, so "Oct" is one column before "Nov".
  const { cells } = heat.heatCells({}, THU);
  assert.equal(cells[0].key, '2025-10-19');
  assert.equal(heat.heatMonths(cells)[0].label, 'Nov');
});
