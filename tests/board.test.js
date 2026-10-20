// The extension side of the leaderboard (src/board.js), with a fake server and fake storage.
const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/nickname.js');
const { create } = require('../src/board.js');

const URL = 'https://board.test';
const ID = '00000000-0000-4000-8000-000000000001';

function setup({ lifetime = 1234, replies = {} } = {}) {
  const data = {};
  const calls = [];
  const storage = {
    get: async (key) => (key in data ? { [key]: structuredClone(data[key]) } : {}),
    set: async (items) => Object.assign(data, structuredClone(items)),
    remove: async (key) => delete data[key],
  };
  const fetchFn = async (url, init = {}) => {
    const route = `${init.method || 'GET'} ${url.slice(URL.length).split('?')[0]}`;
    calls.push({ route, url, body: init.body ? JSON.parse(init.body) : undefined });
    const reply = replies[route];
    if (reply === 'offline') throw new TypeError('Failed to fetch');
    const [status, json] = reply || [200, { ok: true }];
    return { ok: status < 400, status, json: async () => json };
  };
  const board = create({ url: URL, fetchFn, storage, store: { getLifetime: async () => lifetime }, newId: () => ID });
  return { board, data, calls };
}

test('nothing is sent to the server before you join', async () => {
  const { board, calls } = setup();
  assert.deepEqual(await board.sync(), { ok: false, error: 'not_joined' });
  assert.deepEqual(await board.top(), { ok: false, error: 'not_joined' });
  assert.deepEqual(await board.leave(), { ok: false, error: 'not_joined' });
  assert.equal(calls.length, 0);
});

test('a bad nickname is refused right away, without asking the server', async () => {
  const { board, calls } = setup();
  assert.deepEqual(await board.join('ab'), { ok: false, error: 'too_short' });
  assert.deepEqual(await board.join('b1tch'), { ok: false, error: 'not_allowed' });
  assert.equal(calls.length, 0);
});

test('join sends only the id, nickname and lifetime total, then remembers you', async () => {
  const { board, data, calls } = setup({ replies: { 'POST /join': [200, { ok: true, nickname: 'Migs Cruz', tokens: 1234 }] } });
  assert.equal((await board.join('  Migs   Cruz ')).ok, true);
  assert.deepEqual(calls[0].body, { id: ID, nickname: 'Migs Cruz', total: 1234 });
  assert.deepEqual(data.mknBoard, { id: ID, nickname: 'Migs Cruz' });
  assert.deepEqual(await board.join('Again'), { ok: false, error: 'already_joined' });
});

test('a refused join is not remembered', async () => {
  const { board, data } = setup({ replies: { 'POST /join': [409, { error: 'taken' }] } });
  assert.deepEqual(await board.join('Migs'), { ok: false, error: 'taken' });
  assert.equal(data.mknBoard, undefined);
});

test('sync sends only your id and lifetime total', async () => {
  const { board, calls } = setup({ lifetime: 5000 });
  await board.join('Migs');
  await board.sync();
  assert.deepEqual(calls[1], { route: 'POST /submit', url: `${URL}/submit`, body: { id: ID, total: 5000 } });
});

test('if the server no longer knows you, you are shown as not joined', async () => {
  const { board, data } = setup({ replies: { 'POST /submit': [404, { error: 'not_joined' }] } });
  await board.join('Migs');
  assert.equal((await board.sync()).error, 'not_joined');
  assert.equal(data.mknBoard, undefined);
});

test('top asks for your own rank too', async () => {
  const { board, calls } = setup({
    replies: { 'GET /top': [200, { top: [], me: { rank: 1, nickname: 'Migs', tokens: 9 }, players: 1 }] },
  });
  await board.join('Migs');
  const res = await board.top();
  assert.equal(res.me.rank, 1);
  assert.equal(calls[1].url, `${URL}/top?id=${ID}`);
});

test('rename keeps the new nickname; leave forgets you, but only once the server agrees', async () => {
  const { board, data } = setup({ replies: { 'POST /rename': [200, { ok: true, nickname: 'Ana' }] } });
  await board.join('Migs');
  assert.equal((await board.rename('Ana')).ok, true);
  assert.equal(data.mknBoard.nickname, 'Ana');
  assert.equal((await board.leave()).ok, true);
  assert.equal(data.mknBoard, undefined);

  const offline = setup({ replies: { 'POST /leave': 'offline' } });
  await offline.board.join('Migs');
  assert.deepEqual(await offline.board.leave(), { ok: false, error: 'network' });
  assert.equal(offline.data.mknBoard.nickname, 'Migs');
});
