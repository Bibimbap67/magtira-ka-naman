// Tests the leaderboard server (server/src/index.js) against a real SQLite database,
// through a tiny adapter that looks like Cloudflare D1.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DAY = 24 * 3600 * 1000;
const START = Date.UTC(2026, 9, 20, 12); // Oct 20, 2026

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '../server/schema.sql'), 'utf8'));
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const api = {
        bind: (...a) => ((args = a), api),
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => ({ meta: { changes: stmt.run(...args).changes } }),
      };
      return api;
    },
  };
}

let ipCounter = 0;
async function setup() {
  const { createWorker } = await import('../server/src/index.js');
  const clock = { now: START };
  const worker = createWorker({ now: () => clock.now });
  const env = { DB: fakeD1() };
  const call = async (method, route, body, ip = `10.0.0.${++ipCounter}`) => {
    const res = await worker.fetch(
      new Request(`https://board.test${route}`, {
        method,
        headers: { 'cf-connecting-ip': ip, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    );
    return { status: res.status, json: res.status === 204 ? null : await res.json(), headers: res.headers };
  };
  return { clock, call };
}

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('join: good nickname works; bad, taken and malformed ones are refused', async () => {
  const { call } = await setup();
  assert.equal((await call('POST', '/join', { id: id(1), nickname: 'Migs' })).status, 200);

  const taken = await call('POST', '/join', { id: id(2), nickname: ' migs ' });
  assert.deepEqual([taken.status, taken.json.error], [409, 'taken']);

  const rude = await call('POST', '/join', { id: id(3), nickname: 'f u c k' });
  assert.deepEqual([rude.status, rude.json.error], [400, 'not_allowed']);

  const short = await call('POST', '/join', { id: id(3), nickname: 'ab' });
  assert.deepEqual([short.status, short.json.error], [400, 'too_short']);

  const badId = await call('POST', '/join', { id: 'not-a-uuid', nickname: 'Valid Name' });
  assert.deepEqual([badId.status, badId.json.error], [400, 'bad_request']);

  const again = await call('POST', '/join', { id: id(1), nickname: 'Another' });
  assert.deepEqual([again.status, again.json.error], [409, 'already_joined']);
});

test('join starts from the total you bring, up to 1,000,000 tokens', async () => {
  const { call } = await setup();
  await call('POST', '/join', { id: id(1), nickname: 'Small', total: 40000 });
  await call('POST', '/join', { id: id(2), nickname: 'Huge', total: 999999999 });
  const top = (await call('GET', '/top')).json.top;
  assert.deepEqual(top.map((p) => [p.nickname, p.tokens]), [['Huge', 1000000], ['Small', 40000]]);
});

test('submit: needs a joined player, at most once a minute, never goes down', async () => {
  const { clock, call } = await setup();
  assert.equal((await call('POST', '/submit', { id: id(1), total: 5 })).json.error, 'not_joined');

  await call('POST', '/join', { id: id(1), nickname: 'Migs' });
  clock.now += 61000;
  assert.equal((await call('POST', '/submit', { id: id(1), total: 5000 })).json.tokens, 5000);

  clock.now += 10000;
  const fast = await call('POST', '/submit', { id: id(1), total: 6000 });
  assert.deepEqual([fast.status, fast.json.error], [429, 'too_fast']);

  clock.now += 61000;
  assert.equal((await call('POST', '/submit', { id: id(1), total: 100 })).json.tokens, 5000); // lower: ignored

  const bad = await call('POST', '/submit', { id: id(1), total: 'lots' });
  assert.deepEqual([bad.status, bad.json.error], [400, 'bad_request']);
});

test('submit: an hour can add at most 300,000 tokens', async () => {
  const { clock, call } = await setup();
  await call('POST', '/join', { id: id(1), nickname: 'Cheater' });
  clock.now += 61000;
  assert.equal((await call('POST', '/submit', { id: id(1), total: 50000 })).json.tokens, 50000);
  clock.now += 61000;
  assert.equal((await call('POST', '/submit', { id: id(1), total: 99999999 })).json.tokens, 300000); // capped
  clock.now += 61000;
  assert.equal((await call('POST', '/submit', { id: id(1), total: 99999999 })).json.tokens, 300000); // nothing left this hour
  clock.now += 3600 * 1000;
  assert.equal((await call('POST', '/submit', { id: id(1), total: 99999999 })).json.tokens, 600000); // a new hour
});

test('top: ranked, ties share a rank, your own rank is included, no ids leak', async () => {
  const { clock, call } = await setup();
  const players = [['Ana', 900], ['Ben', 500], ['Cyd', 500], ['Dee', 100]];
  for (const [i, [name, total]] of players.entries()) {
    await call('POST', '/join', { id: id(i + 1), nickname: name, total });
  }
  clock.now += 61000;

  const res = await call('GET', `/top?id=${id(4)}`);
  assert.deepEqual(
    res.json.top.map((p) => [p.rank, p.nickname]),
    [[1, 'Ana'], [2, 'Ben'], [2, 'Cyd'], [4, 'Dee']],
  );
  assert.deepEqual(res.json.me, { rank: 4, nickname: 'Dee', tokens: 100 });
  assert.equal(res.json.players, 4);
  assert.ok(!JSON.stringify(res.json).includes('0000-4000'), 'no id in the response');
  assert.equal((await call('GET', '/top')).json.me, null);
});

test('top: shows 20, and a player outside the top 20 still sees their own rank', async () => {
  const { call } = await setup();
  for (let i = 1; i <= 25; i++) {
    await call('POST', '/join', { id: id(i), nickname: `Player ${i}`, total: i * 10 }, `192.168.0.${i}`);
  }
  const res = (await call('GET', `/top?id=${id(1)}`)).json;
  assert.equal(res.top.length, 20);
  assert.equal(res.top[0].nickname, 'Player 25');
  assert.deepEqual(res.me, { rank: 25, nickname: 'Player 1', tokens: 10 });
});

test('joins are limited per network per day', async () => {
  const { clock, call } = await setup();
  for (let i = 1; i <= 5; i++) {
    assert.equal((await call('POST', '/join', { id: id(i), nickname: `Fan ${i}` }, '7.7.7.7')).status, 200);
  }
  const sixth = await call('POST', '/join', { id: id(6), nickname: 'Fan 6' }, '7.7.7.7');
  assert.deepEqual([sixth.status, sixth.json.error], [429, 'too_many']);
  assert.equal((await call('POST', '/join', { id: id(6), nickname: 'Fan 6' }, '8.8.8.8')).status, 200); // other network
  clock.now += DAY;
  assert.equal((await call('POST', '/join', { id: id(7), nickname: 'Fan 7' }, '7.7.7.7')).status, 200); // next day
});

test('rename and leave', async () => {
  const { call } = await setup();
  await call('POST', '/join', { id: id(1), nickname: 'Migs' });
  await call('POST', '/join', { id: id(2), nickname: 'Ana' });

  assert.equal((await call('POST', '/rename', { id: id(1), nickname: 'MIGS' })).status, 200); // only the capitals change
  assert.equal((await call('POST', '/rename', { id: id(1), nickname: 'ana' })).json.error, 'taken');
  assert.equal((await call('POST', '/rename', { id: id(1), nickname: 'shit' })).json.error, 'not_allowed');
  assert.equal((await call('POST', '/rename', { id: id(9), nickname: 'Nobody' })).json.error, 'not_joined');

  assert.equal((await call('POST', '/leave', { id: id(1) })).status, 200);
  const top = (await call('GET', '/top')).json.top;
  assert.deepEqual(top.map((p) => p.nickname), ['Ana']);
  assert.equal((await call('POST', '/join', { id: id(3), nickname: 'migs' })).status, 200); // name is free again
});

test('odd requests get clear answers', async () => {
  const { call } = await setup();
  assert.equal((await call('GET', '/nope')).status, 404);
  assert.equal((await call('GET', '/join')).status, 405);

  const options = await call('OPTIONS', '/join');
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-origin'), '*');

  const { createWorker } = await import('../server/src/index.js');
  const res = await createWorker().fetch(
    new Request('https://board.test/join', { method: 'POST', body: '{oops' }),
    { DB: fakeD1() },
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'bad_request');
});
