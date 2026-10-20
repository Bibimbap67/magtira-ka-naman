// The shareable "water story": today's water as a 1080×1920 PNG (the size of an Instagram or
// Facebook story), drawn on a canvas in the popup. Only numbers go in it, never chat text.
(function (root) {
  const W = 1080;
  const H = 1920;
  const INK = '#1d2b3e';
  const FONT = '"Bricolage Grotesque", system-ui, sans-serif'; // fonts/ + @font-face in popup.css
  const SURFACE = 1110; // where the water starts

  // A wavy band across the story with its top edge at y, filled down to the bottom.
  function wave(ctx, y, amp, len, phase, fill) {
    ctx.beginPath();
    ctx.moveTo(-len + phase, y);
    for (let x = -len + phase, i = 0; x < W + len; x += len / 2, i++) {
      ctx.quadraticCurveTo(x + len / 4, y + (i % 2 ? amp : -amp), x + len / 2, y);
    }
    ctx.lineTo(W + len, H);
    ctx.lineTo(-len, H);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // The same container drawing the glass widget uses, as a still picture.
  function vessel(index, level) {
    const g = root.MKN.glass.create('');
    g.setVessel(index);
    g.setLevel(level);
    g.node.setAttribute('width', 680);
    g.node.setAttribute('height', 765);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(g.node))}`;
    return img.decode().then(() => img);
  }

  function lines(ctx, text, max) {
    const out = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > max) {
        out.push(line);
        line = word;
      } else line = next;
    }
    return [...out, line];
  }

  // ml: { low, high } from tokensToMl. Resolves to a PNG Blob.
  async function make(ml) {
    const MKN = root.MKN;
    await document.fonts.load(`800 80px ${FONT}`);
    const { index, tier, level } = MKN.tierFor(ml.high);
    const img = await vessel(index, level);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eaf5fd';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = INK;
    ctx.font = `700 38px ${FONT}`;
    ctx.fillText('💧 Magtira Ka Naman', 80, 130);
    ctx.fillStyle = '#5a6b80';
    ctx.font = `500 34px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 1000, 130);
    ctx.textAlign = 'left';

    ctx.fillStyle = INK;
    ctx.font = `800 84px ${FONT}`;
    ctx.letterSpacing = '-2px';
    ctx.fillText('My AI drank', 80, 280);
    ctx.fillText(ml.high > 0 ? `${tier.drank} today.` : 'nothing yet.', 80, 370);
    ctx.letterSpacing = '0px';

    ctx.drawImage(img, 200, 375);

    wave(ctx, SURFACE - 22, 14, 360, 160, '#a9dcfb');
    wave(ctx, SURFACE, 16, 300, 40, '#3f9ee6');
    wave(ctx, 1665, 12, 420, 90, '#2a85d0');

    // The number is fully under water (white on blue), so it reads at a glance.
    const [num, unit] = MKN.formatMl(ml.high).split(' ');
    let size = 300;
    const widthAt = (s) => {
      ctx.font = `800 ${s}px ${FONT}`;
      const w = ctx.measureText(num).width;
      ctx.font = `800 ${s / 2}px ${FONT}`;
      return w + 24 + ctx.measureText(unit).width;
    };
    while (widthAt(size) > 920 && size > 120) size -= 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${size}px ${FONT}`;
    ctx.letterSpacing = '-12px';
    ctx.fillText(num, 72, 1370);
    const numWidth = ctx.measureText(num).width;
    ctx.letterSpacing = '0px';
    ctx.font = `800 ${size / 2}px ${FONT}`;
    ctx.fillText(unit, 72 + numWidth + 24, 1370);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 5;
    for (const [x, y, r] of [[930, 1250, 22], [985, 1190, 12], [905, 1325, 9]]) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#e9f6ff';
    ctx.font = `500 32px ${FONT}`;
    ctx.fillText(`As little as ${MKN.formatMl(ml.low)} by the low estimate`, 80, 1440);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 50px ${FONT}`;
    MKN.quip(ml.high)
      .split(/(?<=[.!?])\s+(?=[A-Za-z])/) // one sentence per line
      .flatMap((sentence) => lines(ctx, sentence, 920))
      .forEach((line, i) => ctx.fillText(line, 80, 1530 + i * 64));

    // Containers reached so far; the ones further on stay a mystery.
    ctx.textAlign = 'center';
    MKN.TIERS.forEach((t, i) => {
      const x = 120 + i * 105;
      const done = i <= index;
      ctx.beginPath();
      ctx.arc(x, 1745, i === index ? 40 : 30, 0, Math.PI * 2);
      if (done) {
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.stroke();
      }
      ctx.fillStyle = done ? INK : 'rgba(255, 255, 255, 0.6)';
      ctx.font = `700 ${i === index ? 42 : 30}px ${FONT}`;
      ctx.fillText(done ? t.emoji : '?', x, 1759);
    });
    ctx.fillStyle = '#cfe7fb';
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText('github.com/Bibimbap67/magtira-ka-naman', W / 2, 1860);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  root.MKN = root.MKN || {};
  root.MKN.story = { make };
})(globalThis);
