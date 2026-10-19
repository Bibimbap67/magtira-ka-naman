// Token estimate. The chat sites don't show real token counts, so we use the
// common rule of thumb: ~4 characters per token. Swap this out for a real
// tokenizer later if you want closer numbers.
(function (root) {
  const CHARS_PER_TOKEN = 4;

  function estimateTokens(text) {
    if (!text) return 0;
    const clean = String(text).replace(/\s+/g, ' ').trim();
    return clean ? Math.ceil(clean.length / CHARS_PER_TOKEN) : 0;
  }

  const api = { CHARS_PER_TOKEN, estimateTokens };
  root.MKN = Object.assign(root.MKN || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
