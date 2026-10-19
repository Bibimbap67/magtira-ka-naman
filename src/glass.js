// The water container shown in both the chat widget and the popup: waves that keep
// moving, a level that rises or drains, and drops that fall in with a splash.
// It starts as a glass and turns into bigger things (see TIERS in water.js).
// Built with DOM calls instead of innerHTML because Gemini blocks innerHTML (Trusted Types).
(function (root) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const NAVY = '#1d2b3e';
  const STONE = '#f3e2b0';
  const DROP = 'M0 -6 C1.8 -3 3.2 -1 3.2 1 A3.2 3.2 0 0 1 -3.2 1 C-3.2 -1 -1.8 -3 0 -6 Z';
  const WAVE = 32; // one wave length; sliding by this much loops seamlessly
  const FALL_MS = 420;

  // A rounded window for the scenes (flood, trench, Atlantis), which have no container.
  const FRAME = 'M6 4 H58 Q62 4 62 8 V63 Q62 67 58 67 H6 Q2 67 2 63 V8 Q2 4 6 4 Z';
  const shine = (d) => ({ d, stroke: '#ffffff', 'stroke-width': 2.5, opacity: 0.8 });
  const faint = { d: FRAME, 'stroke-width': 2, opacity: 0.25 };

  // One per tier, in the same order. inside: where water can be. full / empty: the
  // water surface's y. behind: drawn under the water. front: outlines over it.
  // see: the water is see-through, so what's under it still shows.
  const VESSELS = [
    {
      // Glass
      inside: 'M9 9 L16.3 61.5 Q17 65 20.5 65 H43.5 Q47 65 47.7 61.5 L55 9 Z',
      full: 13,
      empty: 65,
      front: [shine('M15 17 L18.5 46'), { d: 'M7 8 L14.5 62 Q15.3 67 20 67 H44 Q48.7 67 49.5 62 L57 8' }],
    },
    {
      // Tumbler
      inside: 'M18 18 V61.5 Q18 65 21.5 65 H42.5 Q46 65 46 61.5 V18 Z',
      full: 23,
      empty: 65,
      front: [
        shine('M22 27 V52'),
        { d: 'M16 18 V62 Q16 67 21 67 H43 Q48 67 48 62 V18' },
        { d: 'M13 18 V14 Q13 10 17 10 H47 Q51 10 51 14 V18 Z', fill: NAVY },
        { d: 'M26 10 V7 Q26 4 29 4 H35 Q38 4 38 7 V10' },
      ],
    },
    {
      // Bucket
      inside: 'M10 23 L15.8 62 Q16.3 65 19.5 65 H44.5 Q47.7 65 48.2 62 L54 23 Z',
      full: 27,
      empty: 65,
      front: [
        { d: 'M9 22 Q32 -4 55 22', 'stroke-width': 2 },
        { d: 'M8 22 L14 63 Q14.6 67 19 67 H45 Q49.4 67 50 63 L56 22' },
        { d: 'M4 22 H60' },
      ],
    },
    {
      // Bathtub
      inside: 'M6 35 H58 V44 Q58 56 46 56 H18 Q6 56 6 44 Z',
      full: 39,
      empty: 56,
      front: [
        { d: 'M4 34 V44 Q4 58 18 58 H46 Q60 58 60 44 V34' },
        { d: 'M2 34 H62' },
        { d: 'M15 58 L12 65 M49 58 L52 65' },
        { d: 'M10 34 V22 Q10 18 14 18 H19 V22' },
      ],
    },
    {
      // Swimming pool, with a ladder
      inside: 'M12 26 V59.5 Q12 62 14.5 62 H49.5 Q52 62 52 59.5 V26 Z',
      full: 30,
      empty: 62,
      front: [
        { d: 'M2 26 H10 V60 Q10 64 14 64 H50 Q54 64 54 60 V26 H62' },
        { d: 'M40 44 V18 Q40 14 44 14 H54 Q58 14 58 18 V26', 'stroke-width': 2 },
        { d: 'M46 44 V26 M40 28 H46 M40 36 H46', 'stroke-width': 2 },
      ],
    },
    {
      // Dam: a valley on the left, the dam wall on the right
      inside: 'M4.5 12 L16 60 H40 V12 Z',
      full: 17,
      empty: 60,
      front: [
        { d: 'M2 12 L14 62 H40' },
        { d: 'M40 8 H47 L60 66 H40 Z', fill: '#c9d4e0' },
        { d: 'M60 66 H63' },
      ],
    },
    {
      // Flood: a house going under
      inside: FRAME,
      full: 12,
      empty: 67,
      see: true,
      behind: [
        { d: 'M2 66 H62' },
        { d: 'M42 28 V20 H47 V33', fill: '#ffffff' },
        { d: 'M16 34 V66 H48 V34', fill: '#ffffff' },
        { d: 'M11 38 L32 17 L53 38' },
        { d: 'M28 66 V52 H36 V66' },
        { d: 'M20 42 H26 V48 H20 Z' },
      ],
      front: [faint],
    },
    {
      // Mariana Trench: rock on both sides of a deep crack
      inside: FRAME,
      full: 8,
      empty: 66,
      front: [
        {
          d: 'M2 16 H14 L19 30 L17 42 L24 54 L30 66 L35 58 L40 46 L44 36 L48 26 L51 16 H62 V63 Q62 67 58 67 H6 Q2 67 2 63 Z',
          fill: '#33465f',
        },
        faint,
      ],
    },
    {
      // Atlantis: a temple on the sea floor
      inside: FRAME,
      full: 10,
      empty: 67,
      see: true,
      behind: [
        { d: 'M2 61 Q20 57 32 60 T62 59 V63 Q62 67 58 67 H6 Q2 67 2 63 Z', fill: '#e8d9b0', 'stroke-width': 2 },
        { d: 'M17 34 V56 M25 34 V56 M39 34 V56 M47 44 V56' },
        { d: 'M12 30 L32 18 L52 30 Z', fill: STONE },
        { d: 'M12 30 H52 V34 H12 Z', fill: STONE },
        { d: 'M10 56 H54 V60 H10 Z', fill: STONE },
      ],
      front: [faint],
    },
  ];

  let count = 0;

  function svg(tag, attrs = {}, children = []) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    for (const child of children) node.append(child);
    return node;
  }

  function part(attrs) {
    return svg('path', {
      fill: 'none',
      stroke: NAVY,
      'stroke-width': 3,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...attrs,
    });
  }

  // A wavy band from x=-32 to x=96, filled down past the bottom.
  function wavePath(amp) {
    let d = `M${-WAVE} 0`;
    for (let i = 0; i < 8; i++) d += ` q8 ${i % 2 ? amp : -amp} 16 0`;
    return `${d} V80 H${-WAVE} Z`;
  }

  function create(className) {
    const clipId = `mkn-glass-clip-${++count}`;
    const back = svg('path', { d: wavePath(2.5), fill: '#a9dcfb' });
    const front = svg('path', { d: wavePath(3), fill: '#5bb4f2' });
    const water = svg('g', {}, [back, front]);
    const clipShape = svg('path');
    const insideFill = svg('path', { fill: 'rgba(255, 255, 255, 0.6)' });
    const under = svg('g');
    const over = svg('g');
    const drops = svg('g');
    const node = svg('svg', { class: className, viewBox: '0 0 64 72', 'aria-hidden': 'true' }, [
      svg('defs', {}, [svg('clipPath', { id: clipId }, [clipShape])]),
      insideFill,
      under,
      svg('g', { 'clip-path': `url(#${clipId})` }, [water]),
      over,
      drops,
    ]);
    node.style.overflow = 'visible';
    node.style.transformOrigin = '50% 100%';

    let vessel = null;
    let vesselIndex = -1;
    let level = 0;
    let surface = 0;

    // 0 = empty, 1 = full.
    function setLevel(value) {
      level = value;
      surface = level > 0 ? vessel.empty - (vessel.empty - vessel.full) * Math.min(1, level) : vessel.empty + 6;
      water.setAttribute('transform', `translate(0 ${surface})`);
    }

    // Switches to another container (index into TIERS). pop: bounce it in.
    function setVessel(index, pop = false) {
      if (index === vesselIndex) return;
      vesselIndex = index;
      vessel = VESSELS[Math.min(index, VESSELS.length - 1)];
      clipShape.setAttribute('d', vessel.inside);
      insideFill.setAttribute('d', vessel.inside);
      under.replaceChildren(...(vessel.behind || []).map(part));
      over.replaceChildren(...vessel.front.map(part));
      water.setAttribute('opacity', vessel.see ? 0.72 : 1);
      setLevel(level);
      if (pop) {
        node.animate(
          [{ transform: 'scale(0.55)' }, { transform: 'scale(1.12)', offset: 0.6 }, { transform: 'scale(1)' }],
          { duration: 480, easing: 'ease-out' },
        );
      }
    }
    setVessel(0);

    // The two wave layers drift in opposite directions, forever (off for reduced motion).
    let waves = [];
    function setWaves(on) {
      waves.forEach((a) => a.cancel());
      waves = on
        ? [
            front.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${WAVE}px)` }], {
              duration: 2200,
              iterations: Infinity,
            }),
            back.animate([{ transform: `translateX(${WAVE}px)` }, { transform: 'translateX(0)' }], {
              duration: 3400,
              iterations: Infinity,
            }),
          ]
        : [];
    }

    function drip(delay = 0) {
      const x = 32 + (Math.random() * 12 - 6);
      const y = Math.min(surface, vessel.empty) - 1;
      const drop = svg('path', { d: DROP, fill: '#4fa8ff' });
      drops.append(drop);
      drop.animate(
        [
          { transform: `translate(${x}px, -6px) scale(0.5)`, opacity: 0 },
          { transform: `translate(${x}px, 2px) scale(1)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${x}px, ${y}px) scale(0.9, 1.2)`, opacity: 1 },
        ],
        { duration: FALL_MS, delay, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'backwards' },
      ).onfinish = () => {
        drop.remove();
        const ring = svg('ellipse', { rx: 6, ry: 1.8, fill: 'none', stroke: '#4fa8ff', 'stroke-width': 1.2 });
        drops.append(ring);
        ring.animate(
          [
            { transform: `translate(${x}px, ${y}px) scale(0.3)`, opacity: 0.9 },
            { transform: `translate(${x}px, ${y}px) scale(1.7)`, opacity: 0 },
          ],
          { duration: 380, easing: 'ease-out' },
        ).onfinish = () => ring.remove();
      };
    }

    return { node, setLevel, setVessel, setWaves, drip };
  }

  root.MKN = root.MKN || {};
  root.MKN.glass = { create, FALL_MS };
})(globalThis);
