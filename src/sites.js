// Per-site settings. When a site changes its HTML and counting stops working,
// this is the file to fix: inspect a chat message and update the selectors.
(function (root) {
  const SITES = {
    chatgpt: {
      name: 'ChatGPT',
      color: '#19c37d', // bar color in the popup
      hosts: ['chatgpt.com', 'chat.openai.com'],
      // Tried in order; the first selector that matches anything is used.
      selectors: ['[data-message-author-role]', 'article[data-testid^="conversation-turn"]'],
      // Attribute holding a stable per-message id, if the site has one.
      idAttr: 'data-message-id',
    },
    claude: {
      name: 'Claude',
      color: '#d97757',
      hosts: ['claude.ai'],
      // Each selector must match both your prompts AND Claude's replies: one that only
      // finds prompts still "matches", so the backups after it would never be tried.
      selectors: [
        '[data-testid="user-message"], [data-testid="assistant-message"]', // claude.ai, Oct 2026
        '[data-testid="user-message"], .font-claude-response',
        '[data-testid="user-message"], [data-is-streaming]',
      ],
    },
    gemini: {
      name: 'Gemini',
      color: '#4c8df6',
      hosts: ['gemini.google.com'],
      selectors: ['user-query, model-response', '.query-text, message-content'],
    },
  };

  // Used when none of a site's selectors match: count new text in the main area.
  const FALLBACK_SELECTOR = 'main';

  // Clicking one of these (by aria-label, data-testid or title) counts as sending.
  const SEND_BUTTON_PATTERN = /send|submit|regenerate|retry|try again|ipadala/i;

  function detectSite(hostname) {
    for (const [id, site] of Object.entries(SITES)) {
      if (site.hosts.some((h) => hostname === h || hostname.endsWith('.' + h))) {
        return { id, ...site };
      }
    }
    return null;
  }

  const api = { SITES, FALLBACK_SELECTOR, SEND_BUTTON_PATTERN, detectSite };
  root.MKN = Object.assign(root.MKN || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
