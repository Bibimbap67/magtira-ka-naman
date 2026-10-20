// The leaderboard server: a Cloudflare Worker with a D1 (SQLite) database.
// It keeps only a random id, a nickname and an all-time token total per player,
// and never sends anyone's id back out.
import nickname from '../../src/nickname.js';

const TOP = 20;
const SUBMIT_GAP_MS = 60 * 1000; // at most one update a minute
const HOUR_MS = 3600 * 1000;
const HOUR_CAP = 300000; // most tokens an hour can add (cheating guard)
const JOIN_CAP = 1000000; // most tokens you can bring when joining
const JOINS_PER_NETWORK_PER_DAY = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const reply = (status, body) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: body === null ? CORS : { ...CORS, 'content-type': 'application/json' },
  });
const fail = (status, error) => reply(status, { error });
const isId = (id) => typeof id === 'string' && UUID.test(id);
const isTotal = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const isUnique = (e) => /UNIQUE/i.test(String(e?.message));

async function readBody(request) {
  const text = await request.text();
  if (text.length > 1000) return null;
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

// The day is part of the hash, so the stored value can't be linked across days.
async function networkKey(request, day, env) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const data = new TextEncoder().encode(`${ip}|${day}|${env.IP_SALT || ''}`);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...hash.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function join({ request, env, db, body, t }) {
  if (!isId(body.id)) return fail(400, 'bad_request');
  const name = nickname.check(body.nickname);
  if (!name.ok) return fail(400, name.reason);
  if (await db.prepare('SELECT 1 FROM players WHERE id = ?').bind(body.id).first()) return fail(409, 'already_joined');

  const day = new Date(t).toISOString().slice(0, 10);
  const network = await networkKey(request, day, env);
  const seen = await db.prepare('SELECT n FROM joins WHERE ip_hash = ? AND day = ?').bind(network, day).first();
  if (seen && seen.n >= JOINS_PER_NETWORK_PER_DAY) return fail(429, 'too_many');

  const tokens = isTotal(body.total) ? Math.min(body.total, JOIN_CAP) : 0;
  try {
    await db
      .prepare('INSERT INTO players (id, nickname, nickname_key, tokens, updated_at, hour_start, hour_tokens) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .bind(body.id, name.nickname, name.key, tokens, t, t)
      .run();
  } catch (e) {
    if (isUnique(e)) return fail(409, 'taken');
    throw e;
  }
  await db
    .prepare('INSERT INTO joins (ip_hash, day, n) VALUES (?, ?, 1) ON CONFLICT (ip_hash, day) DO UPDATE SET n = n + 1')
    .bind(network, day)
    .run();
  await db.prepare('DELETE FROM joins WHERE day < ?').bind(day).run();
  return reply(200, { ok: true, nickname: name.nickname, tokens });
}

async function rename({ db, body }) {
  if (!isId(body.id)) return fail(400, 'bad_request');
  const name = nickname.check(body.nickname);
  if (!name.ok) return fail(400, name.reason);
  try {
    const result = await db
      .prepare('UPDATE players SET nickname = ?, nickname_key = ? WHERE id = ?')
      .bind(name.nickname, name.key, body.id)
      .run();
    if (!result.meta.changes) return fail(404, 'not_joined');
  } catch (e) {
    if (isUnique(e)) return fail(409, 'taken');
    throw e;
  }
  return reply(200, { ok: true, nickname: name.nickname });
}

// The extension sends its all-time total; the server only ever moves it up, and slowly.
async function submit({ db, body, t }) {
  if (!isId(body.id) || !isTotal(body.total)) return fail(400, 'bad_request');
  const p = await db
    .prepare('SELECT tokens, updated_at, hour_start, hour_tokens FROM players WHERE id = ?')
    .bind(body.id)
    .first();
  if (!p) return fail(404, 'not_joined');
  if (t - p.updated_at < SUBMIT_GAP_MS) return fail(429, 'too_fast');

  const newHour = t - p.hour_start >= HOUR_MS;
  const hourStart = newHour ? t : p.hour_start;
  const used = newHour ? 0 : p.hour_tokens;
  const added = Math.max(0, Math.min(body.total - p.tokens, HOUR_CAP - used));
  await db
    .prepare('UPDATE players SET tokens = ?, updated_at = ?, hour_start = ?, hour_tokens = ? WHERE id = ?')
    .bind(p.tokens + added, t, hourStart, used + added, body.id)
    .run();
  return reply(200, { ok: true, tokens: p.tokens + added });
}

async function leave({ db, body }) {
  if (!isId(body.id)) return fail(400, 'bad_request');
  await db.prepare('DELETE FROM players WHERE id = ?').bind(body.id).run();
  return reply(200, { ok: true });
}

// Top 20, plus your own place when ?id= is given. Equal totals share a rank.
async function top({ db, url }) {
  const { results } = await db
    .prepare('SELECT nickname, tokens FROM players ORDER BY tokens DESC, nickname_key ASC LIMIT ?')
    .bind(TOP)
    .all();
  let rank = 0;
  const list = results.map((p, i) => {
    if (i === 0 || p.tokens !== results[i - 1].tokens) rank = i + 1;
    return { rank, nickname: p.nickname, tokens: p.tokens };
  });

  let me = null;
  const id = url.searchParams.get('id');
  const mine = isId(id) && (await db.prepare('SELECT nickname, tokens FROM players WHERE id = ?').bind(id).first());
  if (mine) {
    const above = await db.prepare('SELECT COUNT(*) AS n FROM players WHERE tokens > ?').bind(mine.tokens).first();
    me = { rank: above.n + 1, nickname: mine.nickname, tokens: mine.tokens };
  }
  const { n } = await db.prepare('SELECT COUNT(*) AS n FROM players').first();
  return reply(200, { top: list, me, players: n });
}

const ROUTES = {
  'POST /join': join,
  'POST /rename': rename,
  'POST /submit': submit,
  'POST /leave': leave,
  'GET /top': top,
};

export function createWorker({ now = Date.now } = {}) {
  return {
    async fetch(request, env) {
      if (request.method === 'OPTIONS') return reply(204, null);
      const url = new URL(request.url);
      const handler = ROUTES[`${request.method} ${url.pathname}`];
      if (!handler) {
        const known = Object.keys(ROUTES).some((r) => r.endsWith(` ${url.pathname}`));
        return known ? fail(405, 'method_not_allowed') : fail(404, 'not_found');
      }
      let body = {};
      if (request.method === 'POST') {
        body = await readBody(request);
        if (!body) return fail(400, 'bad_request');
      }
      try {
        return await handler({ request, env, url, body, db: env.DB, t: now() });
      } catch (e) {
        console.error(e);
        return fail(500, 'server_error');
      }
    },
  };
}

export default createWorker();
