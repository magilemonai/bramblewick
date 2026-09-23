// Render registered sprites to a PNG contact sheet (no deps).
// Usage: node tools/sprite-sheet.mjs <art-module.js> [out.png] [scale] [filterPrefix]
// Prints the grid order so you can match cells to ids. Draw-function sprites are skipped.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , modPath, outPath = 'sheet.png', scaleArg = '4', prefix = ''] = process.argv;
if (!modPath) { console.error('usage: node tools/sprite-sheet.mjs <module> [out.png] [scale] [prefix]'); process.exit(1); }
const pixel = await import(pathToFileURL(resolve('src/pixel.js')).href);
await import(pathToFileURL(resolve(modPath)).href);

const scale = +scaleArg;
const ids = pixel.spriteIds().filter(id => id.startsWith(prefix));
const sprites = ids.map(id => {
  try { return [id, pixel.spritePixels(id)]; } catch (e) { console.error('ERR', id, e.message); return [id, null]; }
}).filter(([, p]) => p);

const pad = 4, cols = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(sprites.length))));
const cellW = Math.max(...sprites.map(([, p]) => p.w)) * scale + pad * 2;
const cellH = Math.max(...sprites.map(([, p]) => p.h)) * scale + pad * 2;
const rows = Math.ceil(sprites.length / cols);
const W = cols * cellW, H = rows * cellH;
const img = new Uint8Array(W * H * 4);
// checker background so transparency is visible
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = (y * W + x) * 4, c = ((x >> 3) + (y >> 3)) & 1 ? 200 : 225;
  img[i] = c; img[i + 1] = c + 10; img[i + 2] = c; img[i + 3] = 255;
}
sprites.forEach(([id, p], n) => {
  const ox = (n % cols) * cellW + pad, oy = Math.floor(n / cols) * cellH + pad;
  for (let y = 0; y < p.h * scale; y++) for (let x = 0; x < p.w * scale; x++) {
    const si = (Math.floor(y / scale) * p.w + Math.floor(x / scale)) * 4;
    const a = p.data[si + 3] / 255; if (!a) continue;
    const di = ((oy + y) * W + ox + x) * 4;
    for (let k = 0; k < 3; k++) img[di + k] = Math.round(p.data[si + k] * a + img[di + k] * (1 - a));
  }
  console.log(`[${Math.floor(n / cols)},${n % cols}] ${id} ${p.w}x${p.h}`);
});

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(img.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync(outPath, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote ${outPath} (${W}x${H}, ${sprites.length} sprites)`);
