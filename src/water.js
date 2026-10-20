// Tokens → water in mL / L. All numbers are rough estimates; see README.
(function (root) {
  // mL of water per token. Low ≈ Google/OpenAI 2025 per-prompt figures,
  // high ≈ UC Riverside "Making AI Less Thirsty", both assuming ~500 tokens per reply.
  const ML_PER_TOKEN = { low: 0.0005, high: 0.05 };

  // Growing ~1 cup of cooked rice takes ~150 L (≈2,500 L per kg of rice).
  const RICE_CUP_ML = 150000;

  // Today's water starts in a glass. When it's full, the water moves to the next
  // container, and so on. These are game levels, not real sizes: a real bathtub
  // holds ~150 L, which almost nobody would ever reach in a day of chatting.
  const TIERS = [
    { name: 'Glass', emoji: '🥛', fullMl: 250, drank: 'a glass of water', quip: 'Just a little. Still okay.' },
    { name: 'Tumbler', emoji: '🧋', fullMl: 1000, drank: 'a tumbler', quip: 'Upgraded to a tumbler. Stay hydrated! 🧋' },
    { name: 'Bucket', emoji: '🪣', fullMl: 3000, drank: 'a whole timba', quip: 'A whole timba. Save some water for the rest of us! 😤' },
    { name: 'Bathtub', emoji: '🛁', fullMl: 8000, drank: 'a bathtub', quip: 'Enough for a bath. Magtira ka naman! 🛁' },
    { name: 'Swimming pool', emoji: '🏊', fullMl: 20000, drank: 'a swimming pool', quip: 'Cannonball! You filled a pool. 🏊' },
    { name: 'Dam', emoji: '🏞️', fullMl: 50000, drank: 'a dam', quip: 'The dam is holding… barely. 🏞️' },
    { name: 'Flood', emoji: '🌊', fullMl: 100000, drank: 'a flood', quip: "It's a flood. You're the water interruption now. 🌊" },
    { name: 'Mariana Trench', emoji: '🦑', fullMl: 250000, drank: 'the Mariana Trench', quip: 'Deeper than the Mariana Trench. Hi, anglerfish. 🦑' },
    { name: 'Atlantis', emoji: '🏛️', fullMl: 1000000, drank: 'Atlantis', quip: 'You found the lost city of Atlantis. 🏛️' },
  ];

  function tokensToMl(tokens) {
    const t = Math.max(0, Number(tokens) || 0);
    return { low: t * ML_PER_TOKEN.low, high: t * ML_PER_TOKEN.high };
  }

  function formatAmount(n) {
    if (n >= 100) return Math.round(n).toLocaleString('en-US');
    if (n >= 10) return String(Math.round(n));
    return String(Math.round(n * 10) / 10);
  }

  // Plain metric: "0.05 mL", "60 mL", "1.5 L".
  function formatMl(ml) {
    const trim = (n, digits) => String(Number(n.toFixed(digits)));
    if (!(ml > 0)) return '0 mL';
    if (ml < 0.1) return `${trim(ml, 2)} mL`;
    if (ml < 10) return `${trim(ml, 1)} mL`;
    if (ml < 1000) return `${Math.round(ml)} mL`;
    return `${formatAmount(ml / 1000)} L`;
  }

  // The low–high water range for a token count: "5–500 mL", or "20 mL – 2 L" when the units differ.
  function formatRange(tokens) {
    const { low, high } = tokensToMl(tokens);
    if (!(high > 0)) return '0 mL';
    const [lowNum, lowUnit] = formatMl(low).split(' ');
    const highText = formatMl(high);
    return highText.endsWith(` ${lowUnit}`) ? `${lowNum}–${highText}` : `${lowNum} ${lowUnit} – ${highText}`;
  }

  function riceCups(ml) {
    return Math.max(0, ml) / RICE_CUP_ML;
  }

  // Compares the high estimate with one cup of rice.
  function riceLine(ml) {
    if (!(ml > 0)) return 'No water used yet. 🍚';
    const cups = riceCups(ml);
    if (cups < 1) return `A cup of rice still uses ${formatAmount(1 / cups)}× more water. 🍚`;
    return `That's as much water as ${formatAmount(cups)} cups of rice. 🍚`;
  }

  // How many drops fall into the glass when tokens are added.
  function dropsFor(addedTokens) {
    if (!(addedTokens >= 1)) return 0;
    if (addedTokens < 200) return 1;
    if (addedTokens < 1000) return 2;
    return 3;
  }

  // The container today's water is in, and how full it is (0–1).
  // A full container stays itself; only more water moves it to the next one.
  function tierFor(ml) {
    const amount = Math.max(0, ml) || 0;
    let index = TIERS.findIndex((t) => amount <= t.fullMl);
    if (index < 0) index = TIERS.length - 1;
    return { index, tier: TIERS[index], level: Math.min(1, amount / TIERS[index].fullMl) };
  }

  // The new container when going from oldMl up to newMl moves to a bigger one, else null.
  function tierUp(oldMl, newMl) {
    const before = tierFor(oldMl).index;
    const after = tierFor(newMl).index;
    return after > before ? TIERS[after] : null;
  }

  // A joke line for the container the water is in.
  function quip(ml) {
    if (!(ml > 0)) return 'Nothing yet. Nice and thrifty! 🌱';
    return tierFor(ml).tier.quip;
  }

  const api = {
    ML_PER_TOKEN,
    RICE_CUP_ML,
    TIERS,
    tokensToMl,
    formatAmount,
    formatMl,
    formatRange,
    riceCups,
    riceLine,
    dropsFor,
    tierFor,
    tierUp,
    quip,
  };
  root.MKN = Object.assign(root.MKN || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
