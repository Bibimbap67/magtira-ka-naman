// Draws the water-drop icons as PNGs with no dependencies.
// Run: node tools/make-icons.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZES = [16, 48, 128];
const OUT_DIR = path.join(__dirname, '..', 'icons');

// Drop = circle at the bottom + two tangent lines up to a tip.
const CX = 0.5, CY = 0.62, R = 0.32, TIP = 0.06;
const D = CY - TIP;
const TAN = R / Math.sqrt(D * D - R * R);
const TANGENT_Y = TIP + (D * D - R * R) / D;

function inDrop(u, v) {
  if ((u - CX) ** 2 + (v - CY) ** 2 <= R * R) return true;
  return v >= TIP && v <= TANGENT_Y && Math.abs(u - CX) <= (v - TIP) * TAN;
}

function inHighlight(u, v) {
  return ((u - 0.4) / 0.07) ** 2 + ((v - 0.66) / 0.11) ** 2 <= 1;
}

function pixel(x, y, size) {
  const S = 4; // 4x4 supersampling for smooth edges
  let cover = 0, shine = 0;
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < S; j++) {
      const u = (x + (i + 0.5) / S) / size;
      const v = (y + (j + 0.5) / S) / size;
      if (inDrop(u, v)) {
        cover++;
        if (inHighlight(u, v)) shine++;
      }
    }
  }
  if (!cover) return [0, 0, 0, 0];
  const t = y / size; // light blue at the top, deep blue at the bottom
  const base = [100 + (21 - 100) * t, 181 + (101 - 181) * t, 246 + (192 - 246) * t];
  const k = (shine / cover) * 0.6;
  const rgb = base.map((c) => Math.round(c + (255 - c) * k));
  return [...rgb, Math.round((cover / (S * S)) * 255)];
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // no filter
    for (let x = 0; x < size; x++) {
      for (const c of pixel(x, y, size)) raw[o++] = c;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(file, png(size));
  console.log('wrote', path.relative(process.cwd(), file));
}
