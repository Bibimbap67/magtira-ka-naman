// Talks to the leaderboard server. Used only by the service worker (background.js),
// and only after you join. It sends a random id, your nickname and your all-time
// token total — never chat text. You are remembered as { mknBoard: { id, nickname } }.
(function (root) {
  const KEY = 'mknBoard';
  const TIMEOUT_MS = 8000;

  function create({
    url,
    fetchFn = (...args) => fetch(...args),
    storage = chrome.storage.local,
    store = root.MKN.store,
    newId = () => crypto.randomUUID(),
  }) {
    const notJoined = { ok: false, error: 'not_joined' };

    // { ok: true, ...reply } or { ok: false, error }.
    async function call(method, path, body) {
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
      try {
        const res = await fetchFn(url + path, {
          method,
          headers: body ? { 'content-type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: abort.signal,
        });
        const json = await res.json().catch(() => ({}));
        return res.ok ? { ok: true, ...json } : { ok: false, error: json.error || 'server_error' };
      } catch {
        return { ok: false, error: 'network' };
      } finally {
        clearTimeout(timer);
      }
    }

    const me = async () => (await storage.get(KEY))[KEY] || null;
    // The server no longer knows you (you left elsewhere, or were removed).
    const forgetIf = async (res) => {
      if (res.error === 'not_joined') await storage.remove(KEY);
      return res;
    };

    async function join(raw) {
      const name = root.MKN.nickname.check(raw);
      if (!name.ok) return { ok: false, error: name.reason };
      if (await me()) return { ok: false, error: 'already_joined' };
      const id = newId();
      const res = await call('POST', '/join', { id, nickname: name.nickname, total: await store.getLifetime() });
      if (res.ok) await storage.set({ [KEY]: { id, nickname: name.nickname } });
      return res;
    }

    async function rename(raw) {
      const player = await me();
      if (!player) return notJoined;
      const name = root.MKN.nickname.check(raw);
      if (!name.ok) return { ok: false, error: name.reason };
      const res = await call('POST', '/rename', { id: player.id, nickname: name.nickname });
      if (res.ok) await storage.set({ [KEY]: { ...player, nickname: name.nickname } });
      return forgetIf(res);
    }

    async function leave() {
      const player = await me();
      if (!player) return notJoined;
      const res = await call('POST', '/leave', { id: player.id });
      if (res.ok) await storage.remove(KEY);
      return res;
    }

    async function top() {
      const player = await me();
      if (!player) return notJoined;
      return forgetIf(await call('GET', `/top?id=${encodeURIComponent(player.id)}`));
    }

    async function sync() {
      const player = await me();
      if (!player) return notJoined;
      return forgetIf(await call('POST', '/submit', { id: player.id, total: await store.getLifetime() }));
    }

    return { me, join, rename, leave, top, sync };
  }

  const api = { KEY, create };
  root.MKN = root.MKN || {};
  root.MKN.board = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
