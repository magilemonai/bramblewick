// Render the PWA icons and the link-preview image from registered sprites (no deps).
// Usage: node tools/make-icons.mjs [outDir=icons]
// Writes icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png (180) from `app_icon`
// (src/art/icons2.js; falls back to `farmer`), and og.png (1200x630) composed from sprites.
// Same PNG approach as tools/sprite-sheet.mjs: pixel-perfect nearest-neighbour upscale on a padded background.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = resolve(process.argv[2] || 'icons');
mkdirSync(outDir, { recursive: true });
const pixel = await import(pathToFileURL(resolve('src/pixel.js')).href);
for (const m of ['chars_a', 'chars_c', 'icons', 'icons2', 'plants']) {
  try { await import(pathToFileURL(resolve(`src/art/${m}.js`)).href); } catch (e) { console.warn(`skip src/art/${m}.js: ${e.message}`); }
}
const sprite = (...ids) => { for (const id of ids) { if (!pixel.hasSprite(id)) continue; try { const p = pixel.spritePixels(id); if (p) return { id, ...p }; } catch { /* draw-fn sprite */ } } return null; };

// ---------- tiny RGBA canvas ----------
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function canvas(W, H, bg) {
  const d = new Uint8Array(W * H * 4);
  const c = { W, H, d };
  c.rect = (x, y, w, h, col, a = 1) => {
    const [r, g, b] = hex(col);
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) for (let xx = Math.max(0, x); xx < Math.min(W, x + w); xx++) {
      const i = (yy * W + xx) * 4;
      d[i] = Math.round(r * a + d[i] * (1 - a)); d[i + 1] = Math.round(g * a + d[i + 1] * (1 - a)); d[i + 2] = Math.round(b * a + d[i + 2] * (1 - a)); d[i + 3] = 255;
    }
  };
  c.blit = (p, ox, oy, s, flip = false) => {
    for (let y = 0; y < p.h * s; y++) for (let x = 0; x < p.w * s; x++) {
      const sx = Math.floor(x / s), sy = Math.floor(y / s);
      const si = (sy * p.w + (flip ? p.w - 1 - sx : sx)) * 4;
      const a = p.data[si + 3] / 255; if (!a) continue;
      const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const di = (Y * W + X) * 4;
      for (let k = 0; k < 3; k++) d[di + k] = Math.round(p.data[si + k] * a + d[di + k] * (1 - a));
      d[di + 3] = 255;
    }
  };
  if (bg) c.rect(0, 0, W, H, bg);
  return c;
}

// ---------- PNG ----------
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function writePNG(c, name) {
  const { W, H, d } = c;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; Buffer.from(d.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  const file = join(outDir, name);
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  console.log(`wrote ${file} (${W}x${H})`);
}

// ---------- icons ----------
const icon = sprite('app_icon', 'farmer');
if (!icon) { console.error('no app_icon or farmer sprite registered'); process.exit(1); }
console.log(`icon source: ${icon.id} ${icon.w}x${icon.h}`);
const ICON_BG = '#f7e6bb';
function iconPNG(size, fill, name) {
  const s = Math.max(1, Math.floor((size * fill) / Math.max(icon.w, icon.h)));
  const c = canvas(size, size, ICON_BG);
  // soft sun disc behind the sprite, in pixel steps
  const r = Math.floor(size * 0.36), cx = size / 2, cy = size / 2, step = Math.max(1, s);
  for (let y = 0; y < size; y += step) for (let x = 0; x < size; x += step) if ((x - cx + step / 2) ** 2 + (y - cy + step / 2) ** 2 < r * r) c.rect(x, y, step, step, '#ffd97a', 0.55);
  c.blit(icon, Math.floor((size - icon.w * s) / 2), Math.floor((size - icon.h * s) / 2), s);
  writePNG(c, name);
}
iconPNG(192, 0.84, 'icon-192.png');
iconPNG(512, 0.84, 'icon-512.png');
iconPNG(512, 0.58, 'icon-maskable-512.png'); // inside the maskable safe zone
iconPNG(180, 0.84, 'apple-touch-icon.png');

// ---------- og.png (1200x630) ----------
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'], K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'], M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
function text(c, str, cx, y, s, fill, shade, ink = '#2a1d1a') {
  const w = str.length * 6 * s - s;
  let x = Math.round(cx - w / 2);
  for (const ch of str) {
    const g = FONT[ch] || FONT[' '];
    const px = (dx, dy, col) => g.forEach((row, ry) => [...row].forEach((v, rx) => { if (v === '#') c.rect(x + rx * s + dx, y + ry * s + dy, s, s, col); }));
    for (const [dx, dy] of [[-s, 0], [s, 0], [0, -s], [0, s], [-s, -s], [s, s], [-s, s], [s, -s], [0, 2 * s], [0, 3 * s]]) px(dx, dy, ink);
    px(0, Math.round(s * 1.2), shade);
    px(0, 0, fill);
    x += 6 * s;
  }
}
const W = 1200, H = 630, og = canvas(W, H);
// golden-hour sky in pixel bands
const sky = ['#f7c77e', '#f5b877', '#f0a672', '#e8956f', '#d9876f', '#c47a70'];
const band = 8;
for (let y = 0; y < H; y += band) og.rect(0, y, W, band, sky[Math.min(sky.length - 1, Math.floor((y / (H * 0.62)) * sky.length))]);
// sun
for (let y = -120; y < 120; y += 8) for (let x = -120; x < 120; x += 8) if (x * x + y * y < 110 * 110) og.rect(900 + x, 250 + y, 8, 8, '#ffe39a', 0.8);
// hills + meadow
for (let x = 0; x < W; x += 8) {
  const h1 = Math.round(380 + 26 * Math.sin(x / 140) + 14 * Math.sin(x / 53));
  og.rect(x, h1, 8, H - h1, '#7f9e5a');
  const h2 = Math.round(450 + 18 * Math.sin(x / 90 + 1.3));
  og.rect(x, h2, 8, H - h2, '#6fae4a');
  og.rect(x, h2, 8, 8, '#a8d66a');
}
og.rect(0, 560, W, 70, '#3f7a3a');
for (let x = 0; x < W; x += 24) og.rect(x + ((x / 24) % 2) * 8, 552, 8, 8, '#56733a');
text(og, 'BRAMBLEWICK', W / 2, 44, 14, '#ffe7a8', '#b0662c');
text(og, 'A DECKBUILDING YEAR', W / 2, 170, 5, '#fff4d6', '#8a5a3b');
const stand = (p, cx, footY, s, flip = false) => { if (p) og.blit(p, Math.round(cx - (p.w * s) / 2), Math.round(footY - p.h * s), s, flip); };
const farmer = sprite('farmer'), pell = sprite('pc_pell', 'vil_pell'), almanac = sprite('almanac');
stand(farmer, 430, 590, 8);
stand(pell, 770, 590, 8, pell?.id === 'vil_pell');
stand(almanac, 600, 400, 5);
stand(sprite('en_gloamslug'), 120, 590, 5, false);
stand(sprite('en_burrlet'), 1080, 590, 5, false);
stand(sprite('plant_turnip_3'), 245, 590, 5);
stand(sprite('plant_sunflower_3'), 955, 590, 6);
writePNG(og, 'og.png');
