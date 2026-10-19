// Fake chrome.storage / chrome.runtime so the extension scripts can run on a plain
// web page for local testing. Data is kept in localStorage so the popup page and
// the fake chat share it, the same way they share chrome.storage in the real extension.
(function () {
  const PREFIX = 'mkn-dev:';
  const listeners = [];

  function readAll() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(PREFIX)) out[key.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(key));
    }
    return out;
  }

  function notify(changes) {
    for (const fn of listeners) fn(changes, 'local');
  }

  const local = {
    async get(keys) {
      const all = readAll();
      if (keys == null) return all;
      const out = {};
      for (const k of [].concat(keys)) if (k in all) out[k] = all[k];
      return out;
    },
    async set(items) {
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        localStorage.setItem(PREFIX + k, JSON.stringify(v));
        changes[k] = { newValue: v };
      }
      notify(changes);
    },
    async remove(keys) {
      const changes = {};
      for (const k of [].concat(keys)) {
        localStorage.removeItem(PREFIX + k);
        changes[k] = { newValue: undefined };
      }
      notify(changes);
    },
  };

  // Other tabs (e.g. the popup preview) see changes through the storage event.
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(PREFIX)) {
      notify({ [e.key.slice(PREFIX.length)]: { newValue: e.newValue ? JSON.parse(e.newValue) : undefined } });
    }
  });

  window.chrome = {
    runtime: { id: 'dev' },
    storage: { local, onChanged: { addListener: (fn) => listeners.push(fn) } },
  };
})();
