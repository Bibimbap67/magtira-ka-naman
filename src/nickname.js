// Leaderboard nickname rules, shared by the popup (instant feedback) and the server.
// The word filter is basic on purpose: it catches common English and Tagalog bad words,
// also when stretched (shiiit), spaced out (f u c k) or written with look-alike digits (b1tch).
// Some will still get through; the server README shows how to remove a nickname by hand.
(function (root) {
  const MIN = 3;
  const MAX = 20;
  const ALLOWED = /^[\p{L}\p{N} _.\-]+$/u;

  // Blocked anywhere inside the name: long enough not to hide inside normal words.
  const INSIDE = [
    'fuck', 'shit', 'bitch', 'cunts', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard', 'pussy',
    'asshole', 'bastard', 'vagina', 'penis', 'porn', 'hitler',
    'putang', 'tangina', 'kantot', 'pakyu', 'pakshet', 'tamod', 'pekpek', 'kupal', 'jakol', 'hinayupak', 'punyeta',
  ];
  // Blocked only as a whole word: short ones that hide in normal words (Scunthorpe, Batangas, Hancock).
  const WHOLE = [
    'ass', 'sex', 'dick', 'cock', 'cunt', 'rape', 'nazi', 'anus', 'tit', 'tits',
    'puta', 'pota', 'gago', 'gaga', 'bobo', 'tanga', 'ulol', 'titi', 'burat', 'leche', 'shet', 'pucha',
  ];

  const LOOKALIKE = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', v: 'u' };
  // Lowercase a–z only: accents removed, look-alike digits swapped, everything else dropped.
  const letters = (text) =>
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[013457v]/g, (c) => LOOKALIKE[c])
      .replace(/[^a-z]/g, '');

  // "shit" → /s+h+i+t+/ so "shiiit" matches; a doubled letter stays doubled ("ass" → /a+s{2,}/).
  const stretch = (word) =>
    [...letters(word).matchAll(/(.)\1*/g)].map(([run, c]) => (run.length > 1 ? `${c}{2,}` : `${c}+`)).join('');
  const inside = INSIDE.map((w) => new RegExp(stretch(w)));
  const whole = WHOLE.map((w) => new RegExp(`^${stretch(w)}$`));

  function isRude(name) {
    const all = letters(name);
    const words = name.split(/[\s_.\-]+/).map(letters);
    return (
      inside.some((re) => re.test(all)) ||
      whole.some((re) => re.test(all) || words.some((w) => re.test(w)))
    );
  }

  // { ok: true, nickname, key } or { ok: false, reason }. key is what "already taken" compares.
  function check(raw) {
    const nickname = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
    if ([...nickname].length < MIN) return { ok: false, reason: 'too_short' };
    if ([...nickname].length > MAX) return { ok: false, reason: 'too_long' };
    if (!ALLOWED.test(nickname)) return { ok: false, reason: 'bad_chars' };
    if (isRude(nickname)) return { ok: false, reason: 'not_allowed' };
    return { ok: true, nickname, key: nickname.toLowerCase() };
  }

  const api = { MIN, MAX, check };
  root.MKN = root.MKN || {};
  root.MKN.nickname = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
