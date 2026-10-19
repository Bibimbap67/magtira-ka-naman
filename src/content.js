// Runs on the chat sites. Watches for chat messages, counts each one's tokens once
// it has finished, and adds them to today's total. Chat text never leaves this tab.
(function () {
  const MKN = globalThis.MKN;
  const site = MKN.detectSite(location.hostname);
  if (!site) return;

  const SCAN_DELAY_MS = 400; // wait this long after page changes before scanning
  const SETTLE_MS = 1500; // a message counts once it stops changing for this long
  const SEND_WINDOW_MS = 2 * 60 * 1000; // messages that appear this soon after a send are new

  // Old messages that are already on screen (opening a past chat, reloading the
  // page) must not count again. So a message only counts if it showed up or
  // changed soon after you sent something.
  let lastSendAt = 0;

  // Each message on screen gets a state: { sig, tokens, counted, live, changedAt, elRef }.
  // The site may re-create a message's element, so states are also found by the
  // site's message id or by identical text.
  const stateByEl = new WeakMap();
  const stateById = new Map();
  const statesByHash = new Map(); // hash of text -> Set of states (replies can repeat)

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return String(h);
  }

  function findMessages() {
    for (const sel of site.selectors) {
      // Skip matches nested inside another match so nothing counts twice.
      const els = [...document.querySelectorAll(sel)].filter((el) => !el.parentElement?.closest(sel));
      if (els.length) return { els, fallback: false };
    }
    const main = document.querySelector(MKN.FALLBACK_SELECTOR);
    return { els: main ? [main] : [], fallback: true };
  }

  function read(el, fallback) {
    if (!fallback) {
      const text = el.innerText || '';
      return { sig: text, tokens: MKN.estimateTokens(text) };
    }
    // Fallback: the whole chat area, minus whatever is being typed in the input box.
    let length = (el.innerText || '').length;
    for (const box of el.querySelectorAll('[contenteditable="true"], textarea')) {
      length -= (box.innerText || box.value || '').length;
    }
    length = Math.max(0, length);
    return { sig: `len:${length}`, tokens: Math.ceil(length / MKN.CHARS_PER_TOKEN) };
  }

  function lookup(el, sig) {
    const known = stateByEl.get(el);
    if (known) return known;
    const id = site.idAttr && el.getAttribute(site.idAttr);
    if (id && stateById.has(id)) return stateById.get(id);
    // Same text as a message whose element was just removed → it's that message, re-created.
    for (const twin of statesByHash.get(hash(sig)) || []) {
      if (!twin.elRef?.deref()?.isConnected) return twin;
    }
    return null;
  }

  function remember(el, state) {
    state.elRef = new WeakRef(el);
    stateByEl.set(el, state);
    const id = site.idAttr && el.getAttribute(site.idAttr);
    if (id) stateById.set(id, state);
    const h = hash(state.sig);
    if (!statesByHash.has(h)) statesByHash.set(h, new Set());
    statesByHash.get(h).add(state);
  }

  function update(state, sig, tokens) {
    const oldHash = hash(state.sig);
    statesByHash.get(oldHash)?.delete(state);
    if (statesByHash.get(oldHash)?.size === 0) statesByHash.delete(oldHash);
    state.sig = sig;
    state.tokens = tokens;
  }

  function scan() {
    const now = Date.now();
    const recent = now - lastSendAt < SEND_WINDOW_MS;
    const { els, fallback } = findMessages();
    let added = 0;
    let waiting = false;

    for (const el of els) {
      const { sig, tokens } = read(el, fallback);
      let state = lookup(el, sig);

      if (!state) {
        state = { sig, tokens, counted: recent ? 0 : tokens, live: recent, changedAt: now };
      } else if (state.sig !== sig) {
        update(state, sig, tokens);
        state.changedAt = now;
        // A reply that is still streaming stays live even past the send window.
        if (recent || state.live) state.live = true;
        else state.counted = tokens;
      }
      remember(el, state);

      if (!state.live) continue;
      if (now - state.changedAt < SETTLE_MS) {
        waiting = true;
        continue;
      }
      if (state.tokens > state.counted) added += state.tokens - state.counted;
      state.counted = state.tokens; // never subtract when a message shrinks
      state.live = false; // if it grows again soon after a send, it becomes live again
    }

    if (added > 0) save(added);
    if (waiting) scheduleScan(SETTLE_MS);
  }

  function save(tokens) {
    if (!chrome.runtime?.id) return stop(); // extension was reloaded or removed
    MKN.store.addTokens(site.id, tokens).catch(() => {});
  }

  let timer = null;
  function scheduleScan(delay = SCAN_DELAY_MS) {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      scan();
    }, delay);
  }

  // --- Detecting "you just sent something" ---

  function markSend() {
    lastSendAt = Date.now();
    scheduleScan();
  }

  function isTyping(target) {
    return target instanceof Element && (target.isContentEditable || target.closest('textarea'));
  }

  function buttonLabel(btn) {
    return ['aria-label', 'data-testid', 'title'].map((a) => btn.getAttribute(a) || '').join(' ');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && isTyping(e.target)) markSend();
  }

  function onClick(e) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target || target.closest('#mkn-widget')) return;
    const btn = target.closest('button, [role="button"]');
    if (btn && MKN.SEND_BUTTON_PATTERN.test(buttonLabel(btn))) return markSend();
    // Clicking a link (e.g. an old chat in the sidebar) is not sending anything.
    if (target.closest('a[href]')) lastSendAt = 0;
  }

  // --- Start ---

  // A glass left behind by an older copy of the extension (see background.js).
  document.querySelectorAll('#mkn-widget').forEach((old) => old.remove());
  const widget = MKN.widget.mount();
  MKN.store.getDays().then(widget.render, () => {});
  MKN.store.onChange(widget.render);

  const observer = new MutationObserver((records) => {
    // The widget's own animation is not chat activity.
    if (records.every((r) => widget.el.contains(r.target))) return;
    scheduleScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('click', onClick, true);

  // Reloading or updating the extension cuts this script off: it no longer hears the
  // popup's switch or saves anything, but its glass would stay on the page. Remove it.
  // background.js then puts the new copy in this tab.
  const orphanCheck = setInterval(() => !chrome.runtime?.id && stop(), 2000);

  function stop() {
    clearInterval(orphanCheck);
    widget.el.remove();
    observer.disconnect();
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('click', onClick, true);
  }

  scan(); // records what's already on screen without counting it
})();
