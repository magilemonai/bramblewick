// Bramblewick scenery: animated pixel-art landscapes + particles on one full-viewport canvas.
// Static layers are painted once per scene (seeded, so repaints are stable) into offscreen
// canvases at low internal resolution; only the living bits animate each frame.
import { PAL } from '../pixel.js';

const TAU = Math.PI * 2;
const M = 8;                          // parallax margin (px) on each side of every layer
const DEPTH = [0.12, 0.35, 0.65, 1];  // sky, far, mid, near
const FADE = 0.6;                     // crossfade seconds
const AMB_MAX = 300, BURST_MAX = 320;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bay = (x, y) => BAY[(y & 3) * 4 + (x & 3)];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------- colour ----------
const rgbCache = new Map();
function rgb(h) {
  let v = rgbCache.get(h);
  if (!v) {
    const s = h.replace('#', '');
    v = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    rgbCache.set(h, v);
  }
  return v;
}
const hex = (r, g, b) => '#' + ((1 << 24) | (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)).toString(16).slice(1);
function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return hex(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t));
}
function mapPal(p, fn) {
  const o = {};
  for (const k in p) {
    const v = p[k];
    if (typeof v === 'string' && v[0] === '#') o[k] = fn(v, k);
    else if (Array.isArray(v)) o[k] = v.map(e => (Array.isArray(e) ? e.map(c => fn(c, k)) : fn(e, k)));
    else o[k] = v;
  }
  return o;
}

// ---------- palettes ----------
const FALL_WOODS = [
  ['#7a2f22', '#b8522e', '#d9743a', '#f0a060'],
  ['#a0501c', '#e0802e', '#f2a848', '#ffd080'],
  ['#4d2a44', '#7a3f5a', '#a8586f', '#d68a8a'],
  ['#86561a', '#d0942a', '#f2c84a', '#fff0a0'],
];
const BASE = {
  spring: {
    sky: ['#76c0e4', '#9ad4ea', '#c4e9ef', '#eaf7e4'],
    sun: '#fffbe6', sunGlow: '#fff0b0', cloud: '#ffffff', cloudShade: '#d0e6f0',
    far2: '#b6dac8', far: '#98c8aa', mid: '#80bd58', distant: '#8fb8ae', distantDark: '#77a39c',
    g: ['#a4d868', '#8ccf5c', '#74b84c', '#5c9c40'],
    blade: ['#4f8c38', '#6aae46', '#8fcc5a', '#b8e27a'],
    leaf: ['#3f7a3a', '#5d9e45', '#86c455', '#b8e07a'],
    accent: ['#d65f7c', '#f29bb0', '#f8c8d4', '#fff2f6'],
    trunk: '#7a5238', trunkDark: '#4f3426',
    path: '#ead69e', pathDark: '#c9aa6e',
    water: '#4f9fd0', waterDark: '#3a7fb0', waterLight: '#d0f4ff',
    flowers: ['#f29bb0', '#fff4d6', '#ffd35c', '#b69ae0', '#ffffff', '#e0667f'],
    roof: '#d6453d', roofDark: '#a8325c', wall: '#f3e2b3', wallDark: '#d4b67e',
    cobble: '#c9bca0',
  },
  summer: {
    sky: ['#3b96d4', '#5fb2e0', '#96cfe4', '#f2e8b4'],
    sun: '#fffbe0', sunGlow: '#ffe890', cloud: '#ffffff', cloudShade: '#d4e4ec',
    far2: '#a6c79e', far: '#84ae7c', mid: '#5c9e3c', distant: '#7ea68a', distantDark: '#6a9478',
    g: ['#90c44a', '#76b03c', '#5e9a34', '#48822c'],
    blade: ['#3c7428', '#56922f', '#80bc44', '#b2da58'],
    leaf: ['#285c2a', '#3d7a33', '#5e9e3c', '#92c658'],
    accent: ['#c88418', '#ffd35c', '#fff0a0', '#6e4a32'],
    trunk: '#6e4a32', trunkDark: '#4a3228',
    path: '#ead08a', pathDark: '#c4a060',
    water: '#3b92c6', waterDark: '#2c72a2', waterLight: '#cff4ff',
    flowers: ['#ffd35c', '#d6453d', '#fff4d6', '#f2b53a', '#e8873a', '#b69ae0'],
    roof: '#b8522e', roofDark: '#8a3a22', wall: '#f3e2b3', wallDark: '#d4b67e',
    cobble: '#d2c098',
  },
  fall: {
    sky: ['#6aa2cc', '#98bcd2', '#e2cea8', '#f6b676'],
    sun: '#fff2cc', sunGlow: '#ffbe6a', cloud: '#fff2e4', cloudShade: '#dcc0b2',
    far2: '#c6a28e', far: '#a8827c', mid: '#b88a44', distant: '#a48a8a', distantDark: '#8e7478',
    g: ['#d2b664', '#bea252', '#a68c46', '#8a723a'],
    blade: ['#7a6232', '#9c8440', '#c8ac5c', '#e6d080'],
    leaf: FALL_WOODS[0],
    accent: ['#a8421e', '#e8873a', '#f6aa5c', '#5e7a2a'],
    trunk: '#5e3b26', trunkDark: '#3e261a',
    path: '#dcbc7e', pathDark: '#b08a58',
    water: '#4a82ac', waterDark: '#36668e', waterLight: '#cfe8f4',
    flowers: ['#e8873a', '#b8522e', '#f2b53a', '#a8586f', '#fff0c0'],
    roof: '#7a3f5a', roofDark: '#4d3566', wall: '#efd8a8', wallDark: '#c8a878',
    cobble: '#bca88c',
  },
  winter: {
    sky: ['#24325c', '#384b80', '#6176aa', '#a6b6d8'],
    sun: '#fff8e8', sunGlow: '#c8d6f8', cloud: '#d8e2f4', cloudShade: '#96a8cc',
    far2: '#98aad0', far: '#8296c2', mid: '#d4e0f2', distant: '#6a7aa8', distantDark: '#58689a',
    g: ['#eaf0fa', '#dce6f4', '#cad7eb', '#b6c5de'],
    blade: ['#7f9a94', '#9cb2ac', '#c2d4ce', '#eef4f8'],
    leaf: ['#1d3e36', '#2d5848', '#44745a', '#6a9a78'],
    accent: ['#c8323a', '#f2b53a', '#fff4d6', '#8a5a3b'],
    trunk: '#5e3b26', trunkDark: '#3e261a',
    path: '#c6d0e2', pathDark: '#a4b2ca',
    water: '#9cc4e0', waterDark: '#7aa6ca', waterLight: '#f4fbff',
    flowers: ['#d6453d', '#ffffff', '#c8323a'],
    roof: '#eef3fb', roofDark: '#b4c4de', wall: '#b98356', wallDark: '#8a5a3b',
    cobble: '#aab4c8',
  },
};
const DUSK_SKY = {
  warm: ['#2a2350', '#5a3a70', '#b25a78', '#f29466'],
  winter: ['#10173a', '#212b5a', '#443f7c', '#86689a'],
};
const GOLD_SKY = {
  spring: ['#8ab2dc', '#e4c0b4', '#f8d49c', '#fff0c4'],
  summer: ['#74a2d6', '#eeb892', '#f8c878', '#ffe6a2'],
  fall: ['#7488be', '#d696a0', '#f2a870', '#f8d092'],
  winter: ['#56669e', '#b494be', '#eeaca6', '#f8d8c2'],
};

function palette(season, mode) {
  const b = BASE[season] || BASE.spring;
  if (mode === 'dusk') {
    // land is tinted after painting (see tintLayers) so hand-picked prop colours dim too
    const q = mapPal(b, (c, k) => (k.startsWith('far') || k.startsWith('distant') ? mix(c, '#b07890', 0.25) : c));
    q.sky = DUSK_SKY[season === 'winter' ? 'winter' : 'warm'].slice();
    q.sun = '#ffe2a8'; q.sunGlow = '#f58c6a'; q.cloud = '#f2a8a0'; q.cloudShade = '#8a5a88';
    if (season === 'winter') { q.cloud = '#7a7aa8'; q.cloudShade = '#4a4a7a'; q.sun = '#f4f0dc'; q.sunGlow = '#7a88c0'; }
    return q;
  }
  if (mode === 'golden') {
    const q = mapPal(b, (c, k) => mix(c, '#ffa850', k.startsWith('far') || k.startsWith('distant') ? 0.2 : 0.12));
    q.sky = GOLD_SKY[season].slice();
    q.far2 = mix(q.far2, q.sky[1], 0.45); q.far = mix(q.far, q.sky[1], 0.25);
    q.sun = '#fff6d6'; q.sunGlow = '#ffc870'; q.cloud = '#fff0d8'; q.cloudShade = '#e8a890';
    return q;
  }
  if (mode === 'bright') {
    const q = mapPal(b, c => mix(c, '#ffffff', 0.06));
    if (season === 'winter') q.sky = ['#6f9ad6', '#8fb4e0', '#b6d0ec', '#e0ecf8'];
    return q;
  }
  if (mode === 'dawn') {
    const q = mapPal(b, (c, k) => mix(c, '#ff9a80', k.startsWith('far') || k.startsWith('distant') ? 0.22 : 0.1));
    q.sky = ['#5a6aa6', '#9a88b8', '#e8a0a4', '#ffcfa0'];
    q.far2 = mix(q.far2, q.sky[2], 0.45); q.far = mix(q.far, q.sky[2], 0.28);
    q.sun = '#fff2d8'; q.sunGlow = '#ffb088'; q.cloud = '#ffe0d4'; q.cloudShade = '#c890a8';
    return q;
  }
  if (mode === 'map') return mapPal(b, c => mix(c, '#f3e2b3', 0.3));
  return mapPal(b, c => c);
}

// ---------- paint kit (all coords in "screen" px; layers are pre-translated by M) ----------
function rect(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function disc(g, c, cx, cy, r) {
  if (r <= 0.5) { rect(g, c, cx, cy, 1, 1); return; }
  g.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy);
  const ri = Math.floor(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const hw = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.35);
    g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}
function ellipse(g, c, cx, cy, rx, ry) {
  g.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy);
  const ri = Math.floor(ry);
  for (let dy = -ri; dy <= ri; dy++) {
    const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))) + 0.35);
    g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}
function ditherEllipse(g, c, cx, cy, rx, ry, amt, fall = true) {
  g.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy);
  for (let dy = -Math.ceil(ry); dy <= ry; dy++) for (let dx = -Math.ceil(rx); dx <= rx; dx++) {
    const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    if (d > 1) continue;
    const a = fall ? amt * (1 - d) : amt;
    if (bay(cx + dx + M, cy + dy) < a) g.fillRect(cx + dx, cy + dy, 1, 1);
  }
}
// Vertical banded gradient with Bayer-dithered seams. Raw layer coords (ignores transform).
function vgrad(g, x0, y0, w, h, cols, soft = 0.4) {
  y0 = Math.round(y0); h = Math.round(h);
  if (h <= 0 || w <= 0) return;
  const img = g.createImageData(w, h), d = img.data, n = cols.length - 1, C = cols.map(rgb);
  for (let y = 0; y < h; y++) {
    const tt = n === 0 ? 0 : (y / Math.max(1, h - 1)) * n;
    const i = Math.min(n - 1, Math.max(0, Math.floor(tt)));
    const f = n === 0 ? 0 : clamp((tt - i - 0.5) / soft + 0.5, 0, 1);
    const A = C[Math.max(0, i)], B = C[Math.min(n, i + 1)];
    for (let x = 0; x < w; x++) {
      const c = bay(x0 + x, y0 + y) < f ? B : A;
      const o = (y * w + x) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  g.putImageData(img, x0, y0);
}
function ridge(R, base, amp, freq) {
  const p1 = R() * TAU, p2 = R() * TAU, p3 = R() * TAU;
  return x => base - amp * (0.5 + 0.28 * Math.sin(x * freq + p1) + 0.15 * Math.sin(x * freq * 2.3 + p2) + 0.07 * Math.sin(x * freq * 5.1 + p3));
}
function hill(g, S, rf, col, hi) {
  const { W, H } = S;
  g.fillStyle = col;
  for (let x = -M; x < W + M; x++) { const y = Math.round(rf(x)); g.fillRect(x, y, 1, H - y + 1); }
  if (!hi) return;
  g.fillStyle = hi;
  for (let x = -M; x < W + M; x++) {
    const y = Math.round(rf(x));
    const lit = rf(x + 2) < rf(x - 2) - 0.4; // rising to the right faces the upper-left light
    g.fillRect(x, y, 1, lit ? 2 : 1);
  }
}
function canopy(g, S, cx, cy, r, cols) {
  const R = S.R;
  const n = 3 + Math.round(r / 3);
  const blobs = [[cx, cy, r * 0.72]];
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, d = r * (0.3 + R() * 0.35);
    blobs.push([cx + Math.cos(a) * d * 1.1, cy + Math.sin(a) * d * 0.72, r * (0.38 + R() * 0.26)]);
  }
  for (const b of blobs) disc(g, cols[0], b[0], b[1], b[2] + 1);
  for (const b of blobs) disc(g, cols[1], b[0] - 1, b[1] - 1, b[2]);
  for (const b of blobs) if (b[1] <= cy + r * 0.15 && b[0] <= cx + r * 0.35) disc(g, cols[2], b[0] - 1.5, b[1] - 2, b[2] * 0.55);
  const k = Math.round(r * r * 0.14);
  for (let i = 0; i < k; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * r * 0.85;
    const px = Math.round(cx + Math.cos(a) * d), py = Math.round(cy + Math.sin(a) * d * 0.7);
    const up = py < cy - r * 0.05 && px < cx + r * 0.25;
    rect(g, up ? cols[3] : cols[0], px, py, 1, 1);
    if (!up && R() < 0.4) rect(g, cols[0], px + 1, py, 1, 1);
  }
}
function trunk(g, S, x, top, by, tw) {
  const tc = S.trunkCols || [S.P.trunk, S.P.trunkDark];
  rect(g, tc[0], x - (tw >> 1), top, tw, by - top);
  rect(g, tc[1], x - (tw >> 1) + tw - 1, top, 1, by - top);
  if (tw >= 3) {
    rect(g, mix(tc[0], '#ffffff', 0.18), x - (tw >> 1), top, 1, by - top);
    rect(g, tc[0], x - (tw >> 1) - 1, by - 2, tw + 2, 2);
    rect(g, tc[1], x - (tw >> 1) + tw, by - 1, 1, 1);
  }
}
function roundTree(g, S, x, by, h, cols) {
  const r = Math.max(3, Math.round(h * 0.34));
  const th = Math.max(3, Math.round(h - r * 1.55));
  const tw = h > 40 ? 4 : h > 20 ? 3 : 2;
  trunk(g, S, x, by - th - 2, by, tw);
  canopy(g, S, x, by - th - r * 0.5, r, cols);
}
function pine(g, S, x, by, h, cols, snow) {
  const tiers = h > 26 ? 4 : 3;
  rect(g, h < 16 ? cols[0] : S.P.trunkDark, x - 1, by - 3, 2, 3);
  const top = by - h, body = h - 3, maxHw = Math.max(2, Math.round(h * 0.28));
  for (let i = 0; i < body; i++) {
    const p = i / body, tp = (p * tiers) % 1;
    const hw = Math.max(0, Math.round(maxHw * (0.22 + 0.78 * p) * (0.45 + 0.55 * tp)));
    const y = top + i;
    rect(g, cols[1], x - hw, y, hw + 1, 1);
    if (hw > 0) rect(g, cols[0], x + 1, y, hw, 1);
    if (hw > 1) rect(g, cols[2], x - hw, y, 1, 1);
    if (snow && tp < 0.34 && i > 0) {
      const sw = Math.max(1, Math.round(hw * 1.3));
      rect(g, '#f4f8ff', x - hw, y, sw, 1);
      if (tp < 0.2) rect(g, '#c4d2ec', x - hw + sw, y, 1, 1);
    }
  }
  rect(g, snow ? '#f4f8ff' : cols[1], x, top - 1, 1, 1);
}
// A season-appropriate tree.
function seasonTree(g, S, x, by, h, variant = 0) {
  const P = S.P, s = S.season;
  if (s === 'winter') {
    if (variant === 1 && h < 30) { bareTree(g, S, x, by, h); return; }
    pine(g, S, x, by, Math.round(h * 1.1), P.leaf, true); return;
  }
  if (s === 'fall') { roundTree(g, S, x, by, h, S.woods[(variant + (S.R() * 4 | 0)) % 4]); return; }
  if (s === 'spring' && variant === 1) { roundTree(g, S, x, by, h, [P.accent[0], P.accent[1], P.accent[2], P.accent[3]]); return; }
  roundTree(g, S, x, by, h, P.leaf);
}
function bareTree(g, S, x, by, h) {
  const P = S.P, R = S.R;
  trunk(g, S, x, by - Math.round(h * 0.5), by, 2);
  const br = (bx, bySt, len, dir, d) => {
    let cx = bx, cy = bySt;
    for (let i = 0; i < len; i++) {
      cx += dir * (R() < 0.6 ? 1 : 0); cy -= 1;
      rect(g, P.trunkDark, cx, cy, 1, 1);
      if (i === len - 1 || R() < 0.1) rect(g, '#f4f8ff', cx, cy - 1, 1, 1);
    }
    if (d < 2) { br(cx, cy, Math.max(2, len * 0.6 | 0), -dir, d + 1); br(cx, cy, Math.max(2, len * 0.5 | 0), dir, d + 1); }
  };
  const tip = by - Math.round(h * 0.5);
  br(x, tip, Math.round(h * 0.3), -1, 0); br(x, tip, Math.round(h * 0.3), 1, 0);
}
function bush(g, S, x, by, r, cols, snow) {
  const R = S.R;
  const blobs = [[x, by - r, r], [x - r * 0.8, by - r * 0.6, r * 0.7], [x + r * 0.8, by - r * 0.6, r * 0.7]];
  for (const b of blobs) disc(g, cols[0], b[0], b[1], b[2] + 1);
  for (const b of blobs) disc(g, cols[1], b[0] - 1, b[1] - 1, b[2]);
  disc(g, cols[2], x - r * 0.4, by - r * 1.3, r * 0.45);
  if (snow) { ellipse(g, '#f4f8ff', x - 1, by - r * 1.6, r * 0.9, r * 0.45); ellipse(g, '#f4f8ff', x - r * 0.9, by - r * 1.0, r * 0.5, r * 0.3); }
  else for (let i = 0; i < r; i++) rect(g, cols[3], x - r + R() * r * 1.4, by - r * 1.6 + R() * r, 1, 1);
}
function sunflower(g, S, x, by, h) {
  const stem = '#3f7a2c', lf = '#5e9e3c';
  rect(g, stem, x, by - h, 1, h);
  rect(g, lf, x + 1, by - Math.round(h * 0.45), 2, 1); rect(g, lf, x + 2, by - Math.round(h * 0.45) - 1, 1, 1);
  rect(g, lf, x - 2, by - Math.round(h * 0.28), 2, 1); rect(g, lf, x - 3, by - Math.round(h * 0.28) - 1, 1, 1);
  const cy = by - h - 2;
  disc(g, '#c88418', x, cy, 3.2);
  disc(g, '#ffd35c', x - 0.4, cy - 0.4, 2.6);
  rect(g, '#fff0a0', x - 2, cy - 2, 1, 1);
  rect(g, '#6e4a32', x - 1, cy - 1, 3, 3); rect(g, '#4a3228', x, cy, 2, 2); rect(g, '#8a6040', x - 1, cy - 1, 1, 1);
}
function pumpkin(g, x, by, r) {
  ellipse(g, '#a8421e', x, by - r, r + 1.5, r);
  ellipse(g, '#e8873a', x - 0.5, by - r - 0.5, r + 0.6, r - 0.6);
  rect(g, '#c8622e', x - Math.round(r / 2), by - 2 * r + 1, 1, 2 * r - 2);
  rect(g, '#c8622e', x + Math.round(r / 2) + 1, by - 2 * r + 1, 1, 2 * r - 2);
  rect(g, '#f6aa5c', x - r, by - r - 1, 1, 2);
  rect(g, '#5e7a2a', x, by - 2 * r - 2, 2, 2); rect(g, '#3f5a20', x + 1, by - 2 * r - 3, 1, 1);
}
function hayBale(g, x, by, r) {
  disc(g, '#b08a3a', x, by - r, r);
  disc(g, '#e6c460', x - 0.5, by - r - 0.5, r - 1);
  disc(g, '#c8a048', x, by - r, r * 0.55); disc(g, '#e6c460', x, by - r, r * 0.3);
  rect(g, '#fff0a0', x - r + 2, by - r - 2, 1, 2);
}
function rock(g, S, x, by, r, snow) {
  ellipse(g, PAL.stoneDark, x, by - r * 0.5, r, r * 0.6);
  ellipse(g, PAL.stone, x - 0.5, by - r * 0.6, r - 0.8, r * 0.5);
  rect(g, snow ? '#f4f8ff' : '#b8b4ae', x - Math.round(r * 0.5), by - r, Math.max(1, Math.round(r * 0.6)), 1);
}
function flower(g, x, y, c, big, stem) {
  if (big) {
    rect(g, stem, x, y + 1, 1, 2);
    rect(g, c, x - 1, y, 3, 1); rect(g, c, x, y - 1, 1, 3); rect(g, '#fff4b0', x, y, 1, 1);
  } else { rect(g, stem, x, y + 1, 1, 1); rect(g, c, x, y, 1, 1); }
}
function fence(g, S, x0, y0, x1, y1, snow) {
  const wood = '#b98356', dark = '#6e4a32', light = '#dcae7c';
  const a = Math.min(x0, x1), b = Math.max(x0, x1);
  const yAt = x => Math.round(lerp(y0, y1, (x - x0) / (x1 - x0 || 1)));
  for (let x = a; x <= b; x++) {
    const y = yAt(x);
    rect(g, wood, x, y - 5, 1, 1); rect(g, dark, x, y - 4, 1, 1);
    rect(g, wood, x, y - 2, 1, 1); rect(g, dark, x, y - 1, 1, 1);
    if (snow && (x & 1)) rect(g, '#f4f8ff', x, y - 6, 1, 1);
  }
  for (let x = a; x <= b; x += 6) {
    const y = yAt(x);
    rect(g, dark, x, y - 7, 2, 7); rect(g, light, x, y - 7, 1, 6);
    if (snow) rect(g, '#f4f8ff', x, y - 8, 2, 1);
  }
}
function win(g, S, x, y, w, h, layer, lit) {
  rect(g, '#5e3b26', x - 1, y - 1, w + 2, h + 2);
  if (lit) {
    rect(g, '#ffd35c', x, y, w, h); rect(g, '#fff0b0', x, y, 1, 1);
    S.dyn.windows.push({ x, y, w, h, layer });
  } else { rect(g, '#9fd8e8', x, y, w, h); rect(g, '#eafaff', x, y, 1, 1); }
  if (w >= 3) rect(g, '#5e3b26', x + (w >> 1), y, 1, h);
  if (h >= 3) rect(g, '#5e3b26', x, y + (h >> 1), w, 1);
}
function farmhouse(g, S, x, by, w, layer) {
  const P = S.P;
  x = Math.round(x); by = Math.round(by);
  const h = Math.round(w * 0.46), rh = Math.round(w * 0.42), wallTop = by - h;
  const chx = x + Math.round(w * 0.7), chTop = wallTop - rh - 2;
  rect(g, '#8e6a5a', chx, chTop, 3, rh + 1); rect(g, '#6a4a40', chx + 2, chTop, 1, rh + 1); rect(g, '#5c4038', chx - 1, chTop - 1, 5, 1);
  rect(g, P.wall, x, wallTop, w, h);
  const siding = mix(P.wall, P.wallDark, 0.55);
  for (let y = wallTop + 2; y < by; y += 3) rect(g, siding, x, y, w, 1);
  rect(g, P.wallDark, x + w - 2, wallTop, 2, h);
  for (let i = 0; i < rh; i++) {
    const inset = Math.round((rh - 1 - i) * 0.85);
    const xl = x - 2 + inset, xr = x + w + 2 - inset, y = wallTop - rh + i;
    rect(g, i % 3 === 2 ? P.roofDark : P.roof, xl, y, xr - xl, 1);
    rect(g, P.roofDark, xr - Math.max(1, Math.round((xr - xl) * 0.28)), y, Math.max(1, Math.round((xr - xl) * 0.28)), 1);
    if (i < 2) rect(g, mix(P.roof, '#ffffff', 0.3), xl, y, Math.round((xr - xl) * 0.5), 1);
  }
  if (S.P.roof === '#eef3fb' || S.season === 'winter') {
    // snow drifts along the roof edge
    for (let xx = x - 2; xx < x + w + 2; xx++) if (S.R() < 0.5) rect(g, '#ffffff', xx, wallTop - 1, 1, 1);
  }
  rect(g, mix(P.wall, PAL.ink, 0.35), x, wallTop, w - 2, 1);
  const dx = x + Math.round(w * 0.2);
  rect(g, '#5e3b26', dx - 1, by - 7, 5, 7); rect(g, '#8a5a3b', dx, by - 6, 3, 6); rect(g, '#f2b53a', dx + 2, by - 3, 1, 1);
  rect(g, PAL.stone, dx - 1, by, 5, 1);
  win(g, S, x + Math.round(w * 0.52), wallTop + 2, 4, 3, layer, S.lit);
  if (w >= 24) win(g, S, x + Math.round(w * 0.78) - 1, wallTop + 2, 3, 3, layer, S.lit);
  return { door: dx + 1, chimney: [chx + 1, chTop - 2] };
}
function barn(g, S, x, by, w) {
  x = Math.round(x); by = Math.round(by);
  const h = Math.round(w * 0.55), red = S.dusk ? '#8a3a44' : '#b8423a', dark = S.dusk ? '#5e2a3a' : '#7e2a26';
  const top = by - h;
  const rh = Math.round(w * 0.35);
  for (let i = 0; i < rh; i++) {
    const inset = i < rh / 2 ? Math.round((rh / 2 - i) * 1.4) : 0;
    rect(g, i === 0 ? '#8a6a5a' : '#5e4a48', x - 1 + inset, top - rh + i, w + 2 - inset * 2, 1);
  }
  rect(g, red, x, top, w, h); rect(g, dark, x + w - 3, top, 3, h);
  for (let xx = x + 2; xx < x + w - 3; xx += 3) rect(g, dark, xx, top + 1, 1, h - 1);
  const dw = Math.round(w * 0.4), dx = x + Math.round((w - dw) / 2), dh = Math.round(h * 0.65);
  rect(g, '#fff4d6', dx - 1, by - dh - 1, dw + 2, dh + 1); rect(g, dark, dx, by - dh, dw, dh);
  for (let i = 0; i < dw; i++) { const yy = Math.round((i / dw) * dh); rect(g, '#fff4d6', dx + i, by - dh + yy, 1, 1); rect(g, '#fff4d6', dx + dw - 1 - i, by - dh + yy, 1, 1); }
  if (S.season === 'winter') for (let xx = x; xx < x + w; xx++) rect(g, '#f4f8ff', xx, top - rh, 1, 1 + (S.R() < 0.5 ? 1 : 0));
}
function village(g, S, cx, rf, layer) {
  const R = S.R, c = S.P.distant, cd = S.P.distantDark;
  const spots = [-13, -6, 1, 8, 14];
  for (let i = 0; i < spots.length; i++) {
    if (R() < 0.2) continue;
    const w = 4 + (R() * 3 | 0), h = 3 + (R() * 2 | 0);
    const x = Math.round(cx + spots[i] + R() * 2), by = Math.round(rf(x + w / 2)) + 2;
    rect(g, c, x, by - h, w, h + 2);
    const rh = Math.ceil(w / 2);
    for (let j = 0; j < rh; j++) rect(g, cd, x + rh - 1 - j, by - h - rh + j, 2 * (j + 1) + (w & 1) - 1, 1);
    if (S.lit && R() < 0.8) { rect(g, '#ffd35c', x + 1, by - h + 1, 1, 1); S.dyn.windows.push({ x: x + 1, y: by - h + 1, w: 1, h: 1, layer, tiny: true }); }
    if (i === 2) { // church steeple
      rect(g, cd, x + 1, by - h - rh - 5, 2, 5); rect(g, cd, x + 1, by - h - rh - 7, 1, 2);
    }
    if (S.lit && i === 1) S.dyn.smoke.push([x + 1, by - h - rh - 1, layer, 0.5]);
  }
}
function windingBand(S, x0, y0, x1, y1, w0, w1, wig, ph, rowFn) {
  const n = Math.max(1, Math.round(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = i / n, y = Math.round(y0 + i);
    const cx = lerp(x0, x1, t) + Math.sin(t * Math.PI * 1.7 + ph) * wig * Math.sin(t * Math.PI);
    const hw = lerp(w0, w1, t * t) / 2;
    rowFn(Math.round(cx - hw), Math.round(cx + hw), y, t);
  }
}
function path(g, S, x0, y0, x1, y1, w0, w1, wig, ph) {
  const P = S.P, R = S.R;
  windingBand(S, x0, y0, x1, y1, w0, w1, wig, ph, (a, b, y, t) => {
    rect(g, P.pathDark, a - 1, y, b - a + 2, 1);
    rect(g, P.path, a, y, b - a, 1);
    if (b - a > 6 && R() < 0.5) rect(g, mix(P.path, P.pathDark, 0.5), a + 2 + R() * (b - a - 4), y, 1 + (t * 2 | 0), 1);
    if (R() < 0.08 * (1 + t)) rect(g, mix(P.path, '#ffffff', 0.4), a + R() * (b - a), y, 1, 1);
  });
}
function stream(g, S, layer, x0, y0, x1, y1, w0, w1, wig, ph) {
  const P = S.P, W = S.dyn.water;
  const bank = mix(P.g[3], PAL.ink, 0.15);
  windingBand(S, x0, y0, x1, y1, w0, w1, wig, ph, (a, b, y) => {
    rect(g, bank, a - 1, y, b - a + 2, 1);
    rect(g, P.waterDark, a, y, b - a, 1);
    if (b - a > 2) rect(g, P.water, a + 1, y, b - a - 2, 1);
    if (y % 2 === 0) for (let x = a + 1; x < b - 1; x++) W.push(x, y, layer);
  });
}
function tuftStatic(g, S, x, y, band) {
  const dk = S.gDark[band], lt = S.gLight[band];
  rect(g, dk, x, y, 1, 1); rect(g, dk, x - 1, y - 1, 1, 1); rect(g, dk, x + 1, y - 1, 1, 1); rect(g, lt, x - 1, y - 2, 1, 1);
}
function addTuft(S, x, y, hmin, hmax) {
  const R = S.R, n = 2 + (R() * 2 | 0);
  for (let i = 0; i < n; i++) {
    const h = Math.round(hmin + R() * (hmax - hmin));
    S.blades.push(Math.round(x + i - n / 2 + (R() < 0.3 ? 1 : 0)), Math.round(y), h, R() * TAU, (R() * 4) | 0);
  }
}
function meadow(g, S, y0, y1, cols) {
  cols = cols || S.P.g;
  const { W, R, LW } = S;
  vgrad(g, 0, y0, LW, y1 - y0, cols, 0.55);
  // soft sun/shadow patches
  for (let i = 0; i < 5; i++) {
    const t = 0.2 + R() * 0.8, y = y0 + t * (y1 - y0);
    ditherEllipse(g, S.gDark[Math.min(3, t * 4 | 0)], R() * W, y, 14 + R() * 30, 3 + t * 8, 0.35);
  }
  const n = Math.round((W * (y1 - y0)) / 40);
  for (let i = 0; i < n; i++) {
    const t = Math.pow(R(), 0.85), y = Math.round(y0 + 1 + t * (y1 - y0 - 1));
    const x = Math.round(-M + R() * (W + 2 * M));
    const band = Math.min(cols.length - 1, Math.floor(t * cols.length));
    g.fillStyle = R() < 0.62 ? S.gDark[band] : S.gLight[band];
    g.fillRect(x, y, 1 + Math.round(t * 2.2 * R()), 1);
  }
}
function scatterFlowers(g, S, y0, y1, n, edgeBias) {
  const { W, R, P } = S;
  for (let i = 0; i < n; i++) {
    const t = Math.pow(R(), 0.9), y = Math.round(y0 + t * (y1 - y0));
    let x = R() * W;
    if (R() < edgeBias) x = R() < 0.5 ? R() * W * 0.22 : W - R() * W * 0.22;
    const c = P.flowers[(R() * P.flowers.length) | 0];
    flower(g, Math.round(x), y, c, t > 0.35 && R() < 0.3, S.gDark[Math.min(3, t * 4 | 0)]);
  }
}
function makeCloud(S, w) {
  const { R, P } = S;
  const h = Math.max(6, Math.round(w * 0.4));
  const c = document.createElement('canvas'); c.width = w + 2; c.height = h + 1;
  const g = c.getContext('2d');
  const n = 3 + ((w / 9) | 0), blobs = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const br = h * (0.32 + R() * 0.22) * (1.15 - Math.abs(u - 0.5) * 0.9);
    blobs.push([lerp(h * 0.42, w - h * 0.42, u) + (R() - 0.5) * 3, h - br - 1, br]);
  }
  for (const b of blobs) disc(g, P.cloudShade, b[0], b[1], b[2]);
  rect(g, P.cloudShade, blobs[0][0], h - 3, blobs[n - 1][0] - blobs[0][0], 3);
  for (const b of blobs) disc(g, P.cloud, b[0] - 1, b[1] - 1.2, b[2] - 0.8);
  for (const b of blobs) if (b[0] < w * 0.6) disc(g, mix(P.cloud, '#ffffff', 0.5), b[0] - 2, b[1] - 2, b[2] * 0.35);
  return c;
}
function paintSky(S, horizon, o = {}) {
  const { L, LW, W, H, P, R, dyn } = S, g = L[0];
  vgrad(g, 0, 0, LW, Math.min(H, horizon + 6), P.sky, 0.45);
  if (horizon + 6 < H) rect(g, P.sky[P.sky.length - 1], -M, horizon + 6, LW, H);
  if (S.night) {
    const n = Math.min(160, Math.round((W * horizon) / 170));
    const st = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      st[i * 4] = Math.round(R() * W); st[i * 4 + 1] = Math.round(Math.pow(R(), 1.5) * horizon * 0.8);
      st[i * 4 + 2] = R() * TAU; st[i * 4 + 3] = R() < 0.12 ? 1 : 0;
    }
    dyn.stars = st;
  }
  if (o.sun) {
    const [x, y, r] = o.sun;
    ditherEllipse(g, P.sunGlow, x, y, r + 16, r + 16, 0.35);
    ditherEllipse(g, P.sunGlow, x, y, r + 7, r + 7, 0.9, false);
    disc(g, mix(P.sunGlow, P.sun, 0.5), x, y, r + 2);
    disc(g, P.sun, x, y, r);
    disc(g, mix(P.sun, '#ffffff', 0.6), x - r * 0.3, y - r * 0.3, r * 0.45);
  }
  if (o.moon) {
    const [x, y, r] = o.moon;
    ditherEllipse(g, mix(P.sky[1], '#c8d0ff', 0.4), x, y, r + 8, r + 8, 0.6);
    disc(g, '#f4f0dc', x, y, r);
    disc(g, '#dcd6bc', x + r * 0.35, y + r * 0.1, r * 0.3); disc(g, '#dcd6bc', x - r * 0.3, y + r * 0.45, r * 0.2);
    rect(g, '#fffbea', x - r * 0.5, y - r * 0.5, 2, 1);
  }
  const nc = o.clouds ?? 4;
  for (let i = 0; i < nc; i++) {
    const w = Math.round(18 + R() * 28), c = makeCloud(S, w);
    dyn.clouds.push({ c, x: R() * (W + 40) - 20, y: Math.round(horizon * (0.06 + R() * (o.cloudSpan ?? 0.5))), v: 0.8 + R() * 2.2 });
  }
}
function darken(g, S, cx, cy, r0, r1, levels, warm) {
  const { LW, H } = S;
  const img = g.getImageData(0, 0, LW, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < LW; x++) {
    const o = (y * LW + x) * 4;
    if (!d[o + 3]) continue;
    const dist = Math.hypot(x - M - cx, (y - cy) * 1.2);
    const v = clamp((dist - r0) / (r1 - r0), 0, 1) * (levels.length - 1) + bay(x, y) - 0.5;
    const q = clamp(Math.round(v), 0, levels.length - 1), f = levels[q];
    const wm = warm && q === 0 ? 1.06 : 1;
    d[o] = Math.min(255, d[o] * f * wm); d[o + 1] = d[o + 1] * f; d[o + 2] = d[o + 2] * f * (q === 0 ? 0.92 : 1.02);
  }
  g.putImageData(img, 0, 0);
}
// Banded (posterised) radial glow: hard-edged rings read as pixel art, meant for 'lighter' blending.
function bakeGlow(r, inner, outer, bands = 5) {
  const c = document.createElement('canvas'); c.width = c.height = r * 2 + 1;
  const g = c.getContext('2d');
  for (let b = 0; b < bands; b++) {
    const rr = r * (1 - b / bands), a = 0.22 + (b / bands) * 0.5;
    const [R, G, B] = rgb(mix(outer, inner, b / (bands - 1)));
    g.fillStyle = `rgba(${R},${G},${B},${(a * 0.45).toFixed(3)})`;
    const ri = Math.floor(rr);
    for (let dy = -ri; dy <= ri; dy++) {
      const hw = Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
      g.fillRect(r - hw, r + dy, hw * 2 + 1, 1);
    }
  }
  return c;
}

// ---------- scene painters ----------
function paintCombat(S) {
  const { W, H, P, R, dyn, L, season, dusk } = S;
  const gy = Math.round(H * 0.42); dyn.horizon = gy;
  let sun = null, moon = null;
  if (dusk) { if (season === 'winter') moon = [W * 0.76, gy * 0.3, 7]; else sun = [W * 0.7, gy - 9, 12]; }
  else if (season === 'fall') sun = [W * 0.8, gy - 20, 9];
  else if (season === 'winter') moon = [W * 0.8, gy * 0.28, 6];
  else sun = [W * 0.8, Math.min(H * 0.13, gy * 0.35), 7];
  paintSky(S, gy, { sun, moon, clouds: season === 'winter' ? 2 : 4, cloudSpan: 0.45 });
  dyn.raySrc = sun ? [sun[0], sun[1]] : [W * 0.15, -20];
  const r2 = ridge(R, gy - 6, Math.min(30, H * 0.1), 0.022);
  hill(L[1], S, r2, P.far2, mix(P.far2, '#ffffff', 0.18));
  village(L[1], S, W * (R() < 0.5 ? 0.3 : 0.66), r2, 1);
  const r1 = ridge(R, gy - 1, Math.min(12, H * 0.045), 0.04);
  hill(L[1], S, r1, P.far, mix(P.far, '#ffffff', 0.14));
  // distant treeline clumps at the sides
  const fdark = mix(P.far, PAL.ink, 0.12);
  for (let x = -M; x < W + M; x += 3 + R() * 4) {
    const edge = Math.min(x, W - x) / W;
    if (edge > 0.3 && R() < 0.8) continue;
    const y = r1(x);
    if (season === 'winter') { pine(L[1], S, Math.round(x), Math.round(y) + 2, 7 + (R() * 6 | 0), [fdark, P.far, mix(P.far, '#ffffff', 0.2)], true); continue; }
    disc(L[1], fdark, x, y - 1, 2 + R() * 2.5); disc(L[1], mix(P.far, '#ffffff', 0.08), x - 0.5, y - 1.5, 1.5 + R());
  }
  const rm = ridge(R, gy + 2, 4, 0.06);
  // mid-distance trees near the edges
  for (let x = -M; x < W + M; x += 5 + R() * 6) {
    const edge = Math.min(x, W - x) / W;
    if (edge > 0.22) continue;
    seasonTree(L[2], S, Math.round(x), Math.round(rm(x)) + 2, 10 + (R() * 8 | 0), R() < 0.3 ? 1 : 0);
  }
  if (season === 'winter' || dusk) {
    const cx = Math.round(W * (R() < 0.5 ? 0.8 : 0.16));
    const h = farmhouse(L[2], S, cx - 7, Math.round(rm(cx)) + 3, 14, 2);
    dyn.smoke.push([h.chimney[0], h.chimney[1], 2, 1]);
  }
  hill(L[2], S, rm, P.mid, mix(P.mid, '#ffffff', 0.15));
  const g = L[3];
  meadow(g, S, gy + 2, H);
  const deep = H - gy, k = S.k;
  // season edge dressing
  const props = [];
  const add = (y, fn) => props.push([y, fn]);
  const side = () => (R() < 0.5 ? R() * W * 0.17 : W - R() * W * 0.17);
  if (season === 'spring') {
    stream(g, S, 3, W * 0.8, gy + 4, W + 10, H + 2, 3, 30, 12, R() * 3);
    add(gy + 12, () => seasonTree(g, S, Math.round(W * 0.05), gy + 12, 48 * k, 1));
    add(gy + 8, () => seasonTree(g, S, Math.round(W * 0.15), gy + 8, 30 * k, 0));
    add(gy + 13, () => seasonTree(g, S, Math.round(W * 0.95), gy + 13, 44 * k, 0));
    add(gy + 7, () => seasonTree(g, S, Math.round(W * 0.86), gy + 7, 24 * k, 1));
    add(gy + deep * 0.3, () => fence(g, S, -M, gy + deep * 0.3, Math.round(W * 0.12), gy + deep * 0.27, false));
  } else if (season === 'summer') {
    add(gy + 12, () => seasonTree(g, S, Math.round(W * 0.04), gy + 12, 50 * k, 0));
    add(gy + 7, () => seasonTree(g, S, Math.round(W * 0.93), gy + 10, 44 * k, 0));
    add(gy + 7, () => seasonTree(g, S, Math.round(W * 0.84), gy + 6, 22 * k, 0));
    add(gy + 9, () => hayBale(g, Math.round(W * 0.16), gy + 10, 5));
    for (let i = 0; i < 12; i++) {
      const x = i < 6 ? W * 0.02 + i * 5 + R() * 3 : W * 0.8 + (i - 6) * 5 + R() * 3;
      const y = gy + deep * (0.12 + R() * 0.22);
      add(y, () => sunflower(g, S, Math.round(x), Math.round(y), 12 + (R() * 9 | 0)));
    }
  } else if (season === 'fall') {
    add(gy + 12, () => seasonTree(g, S, Math.round(W * 0.05), gy + 12, 48 * k, 0));
    add(gy + 8, () => seasonTree(g, S, Math.round(W * 0.16), gy + 8, 28 * k, 2));
    add(gy + 12, () => seasonTree(g, S, Math.round(W * 0.95), gy + 12, 46 * k, 1));
    add(gy + 7, () => seasonTree(g, S, Math.round(W * 0.85), gy + 7, 24 * k, 3));
    for (let i = 0; i < 5; i++) {
      const x = side(), y = gy + deep * (0.1 + R() * 0.35);
      add(y, () => pumpkin(g, Math.round(x), Math.round(y), 2 + (R() * 3 | 0)));
    }
    add(gy + 9, () => hayBale(g, Math.round(W * 0.78), gy + 9, 4));
    for (let i = 0; i < W * deep / 60; i++) rect(g, S.woods[(R() * 4) | 0][1 + (R() * 2 | 0)], R() * W, gy + 3 + Math.pow(R(), 0.8) * deep, 1, 1);
  } else {
    add(gy + 14, () => pine(g, S, Math.round(W * 0.05), gy + 14, Math.round(56 * k), P.leaf, true));
    add(gy + 8, () => pine(g, S, Math.round(W * 0.15), gy + 8, Math.round(32 * k), P.leaf, true));
    add(gy + 13, () => pine(g, S, Math.round(W * 0.94), gy + 13, Math.round(50 * k), P.leaf, true));
    add(gy + 6, () => pine(g, S, Math.round(W * 0.85), gy + 6, Math.round(26 * k), P.leaf, true));
    add(gy + deep * 0.28, () => fence(g, S, -M, gy + deep * 0.3, Math.round(W * 0.14), gy + deep * 0.25, true));
    for (let i = 0; i < 3; i++) { const x = side(), y = gy + deep * (0.15 + R() * 0.3); add(y, () => bush(g, S, Math.round(x), Math.round(y), 3 + R() * 2, [mix(P.leaf[0], '#8fa8c8', 0.3), P.leaf[1], P.leaf[2], P.leaf[3]], true)); }
  }
  for (let i = 0; i < 3; i++) { const x = side(), y = gy + deep * (0.2 + R() * 0.5); add(y, () => rock(g, S, Math.round(x), Math.round(y), 2 + R() * 2, season === 'winter')); }
  // foreground bushes in the bottom corners
  if (season !== 'winter') for (let i = 0; i < 4; i++) {
    const x = i < 2 ? R() * W * 0.14 : W - R() * W * 0.14, y = H - R() * deep * 0.25;
    add(y, () => bush(g, S, Math.round(x), Math.round(y), 5 + R() * 4, season === 'fall' ? S.woods[(R() * 4) | 0] : P.leaf, false));
  }
  props.sort((a, b) => a[0] - b[0]).forEach(p => p[1]());
  if (season !== 'winter') scatterFlowers(g, S, gy + 3, H, Math.round(W * deep / (season === 'spring' ? 170 : 260)), 0.7);
  for (let i = 0; i < W * deep / 260; i++) {
    const t = Math.pow(R(), 0.8); tuftStatic(g, S, Math.round(R() * W), Math.round(gy + 3 + t * deep), Math.min(3, t * 4 | 0));
  }
  // live grass: denser at the edges and along the bottom
  for (let i = 0; i < 70; i++) {
    const t = Math.pow(R(), 0.7), y = gy + 4 + t * (deep - 4);
    let x = R() * W;
    if (R() < 0.65) x = R() < 0.5 ? R() * W * 0.25 : W - R() * W * 0.25;
    addTuft(S, x, y, 2 + t * 2, 3 + t * 4);
  }
  for (let x = -4; x < W + 4; x += 3 + R() * 5) addTuft(S, x, H + 1, 5, 9);
  dyn.amb = seasonAmb(S);
}

function paintValley(S) {
  const { W, H, P, R, dyn, L, season, portrait, mode } = S;
  const hy = Math.round(H * (portrait ? 0.42 : 0.47)); dyn.horizon = hy;
  const r3 = ridge(R, hy - Math.min(8, H * 0.03), Math.min(30, H * 0.11), 0.03);
  let sun = null, moon = null;
  if (mode === 'golden') sun = [W * 0.7, Math.round(r3(W * 0.7)) - (portrait ? 3 : 4), portrait ? 11 : 13];
  else if (mode === 'bright') sun = [W * 0.8, Math.min(H * 0.12, hy * 0.3), 8];
  else if (season === 'winter') moon = [W * 0.74, hy * 0.35, 7];
  else sun = [W * 0.68, Math.round(r3(W * 0.68)) + 2, 11];
  paintSky(S, hy, { sun, moon, clouds: 4, cloudSpan: 0.55 });
  dyn.raySrc = sun ? [sun[0], sun[1]] : [W * 0.2, -20];
  hill(L[1], S, r3, P.far2, mix(P.far2, '#ffffff', 0.2));
  if (season === 'winter') for (let x = -M; x < W + M; x++) { const y = Math.round(r3(x)); rect(L[1], '#f4f8ff', x, y, 1, 2 + (bay(x, 0) < 0.5 ? 1 : 0)); }
  const r2 = ridge(R, hy + 3, Math.min(12, H * 0.05), 0.05);
  village(L[1], S, W * 0.2, r2, 1);
  hill(L[1], S, r2, P.far, mix(P.far, '#ffffff', 0.14));
  // the farm hill
  const hx = Math.round(W * (portrait ? 0.56 : 0.6));
  const mbase = hy + H * (portrait ? 0.12 : 0.17), mamp = Math.min(20, H * 0.07), ph = R() * TAU;
  const rm = x => mbase - mamp * Math.exp(-(((x - hx) / (W * 0.4)) ** 2)) - 2.5 * Math.sin(x * 0.05 + ph);
  const gm = L[2];
  // trees on the hill behind the house
  for (let x = -M; x < W + M; x += 6 + R() * 8) {
    if (Math.abs(x - hx - 10) < 22) continue;
    seasonTree(gm, S, Math.round(x), Math.round(rm(x)) + 2, 9 + (R() * 7 | 0), R() < 0.3 ? 1 : 0);
  }
  hill(gm, S, rm, P.mid, mix(P.mid, '#ffffff', 0.16));
  // crop field on the slope
  const fx0 = Math.round(W * 0.08), fx1 = Math.round(hx - 16);
  const fieldCols = season === 'spring' ? ['#b89a6a', '#7cc24e'] : season === 'summer' ? ['#e2c860', '#c8a844'] : season === 'fall' ? ['#9a7448', '#b48a58'] : ['#e8eef8', '#c8d4e8'];
  for (let x = fx0; x < fx1; x++) {
    const top = Math.round(rm(x)) + 5, bot = Math.round(mbase + 10);
    for (let y = top; y < bot; y++) rect(gm, fieldCols[(y >> 1) & 1], x, y, 1, 1);
  }
  if (season === 'fall') for (let i = 0; i < 6; i++) { const x = lerp(fx0, fx1, R()); pumpkin(gm, Math.round(x), Math.round(rm(x)) + 8 + (R() * 6 | 0), 1 + (R() * 2 | 0)); }
  const hw = portrait ? 22 : 26;
  const hby = Math.round(rm(hx + hw / 2)) + 3;
  seasonTree(gm, S, hx - 6, hby - 1, 22, 1);
  seasonTree(gm, S, hx + hw + 5, hby - 2, 26, 0);
  if (!portrait || W > 180) barn(gm, S, hx + hw + 10, hby + 1, 16);
  const house = farmhouse(gm, S, hx, hby, hw, 2);
  dyn.smoke.push([house.chimney[0], house.chimney[1], 2, 1]);
  fence(gm, S, hx - 26, hby + 6, hx + hw + 30, hby + 7, season === 'winter');
  // near meadow
  const nb = Math.round(hy + H * (portrait ? 0.26 : 0.34));
  const rn = ridge(R, nb, 4, 0.04);
  const gn = L[3];
  path(gm, S, house.door, hby + 1, house.door - 4, nb + 2, 3, 6, 3, 0);
  hill(gn, S, rn, P.g[0], mix(P.g[0], '#ffffff', 0.18));
  meadow(gn, S, nb + 3, H);
  path(gn, S, house.door - 4, Math.round(rn(house.door - 4)) + 1, W * 0.5, H + 2, 6, W * 0.3, 14, R() * 3);
  if (season !== 'winter') stream(gn, S, 3, -M, nb + 10, W * 0.24, H + 2, 5, 22, 10, 1);
  else { ellipse(gn, S.P.waterDark, W * 0.14, nb + (H - nb) * 0.45, W * 0.16, 6); ellipse(gn, S.P.water, W * 0.14, nb + (H - nb) * 0.45 - 1, W * 0.15 - 1, 4); for (let x = Math.round(W * 0.02); x < W * 0.28; x++) for (let y = -3; y < 4; y += 2) dyn.water.push(x, Math.round(nb + (H - nb) * 0.45 + y), 3); }
  scatterFlowers(gn, S, nb + 3, H, season === 'winter' ? 0 : Math.round(W * (H - nb) / 120), 0.4);
  // big framing tree + bushes
  const ft = Math.round(Math.min(W * 0.5, H * 0.42));
  seasonTree(gn, S, Math.round(W * 0.03), H - 2, ft, season === 'spring' ? 1 : 0);
  bush(gn, S, Math.round(W * 0.93), H - 3, 7, season === 'fall' ? S.woods[1] : P.leaf, season === 'winter');
  bush(gn, S, Math.round(W * 0.82), H + 1, 5, season === 'fall' ? S.woods[2] : P.leaf, season === 'winter');
  for (let i = 0; i < W * (H - nb) / 280; i++) { const t = R(); tuftStatic(gn, S, Math.round(R() * W), Math.round(nb + 4 + t * (H - nb - 4)), Math.min(3, t * 4 | 0)); }
  for (let i = 0; i < 50; i++) { const t = Math.pow(R(), 0.6); addTuft(S, R() * W, nb + 4 + t * (H - nb - 4), 2 + t * 2, 3 + t * 5); }
  for (let x = -4; x < W + 4; x += 3 + R() * 5) addTuft(S, x, H + 1, 5, 10);
  if (mode === 'bright') { dyn.rays = 1; dyn.amb = [[K.CONFETTI, 20 * W / 320], [K.PETAL, 6 * W / 320], [K.GLINT, 8 * W / 320]]; }
  else if (mode === 'dusk') dyn.amb = [[K.FIREFLY, 2 * W / 320], ...seasonAmb(S, 0.5)];
  else { dyn.rays = 1; dyn.amb = [...seasonAmb(S, 0.8), [K.MOTE, 2 * W / 320]]; }
}

// Map: a soft patchwork quilt of fields (jittered-grid Voronoi), hedgerows, a stream and seasonal
// details, then contrast-compressed toward a wash colour so the map UI reads on top.
const MAP_SETS = {
  spring: {
    hedge: '#5d9e45', hedgeLt: '#78b452', wash: '#b4d68c', weights: [0, 0, 1, 1, 2, 3, 3, 4, 5],
    kinds: [['#a4d868', '#b8e27a'], ['#c8b48a', '#94c86a'], ['#98cc68', '#5d9e45'], ['#9cd46a', '#b8e27a', '#f29bb0', '#fff4d6', '#ffd35c', '#b69ae0'], ['#8ccf5c', '#a4d868'], ['#c8b48a', '#b09a70']],
    tree: ['#3f7a3a', '#5d9e45', '#86c455', '#f8c8d4'], blossom: true,
  },
  summer: {
    hedge: '#3d7a33', hedgeLt: '#56922f', wash: '#c4cc7c', weights: [0, 1, 1, 2, 2, 3, 4, 5],
    kinds: [['#90c44a', '#a4d058'], ['#e6d27a', '#d4b85a'], ['#98bc5e', '#f2c84a'], ['#a8cc64', '#b8d870', '#d6453d', '#ffd35c', '#fff4d6'], ['#80b440', '#90c44a'], ['#dcc070', '#c8a858']],
    tree: ['#285c2a', '#3d7a33', '#5e9e3c', '#92c658'],
  },
  fall: {
    hedge: '#8a5a2e', hedgeLt: '#b0702e', wash: '#ccb47c', weights: [0, 1, 1, 2, 3, 4, 4, 5],
    kinds: [['#c8b460', '#b8a052'], ['#9a7448', '#b48a58'], ['#8a8a3a', '#e8873a'], ['#c8b460', '#d2bc6c', '#e8873a', '#b8522e', '#f2b53a'], ['#b8a852', '#c8b460'], ['#d8bc70', '#c8a860']],
    tree: FALL_WOODS[1],
  },
  winter: {
    hedge: '#a8b4c8', hedgeLt: '#c0cadc', wash: '#dde5f0', weights: [0, 0, 1, 1, 2, 4, 5, 5],
    kinds: [['#eef3fa', '#dde6f2'], ['#e6ecf6', '#c4d0e4'], ['#e8eef8', '#a8b8cc'], ['#eef3fa', '#dde6f2', '#c8323a'], ['#e6ecf6', '#eef3fa'], ['#dde6f2', '#c8d4e6']],
    tree: ['#1d3e36', '#2d5848', '#44745a', '#f4f8ff'], snow: true,
  },
};
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (a, n) => ((a % n) + n) % n;
function mapPattern(kind, K, x, y, a) {
  switch (kind) {
    case 1: { // ploughed / planted rows
      const u = a === 0 ? y : a > 1.5 ? x : x * Math.cos(a) + y * Math.sin(a);
      return mod(Math.floor(u), 4) < 2 ? K[1] : K[0];
    }
    case 2: return mod(x, 4) === 0 && mod(y, 3) === 0 ? K[1] : K[0]; // crop dots
    case 3: { // wildflowers
      const h = hash2(x, y);
      return h < 0.05 ? K[2 + (((h * 4000) | 0) % (K.length - 2))] : h < 0.12 ? K[1] : K[0];
    }
    case 5: return mod(x + y, 6) === 0 ? K[1] : K[0]; // hatched fallow
    default: return hash2(x, y) < 0.07 ? K[1] : K[0]; // meadow, orchard floor
  }
}
function paintMap(S) {
  const { W, H, P, R, dyn, L, LW, season } = S;
  dyn.noPan = true; dyn.horizon = 0;
  const SET = MAP_SETS[season] || MAP_SETS.spring;
  rect(L[0], SET.wash, -M, 0, LW, H);
  const g = L[3];
  const cs = Math.round(clamp(Math.min(W, H) * 0.22, 28, 52));
  const nx = Math.ceil(LW / cs) + 2, ny = Math.ceil(H / cs) + 2, N = nx * ny;
  const cx = new Float32Array(N), cy = new Float32Array(N), ty = new Uint8Array(N), an = new Float32Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = j * nx + i;
    cx[n] = (i - 1 + 0.15 + R() * 0.7) * cs - M; cy[n] = (j - 1 + 0.15 + R() * 0.7) * cs;
    ty[n] = SET.weights[(R() * SET.weights.length) | 0];
    an[n] = R() < 0.4 ? 0 : R() < 0.5 ? 2 : (R() - 0.5) * 1.2;
  }
  const cols = SET.kinds.map(k => k.map(rgb)), hedge = rgb(SET.hedge), hedgeLt = rgb(SET.hedgeLt);
  const img = g.createImageData(LW, H), d = img.data, border = [];
  for (let y = 0; y < H; y++) for (let xr = 0; xr < LW; xr++) {
    const x = xr - M, ci = Math.floor(xr / cs) + 1, cj = Math.floor(y / cs) + 1;
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let dj = -1; dj <= 1; dj++) {
      const jj = cj + dj; if (jj < 0 || jj >= ny) continue;
      for (let di = -1; di <= 1; di++) {
        const ii = ci + di; if (ii < 0 || ii >= nx) continue;
        const n = jj * nx + ii, dx = x - cx[n], dy = (y - cy[n]) * 1.15, dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; best = n; } else if (dd < d2) d2 = dd;
      }
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    let C;
    if (edge < 1.7) { C = bay(xr, y) < 0.5 ? hedge : hedgeLt; if (hash2(xr, y) < 0.07) border.push(x, y); }
    else C = mapPattern(ty[best], cols[ty[best]], x, y, an[best]);
    const o = (y * LW + xr) * 4;
    d[o] = C[0]; d[o + 1] = C[1]; d[o + 2] = C[2]; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // hedgerow bushes (or snowy stone walls) along the field borders
  const hd = mix(SET.hedge, PAL.ink, 0.2);
  for (let i = 0; i < border.length; i += 2) {
    const x = border[i], y = border[i + 1];
    if (SET.snow) { rect(g, '#9aa8bc', x, y, 2, 1); rect(g, '#f4f8ff', x, y - 1, 2, 1); continue; }
    disc(g, hd, x + 0.5, y + 0.5, 1.3); disc(g, SET.hedgeLt, x, y, 1); if (season === 'fall' && R() < 0.4) rect(g, '#e8873a', x, y - 1, 1, 1);
  }
  // cell dressing: orchards, sheep, bales, pumpkins, footprints
  const tree = (x, y, r) => {
    ellipse(g, mix(SET.hedge, PAL.ink, 0.25), x + 1.5, y + 1.5, r, r * 0.8);
    disc(g, SET.tree[1], x, y, r); disc(g, SET.tree[2], x - 0.6, y - 0.6, r * 0.55);
    rect(g, SET.tree[3], x - 1, y - 1, 1, 1);
    if (SET.blossom && R() < 0.6) { rect(g, '#f8c8d4', x + 1, y - 1, 1, 1); rect(g, '#fff2f6', x - 1, y + 1, 1, 1); }
  };
  for (let n = 0; n < N; n++) {
    const x0 = cx[n], y0 = cy[n];
    if (x0 < -M - 4 || x0 > W + M + 4 || y0 < -4 || y0 > H + 4) continue;
    const k = ty[n];
    if (k === 4) {
      for (let dy = -cs * 0.28; dy <= cs * 0.28; dy += 7) for (let dx = -cs * 0.3; dx <= cs * 0.3; dx += 7) tree(Math.round(x0 + dx + (dy / 7 & 1) * 3), Math.round(y0 + dy), 2.2);
    } else if (k === 0) {
      if (season === 'spring') for (let i = 0; i < 3; i++) { const x = x0 + (R() - 0.5) * cs * 0.5, y = y0 + (R() - 0.5) * cs * 0.4; rect(g, '#fffbf0', x, y, 3, 2); rect(g, '#4a3a38', x + 3, y, 1, 1); }
      else if (season === 'summer' || season === 'fall') for (let i = 0; i < 3; i++) { const x = Math.round(x0 + (R() - 0.5) * cs * 0.5), y = Math.round(y0 + (R() - 0.5) * cs * 0.4); disc(g, '#b08a3a', x + 1, y + 1, 2); disc(g, '#e6c460', x, y, 2); rect(g, '#c8a048', x, y, 1, 1); }
      else { let x = x0 - cs * 0.3, y = y0 + (R() - 0.5) * 8; for (let s = 0; s < 10; s++) { rect(g, '#b8c6dc', x, y + (s & 1) * 2, 1, 1); x += 3; y += (R() - 0.5) * 2; } }
    } else if (k === 2 && season === 'fall') {
      for (let i = 0; i < 5; i++) { const x = Math.round(x0 + (R() - 0.5) * cs * 0.55), y = Math.round(y0 + (R() - 0.5) * cs * 0.45); disc(g, '#b8522e', x + 0.5, y + 0.5, 1.6); disc(g, '#e8873a', x, y, 1.4); rect(g, '#5e7a2a', x, y - 2, 1, 1); }
    } else if (k === 2 && season === 'summer') {
      for (let i = 0; i < 6; i++) { const x = Math.round(x0 + (R() - 0.5) * cs * 0.55), y = Math.round(y0 + (R() - 0.5) * cs * 0.45); rect(g, '#ffd35c', x - 1, y, 3, 1); rect(g, '#ffd35c', x, y - 1, 1, 3); rect(g, '#6e4a32', x, y, 1, 1); }
    }
  }
  // a stream wandering down one side
  const sx = W * (R() < 0.5 ? 0.1 : 0.9);
  stream(g, S, 3, sx, -2, sx + (R() - 0.5) * W * 0.1, H + 2, 5, 7, 12, R() * 3);
  // cottages with smoke
  for (let i = 0; i < 3; i++) {
    const x = Math.round(i === 1 ? W * (0.84 + R() * 0.08) : W * (0.04 + R() * 0.1)), y = Math.round(H * (0.15 + i * 0.3 + R() * 0.1));
    const roof = season === 'winter' ? '#eef3fb' : ['#d6453d', '#b8522e', '#7a3f5a'][i];
    ellipse(g, mix(SET.hedge, PAL.ink, 0.3), x + 5, y + 7, 6, 2);
    rect(g, mix(roof, PAL.ink, 0.2), x, y + 3, 9, 3); rect(g, roof, x, y, 9, 3); rect(g, mix(roof, '#ffffff', 0.3), x, y + 2, 9, 1);
    rect(g, '#8e6a5a', x + 6, y - 1, 2, 2);
    if (season === 'fall' || season === 'winter' || R() < 0.4) dyn.smoke.push([x + 6, y - 2, 3, 0.6]);
  }
  // clustered woods on the side margins
  for (let i = 0; i < (W * H) / 1800; i++) {
    const x = R() < 0.5 ? R() * W * 0.12 : W - R() * W * 0.12, y = R() * H, r = 3 + R() * 3.5;
    const tc = season === 'fall' ? S.woods[(R() * 4) | 0] : SET.tree;
    ellipse(g, mix(SET.hedge, PAL.ink, 0.25), x + 2, y + 2, r, r * 0.8);
    if (SET.snow) { disc(g, tc[1], x, y, r); disc(g, '#f4f8ff', x - 1, y - 1, r * 0.6); continue; }
    disc(g, tc[1], x, y, r); disc(g, tc[2], x - 1, y - 1, r * 0.6); rect(g, tc[3], x - r * 0.5, y - r * 0.5, 1, 1);
  }
  // a pond
  const px = W * (sx < W / 2 ? 0.86 : 0.14), py = H * (0.3 + R() * 0.4);
  ellipse(g, P.waterDark, px, py, 12, 7); ellipse(g, P.water, px - 0.5, py - 0.5, 10, 5);
  for (let y = -4; y <= 4; y += 2) for (let x = -9; x <= 9; x++) if ((x * x) / 81 + (y * y) / 25 < 0.9) dyn.water.push(Math.round(px + x), Math.round(py + y), 3);
  // compress contrast toward the wash so the map UI owns the foreground
  const im = g.getImageData(0, 0, LW, H), dd = im.data, B = rgb(SET.wash);
  for (let i = 0; i < dd.length; i += 4) {
    if (!dd[i + 3]) continue;
    dd[i] = B[0] + (dd[i] - B[0]) * 0.58; dd[i + 1] = B[1] + (dd[i + 1] - B[1]) * 0.58; dd[i + 2] = B[2] + (dd[i + 2] - B[2]) * 0.58;
  }
  g.putImageData(im, 0, 0);
  g.globalAlpha = 0.16; rect(g, PAL.parchment, -M, 0, LW, H); g.globalAlpha = 1;
  dyn.waterHi = mix(P.waterLight, PAL.parchment, 0.3);
  dyn.frozen = season === 'winter';
  dyn.amb = seasonAmb(S, 0.6);
}

function paintHearth(S) {
  const { W, H, P, R, dyn, L, LW, season, portrait } = S;
  dyn.noPan = true; dyn.horizon = H; dyn.indoor = true;
  rect(L[0], '#1a1014', -M, 0, LW, H);
  const g = L[3];
  const floorY = Math.round(H * (portrait ? 0.6 : 0.74));
  const planks = ['#7a4a30', '#84543a', '#6e4229', '#7e4e33'];
  for (let x = -M, i = 0; x < W + M; x += 9, i++) {
    rect(g, planks[(R() * 4) | 0], x, 0, 9, floorY);
    rect(g, '#4a2c1c', x, 0, 1, floorY); rect(g, '#9a6a48', x + 1, 0, 1, floorY);
    if (R() < 0.5) { const ky = R() * floorY; ellipse(g, '#5a3622', x + 4, ky, 1.5, 1); }
    for (let y = 2 + (i & 1) * 20; y < floorY; y += 40) { rect(g, '#3a2418', x + 2, y, 1, 1); rect(g, '#3a2418', x + 6, y, 1, 1); }
  }
  const beamY = Math.round(H * 0.06);
  rect(g, '#4f301f', -M, beamY, LW, 6); rect(g, '#6e4630', -M, beamY, LW, 1); rect(g, '#2e1a12', -M, beamY + 6, LW, 1);
  rect(g, '#5e3b26', -M, floorY - 16, LW, 3); rect(g, '#8a5a3b', -M, floorY - 16, LW, 1);
  // floor
  for (let y = floorY, i = 0; y < H; y += 5, i++) {
    rect(g, i & 1 ? '#633b25' : '#6e4229', -M, y, LW, 5); rect(g, '#3e2418', -M, y, LW, 1);
    for (let x = -M + ((i * 17) % 23); x < W + M; x += 23 + (R() * 10 | 0)) rect(g, '#3e2418', x, y, 1, 5);
  }
  // window with a night sky
  const ww = Math.round(clamp(W * 0.2, 26, 40)), wh = Math.round(ww * 1.1);
  const wx = Math.round(W * (portrait ? 0.06 : 0.1)), wy = Math.round(H * (portrait ? 0.14 : 0.16));
  rect(g, '#3a2418', wx - 3, wy - 3, ww + 6, wh + 6); rect(g, '#9a6a48', wx - 2, wy - 2, ww + 4, wh + 4);
  vgrad(g, wx + M, wy, ww, wh, season === 'winter' ? ['#141c40', '#2a3668', '#4a5a90'] : ['#1a1a44', '#3a2e66', '#6a4a7a'], 0.5);
  for (let i = 0; i < ww * wh / 30; i++) rect(g, R() < 0.3 ? '#fff4d6' : '#9aa0d0', wx + R() * ww, wy + R() * wh * 0.7, 1, 1);
  disc(g, '#f4f0dc', wx + ww * 0.7, wy + wh * 0.25, 3); disc(g, '#dcd6bc', wx + ww * 0.7 + 1, wy + wh * 0.25 + 1, 1);
  if (season === 'winter') { for (let x = 0; x < ww; x++) rect(g, '#e8f0fa', wx + x, wy + wh - 3 - (Math.sin(x * 0.4) > 0.3 ? 1 : 0), 1, 4); }
  else { const hl = mix(P.far, '#1a1a44', 0.5); for (let x = 0; x < ww; x++) rect(g, hl, wx + x, wy + wh - 5 + Math.round(Math.sin(x * 0.15) * 2), 1, 6); }
  rect(g, '#9a6a48', wx + (ww >> 1) - 1, wy, 2, wh); rect(g, '#9a6a48', wx, wy + (wh >> 1) - 1, ww, 2);
  rect(g, '#b98356', wx - 4, wy + wh + 2, ww + 8, 3); rect(g, '#6e4630', wx - 4, wy + wh + 5, ww + 8, 1);
  const sillY = wy + wh + 2;
  if (season === 'fall') pumpkin(g, wx + ww - 5, sillY, 3);
  else if (season === 'winter') { rect(g, '#f2e8d0', wx + 3, sillY - 5, 3, 5); rect(g, '#ffd35c', wx + 4, sillY - 7, 1, 2); dyn.candles.push([wx + 4, sillY - 7]); }
  else { rect(g, '#b8522e', wx + 2, sillY - 3, ww - 4, 3); for (let x = wx + 3; x < wx + ww - 3; x += 3) flower(g, x, sillY - 5, P.flowers[(R() * 4) | 0], false, '#3f7a3a'); }
  // shelf with preserve jars
  const shx = Math.round(W * (portrait ? 0.62 : 0.76)), shy = Math.round(H * (portrait ? 0.2 : 0.24)), shw = Math.round(clamp(W * 0.18, 28, 44));
  for (let k = 0; k < 2; k++) {
    const y = shy + k * 16;
    rect(g, '#b98356', shx, y, shw, 2); rect(g, '#5e3b26', shx, y + 2, shw, 1);
    rect(g, '#5e3b26', shx + 2, y + 3, 1, 3); rect(g, '#5e3b26', shx + shw - 3, y + 3, 1, 3);
    for (let x = shx + 2; x < shx + shw - 5; x += 6) {
      const jc = [PAL.red, PAL.orange, PAL.gold, PAL.leaf, PAL.pink, PAL.purple][(R() * 6) | 0];
      rect(g, '#dfe8e8', x, y - 7, 5, 7); rect(g, jc, x + 1, y - 5, 3, 5); rect(g, '#fff4d6', x + 1, y - 5, 1, 2);
      rect(g, '#d6453d', x, y - 8, 5, 1); rect(g, '#f3e2b3', x + 1, y - 9, 3, 1);
    }
  }
  // fireplace
  const fw = Math.round(clamp(W * (portrait ? 0.62 : 0.44), 64, 124)), fh = Math.round(Math.min(fw * 0.82, floorY * 0.58));
  const fx = Math.round(W / 2 - fw / 2), fy = floorY - fh;
  const stones = ['#9a8a7e', '#a8968a', '#8a7a70', '#b4a294', '#927f72'];
  rect(g, '#4a4644', fx - 1, fy - 1, fw + 2, fh + 1);
  for (let y = fy, row = 0; y < floorY; y += 5, row++) {
    for (let x = fx + (row & 1 ? -3 : 0); x < fx + fw; x += 7 + (R() * 3 | 0)) {
      const sx = Math.max(fx, x), ex = Math.min(fx + fw, x + 7);
      if (ex - sx < 2) continue;
      rect(g, stones[(R() * 5) | 0], sx, y, ex - sx - 1, 4);
      rect(g, '#c0bbb4', sx, y, ex - sx - 2, 1); rect(g, '#6a6662', sx, y + 3, ex - sx - 1, 1);
    }
  }
  const ow = Math.round(fw * 0.56), oh = Math.round(fh * 0.56), ox = Math.round(W / 2 - ow / 2), oy = floorY - oh;
  rect(g, '#5c5855', ox - 2, oy - 2, ow + 4, oh + 2);
  for (let y = 0; y < oh; y++) {
    const inset = y < 4 ? [4, 2, 1, 0][y] : 0;
    rect(g, y < oh * 0.5 ? '#1a1210' : '#24160f', ox + inset, oy + y, ow - inset * 2, 1);
  }
  for (let i = 0; i < ow * oh / 12; i++) rect(g, '#2e1e16', ox + R() * ow, oy + 4 + R() * oh * 0.6, 1, 1);
  // logs
  ellipse(g, '#4a2c1c', W / 2 - ow * 0.18, floorY - 3, ow * 0.22, 2.5); ellipse(g, '#5e3b26', W / 2 + ow * 0.16, floorY - 3, ow * 0.22, 2.5);
  rect(g, '#c8a070', W / 2 - ow * 0.38, floorY - 4, 2, 2); rect(g, '#c8a070', W / 2 + ow * 0.36, floorY - 4, 2, 2);
  dyn.fire = { x: Math.round(ox + ow * 0.18), y: floorY - 4, w: Math.min(60, Math.round(ow * 0.64)), h: Math.round(oh * 0.72) };
  // mantel + things on it
  const my = fy - 4;
  rect(g, '#6e4630', fx - 6, my, fw + 12, 5); rect(g, '#b98356', fx - 6, my, fw + 12, 1); rect(g, '#3e2418', fx - 6, my + 5, fw + 12, 1);
  const cx1 = fx + 4, cx2 = fx + fw - 6;
  for (const cx of [cx1, cx2]) { rect(g, '#f2e8d0', cx, my - 6, 2, 6); rect(g, '#d8c8a8', cx + 1, my - 6, 1, 6); dyn.candles.push([cx, my - 8]); }
  rect(g, '#b8522e', fx + fw * 0.3, my - 6, 6, 6); rect(g, '#d6743a', fx + fw * 0.3 + 1, my - 6, 4, 1); for (let i = 0; i < 4; i++) rect(g, '#5d9e45', fx + fw * 0.3 + i + 1, my - 8 - (i & 1), 1, 2);
  rect(g, '#7a3f5a', fx + fw * 0.55, my - 4, 10, 4); rect(g, '#3f7a3a', fx + fw * 0.55 + 1, my - 7, 9, 3); rect(g, '#f3e2b3', fx + fw * 0.55 + 10, my - 6, 1, 5);
  rect(g, '#5c5855', fx - 4, floorY, fw + 8, 3); rect(g, '#8e8a86', fx - 4, floorY, fw + 8, 1);
  // hanging herbs
  for (let x = 6 + R() * 10; x < W - 4; x += 16 + R() * 18) {
    if (Math.abs(x - W / 2) < fw * 0.3) continue;
    const len = 4 + (R() * 6 | 0);
    rect(g, '#c8a878', x, beamY + 6, 1, len);
    const c = [PAL.leafDark, PAL.moss, PAL.lilac, '#8a9a4a'][(R() * 4) | 0];
    rect(g, c, x - 1, beamY + 6 + len, 3, 6); rect(g, mix(c, '#ffffff', 0.25), x - 1, beamY + 6 + len, 1, 5); rect(g, c, x, beamY + 12 + len, 1, 2);
  }
  // rug
  const ry = floorY + Math.round((H - floorY) * 0.42), rrx = fw * 0.7, rry = Math.max(5, (H - floorY) * 0.2);
  ellipse(g, '#7a2a3a', W / 2, ry, rrx + 2, rry + 1); ellipse(g, '#a8325c', W / 2, ry, rrx, rry);
  ellipse(g, '#f2b53a', W / 2, ry, rrx - 4, rry - 2); ellipse(g, '#a8325c', W / 2, ry, rrx - 5, rry - 3);
  ditherEllipse(g, '#d6453d', W / 2, ry, rrx - 7, rry - 4, 0.5, false);
  // a little stool and basket of logs
  rect(g, '#5e3b26', fx + fw + 6, floorY - 6, 12, 7); rect(g, '#8a5a3b', fx + fw + 6, floorY - 6, 12, 1);
  for (let i = 0; i < 3; i++) ellipse(g, '#6e4630', fx + fw + 9 + i * 3, floorY - 8, 1.5, 1.5);
  const fcy = floorY - oh * 0.35;
  darken(g, S, W / 2, fcy, fw * 0.45, Math.max(W, H) * 0.75, [1, 0.82, 0.66, 0.52, 0.42], true);
  dyn.glow = { x: W / 2, y: fcy, c: bakeGlow(Math.round(fw * 0.9), '#ffb050', '#b85020') };
  dyn.amb = [[K.EMBER, 5]];
}

function paintMarket(S) {
  const { W, H, P, R, dyn, L, LW, season, portrait } = S;
  const hz = Math.round(H * (portrait ? 0.34 : 0.4)); dyn.horizon = hz;
  const sun = season === 'winter' ? null : [W * 0.84, Math.min(H * 0.1, hz * 0.3), 7];
  paintSky(S, hz, { sun, moon: season === 'winter' ? [W * 0.84, hz * 0.25, 5] : null, clouds: 3, cloudSpan: 0.5 });
  dyn.raySrc = sun ? [sun[0], sun[1]] : [0, -20]; dyn.rays = season === 'winter' ? 0 : 1;
  // village backdrop
  const gf = L[1];
  const roofs = [P.roof, P.roofDark, '#b8522e', '#5e7a8a', '#7a3f5a', '#8a5a3b'];
  for (let x = -M; x < W + M;) {
    const w = 14 + (R() * 14 | 0), h = 10 + (R() * 14 | 0), by = hz + 2;
    const wall = mix(R() < 0.5 ? P.wall : '#e8d0b0', P.far, 0.35), roof = mix(roofs[(R() * roofs.length) | 0], P.far, 0.3);
    rect(gf, wall, x, by - h, w, h + 2); rect(gf, mix(wall, PAL.ink, 0.15), x + w - 2, by - h, 2, h + 2);
    const rh = Math.ceil(w / 2.4);
    for (let j = 0; j < rh; j++) { const inset = Math.round((rh - 1 - j) * 1.1); rect(gf, j % 3 === 2 ? mix(roof, PAL.ink, 0.2) : roof, x - 1 + inset, by - h - rh + j, w + 2 - inset * 2, 1); }
    if (season === 'winter') rect(gf, '#f4f8ff', x + 1, by - h - rh, w - 2, 1);
    for (let wx2 = x + 3; wx2 < x + w - 4; wx2 += 6) win(gf, S, wx2, by - h + 3, 2, 3, 1, S.lit);
    if (R() < 0.5) { rect(gf, '#7a6a64', x + w - 5, by - h - rh - 3, 2, 4); if (S.lit || season === 'winter' || season === 'fall') dyn.smoke.push([x + w - 4, by - h - rh - 4, 1, 0.6]); }
    x += w + 1 + (R() * 6 | 0);
    if (R() < 0.3) { seasonTree(gf, S, x + 3, by + 1, 14, 0); x += 8; }
  }
  // cobbles
  const g2 = L[2];
  const cob = mix(P.cobble, P.g[1], 0.15);
  vgrad(g2, 0, hz + 2, LW, H - hz - 2, [mix(cob, '#ffffff', 0.1), cob, mix(cob, PAL.ink, 0.1)], 0.6);
  const cobDk = mix(cob, PAL.ink, 0.08), cobLt = mix(cob, '#ffffff', 0.08), cobEdge = mix(cob, PAL.ink, 0.25), cobHi = mix(cob, '#ffffff', 0.25), cobSide = mix(cob, PAL.ink, 0.14);
  for (let y = hz + 3, row = 0; y < H; row++) {
    const t = (y - hz) / (H - hz), sh = 2 + Math.round(t * 3), sw = 4 + Math.round(t * 5);
    for (let x = -M + (row & 1) * (sw >> 1); x < W + M; x += sw + 1) {
      const v = R();
      if (v < 0.3) rect(g2, v < 0.12 ? cobDk : cobLt, x, y, sw, sh);
      rect(g2, cobEdge, x, y + sh, sw, 1);
      rect(g2, cobHi, x, y, sw - 1, 1);
      rect(g2, cobSide, x + sw, y, 1, sh);
    }
    y += sh + 1;
  }
  // stall
  const g = L[3];
  // landscape: the stall sits in the right third so the shop UI owns the middle
  const sw = Math.round(portrait ? clamp(W * 0.84, 110, 196) : clamp(W * 0.34, 96, 150));
  const scx = portrait ? W / 2 : W * 0.76, sx = Math.round(scx - sw / 2);
  const counterTop = Math.round(H * (portrait ? 0.5 : 0.6)), ch = Math.round(clamp(sw * 0.2, 18, 30));
  const awTop = Math.round(counterTop - Math.min(sw * 0.46, H * 0.4)), awH = 10;
  // back wall + shelves
  rect(g, '#6e4630', sx + 2, awTop + awH, sw - 4, counterTop - awTop - awH);
  for (let y = awTop + awH + 3; y < counterTop; y += 4) rect(g, '#5e3b26', sx + 2, y, sw - 4, 1);
  const shelfY = Math.round(lerp(awTop + awH, counterTop, 0.45));
  rect(g, '#b98356', sx + 4, shelfY, sw - 8, 2); rect(g, '#3e2418', sx + 4, shelfY + 2, sw - 8, 1);
  for (let x = sx + 7; x < sx + sw - 10; x += 7) {
    const jc = [PAL.red, PAL.orange, PAL.gold, PAL.leaf, PAL.pink, PAL.purple, PAL.berry][(R() * 7) | 0];
    rect(g, '#dfe8e8', x, shelfY - 7, 5, 7); rect(g, jc, x + 1, shelfY - 5, 3, 5); rect(g, '#ffffff', x + 1, shelfY - 5, 1, 2); rect(g, '#b8522e', x, shelfY - 8, 5, 1);
  }
  // posts
  for (const px of [sx, sx + sw - 4]) { rect(g, '#5e3b26', px, awTop, 4, counterTop - awTop + ch); rect(g, '#8a5a3b', px, awTop, 2, counterTop - awTop + ch); }
  // awning: striped slope + scallops
  const stripeA = season === 'winter' ? '#3a6a9a' : season === 'fall' ? '#b8522e' : '#d6453d', stripeB = '#fff4d6';
  for (let i = 0; i < awH; i++) {
    const inset = Math.round((awH - 1 - i) * 0.9);
    for (let x = sx - 6 + inset; x < sx + sw + 6 - inset; x++) {
      const k = Math.floor((x - sx + 60) / 8) & 1;
      rect(g, i === 0 ? mix(k ? stripeA : stripeB, '#ffffff', 0.25) : k ? stripeA : stripeB, x, awTop + i - awH + 4, 1, 1);
    }
  }
  const scY = awTop + 4;
  for (let x = sx - 6; x < sx + sw + 6; x += 8) {
    const k = Math.floor((x - sx + 60) / 8) & 1, c = k ? stripeA : stripeB;
    rect(g, c, x, scY, 8, 2); rect(g, c, x + 1, scY + 2, 6, 1); rect(g, c, x + 2, scY + 3, 4, 1);
    rect(g, mix(c, PAL.ink, 0.25), x + 2, scY + 4, 4, 1);
  }
  if (season === 'winter') for (let x = sx - 6; x < sx + sw + 6; x++) rect(g, '#f4f8ff', x, awTop - awH + 3 + (Math.sin(x * 0.7) > 0.4 ? 0 : 1), 1, 2);
  // counter
  rect(g, '#8a5a3b', sx - 2, counterTop, sw + 4, ch); rect(g, '#b98356', sx - 4, counterTop - 2, sw + 8, 3); rect(g, '#dcae7c', sx - 4, counterTop - 2, sw + 8, 1);
  for (let y = counterTop + 4; y < counterTop + ch; y += 5) rect(g, '#6e4630', sx - 2, y, sw + 4, 1);
  for (let x = sx + 10; x < sx + sw; x += 17) rect(g, '#6e4630', x, counterTop + 1, 1, ch - 1);
  rect(g, '#4a2c1c', sx - 2, counterTop + ch, sw + 4, 1);
  // little hanging sign
  const sgx = Math.round(scx - 10);
  rect(g, '#3e2418', sgx + 3, counterTop + 2, 1, 3); rect(g, '#3e2418', sgx + 16, counterTop + 2, 1, 3);
  rect(g, '#f3e2b3', sgx, counterTop + 5, 20, 8); rect(g, '#d9bf85', sgx, counterTop + 12, 20, 1); rect(g, '#b8522e', sgx + 3, counterTop + 7, 3, 3); rect(g, '#3f7a3a', sgx + 8, counterTop + 8, 9, 1); rect(g, '#3f7a3a', sgx + 8, counterTop + 10, 6, 1);
  // produce baskets on the counter
  const produce = season === 'spring' ? [['#d6453d', '#ff8a7a'], ['#f29bb0', '#fff'], ['#8ccf5c', '#c8f08a']]
    : season === 'summer' ? [['#d6453d', '#ff8a7a'], ['#f2c84a', '#fff0a0'], ['#4f9a3c', '#8ccf5c']]
      : season === 'fall' ? [['#e8873a', '#ffb070'], ['#c8323a', '#ff8a7a'], ['#8a5a9a', '#c8a0d8']] : [['#e8e0c8', '#fff'], ['#7aa84a', '#b8d88a'], ['#c8323a', '#ff8a7a']];
  const nb = Math.max(3, Math.round(sw / 34));
  for (let i = 0; i < nb; i++) {
    const bx = Math.round(sx + 10 + (i + 0.5) * ((sw - 20) / nb)), by = counterTop - 2;
    const pr = produce[i % produce.length];
    for (let k = 0; k < 6; k++) { const px = bx - 5 + (k % 3) * 4 + (k > 2 ? 2 : 0), py = by - 5 - (k > 2 ? 2 : 0); disc(g, mix(pr[0], PAL.ink, 0.2), px, py, 2); disc(g, pr[0], px - 0.4, py - 0.4, 1.5); rect(g, pr[1], px - 1, py - 1, 1, 1); }
    rect(g, '#b8864a', bx - 7, by - 4, 14, 4); rect(g, '#8a5a2a', bx - 7, by - 2, 14, 1); rect(g, '#d8a868', bx - 7, by - 4, 14, 1);
  }
  ditherEllipse(g, mix(cob, PAL.ink, 0.3), scx, counterTop + ch + 3, sw * 0.62, 5, 0.7, false);
  // crates and sacks on the ground
  const groundY = counterTop + ch + Math.round((H - counterTop - ch) * 0.25);
  const crate = (x, by, s, fill) => {
    rect(g, '#6e4630', x, by - s, s, s); rect(g, '#b98356', x + 1, by - s + 1, s - 2, s - 2);
    for (let y = by - s + 3; y < by - 1; y += 3) rect(g, '#8a5a3b', x + 1, y, s - 2, 1);
    rect(g, '#dcae7c', x + 1, by - s + 1, s - 2, 1);
    if (fill) for (let k = 0; k < s / 3; k++) { disc(g, fill[0], x + 2 + k * 3, by - s - 1, 1.6); rect(g, fill[1], x + 1 + k * 3, by - s - 2, 1, 1); }
  };
  crate(sx - 16, counterTop + ch, 12, produce[0]); crate(sx - 12, counterTop + ch - 12, 10, produce[1]);
  crate(sx + sw + 4, counterTop + ch, 12, produce[2]);
  const sack = (x, by) => { ellipse(g, '#a88a58', x, by - 5, 5, 5); ellipse(g, '#c8a878', x - 1, by - 6, 3.5, 4); rect(g, '#8a6a40', x - 1, by - 11, 3, 2); rect(g, '#6e4630', x - 2, by - 10, 5, 1); };
  sack(sx + sw + 22, counterTop + ch); sack(sx - 24, counterTop + ch + 2);
  if (season === 'fall') { pumpkin(g, sx + sw + 12, groundY + 4, 4); pumpkin(g, sx - 6, groundY + 6, 3); }
  if (season === 'summer' || season === 'spring') { const pot = (x, by) => { rect(g, '#b8522e', x - 3, by - 5, 7, 5); rect(g, '#d6743a', x - 3, by - 5, 7, 1); for (let k = -2; k <= 2; k++) flower(g, x + k, by - 8 - (k & 1), P.flowers[(k + 2) % P.flowers.length], false, '#3f7a3a'); }; pot(sx - 30, counterTop + ch + 6); pot(sx + sw + 34, counterTop + ch + 4); }
  if (season === 'winter') { bush(g, S, sx - 30, counterTop + ch + 6, 4, P.leaf, true); rect(g, '#5e3b26', sx + sw + 30, counterTop - 12, 2, ch + 12); rect(g, '#3a2418', sx + sw + 28, counterTop - 17, 6, 6); rect(g, '#ffd35c', sx + sw + 29, counterTop - 16, 4, 4); dyn.windows.push({ x: sx + sw + 29, y: counterTop - 16, w: 4, h: 4, layer: 3 }); }
  if (!portrait) {
    const bx = Math.round(W * 0.07), by = counterTop + ch + 4;
    ellipse(g, mix(cob, PAL.ink, 0.3), bx + 1, by, 9, 2);
    rect(g, '#6e4630', bx - 7, by - 14, 14, 14); rect(g, '#8a5a3b', bx - 6, by - 14, 12, 14); rect(g, '#b98356', bx - 6, by - 14, 3, 14);
    rect(g, '#5c5855', bx - 7, by - 12, 14, 1); rect(g, '#5c5855', bx - 7, by - 4, 14, 1);
    const fr = produce[0];
    for (let k = 0; k < 5; k++) { const ax = bx - 5 + k * 2.5, ay = by - 15 - (k & 1); disc(g, mix(fr[0], PAL.ink, 0.2), ax, ay, 1.8); disc(g, fr[0], ax - 0.4, ay - 0.4, 1.4); rect(g, fr[1], ax - 1, ay - 1, 1, 1); }
  }
  // bunting strings (flags animate)
  const flagCols = [PAL.red, PAL.gold, PAL.leaf, PAL.sky, PAL.pink, PAL.cream];
  const strings = portrait ? [[H * 0.04, 8], [H * 0.1, 10]] : [[H * 0.05, 10], [H * 0.12, 12]];
  for (let s = 0; s < strings.length; s++) {
    const [y0, sag] = strings[s];
    for (let x = -M; x < W + M; x++) {
      const u = (x + M) / (W + 2 * M), y = Math.round(y0 + sag * 4 * u * (1 - u) + (s ? 2 : 0) * u);
      rect(g, '#6e4a32', x, y, 1, 1);
      if ((x + M + s * 5) % 11 === 0) dyn.bunting.push(x - 2, y + 1, flagCols[(dyn.bunting.length / 3) % flagCols.length]);
    }
  }
  dyn.amb = [...seasonAmb(S, 0.6), [K.MOTE, 2 * W / 320]];
}

function paintGlade(S) {
  const { W, H, P, R, dyn, L, season, portrait } = S;
  const hz = Math.round(H * (portrait ? 0.5 : 0.56)); dyn.horizon = hz;
  paintSky(S, hz, { clouds: 2, cloudSpan: 0.35, moon: S.dusk || season === 'winter' ? [W * 0.5, hz * 0.3, 5] : null });
  dyn.rays = S.dusk ? 0 : 1; dyn.raySrc = [W * 0.45, -30];
  const haze = P.sky[P.sky.length - 1];
  const farCols = (season === 'fall' ? S.woods[0] : P.leaf).map(c => mix(c, haze, 0.55));
  S.trunkCols = [mix(P.trunk, haze, 0.55), mix(P.trunkDark, haze, 0.5)];
  for (let x = -M; x < W + M; x += 5 + R() * 5) {
    const h = Math.round((14 + (R() * 14 | 0)) * S.k), by = hz + 3;
    if (season === 'winter' || R() < 0.35) pine(L[1], S, Math.round(x), by, h + 6, farCols, season === 'winter');
    else roundTree(L[1], S, Math.round(x), by, h, farCols);
  }
  const midCols = (season === 'fall' ? S.woods[2] : P.leaf).map(c => mix(c, haze, 0.25));
  S.trunkCols = [mix(P.trunk, haze, 0.25), mix(P.trunkDark, haze, 0.2)];
  for (let x = -M; x < W + M; x += 6 + R() * 6) {
    if (Math.abs(x - W / 2) < W * 0.2) continue;
    const by = hz + 6 + (R() * 3 | 0), h = Math.round((20 + (R() * 12 | 0)) * S.k);
    if (season === 'winter') pine(L[2], S, Math.round(x), by, h + 4, midCols, true);
    else roundTree(L[2], S, Math.round(x), by, h, midCols);
  }
  S.trunkCols = null;
  const g = L[3];
  meadow(g, S, hz + 5, H);
  ditherEllipse(g, P.g[0], W / 2, hz + (H - hz) * 0.38, W * 0.34, (H - hz) * 0.2, 0.8);
  ditherEllipse(g, mix(P.g[0], '#fff4c0', 0.35), W / 2, hz + (H - hz) * 0.38, W * 0.2, (H - hz) * 0.1, 0.6);
  // framing trunks and an overhanging canopy
  const cols = season === 'fall' ? S.woods[1] : season === 'spring' ? P.leaf : P.leaf;
  const tw0 = Math.round(clamp(W * 0.06, 10, 18)), baseY = Math.round(hz + (H - hz) * (S.portrait ? 0.62 : 0.8));
  for (const [tx, tw] of [[W * 0.04, tw0], [W * 0.965, tw0 - 2]]) {
    const x = Math.round(tx), x0 = x - (tw >> 1);
    rect(g, P.trunk, x0, 0, tw, baseY);
    rect(g, P.trunkDark, x0 + tw - 3, 0, 3, baseY);
    rect(g, mix(P.trunk, '#ffffff', 0.2), x0, 0, 2, baseY);
    for (let y = 4; y < baseY; y += 4 + (R() * 5 | 0)) rect(g, P.trunkDark, x0 + 2 + (R() * (tw - 4) | 0), y, 1, 2 + (R() * 3 | 0));
    for (let i = 0; i < 5; i++) { const w = tw + 2 + i * 3; rect(g, i ? P.trunkDark : P.trunk, x - (w >> 1), baseY - 5 + i, w, 1); }
    rect(g, P.trunk, x - (tw >> 1) - 2, baseY - 6, tw + 4, 4);
    ellipse(g, S.gDark[3], x + 2, baseY + 1, tw, 2);
  }
  for (let x = -M - 4; x < W + M + 4; x += 9 + R() * 8) {
    const edge = Math.min(x, W - x) / W;
    const r = (10 + R() * 9 + (edge < 0.2 ? 9 : 0)) * (S.portrait ? 1.15 : 1);
    const cy = -3 + (edge < 0.15 ? R() * H * 0.12 + 6 : R() * 6) + (edge > 0.3 ? -5 : 0);
    if (season === 'winter') { canopy(g, S, x, cy, r, P.leaf); ellipse(g, '#f4f8ff', x - 2, cy - r * 0.4, r * 0.7, r * 0.3); continue; }
    canopy(g, S, x, cy, r, season === 'fall' ? S.woods[(R() * 4) | 0] : season === 'spring' && R() < 0.3 ? [P.accent[0], P.accent[1], P.accent[2], P.accent[3]] : cols);
  }
  // hanging vines
  if (season !== 'winter') for (let x = 10; x < W - 10; x += 12 + R() * 16) {
    const len = 6 + R() * 16;
    for (let y = 8; y < 8 + len; y++) rect(g, P.leaf[1], x + Math.round(Math.sin(y * 0.3) * 0.8), y, 1, 1);
    rect(g, P.leaf[2], x - 1, 8 + len, 2, 2);
  }
  // clearing details
  const deep = H - hz;
    const stump2 = (x, by, s) => { rect(g, P.trunk, x - s, by - s, 2 * s, s); rect(g, P.trunkDark, x + s - 2, by - s, 2, s); rect(g, P.trunk, x - s - 1, by - 2, 2 * s + 2, 2); ellipse(g, '#d8b080', x, by - s, s, 1.6); ellipse(g, '#b88a58', x, by - s, s * 0.5, 0.8); };
  stump2(Math.round(W * 0.3), Math.round(hz + deep * 0.46), Math.round(5 * S.k));
  const shroom = (x, by, big) => { const r = big ? 3 : 2; rect(g, '#f3e2b3', x - 1, by - r, 2, r); ellipse(g, '#c8323a', x, by - r - 1, r + 0.5, r * 0.6); rect(g, '#ffffff', x - 1, by - r - 2, 1, 1); if (big) rect(g, '#ffffff', x + 1, by - r - 1, 1, 1); };
  for (let i = 0; i < 7; i++) { const x = R() < 0.5 ? W * 0.06 + R() * W * 0.15 : W * 0.8 + R() * W * 0.14; shroom(Math.round(x), Math.round(hz + deep * (0.3 + R() * 0.5)), R() < 0.4); }
  const fern = (x, by) => { for (let k = -3; k <= 3; k++) { const len = 6 - Math.abs(k); for (let j = 0; j < len; j++) rect(g, j > len - 2 ? P.leaf[2] : P.leaf[1], x + k * (j / 2), by - j, 1, 1); } };
  if (season !== 'winter') for (let i = 0; i < 4; i++) fern(Math.round(i < 2 ? W * 0.12 + R() * 10 : W * 0.86 + R() * 10), Math.round(hz + deep * (0.55 + R() * 0.35)));
  rock(g, S, Math.round(W * 0.68), Math.round(hz + deep * 0.5), 4, season === 'winter');
  if (season !== 'winter') scatterFlowers(g, S, hz + 6, H, Math.round(W * deep / 140), 0.3);
  for (let i = 0; i < 50; i++) { const t = Math.pow(R(), 0.7); addTuft(S, R() * W, hz + 6 + t * (deep - 6), 2 + t * 2, 3 + t * 4); }
  for (let x = -4; x < W + 4; x += 3 + R() * 5) addTuft(S, x, H + 1, 5, 9);
  dyn.amb = [...seasonAmb(S, 0.6), [K.MOTE, 3 * W / 320], [K.FIREFLY, (S.dusk ? 2.5 : 0.6) * W / 320]];
}

// ---------- 2.0: select porch + boss arenas ----------
// A thick outlined root/branch along pt(t), t in [0,1]. cols: [outline, body, highlight?]
function rootStroke(g, S, pt, n, w0, w1, cols) {
  const Q = [];
  for (let i = 0; i <= n; i++) { const t = i / n, p = pt(t); Q.push(p[0], p[1], lerp(w0, w1, t)); }
  for (let i = 0; i < Q.length; i += 3) disc(g, cols[0], Q[i], Q[i + 1], Q[i + 2] + 1);
  for (let i = 0; i < Q.length; i += 3) disc(g, cols[1], Q[i], Q[i + 1], Q[i + 2]);
  if (cols[2]) for (let i = 0; i < Q.length; i += 3) if (Q[i + 2] >= 1.5) disc(g, cols[2], Q[i] - Q[i + 2] * 0.45, Q[i + 1] - Q[i + 2] * 0.2, Q[i + 2] * 0.35);
  for (let i = 0; i < Q.length; i += 9) if (Q[i + 2] > 2.5 && S.R() < 0.6) rect(g, cols[0], Q[i] + Q[i + 2] * 0.25, Q[i + 1], 1, 2);
}
function blossom(g, S, x, y, n, cols) {
  const R = S.R;
  for (let i = 0; i < n; i++) {
    const bx = x + (R() - 0.5) * 7, by = y + (R() - 0.5) * 5, c = cols[(R() * cols.length) | 0];
    disc(g, mix(c, '#5a2a3a', 0.35), bx + 0.5, by + 0.8, 1.5);
    disc(g, c, bx, by, 1.3);
    rect(g, '#fff8f0', bx - 1, by - 1, 1, 1);
  }
}
// Two roots rising from the ground and meeting in a pointed (gothic) arch.
function archPair(g, S, cx, by, hw, top, th, cols, bloomCols, bloomAmt) {
  const R = S.R, h = by - top, n = Math.max(24, Math.round(h * 1.4));
  for (const side of [-1, 1]) {
    const sw = 1 + (R() - 0.5) * 0.1;
    const pt = t => [cx + side * hw * sw * (1 - Math.pow(t, 1.7)), by - (h * Math.sin(t * 1.2)) / Math.sin(1.2)];
    rootStroke(g, S, pt, n, th * 1.6, th * 0.7, cols);
    if (bloomCols) for (let i = 0; i < n * bloomAmt * 0.2; i++) { const p = pt(0.2 + R() * 0.8); blossom(g, S, p[0], p[1], 3, bloomCols); }
  }
}
function crowSprite(g, x, y, faceRight) {
  const d = faceRight ? -1 : 1;
  g.fillStyle = '#12101e';
  g.fillRect(x - 2, y - 2, 4, 3); g.fillRect(x - 2 - d * 2 + (d < 0 ? -1 : 0), y - 3, 2, 2);
  g.fillRect(x + (d > 0 ? 2 : -4), y - 1, 2, 1); g.fillRect(x - 1, y + 1, 1, 1); g.fillRect(x + 1, y + 1, 1, 1);
  g.fillStyle = '#d8a040'; g.fillRect(d > 0 ? x - 5 : x + 3, y - 2, 1, 1);
}
function shock(g, x, by, h, cols) {
  for (let i = 0; i < h; i++) {
    const hw = Math.round(1 + i * 0.42);
    rect(g, cols[0], x - hw, by - h + i, hw * 2 + 1, 1);
    rect(g, cols[1], x - hw, by - h + i, hw, 1);
    if (i % 3 === 1) rect(g, cols[2], x - hw + 1, by - h + i, 1, 1);
  }
  rect(g, cols[3], x - 2, by - Math.round(h * 0.55), 5, 1);
}

function paintSelect(S) {
  const { W, H, P, R, dyn, L, LW, k, portrait } = S;
  const hy = Math.round(H * (portrait ? 0.46 : 0.5)); dyn.horizon = hy;
  const deckY = Math.round(H * (portrait ? 0.64 : 0.68));
  const r3 = ridge(R, hy - 2, Math.min(14, H * 0.05), 0.03);
  const sx = Math.round(W * 0.5), sr = portrait ? 10 : 13;
  paintSky(S, hy, { sun: [sx, Math.round(r3(sx)) + 3, sr], clouds: 4, cloudSpan: 0.4 });
  dyn.rays = 1.4; dyn.raySrc = [sx, Math.round(r3(sx))];
  const g1 = L[1];
  hill(g1, S, r3, P.far2, mix(P.far2, '#ffd8b0', 0.35));
  const r2 = ridge(R, hy + 6, Math.min(8, H * 0.03), 0.05);
  village(g1, S, W * 0.8, r2, 1);
  hill(g1, S, r2, P.far, mix(P.far, '#ffd8b0', 0.3));
  for (let i = 0; i < 5; i++) ditherEllipse(g1, '#fff0e8', R() * W, hy + 4 + R() * 8, 24 + R() * 40, 2.5 + R() * 2, 0.45);
  // the yard below the porch
  const g2 = L[2];
  const my = Math.round(lerp(hy + 8, deckY, 0.35)), rm = ridge(R, my, 3, 0.05);
  for (let x = -M; x < W + M; x += 6 + R() * 7) {
    if (Math.min(x, W - x) / W > 0.3) continue;
    seasonTree(g2, S, Math.round(x), Math.round(rm(x)) + 2, Math.round((12 + (R() * 10 | 0)) * k), R() < 0.35 ? 1 : 0);
  }
  hill(g2, S, rm, P.mid, mix(P.mid, '#ffe0c0', 0.2));
  const rowA = mix(P.mid, '#b89a6a', 0.35), rowB = mix(P.mid, P.leaf[2], 0.25);
  for (let y = Math.round(rm(W / 2)) + 4; y < deckY + 2; y++) {
    const t = (y - my) / Math.max(1, deckY - my);
    rect(g2, (y >> 1) & 1 ? rowA : rowB, W * (0.3 - t * 0.1), y, W * (0.4 + t * 0.2), 1);
  }
  // porch deck
  const g = L[3];
  const wood = ['#d8a470', '#c89060', '#b87e50', '#a46e44'], seam = '#6e4630';
  for (let y = deckY, row = 0; y < H; row++) {
    const t = (y - deckY) / Math.max(1, H - deckY), ph = 3 + Math.round(t * 3);
    rect(g, wood[(row % 3) + (t > 0.6 ? 1 : 0)], -M, y, LW, ph);
    rect(g, mix(wood[0], '#fff4e0', 0.3), -M, y, LW, 1);
    rect(g, seam, -M, y + ph, LW, 1);
    for (let x = -M + ((row * 37) % 29); x < W + M; x += 26 + (R() * 22 | 0)) rect(g, seam, x, y, 1, ph);
    y += ph + 1;
  }
  rect(g, '#8a5a3b', -M, deckY - 1, LW, 2);
  ditherEllipse(g, '#ffe8c0', W / 2, deckY + (H - deckY) * 0.3, W * 0.4, (H - deckY) * 0.4, 0.18);
  // the two standing spots: round braided rag rugs
  const spotY = Math.round(deckY + (H - deckY) * 0.42), rx = Math.round(clamp(W * 0.085, 13, 30)), ry = Math.max(4, Math.round(rx * 0.3));
  const rug = (x, cols) => {
    ellipse(g, mix(wood[2], PAL.ink, 0.3), x + 1, spotY + 1, rx, ry);
    for (let i = 0; i < 4; i++) ellipse(g, cols[i], x, spotY, rx - (i * rx) / 4.5, Math.max(1, ry - (i * ry) / 4.5));
  };
  rug(Math.round(W * 0.34), ['#9a5a48', '#d8a868', '#7a8a9a', '#e8d0a0']);
  rug(Math.round(W * 0.66), ['#6a7a58', '#d8b878', '#a86a58', '#f0dcb0']);
  dyn.spots = [[Math.round(W * 0.34), spotY], [Math.round(W * 0.66), spotY]];
  // roof underside + trim
  const roofH = Math.round(H * (portrait ? 0.055 : 0.07));
  rect(g, '#5e3b26', -M, 0, LW, roofH);
  for (let x = -M; x < W + M; x += 7) rect(g, '#4a2c1c', x, 0, 1, roofH - 3);
  rect(g, '#8a5a3b', -M, roofH - 3, LW, 3); rect(g, '#b98356', -M, roofH - 3, LW, 1);
  for (let x = -M; x < W + M; x += 6) { rect(g, '#f3e2b3', x, roofH, 5, 1); rect(g, '#f3e2b3', x + 1, roofH + 1, 3, 1); rect(g, '#d9bf85', x + 2, roofH + 2, 1, 1); }
  // railings between the outer and inner posts, open in the middle
  const railTop = deckY - Math.round(13 * k), rl = '#c8925e', rd = '#8a5a3b';
  const xs = [Math.round(W * 0.03), Math.round(W * 0.2), Math.round(W * 0.8), Math.round(W * 0.97)];
  const railSeg = (x0, x1) => {
    for (let x = x0 + 2; x < x1 - 1; x += 4) { rect(g, rl, x, railTop + 2, 2, deckY - railTop - 4); rect(g, rd, x + 1, railTop + 2, 1, deckY - railTop - 4); }
    rect(g, rd, x0, railTop + 1, x1 - x0, 2); rect(g, rl, x0, railTop, x1 - x0, 2); rect(g, '#e0b080', x0, railTop, x1 - x0, 1);
    rect(g, rd, x0, deckY - 3, x1 - x0, 2);
  };
  railSeg(xs[0], xs[1]); railSeg(xs[2], xs[3]);
  const post = (x, w) => {
    const x0 = x - (w >> 1);
    rect(g, '#a8744a', x0, roofH, w, deckY - roofH + 1); rect(g, '#c8925e', x0, roofH, 1, deckY - roofH + 1);
    rect(g, '#7a5236', x0 + w - 1, roofH, 1, deckY - roofH + 1);
    rect(g, '#6e4630', x0 - 1, deckY - 2, w + 2, 3); rect(g, '#6e4630', x0 - 1, roofH, w + 2, 2);
  };
  const pw = Math.max(4, Math.round(5 * k));
  post(xs[0], pw); post(xs[1], pw - 1); post(xs[2], pw - 1); post(xs[3], pw);
  // climbing rose up the left post
  for (let y = deckY - 2; y > roofH + 2; y -= 2) {
    const x = xs[0] + 2 + Math.round(Math.sin(y * 0.3) * 2);
    rect(g, P.leaf[1], x, y, 2, 1); rect(g, P.leaf[2], x + 1, y - 1, 1, 1);
    if (R() < 0.18) { disc(g, '#c8445c', x + 1, y, 1.5); rect(g, '#f29bb0', x, y - 1, 1, 1); }
  }
  // hanging lantern (lit) and a fern basket
  const lx = Math.round(W * 0.27), cl = Math.round(6 * k);
  rect(g, '#3e2a22', lx, roofH + 2, 1, cl);
  rect(g, '#3e2a22', lx - 2, roofH + 2 + cl, 5, 7); rect(g, '#f2a040', lx - 1, roofH + 3 + cl, 3, 5); rect(g, '#3e2a22', lx - 1, roofH + 1 + cl, 3, 1);
  dyn.windows.push({ x: lx - 1, y: roofH + 3 + cl, w: 3, h: 5, layer: 3, big: true });
  const fx = Math.round(W * 0.73);
  rect(g, '#6e4a32', fx - 3, roofH + 2, 1, cl); rect(g, '#6e4a32', fx + 3, roofH + 2, 1, cl);
  ellipse(g, '#8a5a3b', fx, roofH + 3 + cl, 5, 2.5); rect(g, '#b98356', fx - 4, roofH + 2 + cl, 9, 1);
  for (let i = -5; i <= 5; i++) { const len = 3 + Math.round(Math.abs(Math.sin(i * 1.3)) * 6 * k); for (let j = 0; j < len; j++) rect(g, j > len - 2 ? P.leaf[3] : P.leaf[1], fx + i + Math.round((j / len) * i * 0.5), roofH + 2 + cl + j, 1, 1); }
  // rocking chair in the left bay (painted sage so it reads against the railing)
  const cx = Math.round(lerp(xs[0], xs[1], 0.5)), cy = deckY + Math.round(9 * k);
  const cg = '#5e7e62', cgl = '#86a888', cgd = '#3e5842';
  ellipse(g, mix(wood[2], PAL.ink, 0.3), cx, cy + 1, 9, 1.5);
  for (let i = -8; i <= 8; i++) rect(g, cgd, cx + i, cy - Math.round((i * i) / 18), 1, 2);
  rect(g, cg, cx - 5, cy - 9, 2, 8); rect(g, cg, cx + 4, cy - 9, 2, 8);
  rect(g, cgd, cx - 7, cy - 11, 14, 3); rect(g, cgl, cx - 7, cy - 11, 14, 1);
  rect(g, '#e0667f', cx - 5, cy - 13, 10, 2); rect(g, '#f29bb0', cx - 5, cy - 13, 10, 1);
  rect(g, cg, cx - 8, cy - 28, 3, 18); rect(g, cgl, cx - 8, cy - 28, 1, 18);
  for (let y = cy - 25; y < cy - 13; y += 4) rect(g, cgl, cx - 5, y, 1, 3);
  rect(g, cgd, cx - 8, cy - 29, 5, 2);
  rect(g, cg, cx + 5, cy - 17, 2, 5); rect(g, cgd, cx - 5, cy - 18, 12, 2);
  // flower pots, watering can and a sleeping cat in the right bay
  const bx = Math.round(lerp(xs[2], xs[3], 0.28)), by = deckY + Math.round(3 * k);
  const pot = (x, s) => { rect(g, '#9a4a2a', x - s, by - s - 2, 2 * s + 1, s + 2); rect(g, '#d6743a', x - s, by - s - 2, 2 * s + 1, 1); for (let j = -s; j <= s; j += 2) flower(g, x + j, by - s - 5 - (j & 1), P.flowers[(R() * P.flowers.length) | 0], s > 2, P.leaf[1]); };
  pot(bx, 3); pot(bx + 8, 2);
  rect(g, '#7a9aaa', bx + 14, by - 6, 6, 6); rect(g, '#a8c4d0', bx + 14, by - 6, 6, 1); rect(g, '#7a9aaa', bx + 20, by - 5, 3, 1); rect(g, '#7a9aaa', bx + 16, by - 8, 2, 2);
  const kx = Math.round(lerp(xs[2], xs[3], 0.62)), ky = Math.round(spotY + (H - spotY) * 0.35);
  ellipse(g, mix(wood[2], PAL.ink, 0.3), kx + 1, ky + 1, 7, 2);
  ellipse(g, '#d8844a', kx, ky - 2, 6, 3); ellipse(g, '#f0a868', kx - 1, ky - 3, 4, 1.5);
  for (let i = -3; i <= 3; i += 2) rect(g, '#b8642e', kx + i, ky - 4, 1, 2);
  disc(g, '#d8844a', kx - 5, ky - 3, 2.5); rect(g, '#d8844a', kx - 7, ky - 6, 1, 2); rect(g, '#d8844a', kx - 4, ky - 6, 1, 2);
  rect(g, '#5a3020', kx - 6, ky - 3, 2, 1); rect(g, '#f0a868', kx + 5, ky - 1, 3, 1);
  const f = W / 320;
  dyn.amb = [[K.MOTE, 3 * f], [K.PETAL, 0.8 * f], [K.FIREFLY, 0.3 * f]];
}

function paintRootstag(S) {
  const { W, H, P, R, dyn, L } = S, k = S.k;
  const gy = Math.round(H * 0.42); dyn.horizon = gy;
  paintSky(S, gy, { clouds: 2, cloudSpan: 0.3 });
  dyn.rays = 2; dyn.raySrc = [W * 0.5, -H * 0.2];
  const haze = P.sky[3], hz = (c, a) => mix(c, haze, a);
  const bark = ['#3a2a26', '#6a4a3a', '#94705a'];
  const BL = ['#f29bb0', '#f8c8d4', '#fff2f6', '#e0667f', '#d8b8f0'];
  const g1 = L[1];
  hill(g1, S, ridge(R, gy - 2, 6, 0.03), hz(P.far, 0.5), null);
  archPair(g1, S, W / 2, gy + 2, W * 0.2, gy * 0.26, 1.3 * k, bark.map(c => hz(c, 0.62)), BL.map(c => hz(c, 0.55)), 0.8);
  archPair(g1, S, W / 2, gy + 2, W * 0.33, gy * 0.03, 1.8 * k, bark.map(c => hz(c, 0.5)), BL.map(c => hz(c, 0.45)), 1);
  const g2 = L[2];
  archPair(g2, S, W / 2, gy + 8, W * 0.46, -gy * 0.4, 3 * k, bark.map(c => hz(c, 0.22)), BL.map(c => hz(c, 0.12)), 1.6);
  hill(g2, S, ridge(R, gy + 2, 3, 0.05), mix(P.mid, haze, 0.2), mix(P.mid, '#ffffff', 0.2));
  const g = L[3], deep = H - gy;
  meadow(g, S, gy + 3, H);
  ditherEllipse(g, mix(P.g[0], '#fff6c8', 0.45), W / 2, gy + deep * 0.36, W * 0.32, deep * 0.2, 0.6);
  for (let i = 0; i < (W * deep) / 45; i++) {
    const x = R() < 0.75 ? (R() < 0.5 ? R() * W * 0.3 : W - R() * W * 0.3) : R() * W;
    rect(g, BL[(R() * 4) | 0], x, gy + 4 + Math.pow(R(), 0.7) * (deep - 4), 1, 1);
  }
  // hanging wisteria at the edges
  for (let x = 4; x < W - 4; x += 5 + R() * 6) {
    if (Math.min(x, W - x) / W > 0.17) continue;
    const len = Math.round((8 + R() * 18) * k), c = R() < 0.5 ? '#c8a8f0' : '#f8c8d4';
    rect(g, hz(bark[1], 0.1), x, 0, 1, Math.round(len * 0.4));
    for (let j = Math.round(len * 0.3); j < len; j++) { const w = Math.max(1, Math.round((1 - j / len) * 3)); rect(g, (j & 1) ? c : mix(c, '#ffffff', 0.35), x - (w >> 1), j, w, 1); }
  }
  // the great framing roots, flaring along the ground
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -W * 0.03 : W * 1.03, xb = side < 0 ? W * 0.075 : W * 0.925, yb = gy + deep * 0.6;
    for (let j = 0; j < 4; j++) {
      const dir = j < 2 ? -side : side, reach = W * (0.03 + (j & 1) * 0.025) + R() * 4;
      const ex = xb + dir * reach, ey = yb + 3 + (j & 1) * 4 * k + R() * 3;
      rootStroke(g, S, t => [lerp(xb, ex, t), lerp(yb - 3, ey, t) - Math.sin(t * Math.PI) * 3 * k], 24, 4 * k, 1.2, bark);
    }
    const pt = t => [lerp(x0, xb, Math.pow(t, 0.7)) + Math.sin(t * 5 + side) * 2 * k, lerp(-8, yb, t)];
    rootStroke(g, S, pt, Math.round(yb * 1.2), 9 * k, 6 * k, bark);
    for (let i = 0; i < 10; i++) { const p = pt(R() * 0.75); blossom(g, S, p[0] - side * 4 * k, p[1], 4, BL); }
  }
  const shroom = (x, by, big) => { const r = big ? 3 : 2; rect(g, '#f3e2b3', x - 1, by - r, 2, r); ellipse(g, '#e0667f', x, by - r - 1, r + 0.5, r * 0.6); rect(g, '#ffffff', x - 1, by - r - 2, 1, 1); };
  for (let i = 0; i < 6; i++) { const x = R() < 0.5 ? W * 0.1 + R() * W * 0.12 : W * 0.78 + R() * W * 0.12; shroom(Math.round(x), Math.round(gy + deep * (0.55 + R() * 0.4)), R() < 0.4); }
  for (let i = 0; i < 40; i++) { const t = Math.pow(R(), 0.7); let x = R() * W; if (R() < 0.7) x = R() < 0.5 ? R() * W * 0.25 : W - R() * W * 0.25; addTuft(S, x, gy + 5 + t * (deep - 5), 2 + t * 2, 3 + t * 4); }
  for (let x = -4; x < W + 4; x += 3 + R() * 5) addTuft(S, x, H + 1, 5, 9);
  const f = W / 320;
  dyn.amb = [[K.PETAL, 3.5 * f], [K.MOTE, 3 * f], [K.FIREFLY, 0.5 * f]];
}

function paintScorchmoth(S) {
  const { W, H, P, R, dyn, L } = S, k = S.k;
  const gy = Math.round(H * 0.42); dyn.horizon = gy;
  const sr = Math.round(clamp(Math.min(W * 0.12, gy * 0.34), 14, 44));
  const sx = Math.round(W * 0.36), sy = Math.round(Math.max(sr + 3, gy * 0.42));
  paintSky(S, gy, { clouds: 2, cloudSpan: 0.22 });
  const g0 = L[0];
  for (let i = 5; i >= 1; i--) ditherEllipse(g0, i > 3 ? '#fffbe8' : '#fff6d0', sx, sy, sr + i * sr * 0.42, sr + i * sr * 0.42, 0.14 + (5 - i) * 0.14, false);
  disc(g0, '#ffe890', sx, sy, sr + 2); disc(g0, '#fff6c8', sx, sy, sr);
  disc(g0, '#fffdf0', sx - sr * 0.12, sy - sr * 0.12, sr * 0.78); disc(g0, '#ffffff', sx - sr * 0.3, sy - sr * 0.3, sr * 0.35);
  dyn.glow = { x: sx, y: sy, c: bakeGlow(Math.round(sr * 2.2), '#fff4d0', '#ffd070', 6), slow: true, a: 0.55 };
  dyn.rays = 1.6; dyn.raySrc = [sx, sy]; dyn.shimmer = 0.5;
  const g1 = L[1];
  const rfa = ridge(R, gy - 3, Math.min(8, H * 0.03), 0.025);
  hill(g1, S, rfa, '#d4d8d0', '#e8ece4');
  for (let x = -M; x < W + M; x++) if (bay(x + M, 1) < 0.5) rect(g1, '#f4f0e0', x, Math.round(rfa(x)) - 1, 1, 1);
  hill(g1, S, ridge(R, gy + 4, 6, 0.04), '#c8c4a4', '#dcd8bc');
  const g2 = L[2];
  hill(g2, S, x => gy + 6 + 6 * Math.pow(Math.abs(x - W / 2) / (W / 2), 1.5) + Math.sin(x * 0.07) * 1.5, mix(P.g[2], '#d8d4c0', 0.35), mix(P.g[1], '#ffffff', 0.3));
  // the domed hilltop
  const g = L[3], deep = H - gy;
  const crest = x => gy + 2 + 16 * k * Math.pow(Math.abs(x - W / 2) / (W / 2), 2);
  meadow(g, S, gy + 2, H);
  for (let x = -M; x < W + M; x++) {
    const c = Math.round(crest(x));
    if (c > gy + 2) g.clearRect(x, gy + 2, 1, c - gy - 2);
    rect(g, mix(P.g[0], '#ffffff', 0.4), x, c, 1, 1);
  }
  const crack = mix(P.g[2], '#8a6a3a', 0.35);
  for (let i = 0; i < 5; i++) {
    const cx = W * (0.2 + R() * 0.6), cy = gy + deep * (0.3 + R() * 0.55);
    ditherEllipse(g, mix(P.g[1], '#f0e4c0', 0.5), cx, cy, 14 + R() * 20, 3 + R() * 4, 0.5);
    for (let j = 0; j < 5; j++) {
      let x = cx + (R() - 0.5) * 22, y = cy + (R() - 0.5) * 5;
      for (let s = 0; s < 8; s++) { rect(g, crack, x, y, 1, 1); x += R() < 0.5 ? 1 : -1; y += R() < 0.3 ? (R() < 0.5 ? 1 : -1) : 0; }
    }
  }
  const props = [], add = (y, fn) => props.push([y, fn]);
  const stone = (x, by, w, h) => {
    x = Math.round(x); by = Math.round(by);
    ellipse(g, mix(P.g[3], '#6a5a38', 0.35), x + 2, by, w * 0.9, 1.5);
    rect(g, '#a8a296', x - (w >> 1), by - h, w, h); rect(g, '#d4d0c4', x - (w >> 1), by - h, 1, h);
    rect(g, '#847e72', x + (w >> 1) - 1, by - h, 1, h); rect(g, '#ece8dc', x - (w >> 1), by - h, w - 1, 1);
    for (let y = by - h + 3; y < by - 1; y += 5) rect(g, '#948e82', x - (w >> 1) + 1, y, 1, 2);
  };
  add(crest(W * 0.06) + 22, () => stone(W * 0.06, crest(W * 0.06) + 22 * k, Math.round(10 * k), Math.round(26 * k)));
  add(crest(W * 0.15) + 8, () => stone(W * 0.15, crest(W * 0.15) + 8 * k, Math.round(8 * k), Math.round(14 * k)));
  add(crest(W * 0.93) + 24, () => stone(W * 0.93, crest(W * 0.93) + 24 * k, Math.round(11 * k), Math.round(30 * k)));
  add(crest(W * 0.84), () => {
    const x = Math.round(W * 0.84), by = Math.round(crest(W * 0.84)) + 5;
    S.trunkCols = ['#c8b898', '#9a8a6a']; const td = P.trunkDark; P.trunkDark = '#9a8a6a';
    bareTree(g, S, x, by, Math.round(34 * k));
    S.trunkCols = null; P.trunkDark = td;
  });
  const thistle = (x, by) => { rect(g, '#7a8a58', x, by - 6, 1, 6); rect(g, '#6a8a50', x - 1, by - 3, 1, 1); rect(g, '#6a8a50', x + 1, by - 4, 1, 1); disc(g, '#8a5aa8', x, by - 7, 1.4); rect(g, '#c8a0e0', x - 1, by - 8, 1, 1); };
  for (let i = 0; i < 9; i++) { const x = R() < 0.5 ? R() * W * 0.2 : W - R() * W * 0.2, y = gy + deep * (0.2 + R() * 0.7); add(y, () => thistle(Math.round(x), Math.round(y))); }
  for (let i = 0; i < 12; i++) { const x = R() * W, y = gy + deep * (0.15 + R() * 0.8); add(y, () => rect(g, '#f4f0e4', x, y, 2, 1)); }
  props.sort((a, b) => a[0] - b[0]).forEach(p => p[1]());
  for (let i = 0; i < 45; i++) { const t = Math.pow(R(), 0.7); let x = R() * W; if (R() < 0.7) x = R() < 0.5 ? R() * W * 0.25 : W - R() * W * 0.25; addTuft(S, x, Math.max(crest(x) + 3, gy + 5 + t * (deep - 5)), 2 + t * 2, 3 + t * 5); }
  for (let x = -4; x < W + 4; x += 3 + R() * 5) addTuft(S, x, H + 1, 5, 10);
  const f = W / 320;
  dyn.amb = [[K.DUST, 2.5 * f], [K.MOTE, 2 * f], [K.GLINT, 1 * f]];
}

function paintHollowjack(S) {
  const { W, H, P, R, dyn, L } = S, k = S.k;
  const gy = Math.round(H * 0.42); dyn.horizon = gy;
  const mr = Math.round(clamp(W * 0.045, 8, 16)), mx = Math.round(W * 0.74), my = Math.round(Math.max(mr + 5, gy * 0.34));
  paintSky(S, gy, { clouds: 3, cloudSpan: 0.4 });
  if (dyn.stars) { // no stars in front of the moon
    const st = dyn.stars;
    for (let i = 0; i < st.length; i += 4) if (Math.hypot(st[i] - mx, st[i + 1] - my) < mr * 2.2) st[i + 1] = -10;
  }
  const g0 = L[0];
  ditherEllipse(g0, '#34366e', mx, my, mr * 3.4, mr * 3.4, 0.5);
  ditherEllipse(g0, '#4c4c88', mx, my, mr * 2.1, mr * 2.1, 0.55, false);
  disc(g0, '#f0e6c4', mx, my, mr + 1); disc(g0, '#fff8e4', mx - 1, my - 1, mr - 1);
  disc(g0, '#e4dab8', mx + mr * 0.3, my + mr * 0.15, mr * 0.28); disc(g0, '#e4dab8', mx - mr * 0.35, my + mr * 0.4, mr * 0.18); disc(g0, '#e4dab8', mx - mr * 0.1, my - mr * 0.45, mr * 0.14);
  const g1 = L[1];
  const r2 = ridge(R, gy - 4, Math.min(14, H * 0.05), 0.03);
  hill(g1, S, r2, '#2c2a56', '#433f74');
  const wx = Math.round(W * 0.2), wy = Math.round(r2(wx)) + 2, wh = Math.round(16 * k);
  for (let i = 0; i < wh; i++) { const hw = Math.max(1, Math.round(3 - i * 0.14)); rect(g1, '#1a1838', wx - hw, wy - i, hw * 2 + 1, 1); }
  for (let b = 0; b < 4; b++) { const a = 0.5 + b * Math.PI / 2; for (let j = 1; j < Math.round(10 * k); j++) rect(g1, '#1a1838', wx + Math.round(Math.cos(a) * j), wy - wh + Math.round(Math.sin(a) * j), 1, 1); }
  win(g1, S, wx, wy - Math.round(wh * 0.45), 1, 1, 1, true);
  for (let x = Math.round(W * 0.34); x < W * 0.62; x += 6 + R() * 6) shock(g1, Math.round(x), Math.round(r2(x)) + 2, 4, ['#242250', '#2c2a58', '#1c1a44', '#1c1a44']);
  hill(g1, S, ridge(R, gy + 1, 3, 0.05), '#3a3660', '#4c4876');
  const g2 = L[2], corn = ['#4a3e3a', '#6a5848', '#8a7458', '#a8906a'];
  for (let x = -M; x < W + M; x += 2) {
    const e = Math.min(x, W - x) / W; if (e > 0.15) continue;
    const by = gy + 5 + (R() * 3 | 0), h = Math.round((16 + R() * 14) * k * (1 - e * 2.5));
    rect(g2, corn[1], x, by - h, 1, h); rect(g2, corn[0], x + 1, by - h + 2, 1, h - 2);
    for (let y = by - h + 3; y < by - 2; y += 4 + (R() * 3 | 0)) { const d = R() < 0.5 ? -1 : 1; rect(g2, corn[2], x + d, y, 1, 1); rect(g2, corn[2], x + d * 2, y + 1, 1, 1); }
    rect(g2, corn[3], x, by - h - 1, 1, 2);
  }
  const g = L[3], deep = H - gy;
  meadow(g, S, gy + 2, H);
  const vx = W / 2, vy = gy - 20, fur = mix(P.g[3], '#2a2440', 0.3), furL = mix(P.g[0], '#ffffff', 0.12);
  for (let i = -16; i <= 16; i++) {
    const bx = W / 2 + i * W * 0.085;
    for (let y = gy + 3; y < H; y++) { const x = vx + (bx - vx) * ((y - vy) / (H - vy)); rect(g, fur, x, y, 1, 1); if ((y & 3) === 0) rect(g, furL, x + 1, y, 1, 1); }
  }
  ditherEllipse(g, mix(P.g[0], '#e8e8ff', 0.3), W / 2, gy + deep * 0.4, W * 0.3, deep * 0.2, 0.4);
  // rows of lantern posts receding toward the horizon, strung with rope
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      pts.push([Math.round(lerp(side < 0 ? W * 0.04 : W * 0.96, side < 0 ? W * 0.34 : W * 0.66, Math.pow(t, 0.8))), Math.round(lerp(H * 0.97, gy + 4, Math.pow(t, 0.7))), Math.round(lerp(34 * k, 7, Math.pow(t, 0.6)))]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, h0] = pts[i], [x1, y1, h1] = pts[i + 1], n = Math.max(4, Math.abs(x1 - x0));
      for (let s = 0; s <= n; s++) { const u = s / n; rect(g, '#2e2438', lerp(x0, x1, u), lerp(y0 - h0, y1 - h1, u) + Math.sin(u * Math.PI) * 4 * (1 - i * 0.2), 1, 1); }
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const [x, by, h] = pts[i], pw = Math.max(1, Math.round(h / 14)), ls = Math.max(1, Math.round(h / 10));
      rect(g, '#3a2e30', x, by - h, pw, h); if (pw > 1) rect(g, '#5a4640', x, by - h, 1, h);
      rect(g, '#3a2e30', x - side * 2 * ls, by - h, 2 * ls + 1, 1);
      const lx = x - side * 2 * ls, ly = by - h + 1;
      rect(g, '#1e1826', lx - ls, ly, 2 * ls + 1, 2 * ls + 2); rect(g, '#f2a040', lx - ls + 1, ly + 1, Math.max(1, 2 * ls - 1), 2 * ls);
      dyn.windows.push({ x: lx - ls + 1, y: ly + 1, w: Math.max(1, 2 * ls - 1), h: 2 * ls, layer: 3, big: ls >= 2, tiny: ls < 2 });
    }
  }
  const props = [], add = (y, fn) => props.push([y, fn]);
  const jack = (gg, x, by, r) => {
    pumpkin(gg, x, by, r);
    if (r < 3) return;
    const ey = by - r - 1;
    dyn.windows.push({ x: x - 1, y: ey, w: 1, h: 1, layer: 3, tiny: true }, { x: x + 2, y: ey, w: 1, h: 1, layer: 3, tiny: true }, { x: x - 1, y: ey + 2, w: 4, h: 1, layer: 3, tiny: true });
  };
  for (let i = 0; i < 7; i++) { const x = R() < 0.5 ? W * (0.08 + R() * 0.16) : W * (0.76 + R() * 0.16), y = gy + deep * (0.12 + R() * 0.7); add(y, () => (i < 3 ? jack : pumpkin)(g, Math.round(x), Math.round(y), 2 + (R() * 3 | 0) + (i < 3 ? 1 : 0))); }
  for (let i = 0; i < 3; i++) { const x = R() < 0.5 ? W * (0.1 + R() * 0.1) : W * (0.8 + R() * 0.1), y = gy + deep * (0.05 + R() * 0.2); add(y, () => shock(g, Math.round(x), Math.round(y), Math.round(12 * k), ['#8a7458', '#a8906a', '#6a5848', '#5a3a2a'])); }
  const fy0 = gy + deep * 0.22;
  add(fy0, () => {
    fence(g, S, -M, Math.round(fy0), Math.round(W * 0.17), Math.round(fy0 - deep * 0.02), false);
    crowSprite(g, Math.round(W * 0.05), Math.round(fy0) - 7, true); crowSprite(g, Math.round(W * 0.13), Math.round(fy0 - deep * 0.015) - 7, false);
  });
  const scx = Math.round(W * 0.9), scy = Math.round(gy + deep * 0.34);
  add(scy, () => {
    const hgt = Math.round(28 * k), arm = Math.round(9 * k), top = scy - hgt;
    rect(g, '#5e4a3a', scx, top, 2, hgt); rect(g, '#5e4a3a', scx - arm, top + 8, arm * 2 + 2, 2);
    rect(g, '#6a4a5a', scx - 3, top + 7, 8, 11); rect(g, '#8a6a3a', scx - 2, top + 11, 3, 3); rect(g, '#4a3a4a', scx + 3, top + 7, 2, 11);
    for (const s of [-1, 1]) { rect(g, '#e0c070', scx + s * arm + (s > 0 ? 1 : 0), top + 10, 1, 3); rect(g, '#6a4a5a', scx + (s < 0 ? -arm : 5), top + 8, arm - 3, 3); }
    disc(g, '#c8b080', scx + 1, top + 4, 3.2); rect(g, '#2a1d1a', scx - 1, top + 3, 1, 1); rect(g, '#2a1d1a', scx + 2, top + 3, 1, 1); rect(g, '#2a1d1a', scx - 1, top + 6, 4, 1);
    rect(g, '#3a2e2a', scx - 5, top + 1, 12, 1); rect(g, '#3a2e2a', scx - 2, top - 4, 6, 5); rect(g, '#8a3a2a', scx - 2, top - 1, 6, 1);
    crowSprite(g, scx - arm + 2, top + 7, true);
  });
  props.sort((a, b) => a[0] - b[0]).forEach(p => p[1]());
  for (let i = 0; i < 45; i++) { const t = Math.pow(R(), 0.7); let x = R() * W; if (R() < 0.7) x = R() < 0.5 ? R() * W * 0.25 : W - R() * W * 0.25; addTuft(S, x, gy + 5 + t * (deep - 5), 2 + t * 2, 3 + t * 4); }
  for (let x = -4; x < W + 4; x += 3 + R() * 5) addTuft(S, x, H + 1, 5, 9);
  dyn.tint = [[2, '#1a1a48', 0.42], [3, '#1a1a48', 0.34]];
  const f = W / 320;
  dyn.amb = [[K.LEAF, 1.1 * f], [K.FIREFLY, 1.1 * f], [K.CROW, 0.06 * f]];
}

function paintNightheron(S) {
  const { W, H, P, R, dyn, L, LW } = S, k = S.k;
  const gy = Math.round(H * 0.42); dyn.horizon = gy;
  paintSky(S, gy, { clouds: 0 });
  dyn.aurora = { y: Math.round(gy * 0.05), span: Math.round(gy * 0.5), amp: Math.max(3, gy * 0.07) };
  // snowy mountains lit from the upper left
  const g1 = L[1], hs = Math.min(1.6, H / 180), peaks = [];
  for (let i = 0; i < 7; i++) peaks.push([R() * (W + 2 * M) - M, (10 + R() * 22) * hs, 20 + R() * 30]);
  const mtn = x => { let h = 2 + Math.sin(x * 0.05) * 1.5; for (const [px, ph, pw] of peaks) h = Math.max(h, ph * (1 - Math.abs(x - px) / pw)); return gy + 1 - h; };
  for (let x = -M; x < W + M; x++) {
    const y = Math.round(mtn(x)), lit = mtn(x + 1) < mtn(x - 1), h = gy + 1 - y;
    rect(g1, lit ? '#3a4880' : '#28346a', x, y, 1, gy + 4 - y);
    const snow = Math.max(0, Math.round((h - 7) * 0.6));
    for (let j = 0; j < snow; j++) if (j < snow - 2 || bay(x + M, y + j) < 0.5) rect(g1, j === 0 ? (lit ? '#b8f0dc' : '#8898c8') : lit ? '#a8bce4' : '#6878b0', x, y + j, 1, 1);
  }
  const g2 = L[2], tc = ['#0e1a30', '#16243e', '#243450'];
  rect(g2, '#141e38', -M, gy + 1, LW, 4);
  for (let x = -M; x < W + M; x += 2 + R() * 3) {
    const e = Math.min(x, W - x) / W, h = Math.round((5 + R() * 5 + (e < 0.25 ? (0.25 - e) * 60 : 0)) * k);
    pine(g2, S, Math.round(x), gy + 3, h, tc, true);
  }
  // the frozen lake
  const g = L[3], deep = H - gy;
  vgrad(g, 0, gy + 3, LW, deep - 3, ['#1c3058', '#26406c', '#30507e', '#3a5c8c'], 0.5);
  rect(g, '#5a7aa8', -M, gy + 3, LW, 1);
  for (let x = -M; x < W + M; x++) {
    const v = 0.5 + 0.5 * Math.sin(x * 0.03 + 1) * Math.sin(x * 0.011 + 2), len = Math.round(deep * 0.4 * v);
    for (let y = gy + 4; y < gy + 4 + len; y++) if (bay(x + M, y) < v * 0.55 * (1 - (y - gy - 4) / (len + 1))) rect(g, (y & 2) ? '#3a8a88' : '#4a7aa0', x, y, 1, 1);
  }
  for (let i = 0; i < 6; i++) ditherEllipse(g, '#4a6c9c', R() * W, gy + deep * (0.15 + R() * 0.7), 20 + R() * 40, 1.5 + R() * 2, 0.5, false);
  for (let i = 0; i < 9; i++) {
    let x = R() * W, y = gy + 5 + R() * deep * 0.75; const dx = R() < 0.5 ? 1 : -1, n = 14 + R() * 20;
    for (let s = 0; s < n; s++) { rect(g, '#8ab4dc', x, y, 1, 1); x += dx * (R() < 0.8 ? 1 : 0); y += R() < 0.3 ? 1 : 0; }
  }
  for (let i = 0; i < 5; i++) { const x = R() < 0.5 ? R() * W * 0.3 : W - R() * W * 0.3; ditherEllipse(g, '#c8d8ee', x, gy + deep * (0.2 + R() * 0.45), 10 + R() * 16, 2 + R() * 2, 0.7); }
  for (let y = gy + 5; y < H; y += 3) for (let x = 0; x < W; x += 2) if (R() < 0.1) dyn.water.push(x, y, 3);
  dyn.waterHi = '#d8f4ff'; dyn.frozen = true;
  // snowbank shore, deeper in the corners
  const bank = x => H - (5 + 22 * Math.pow(Math.abs(x - W / 2) / (W / 2), 2.2)) * k + Math.sin(x * 0.2) * 1.2;
  for (let x = -M; x < W + M; x++) {
    const y = Math.round(bank(x));
    rect(g, '#c8d6ec', x, y, 1, H - y); rect(g, '#e8f0fa', x, y, 1, 2); rect(g, '#f8fbff', x, y, 1, 1);
    if (bay(x + M, y) < 0.3) rect(g, '#a8b8d8', x, y + 3, 1, 1);
  }
  const props = [], add = (y, fn) => props.push([y, fn]);
  const reed = (x, by) => {
    const h = Math.round((8 + R() * 10) * k);
    rect(g, '#5a5a50', x, by - h, 1, h); rect(g, '#4a3226', x, by - h - 3, 1, 3); rect(g, '#f4f8ff', x, by - h - 4, 1, 1);
    rect(g, '#6a6a58', x - 1, by - Math.round(h * 0.5), 1, 2); rect(g, '#6a6a58', x - 2, by - Math.round(h * 0.5) - 2, 1, 2);
  };
  for (let i = 0; i < 16; i++) { const x = R() < 0.5 ? R() * W * 0.15 : W - R() * W * 0.15, by = bank(x) + 3; add(by, () => reed(Math.round(x), Math.round(by))); }
  add(bank(W * 0.03) + 6, () => pine(g, S, Math.round(W * 0.03), Math.round(bank(W * 0.03)) + 6, Math.round(52 * k), P.leaf, true));
  add(bank(W * 0.12) + 4, () => pine(g, S, Math.round(W * 0.12), Math.round(bank(W * 0.12)) + 4, Math.round(30 * k), P.leaf, true));
  add(bank(W * 0.97) + 6, () => pine(g, S, Math.round(W * 0.97), Math.round(bank(W * 0.97)) + 6, Math.round(46 * k), P.leaf, true));
  const dy = Math.round(gy + deep * 0.42);
  add(dy, () => {
    const x0 = Math.round(W * 0.8);
    for (let x = x0; x < W + M; x += 4) { rect(g, '#2a2230', x + 1, dy + 3, 1, 5); }
    for (let r = 0; r < 3; r++) { rect(g, r & 1 ? '#5a4a48' : '#6a5654', x0 + r * 2, dy + r * 2 - 2, W + M - x0, 2); rect(g, '#f4f8ff', x0 + r * 2, dy + r * 2 - 2, W + M - x0, 1); }
    rect(g, '#3a2e30', x0 + 2, dy - 16, 2, 14); rect(g, '#3a2e30', x0 + 2, dy - 16, 5, 1);
    rect(g, '#1e1826', x0 + 5, dy - 15, 5, 6); rect(g, '#f2a040', x0 + 6, dy - 14, 3, 4);
    dyn.windows.push({ x: x0 + 6, y: dy - 14, w: 3, h: 4, layer: 3, big: true });
  });
  for (let i = 0; i < 3; i++) { const x = W * (0.06 + i * 0.07), y = gy + deep * (0.45 + R() * 0.2); add(y, () => rock(g, S, Math.round(x), Math.round(y), 2.5 + R() * 2, true)); }
  props.sort((a, b) => a[0] - b[0]).forEach(p => p[1]());
  dyn.tint = [[2, '#0a1030', 0.3]];
  const f = W / 320;
  dyn.amb = [[K.SNOW, 1.3 * f], [K.GLINT, 1.2 * f]];
}

// Boss arenas: palette tweaks run before the scene's derived colours are computed.
const ARENAS = {
  rootstag: {
    season: 'spring', night: false, paint: paintRootstag,
    pal(P) { P.sky = ['#9ccad6', '#c0e0cc', '#e8f0c8', '#fff6dc']; P.cloud = '#fffaf0'; P.cloudShade = '#dce8d8'; P.g = ['#a8d670', '#8cc85c', '#72b04c', '#5a963e']; },
  },
  scorchmoth: {
    season: 'summer', night: false, paint: paintScorchmoth,
    pal(P) {
      P.sky = ['#8cc0e4', '#b8d8ea', '#e4eeea', '#fbf4dc']; P.cloud = '#ffffff'; P.cloudShade = '#e8ecf0';
      P.g = ['#ecd690', '#dcc274', '#c8aa5c', '#ae9048']; P.blade = ['#9a7a3a', '#b89448', '#d8b860', '#f0d888'];
    },
  },
  hollowjack: {
    season: 'fall', night: true, paint: paintHollowjack,
    pal(P) {
      P.sky = ['#0e1234', '#1c2250', '#302e66', '#4e3c6c']; P.cloud = '#44447a'; P.cloudShade = '#2c2c5a';
      P.g = ['#8a7a5a', '#766848', '#62563c', '#4e4432']; P.blade = ['#4a4030', '#6a5a40', '#8a7650', '#a89060'];
    },
  },
  nightheron: {
    season: 'winter', night: true, paint: paintNightheron,
    pal(P) {
      P.sky = ['#060a24', '#0e1640', '#1a2856', '#2c406e'];
      P.leaf = ['#0e2a2a', '#18383a', '#2a5050', '#3e6a68']; P.blade = ['#4a5a68', '#6a7a88', '#8a9aa8', '#b8c4d0'];
    },
  },
};

// ---------- particles ----------
const K = {
  PETAL: 1, POLLEN: 2, FIREFLY: 3, LEAF: 4, SNOW: 5, SMOKE: 6, EMBER: 7, CONFETTI: 8, RAIN: 9, SPLASH: 10,
  STREAK: 11, ICE: 12, MOTE: 13, DUST: 14, GLINT: 15, CROW: 16,
  SPARK: 20, STAR: 21, BLEAF: 22, BPETAL: 23, HEART: 24, CHIP: 25, COIN: 26, WISP: 27, TWINKLE: 28, MEND: 29, RING: 30, SHARD: 31,
};
function seasonAmb(S, mult = 1) {
  const f = (S.W / 320) * mult;
  switch (S.season) {
    case 'summer': return S.dusk ? [[K.POLLEN, 1.2 * f], [K.FIREFLY, 2.4 * f]] : [[K.POLLEN, 3 * f]];
    case 'fall': return [[K.LEAF, 1.6 * f]];
    case 'winter': return [[K.SNOW, 4.5 * f]];
    default: return S.dusk ? [[K.PETAL, 1.4 * f], [K.FIREFLY, 1.2 * f]] : [[K.PETAL, 2 * f]];
  }
}
const PETAL_C = ['#f29bb0', '#f8c8d4', '#fff0f4', '#e0667f'];
const LEAF_C = ['#e8873a', '#b8522e', '#f2b53a', '#a8586f', '#d9743a'];
const CONF_C = ['#f29bb0', '#ffd35c', '#6fae4a', '#9fd8e8', '#b69ae0', '#e8873a', '#fff4d6'];
const SPARK_R = ['#ffffff', '#fff4b0', '#ffd35c', '#f2b53a', '#e8873a', '#b8522e'];
const EMBER_R = ['#fff4b0', '#ffd35c', '#f2b53a', '#e8873a', '#c8522e', '#7a2a1e'];
const MEND_R = ['#9e8fd1', '#b69ae0', '#d0a8ec', '#f0b8e0', '#ffd0b0', '#ffd35c', '#fff4b0', '#fffbe8'];
const GLOOM_R = ['#b8a8e8', '#9e8fd1', '#7d7299', '#5b5470', '#3a3448'];
const BLOOM_C = ['#f29bb0', '#f8c8d4', '#ffd35c', '#fff4d6', '#e0667f'];
const GREEN_C = ['#6fae4a', '#a8d66a', '#3f7a3a', '#8ccf5c'];
const CHIP_C = ['#8a5a3b', '#b98356', '#5e3b26', '#d9a877'];
const HEAL_C = ['#8ce06a', '#f29bb0', '#a8f080', '#f7b0c4'];
const SPARKLE_C = ['#fffbe8', '#fff4b0', '#ffd35c', '#f8c8d4'];
const HITRING_R = ['#ffffff', '#fff4b0', '#ffd35c', '#f2b53a'];
const BURST_DEF = { hit: 16, leaf: 10, bloom: 16, heal: 8, bark: 10, gold: 10, gloom: 12, sparkle: 12, mend: 30 };
const WKEYS = ['sun', 'rain', 'drought', 'wind', 'frost', 'fog'];
// aurora colour bands: [colour, alpha, top, bottom] as fractions of curtain length above its lower edge
const AUR_BANDS = [['#9a78f0', 0.26, 1, 0.45], ['#40e0b0', 0.46, 0.45, 0.12], ['#a0ffd0', 0.8, 0.12, 0]];

function makePool(n) {
  const a = new Array(n);
  for (let i = 0; i < n; i++) a[i] = { on: false, k: 0, x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1, s: 1, c: '#fff', ph: 0, g: 0, r: 0, a: 0, w: 0, cx: 0, cy: 0, z: 1, ramp: null };
  a.cur = 0; a.live = 0;
  return a;
}
function take(pool) {
  const n = pool.length;
  for (let j = 0; j < n; j++) {
    const i = (pool.cur + j) % n, p = pool[i];
    if (!p.on) { pool.cur = (i + 1) % n; p.on = true; p.t = 0; p.s = 1; p.g = 0; p.r = 0; p.a = 0; p.w = 0; p.ramp = null; return p; }
  }
  return null;
}
const rampAt = (ramp, u) => ramp[Math.min(ramp.length - 1, Math.max(0, (u * ramp.length) | 0))];
function plus(g, x, y, arm) { g.fillRect(x - arm, y, arm * 2 + 1, 1); g.fillRect(x, y - arm, 1, arm * 2 + 1); }
// plus with arm length `arm` and stroke thickness `th` (both in game px)
function plusT(g, x, y, arm, th) { g.fillRect(x - arm, y, arm * 2 + th, th); g.fillRect(x, y - arm, th, arm * 2 + th); }
function heartShape(g, x, y, z = 1) { g.fillRect(x + z, y, z, z); g.fillRect(x + 3 * z, y, z, z); g.fillRect(x, y + z, 5 * z, z); g.fillRect(x + z, y + 2 * z, 3 * z, z); g.fillRect(x + 2 * z, y + 3 * z, z, z); }

// ---------- weather / screen overlays baked per size ----------
function bakeFog(W, H, R, col) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const w = W * 2, h = Math.max(10, Math.round(H * (0.1 + k * 0.03)));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = col;
    const p1 = R() * TAU, p2 = R() * TAU, p3 = R() * TAU;
    for (let y = 0; y < h; y++) {
      const prof = 1 - Math.abs((y / (h - 1)) * 2 - 1);
      for (let x = 0; x < w; x++) {
        const u = (x / w) * TAU;
        const v = 0.5 + 0.25 * Math.sin(u * 3 + p1) + 0.15 * Math.sin(u * 7 + p2) + 0.1 * Math.sin(u * 13 + p3);
        if (bay(x, y) < v * prof * 1.25) g.fillRect(x, y, 1, 1);
      }
    }
    out.push(c);
  }
  return out;
}
function bakeFrost(W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); const img = g.createImageData(W, H), d = img.data;
  const A = rgb('#f4fbff'), B = rgb('#bfe3f2'), C = rgb('#8fb9d9');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    const corner = Math.min(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) * 0.55;
    const reach = 7 + 4 * Math.sin(x * 0.21 + y * 0.13) + 3 * Math.sin(x * 0.07 - y * 0.11);
    const cov = clamp(1 - Math.min(e, corner) / reach, 0, 1);
    if (cov <= 0 || bay(x, y) >= cov * 0.95) continue;
    const col = cov > 0.75 ? A : cov > 0.4 ? B : C, o = (y * W + x) * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = cov > 0.4 ? 235 : 170;
  }
  g.putImageData(img, 0, 0);
  return c;
}
function bakeRays(W, H, sx, sy) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.fillStyle = '#fff2c0';
  const maxD = Math.hypot(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = Math.atan2(y - sy, x - sx), d = Math.hypot(x - sx, y - sy);
    const band = 0.5 + 0.5 * Math.sin(a * 23 + Math.sin(a * 7) * 2.2);
    const v = band * band * band * clamp(1 - d / (maxD * 0.75), 0, 1);
    if (bay(x, y) < v * 0.75) g.fillRect(x, y, 1, 1);
  }
  return c;
}

// Grey sky that slides over the baked sky (sun, moon, clouds) as rain or fog rolls in.
function bakeOvercast(W, hz, night) {
  const LW = W + 2 * M, h = Math.max(4, hz + 10);
  const c = document.createElement('canvas'); c.width = LW; c.height = h;
  const g = c.getContext('2d');
  vgrad(g, 0, 0, LW, h, night ? ['#181a2e', '#22243a', '#2e3048', '#3a3c54'] : ['#6e788e', '#8a92a6', '#a2a8b8', '#b8bcc6'], 0.5);
  const R = rng(99 + hz), dk = night ? '#121424' : '#606a80', lt = night ? '#34364e' : '#b4b8c4';
  for (let i = 0; i < LW / 12; i++) {
    const x = R() * LW, y = R() * h * 0.85, rx = 10 + R() * 24, ry = 3 + R() * 5;
    ellipse(g, dk, x, y + 2, rx, ry); ellipse(g, lt, x - 2, y, rx * 0.8, ry * 0.65);
  }
  return c;
}
// Low-heart vignette: dithered red-violet band of even pixel width around the edges.
function bakeVignette(W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const cols = [rgb('#c0467a'), rgb('#8e2a66'), rgb('#5a1a50')];
  const reach = Math.max(10, Math.min(W, H) * 0.24);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = Math.min(x, W - 1 - x), ey = Math.min(y, H - 1 - y);
    const e = ex < reach && ey < reach ? reach - Math.hypot(reach - ex, reach - ey) : Math.min(ex, ey);
    const cov = Math.pow(clamp(1 - e / reach, 0, 1), 1.6);
    if (cov <= 0 || bay(x, y) >= cov * 1.15) continue;
    const q = cov > 0.62 ? 2 : cov > 0.3 ? 1 : 0, C = cols[q], o = (y * W + x) * 4;
    d[o] = C[0]; d[o + 1] = C[1]; d[o + 2] = C[2]; d[o + 3] = 140 + q * 50;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------- screen transitions (top-layer cover canvas) ----------
// Every type bakes a cover image plus a per-pixel threshold map; a frame shows pixel i as covered
// when its threshold is past the moving front, with coloured edge bands and a soft shadow ahead.
const TR_MS = 450;
const packC = (hex, a = 255) => { const [r, g, b] = rgb(hex); return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; };
function trEdges(list, unit) { // list: [[hex, px], ...] from the front inward
  const c = new Uint32Array(list.length), t = new Float32Array(list.length);
  let acc = 0;
  list.forEach(([h, w], i) => { acc += w * unit; c[i] = packC(h); t[i] = acc; });
  return { edgeC: c, edgeT: t, edgeW: acc };
}
function trCanvas(W, H) { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
const trPixels = (c) => new Uint32Array(c.getContext('2d').getImageData(0, 0, c.width, c.height).data.buffer.slice(0));
function leafStamp(g, x, y, len, wid, ang, cols) {
  const ca = Math.cos(ang), sa = Math.sin(ang), r = Math.ceil(len) + 1;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca, q = (u * u) / (len * len) + (v * v) / (wid * wid);
    if (q > 1) continue;
    g.fillStyle = q > 0.72 ? cols[0] : Math.abs(v) < 0.6 && Math.abs(u) < len * 0.8 ? cols[0] : v < 0 ? cols[2] : cols[1];
    g.fillRect(x + dx, y + dy, 1, 1);
  }
  g.fillStyle = cols[0]; g.fillRect(Math.round(x - ca * (len + 1)), Math.round(y - sa * (len + 1)), 1, 1);
}
const TR_LEAVES = {
  spring: [['#2d5a2a', '#5d9e45', '#86c455'], ['#3f7a3a', '#6fae4a', '#a8d66a'], ['#a8325c', '#f29bb0', '#f8c8d4'], ['#2d5a2a', '#4f8c38', '#8ccf5c']],
  summer: [['#285c2a', '#3d7a33', '#5e9e3c'], ['#3c7428', '#56922f', '#92c658'], ['#8a6a1a', '#e2b83a', '#ffd35c'], ['#285c2a', '#4f8c38', '#80bc44']],
  fall: FALL_WOODS.map(w => [w[0], w[1], w[2]]),
  winter: [['#1d3e36', '#2d5848', '#44745a'], ['#7a1a22', '#c8323a', '#e85a5a'], ['#1d3e36', '#44745a', '#6a9a78'], ['#8a98b8', '#c8d4e8', '#f4f8ff']],
};
function bakeTransition(type, W, H, season) {
  const N = W * H, thr = new Float32Array(N), cv = trCanvas(W, H), g = cv.getContext('2d');
  const R = rng(hashStr(type + season) + W * 7 + H);
  let B;
  if (type === 'iris') {
    vgrad(g, 0, 0, W, H, ['#2a1d1a', '#33223a', '#3e2a4a'], 0.5);
    for (let i = 0; i < N / 90; i++) rect(g, R() < 0.25 ? '#fff4d6' : '#8a7aa8', R() * W, R() * H, 1, 1);
    const cx = W / 2, cy = H * 0.46, mr = Math.max(4, Math.round(Math.min(W, H) * 0.05));
    disc(g, '#f4e8c0', cx, cy, mr); disc(g, '#3a2a48', cx + mr * 0.45, cy - mr * 0.2, mr * 0.9);
    const dmax = Math.hypot(W / 2, H / 2) + 2;
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) thr[i] = 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / dmax;
    B = { lifo: true, shW: 3 / dmax, shC: packC('#2a1d1a', 130), ...trEdges([['#6a4418', 1], ['#f2b53a', 1], ['#fff0a0', 1], ['#f2b53a', 1], ['#6a4418', 1]], 1 / dmax) };
  } else if (type === 'leaves') {
    const pal = TR_LEAVES[season] || TR_LEAVES.fall;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rect(g, bay(x, y) < 0.5 ? '#3e2418' : '#4f301f', x, y, 1, 1);
    const diag = (x, y) => (x / W) * 0.55 + (y / H) * 0.45;
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) thr[i] = Math.min(0.999, 0.1 + diag(x, y) * 0.86 + bay(x, y) * 0.02);
    const n = Math.round(N / 16), stamps = [];
    for (let i = 0; i < n; i++) { const x = R() * W, y = R() * H; stamps.push([clamp(0.1 + diag(x, y) * 0.86 - 0.04 + (R() - 0.5) * 0.1, 0, 0.98), x, y]); }
    stamps.sort((a, b) => a[0] - b[0]);
    for (const [o, x, y] of stamps) {
      const len = 3 + R() * 2.5, wid = len * (0.45 + R() * 0.15), ang = R() * TAU, cols = pal[(R() * pal.length) | 0];
      leafStamp(g, Math.round(x), Math.round(y), len, wid, ang, cols);
      // mark the same footprint in the threshold map
      const r = Math.ceil(len) + 1, ca = Math.cos(ang), sa = Math.sin(ang);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const px = Math.round(x) + dx, py = Math.round(y) + dy;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const u = dx * ca + dy * sa, v = -dx * sa + dy * ca;
        if ((u * u) / (len * len) + (v * v) / (wid * wid) > 1) continue;
        const j = py * W + px; if (o < thr[j]) thr[j] = o;
      }
    }
    const fly = new Float32Array(26 * 4);
    for (let i = 0; i < fly.length; i += 4) { fly[i] = R(); fly[i + 1] = 0.01 + R() * 0.1; fly[i + 2] = R() * TAU; fly[i + 3] = (R() * pal.length) | 0; }
    B = { lifo: false, shW: 0.02, shC: packC('#2a1d1a', 90), ...trEdges([], 1), fly, pal, extra: trLeavesExtra };
  } else if (type === 'snow') {
    vgrad(g, 0, 0, W, H, ['#d4e0f0', '#e4ecf8', '#f4f8ff'], 0.5);
    const p1 = R() * TAU, p2 = R() * TAU;
    const nz = x => 0.5 + 0.3 * Math.sin(x * 0.07 + p1) + 0.2 * Math.sin(x * 0.19 + p2);
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      const v = (1 - y / H) * 0.86 + nz(x) * 0.12;
      thr[i] = clamp(v + bay(x, y) * 0.01, 0, 0.999);
      if ((v * 22) % 3 < 0.12 && bay(x, y) < 0.6) rect(g, '#d0dcee', x, y, 1, 1);
      else if (bay(x, y) < 0.03) rect(g, '#ffffff', x, y, 1, 1);
    }
    const flake = (x, y, s, c) => { for (let a = 0; a < 6; a++) { const ca = Math.cos(a * Math.PI / 3), sa = Math.sin(a * Math.PI / 3); for (let j = 1; j <= s; j++) rect(g, c, Math.round(x + ca * j), Math.round(y + sa * j), 1, 1); } rect(g, c, x, y, 1, 1); };
    for (let i = 0; i < N / 900; i++) flake(Math.round(R() * W), Math.round(R() * H), 2 + (R() * 3 | 0), R() < 0.5 ? '#b8c8e4' : '#ffffff');
    const fly = new Float32Array(60 * 4);
    for (let i = 0; i < fly.length; i += 4) { fly[i] = R(); fly[i + 1] = R(); fly[i + 2] = R() * TAU; fly[i + 3] = 20 + R() * 40; }
    B = { lifo: true, shW: 2 / H, shC: packC('#6a88b8', 110), ...trEdges([['#ffffff', 1], ['#f8fbff', 1]], 1 / H), fly, extra: trSnowExtra };
  } else { // page
    vgrad(g, 0, 0, W, H, ['#f8ecc8', '#f3e2b3', '#ecd6a2'], 0.5);
    for (let i = 0; i < N / 50; i++) rect(g, R() < 0.5 ? '#e8d4a0' : '#faf0d2', R() * W, R() * H, 1, 1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e < 7 && bay(x, y) < (7 - e) / 9) rect(g, '#dcc48c', x, y, 1, 1);
      if (x < 12 && bay(x, y) < (12 - x) / 16) rect(g, '#c8ac74', x, y, 1, 1); // spine shadow
    }
    const b = 6;
    g.fillStyle = '#b8955a'; g.fillRect(b, b, W - 2 * b, 1); g.fillRect(b, H - b - 1, W - 2 * b, 1); g.fillRect(b, b, 1, H - 2 * b); g.fillRect(W - b - 1, b, 1, H - 2 * b);
    g.fillStyle = '#d9bf85'; g.fillRect(b + 2, b + 2, W - 2 * b - 4, 1); g.fillRect(b + 2, H - b - 3, W - 2 * b - 4, 1); g.fillRect(b + 2, b + 2, 1, H - 2 * b - 4); g.fillRect(W - b - 3, b + 2, 1, H - 2 * b - 4);
    for (let y = b + 14; y < H - b - 10; y += 9) rect(g, '#e6d2a0', b + 10, y, W - 2 * b - 20, 1);
    // almanac emblem: a little sun between two leaves, with flourishes
    const cx = Math.round(W / 2), cy = Math.round(H / 2);
    rect(g, '#b8955a', cx - Math.round(W * 0.2), cy, Math.round(W * 0.2) - 10, 1); rect(g, '#b8955a', cx + 11, cy, Math.round(W * 0.2) - 10, 1);
    rect(g, '#b8955a', cx - Math.round(W * 0.2) - 1, cy - 1, 1, 1); rect(g, '#b8955a', cx + Math.round(W * 0.2) + 1, cy - 1, 1, 1);
    g.fillStyle = '#f2b53a'; plusT(g, cx, cy, 6, 1);
    disc(g, '#c88418', cx, cy, 3.4); disc(g, '#f2b53a', cx, cy, 2.6); rect(g, '#fff0a0', cx - 1, cy - 1, 1, 1);
    leafStamp(g, cx - 9, cy + 2, 3.2, 1.6, 0.5, ['#3f7a3a', '#6fae4a', '#a8d66a']);
    leafStamp(g, cx + 9, cy + 2, 3.2, 1.6, -0.5 + Math.PI, ['#3f7a3a', '#6fae4a', '#a8d66a']);
    const cmax = 14;
    for (let y = 0, i = 0; y < H; y++) { const cur = cmax * (y / H) * (y / H); for (let x = 0; x < W; x++, i++) thr[i] = Math.min(0.999, 1 - (x + cur) / (W + cmax)); }
    B = { lifo: false, shW: 8 / (W + cmax), shC: packC('#2a1d1a', 105), ...trEdges([['#7a5a38', 1], ['#fffaf0', 2], ['#fbf0d8', 3], ['#efdcb0', 3], ['#e0c890', 1]], 1 / (W + cmax)) };
  }
  B.thr = thr; B.pix = trPixels(cv);
  return B;
}
function trLeavesExtra(sc, B, f, p, phase, now) {
  const g = sc._og, W = sc.W, H = sc.H, t = now / 1000, A = B.fly, D = (f - 0.1) / 0.86, s = phase === 'in' ? 1 : -1;
  for (let i = 0; i < A.length; i += 4) {
    const dg = D + A[i + 1] * s;
    const x = A[i] * W * 1.3 - W * 0.15 + Math.sin(t * 7 + A[i + 2]) * 3;
    const y = ((dg - (0.55 * x) / W) / 0.45) * H + Math.cos(t * 5 + A[i + 2]) * 2;
    if (y < -6 || y > H + 6) continue;
    const c = B.pal[A[i + 3]], xi = Math.round(x), yi = Math.round(y), flip = Math.sin(t * 9 + A[i + 2]) > 0;
    g.fillStyle = c[0]; g.fillRect(xi + 1, yi + 1, flip ? 4 : 2, flip ? 2 : 3);
    g.fillStyle = c[1]; g.fillRect(xi, yi, flip ? 4 : 2, flip ? 2 : 3);
    g.fillStyle = c[2]; g.fillRect(xi, yi, 1, 1);
  }
}
function trSnowExtra(sc, B, f, p, phase, now) {
  const g = sc._og, W = sc.W, H = sc.H, t = now / 1000, A = B.fly;
  g.globalAlpha = Math.min(1, (phase === 'in' ? p : 1 - p) * 3 + 0.2);
  for (let i = 0; i < A.length; i += 4) {
    const x = Math.round(A[i] * W + Math.sin(t * 1.3 + A[i + 2]) * 4);
    const y = Math.round(((t * A[i + 3] + A[i + 1] * H * 1.3) % (H * 1.3)) - H * 0.15);
    const big = A[i + 3] > 45;
    g.fillStyle = big ? '#ffffff' : '#e4ecf8'; g.fillRect(x, y, big ? 2 : 1, big ? 2 : 1);
  }
  g.globalAlpha = 1;
}

// ---------- the class ----------
export class Scenery {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.fb = document.createElement('canvas'); this.fg = this.fb.getContext('2d');
    this.prev = document.createElement('canvas'); this.pg = this.prev.getContext('2d');
    this.layers = [0, 1, 2, 3].map(() => document.createElement('canvas'));
    this.lctx = this.layers.map(c => c.getContext('2d'));
    this.W = 0; this.H = 0; this.px = 1; this.z = 1; this.za = 1;
    this.scene = { kind: 'title', season: 'spring', weather: null, dusk: false, arena: null };
    this.quality = 'high'; this.qMul = 1;
    this.danger = 0; this.dangerT = 0; this.vign = null;
    this.aurS = new Float32Array(1); this.aurB = new Float32Array(1);
    // top-layer cover canvas (created on first cover/flash)
    this._ov = null; this._og = null; this._ovImg = null; this._ovPix = null; this._trBaked = {};
    this._tr = { state: 'idle', type: 'page', t0: 0, dur: TR_MS, res: [] };
    this._fl = { on: false, c: '#fff', t0: 0, ms: 120, peak: 0.7 };
    this._ovPending = false; this._ovRaf = 0; this._ovTo = 0; this._ovDeadline = 0;
    this._ovTickFn = () => this._ovTick();
    this.wl = { sun: 0, rain: 0, drought: 0, wind: 0, frost: 0, fog: 0 };
    this.amb = makePool(AMB_MAX); this.bur = makePool(BURST_MAX);
    this.acc = new Float32Array(40);
    this.off = new Int16Array(4);
    this.fireH = new Float32Array(64);
    this.t = 0; this.fade = 0; this.shakeAmp = 0; this.sx = 0; this.sy = 0; this.ptx = 0; this.ptxT = 0;
    this._raf = 0; this._last = 0; this._drawn = false; this._shaking = false;
    this.dyn = null;
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.halo = bakeGlow(6, '#ffc050', '#c86a20');
    this.halo2 = bakeGlow(12, '#ffc050', '#c86a20', 6);
    this._loop = now => this._frame(now);
    this._onResize = () => {
      this._dirtySize = true;
      if (!this._raf) this._paintOnce();
      if (this._ov && (this._tr.state !== 'idle' || this._fl.on)) { this._ovEnsure(); this._ovSchedule(); }
    };
    this._onPointer = e => { this.ptxT = e.clientX / (window.innerWidth || 1) - 0.5; };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('pointermove', this._onPointer, { passive: true });
    canvas.style.imageRendering = 'pixelated';
    canvas.style.pointerEvents = 'none';
    this._dirtySize = true; this._dirtyScene = true;
    this._paintOnce();
  }

  setScene({ kind, season, weather, dusk, arena } = {}) {
    const c = this.scene;
    const k = kind || c.kind, s = season || c.season, d = !!dusk;
    const a = k === 'combat' && arena && ARENAS[arena] ? arena : null;
    const changed = k !== c.kind || s !== c.season || d !== c.dusk || a !== c.arena || !this.dyn;
    c.kind = k; c.season = s; c.dusk = d; c.arena = a;
    if (changed) {
      // no crossfade when the swap happens under a full cover
      if (this._drawn && this.W && this._tr.state !== 'covered') { this.pg.drawImage(this.fb, 0, 0); this.fade = 1; } else this.fade = 0;
      this._dirtyScene = true;
    }
    this.setWeather(weather === undefined ? c.weather : weather);
    if (changed) { this._build(); if (!this._raf) this._paintOnce(); }
  }
  setWeather(w) { this.scene.weather = w || null; }

  // 'low' = fewer particles, no parallax, still aurora/shimmer (reduced motion / battery)
  setQuality(q) { this.quality = q === 'low' ? 'low' : 'high'; this.qMul = this.quality === 'low' ? 0.35 : 1; }

  // 0..1 low-heart vignette; eases in/out and pulses gently
  setDanger(v) {
    this.dangerT = clamp(+v || 0, 0, 1);
    if (!this._raf) { this.danger = this.dangerT; this._paintOnce(); }
  }

  // full-screen flash on the top layer (above the UI), fading out over `ms`
  flash(color = '#fff', ms = 120) {
    if (!this._ovEnsure()) return;
    const f = this._fl;
    f.c = color; f.t0 = performance.now(); f.ms = Math.max(30, +ms || 120); f.on = true;
    f.peak = this.reduced ? 0.3 : 0.7;
    this._ov.style.display = 'block';
    this._ovKick(f.ms);
  }

  // Covers the whole screen; resolves once fully covered. types: page | leaves | iris | snow
  cover(type = 'page') {
    if (type !== 'leaves' && type !== 'iris' && type !== 'snow') type = 'page';
    const tr = this._tr;
    if (!this._ovEnsure() || tr.state === 'covered') return Promise.resolve();
    return new Promise(res => {
      if (tr.state === 'covering') { tr.res.push(res); return; }
      const now = performance.now();
      let p0 = 0;
      if (tr.state === 'uncovering') { p0 = 1 - clamp((now - tr.t0) / tr.dur, 0, 1); this._trFlush(); }
      tr.state = 'covering'; tr.type = type; tr.dur = TR_MS; tr.t0 = now - p0 * TR_MS; tr.res.push(res);
      this._ov.style.pointerEvents = 'auto'; this._ov.style.display = 'block';
      this._ovKick(TR_MS);
    });
  }
  // Reveals the (new) screen under the cover; resolves when the cover is gone.
  uncover() {
    const tr = this._tr;
    if (tr.state === 'idle' || !this._ov) return Promise.resolve();
    return new Promise(res => {
      if (tr.state === 'uncovering') { tr.res.push(res); return; }
      if (tr.state === 'covering') this._trFlush();
      tr.state = 'uncovering'; tr.t0 = performance.now(); tr.dur = TR_MS; tr.res.push(res);
      this._ovKick(TR_MS);
    });
  }

  // select scene: where the two characters stand, in CSS px
  get spots() {
    const s = this.dyn && this.dyn.spots;
    return s ? s.map(([x, y]) => ({ x: (x + this.off[3]) * this.px, y: y * this.px })) : null;
  }

  // Sizes and spreads scale with CSS px per game pixel (this.z), so bursts read the same on phones.
  burst(x, y, type = 'sparkle', count) {
    const px = this.px || 1, z = this.z || 1, zi = Math.max(1, Math.round(z));
    const bx = x / px, by = y / px;
    let n = Math.round(count ?? BURST_DEF[type] ?? 10);
    if (this.quality === 'low') n = Math.ceil(n * 0.5);
    n = Math.min(60, Math.max(1, n));
    const r = Math.random;
    let p;
    switch (type) {
      case 'hit': {
        p = this._bspawn(K.RING, 0.26, bx, by, zi); if (p) { p.ramp = HITRING_R; p.s = 13 * z; }
        p = this._bspawn(K.STAR, 0.26, bx, by, zi); if (p) p.s = Math.round(6 * z);
        for (let i = 0; i < n; i++) { p = this._bspawn(K.SPARK, 0.28 + r() * 0.3, bx, by, zi); if (!p) break; this._radial(p, 60 * z, 170 * z, 20 * z); p.g = 90 * z; p.ramp = SPARK_R; }
        for (let i = 0; i < 5; i++) { p = this._bspawn(K.SHARD, 0.22 + r() * 0.12, bx, by, zi); if (!p) break; const a = (i / 5) * TAU + r() * 0.6; p.vx = Math.cos(a) * 230 * z; p.vy = Math.sin(a) * 230 * z; }
        break;
      }
      case 'leaf': case 'bloom': {
        const fallLeaf = type === 'leaf' && this.scene.season === 'fall';
        for (let i = 0; i < n; i++) {
          p = this._bspawn(type === 'leaf' ? K.BLEAF : K.BPETAL, 0.9 + r() * 0.8, bx, by, zi); if (!p) break;
          this._radial(p, 25 * z, 75 * z, 25 * z); p.g = 35 * z;
          p.c = type === 'leaf' ? (fallLeaf ? LEAF_C : GREEN_C)[(r() * 4) | 0] : BLOOM_C[(r() * BLOOM_C.length) | 0];
          p.s = (r() < 0.7 ? 2 : 1) * zi;
        }
        if (type === 'bloom') for (let i = 0; i < 4; i++) { p = this._bspawn(K.TWINKLE, 0.6 + r() * 0.4, bx, by, zi); if (!p) break; this._radial(p, 10 * z, 30 * z, 8 * z); p.c = '#fff4b0'; }
        break;
      }
      case 'heal':
        for (let i = 0; i < n; i++) {
          p = this._bspawn(K.HEART, 1 + r() * 0.5, bx, by, zi); if (!p) break;
          p.cx = bx + (r() - 0.5) * 22 * z; p.x = p.cx; p.y = by + (r() - 0.5) * 10 * z; p.vy = (-18 - r() * 16) * z; p.t = -i * 0.05;
          p.c = HEAL_C[i % 2]; p.ramp = HEAL_C;
        }
        for (let i = 0; i < 5; i++) { p = this._bspawn(K.TWINKLE, 0.8, bx, by, zi); if (!p) break; this._radial(p, 8 * z, 24 * z, 12 * z); p.c = '#c8f8a8'; }
        break;
      case 'bark':
        for (let i = 0; i < n; i++) { p = this._bspawn(K.CHIP, 0.55 + r() * 0.35, bx, by, zi); if (!p) break; this._radial(p, 40 * z, 110 * z, 50 * z); p.g = 240 * z; p.c = CHIP_C[(r() * 4) | 0]; }
        break;
      case 'gold':
        for (let i = 0; i < n; i++) { p = this._bspawn(K.COIN, 0.8 + r() * 0.35, bx, by, zi); if (!p) break; p.vx = (r() - 0.5) * 80 * z; p.vy = (-60 - r() * 70) * z; p.g = 260 * z; p.t = -i * 0.03; }
        for (let i = 0; i < 6; i++) { p = this._bspawn(K.TWINKLE, 0.7 + r() * 0.4, bx, by, zi); if (!p) break; this._radial(p, 10 * z, 40 * z, 10 * z); p.c = '#fff4b0'; }
        break;
      case 'gloom':
        for (let i = 0; i < n; i++) {
          p = this._bspawn(K.WISP, 1 + r() * 0.7, bx, by, zi); if (!p) break;
          p.x = bx + (r() - 0.5) * 18 * z; p.y = by + (r() - 0.5) * 12 * z; p.vx = (r() - 0.5) * 8 * z; p.vy = (6 + r() * 12) * z; p.ramp = GLOOM_R;
        }
        break;
      case 'mend': {
        for (let i = 0; i < n; i++) {
          p = this._bspawn(K.MEND, 1.3 + r() * 0.7, bx, by, zi); if (!p) break;
          p.cx = bx; p.cy = by + 6 * z; p.a = (i / n) * TAU + r() * 0.4; p.w = (3 + r() * 2.5) * (i & 1 ? 1 : -1);
          p.r = (1 + r() * 3) * z; p.vx = (7 + r() * 9) * z; p.vy = (14 + r() * 16) * z; p.t = -i * 0.025; p.ramp = MEND_R;
        }
        for (let i = 0; i < 2; i++) { p = this._bspawn(K.RING, 0.6, bx, by, zi); if (!p) break; p.t = -i * 0.18; p.ramp = MEND_R; p.s = (22 + i * 6) * z; }
        for (let i = 0; i < 8; i++) { p = this._bspawn(K.TWINKLE, 0.9 + r() * 0.6, bx, by, zi); if (!p) break; p.x = bx + (r() - 0.5) * 30 * z; p.y = by + (r() - 0.5) * 20 * z; p.vy = (-10 - r() * 14) * z; p.c = i & 1 ? '#fff4b0' : '#d0a8ec'; p.t = -0.4 - r() * 0.6; }
        for (let i = 0; i < 2; i++) { p = this._bspawn(K.HEART, 1.3, bx, by, zi); if (!p) break; p.cx = bx + (i ? 8 : -8) * z; p.x = p.cx; p.vy = -16 * z; p.t = -0.7 - i * 0.2; p.c = '#f7b0c4'; }
        break;
      }
      default: // sparkle
        for (let i = 0; i < n; i++) { p = this._bspawn(K.TWINKLE, 0.6 + r() * 0.5, bx, by, zi); if (!p) break; this._radial(p, 12 * z, 45 * z, 6 * z); p.c = SPARKLE_C[(r() * 4) | 0]; }
    }
  }
  _bspawn(kind, life, x, y, zi) {
    const p = take(this.bur); if (!p) return null;
    p.k = kind; p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.life = life; p.ph = Math.random() * TAU; p.z = zi;
    return p;
  }
  _radial(p, s0, s1, up) {
    const a = Math.random() * TAU, sp = s0 + Math.random() * (s1 - s0);
    p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - up;
  }

  shake(intensity = 6) {
    this.shakeAmp = Math.max(this.shakeAmp, intensity * (this.reduced ? 0.35 : 1));
  }

  start() {
    if (this._raf) return;
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }
  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.shakeAmp = 0; this._applyShake(0, 0);
  }

  // ---- internals ----
  _measure() {
    const cw = window.innerWidth || 320, ch = window.innerHeight || 200, dpr = window.devicePixelRatio || 1;
    const target = clamp(cw / 320, 2, 5);
    const px = Math.max(1, Math.round(target * dpr)) / dpr;
    const W = Math.ceil(cw / px), H = Math.ceil(ch / px);
    this.px = px;
    this.z = Math.max(1, 4 / px); this.za = this.z >= 1.6 ? 2 : 1;
    this.canvas.style.width = W * px + 'px';
    this.canvas.style.height = H * px + 'px';
    if (W === this.W && H === this.H) return false;
    this.W = W; this.H = H;
    this.canvas.width = W; this.canvas.height = H;
    this.fb.width = W; this.fb.height = H; this.prev.width = W; this.prev.height = H;
    for (const c of this.layers) { c.width = W + 2 * M; c.height = H; }
    for (const g of [this.ctx, this.fg, this.pg, ...this.lctx]) g.imageSmoothingEnabled = false;
    const R = rng(1234);
    this.fog = bakeFog(W, H, R, '#eef2f4');
    this.frostEdge = bakeFrost(W, H);
    this.vign = bakeVignette(W, H);
    this.aurS = new Float32Array(W * 2); this.aurB = new Float32Array(W * 2);
    this.fade = 0;
    return true;
  }
  _paintOnce() {
    if (this._dirtySize) { this._dirtySize = false; if (this._measure()) this._dirtyScene = true; }
    if (this._dirtyScene) this._build();
    this._render(0);
  }
  _build() {
    this._dirtyScene = false;
    if (!this.W) return;
    const { kind, dusk, arena } = this.scene;
    const A = kind === 'combat' && arena ? ARENAS[arena] : null;
    const season = A ? A.season : this.scene.season;
    const W = this.W, H = this.H, LW = W + 2 * M;
    const forceDusk = kind === 'defeat';
    const mode = A ? 'day' : kind === 'map' ? 'map' : kind === 'select' ? 'dawn' : dusk || forceDusk ? 'dusk' : kind === 'title' ? 'golden' : kind === 'victory' ? 'bright' : 'day';
    const P = palette(season, mode);
    if (A) A.pal(P);
    const R = rng(hashStr(`${kind}|${season}|${dusk}` + (A ? '|' + arena : '')));
    for (const g of this.lctx) { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, LW, H); g.setTransform(1, 0, 0, 1, M, 0); g.globalAlpha = 1; }
    const dyn = {
      horizon: Math.round(H * 0.42), clouds: [], stars: null, water: [], windows: [], smoke: [], candles: [], bunting: [],
      blades: null, fire: null, glow: null, rays: 0, raySrc: [0, -20], noPan: false, indoor: false, amb: [], waterHi: P.waterLight,
      tint: null, aurora: null, shimmer: 0, spots: null, overcast: null, frozen: season === 'winter',
    };
    const S = {
      W, H, LW, L: this.lctx, P, R, dyn, season, kind, mode, dusk: mode === 'dusk', portrait: H > W * 1.1,
      night: A ? A.night : mode === 'dusk' || season === 'winter' || kind === 'hearth',
      lit: A ? A.night : mode === 'dusk' || season === 'winter' || kind === 'title' || kind === 'defeat' || kind === 'hearth' || kind === 'select',
      woods: FALL_WOODS.map(w => w.map(c => (mode === 'golden' ? mix(c, '#ffa850', 0.12) : mode === 'map' ? mix(c, '#f3e2b3', 0.3) : c))),
      blades: [], k: H > W * 1.1 ? 1.35 : 1,
    };
    S.gDark = P.g.map(c => mix(c, season === 'winter' ? '#5a6a9a' : '#2a3a10', 0.14));
    S.gLight = P.g.map(c => mix(c, '#ffffff', 0.14));
    switch (kind) {
      case 'combat': if (A) A.paint(S); else paintCombat(S); break;
      case 'select': paintSelect(S); break;
      case 'map': paintMap(S); break;
      case 'hearth': paintHearth(S); break;
      case 'market': paintMarket(S); break;
      case 'event': paintGlade(S); break;
      default: paintValley(S); // title, victory, defeat
    }
    if (mode === 'dusk') {
      const wint = season === 'winter';
      const tints = [[1, wint ? '#3a3f78' : '#8a4a88', 0.58], [2, wint ? '#1c2450' : '#4a2c5e', 0.42], [3, wint ? '#1c2450' : '#4a2c5e', 0.34]];
      for (const [i, c, a] of tints) {
        const g = this.lctx[i];
        g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = c; g.fillRect(-M, 0, LW, H);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
      P.blade = P.blade.map(c => mix(c, wint ? '#1c2450' : '#3b2c58', 0.3));
      P.waterLight = mix(P.waterLight, '#f29466', 0.3);
      dyn.waterHi = P.waterLight;
    }
    if (dyn.tint) for (const [i, c, a] of dyn.tint) {
      const g = this.lctx[i];
      g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = c; g.fillRect(-M, 0, LW, H);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    if (!dyn.indoor && dyn.horizon > 4) dyn.overcast = bakeOvercast(W, dyn.horizon, S.night);
    // pack grass blades sorted by colour so the frame loop switches fillStyle rarely
    const b = S.blades, n = b.length / 5, idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    idx.sort((a, c) => b[a * 5 + 4] - b[c * 5 + 4]);
    const packed = new Float32Array(b.length);
    idx.forEach((src, i) => { for (let j = 0; j < 5; j++) packed[i * 5 + j] = b[src * 5 + j]; });
    dyn.blades = packed; dyn.bladeCols = P.blade;
    dyn.water = Int16Array.from(dyn.water);
    dyn.waterHi = dyn.waterHi || P.waterLight;
    if (dyn.glow) dyn.glow.c2 = null;
    const src = dyn.raySrc;
    dyn.rayCanvas = bakeRays(W, H, src[0], src[1]);
    dyn.smokeCol = mode === 'dusk' ? '#a898b8' : season === 'winter' ? '#c8d0e0' : mode === 'golden' ? '#c8bcb8' : '#dcd8d4';
    this.dyn = dyn;
    this.pal = P;
    // new scene: clear ambient, prewarm so particles are already mid-air
    for (const p of this.amb) p.on = false;
    this.acc.fill(0);
    for (let i = 0; i < 40; i++) { this._spawnAmbient(0.25); this._pool(this.fg, this.amb, 0.25, false); }
  }

  _frame(now) {
    this._raf = requestAnimationFrame(this._loop);
    const dt = clamp((now - this._last) / 1000, 0, 0.05);
    this._last = now;
    if (this._dirtySize) { this._dirtySize = false; if (this._measure()) this._dirtyScene = true; }
    if (this._dirtyScene) this._build();
    this._render(dt);
  }

  _applyShake(ox, oy) {
    const app = typeof document !== 'undefined' ? document.getElementById('app') : null;
    if (app) app.style.transform = ox || oy ? `translate(${ox}px,${oy}px)` : '';
    const inside = app && app.contains(this.canvas);
    this.sx = inside ? 0 : Math.round(ox / this.px);
    this.sy = inside ? 0 : Math.round(oy / this.px);
  }

  _spawnAmbient(dt) {
    const d = this.dyn, wl = this.wl, q = this.qMul, f = (this.W / 320) * q;
    const list = d.amb;
    for (let i = 0; i < list.length; i++) this._emit(list[i][0], list[i][1] * dt * q);
    for (let i = 0; i < d.smoke.length; i++) this._emit(K.SMOKE, 2.2 * d.smoke[i][3] * dt, d.smoke[i]);
    if (d.indoor) return;
    if (wl.rain > 0.02) this._emit(K.RAIN, 150 * f * wl.rain * dt);
    if (wl.wind > 0.02) this._emit(K.STREAK, 16 * f * wl.wind * dt);
    if (wl.frost > 0.02) this._emit(K.ICE, 9 * f * wl.frost * dt);
    if (wl.sun > 0.02) this._emit(K.MOTE, 4 * f * wl.sun * dt);
    if (wl.drought > 0.02) this._emit(K.DUST, 6 * f * wl.drought * dt);
  }
  _emit(k, amount, src) {
    const slot = src ? 39 - (this.dyn.smoke.indexOf(src) % 8) : k;
    this.acc[slot] += amount;
    while (this.acc[slot] >= 1) { this.acc[slot] -= 1; this._spawnOne(k, src); }
  }
  _spawnOne(k, src) {
    const p = take(this.amb); if (!p) return;
    const W = this.W, H = this.H, d = this.dyn, hz = d.horizon, r = Math.random, wind = this.wl.wind;
    p.k = k; p.ph = r() * TAU; p.vx = 0; p.vy = 0; p.z = this.za;
    switch (k) {
      case K.PETAL: case K.LEAF: case K.CONFETTI:
        if (r() < 0.25 + wind * 0.5) { p.x = -3; p.y = r() * H * 0.8; } else { p.x = r() * (W + 40) - 30; p.y = -3; }
        p.vy = k === K.LEAF ? 12 + r() * 8 : k === K.CONFETTI ? 16 + r() * 12 : 7 + r() * 6;
        p.vx = k === K.CONFETTI ? (r() - 0.5) * 14 : 4 + r() * 5;
        p.life = 80; p.s = r() < 0.35 ? 2 : 1;
        p.c = k === K.PETAL ? PETAL_C[(r() * 4) | 0] : k === K.LEAF ? LEAF_C[(r() * LEAF_C.length) | 0] : CONF_C[(r() * CONF_C.length) | 0];
        break;
      case K.SNOW:
        p.x = r() * (W + 40) - 20; p.y = -2; p.s = r() < 0.3 ? 2 : 1; p.vy = p.s === 2 ? 14 + r() * 8 : 7 + r() * 7; p.life = 80;
        p.c = p.s === 2 ? '#ffffff' : '#dfe8f8';
        break;
      case K.POLLEN: case K.MOTE: case K.DUST: case K.GLINT:
        p.x = r() * W; p.y = k === K.DUST ? hz + r() * (H - hz) : r() * H * (k === K.MOTE ? 0.8 : 1);
        p.vx = k === K.DUST ? 8 + r() * 10 : (r() - 0.3) * 4; p.vy = k === K.DUST ? -1 : -1 - r() * 3;
        p.life = 3 + r() * 4;
        p.c = k === K.POLLEN ? (r() < 0.5 ? '#fff0a0' : '#ffd35c') : k === K.DUST ? '#ead0a0' : k === K.GLINT ? '#fff4b0' : '#fff6d0';
        break;
      case K.FIREFLY:
        p.x = r() * W; p.y = hz - 8 + r() * (H - hz) * 0.8; p.life = 5 + r() * 5;
        break;
      case K.SMOKE:
        p.x = src[0] + (d.noPan ? 0 : this.off[src[2]] + M) + (r() - 0.5); p.y = src[1]; p.vx = 2 + r() * 2; p.vy = -5 - r() * 3;
        p.life = 2.5 + r() * 1.5 * src[3]; p.s = src[3] < 1 ? 0.6 : 1; p.c = d.smokeCol;
        break;
      case K.EMBER: {
        const f = d.fire; if (!f) { p.on = false; return; }
        p.x = f.x + r() * f.w; p.y = f.y - f.h * (0.3 + r() * 0.5); p.vx = (r() - 0.5) * 8; p.vy = -12 - r() * 16; p.life = 1.2 + r() * 1.6; p.ramp = EMBER_R;
        break;
      }
      case K.RAIN: { // near drops are long, bright and land low; far drops are faint and land near the horizon
        const near = r() < 0.45;
        p.s = near ? 2 : 1; p.z = this.z;
        p.x = r() * (W + 60) - 10; p.y = -4 - r() * 20; p.vy = near ? 250 + r() * 60 : 170 + r() * 40; p.vx = (-45 - wind * 40) * (near ? 1.1 : 0.8); p.life = 5;
        p.g = near ? hz + (H - hz) * (0.3 + r() * 0.7) : hz + 2 + r() * (H - hz) * 0.35; // ground contact line
        break;
      }
      case K.CROW:
        p.x = W + 8; p.y = 4 + r() * hz * 0.55; p.vx = -(16 + r() * 12); p.vy = (r() - 0.5) * 3; p.life = (W + 30) / 16 + 2;
        break;
      case K.STREAK:
        p.x = -12; p.y = r() * H; p.vx = 170 + r() * 110; p.s = 4 + (r() * 7 | 0); p.life = 4; p.a = 0.25 + r() * 0.35;
        break;
      case K.ICE:
        p.x = r() * W; p.y = r() * H; p.life = 0.8 + r() * 0.8;
        break;
    }
  }

  _pool(g, pool, dt, draw) {
    const W = this.W, H = this.H, wind = this.wl.wind;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.on) continue;
      p.t += dt;
      const t = p.t;
      if (t < 0) continue;
      if (t > p.life) { p.on = false; continue; }
      const u = t / p.life;
      let alpha = 1;
      switch (p.k) {
        case K.PETAL: case K.LEAF: case K.CONFETTI: {
          p.x += (p.vx + wind * 45 + Math.sin(t * 1.6 + p.ph) * 8) * dt;
          p.y += (p.vy + Math.sin(t * 2.3 + p.ph) * 4) * dt;
          if (p.y > H + 4 || p.x > W + 12) { p.on = false; continue; }
          if (!draw) continue;
          const face = Math.sin(t * (p.k === K.CONFETTI ? 9 : 5) + p.ph) > 0, z = p.z;
          g.fillStyle = p.c;
          const x = Math.round(p.x), y = Math.round(p.y);
          if (p.k === K.LEAF) { if (face) { g.fillRect(x, y, 2 * z, 2 * z); g.fillStyle = '#6e4a32'; g.fillRect(x + 2 * z, y + 2 * z, z, z); } else g.fillRect(x, y, 2 * z, z); }
          else if (face) g.fillRect(x, y, (p.s + 1) * z, (p.s === 2 ? 2 : 1) * z); else g.fillRect(x, y, z, p.s * z);
          continue;
        }
        case K.SNOW: {
          p.x += (Math.sin(t * 1.1 + p.ph) * 5 + wind * 55 - 2) * dt; p.y += p.vy * dt;
          if (p.y > H + 2 || p.x > W + 10) { p.on = false; continue; }
          if (!draw) continue;
          g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), p.s * p.z, p.s * p.z);
          continue;
        }
        case K.POLLEN: case K.MOTE: case K.DUST: case K.GLINT: {
          p.x += (p.vx + wind * 20 + Math.sin(t + p.ph) * 2) * dt; p.y += (p.vy + Math.cos(t * 0.8 + p.ph) * 2) * dt;
          if (!draw) continue;
          alpha = Math.min(1, t / 0.6, (p.life - t) / 0.8) * (0.55 + 0.45 * Math.sin(t * 4 + p.ph));
          if (alpha <= 0.02) continue;
          g.globalAlpha = alpha; g.fillStyle = p.c;
          if (p.k === K.GLINT && alpha > 0.7) plus(g, Math.round(p.x), Math.round(p.y), 1);
          else g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
          continue;
        }
        case K.FIREFLY: {
          p.x += (Math.sin(t * 0.7 + p.ph) * 7 + Math.cos(t * 1.9 + p.ph * 2) * 4) * dt;
          p.y += Math.cos(t * 0.9 + p.ph) * 5 * dt;
          if (!draw) continue;
          alpha = clamp(Math.sin(t * 2.1 + p.ph) * 1.4, 0, 1) * Math.min(1, t, p.life - t);
          if (alpha <= 0.02) continue;
          const x = Math.round(p.x), y = Math.round(p.y);
          g.globalAlpha = alpha * 0.35; g.fillStyle = '#d8ff70'; g.fillRect(x - 1, y - 1, 3, 3);
          g.globalAlpha = alpha; g.fillStyle = '#fffbd0'; g.fillRect(x, y, 1, 1);
          continue;
        }
        case K.SMOKE: {
          p.x += (p.vx + wind * 25 + Math.sin(t * 1.3 + p.ph) * 2) * dt; p.y += p.vy * dt;
          if (!draw) continue;
          const s = Math.round((0.6 + u * 3) * p.s + 0.4);
          alpha = (1 - u) * 0.75 * Math.min(1, t * 3);
          g.globalAlpha = alpha; g.fillStyle = p.c;
          const x = Math.round(p.x - s / 2), y = Math.round(p.y - s / 2);
          if (s >= 3) { g.fillRect(x + 1, y, s - 2, s); g.fillRect(x, y + 1, s, s - 2); } else g.fillRect(x, y, s, s);
          continue;
        }
        case K.EMBER: {
          p.x += (p.vx + Math.sin(t * 6 + p.ph) * 7) * dt; p.y += p.vy * dt; p.vy *= 1 - 0.3 * dt;
          if (!draw) continue;
          g.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1; g.fillStyle = rampAt(p.ramp, u);
          g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
          continue;
        }
        case K.RAIN: {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y > p.g) { p.k = K.SPLASH; p.t = 0; p.life = 0.22; p.y = Math.round(p.g); continue; }
          if (!draw) continue;
          const near = p.s === 2, len = Math.round((near ? 7 : 4) * p.z), w = near ? Math.max(1, Math.round(p.z * 0.75)) : 1, h2 = len >> 1;
          const x = Math.round(p.x), y = Math.round(p.y);
          g.globalAlpha = near ? 0.5 : 0.32; g.fillStyle = near ? '#c8dcf4' : '#aabcdc';
          g.fillRect(x + 1, y - len, w, len - h2);
          if (near) { g.globalAlpha = 0.3; g.fillStyle = '#3a4a6a'; g.fillRect(x - 1, y - h2, 1, h2 + 1); } // reads on bright ground
          g.globalAlpha = near ? 0.85 : 0.45; g.fillStyle = near ? '#eef6ff' : '#c4d4ec';
          g.fillRect(x, y - h2, w, h2 + 1);
          continue;
        }
        case K.SPLASH: {
          if (!draw) continue;
          const zz = p.s === 2 ? Math.max(1, Math.round(p.z * 0.75)) : 1, s = (1 + Math.round(u * 2)) * zz;
          g.globalAlpha = (p.s === 2 ? 0.8 : 0.5) * (1 - u); g.fillStyle = '#e4f0ff';
          g.fillRect(Math.round(p.x) - s, p.y - zz, zz, zz); g.fillRect(Math.round(p.x) + s, p.y - zz, zz, zz);
          if (u < 0.4) g.fillRect(Math.round(p.x), p.y - 2 * zz, zz, zz);
          continue;
        }
        case K.STREAK: {
          p.x += p.vx * dt; p.y += Math.sin(t * 2 + p.ph) * 6 * dt;
          if (p.x > W + 12) { p.on = false; continue; }
          if (!draw) continue;
          g.globalAlpha = p.a; g.fillStyle = '#ffffff';
          g.fillRect(Math.round(p.x), Math.round(p.y), p.s, 1);
          continue;
        }
        case K.CROW: {
          p.x += p.vx * dt; p.y += (p.vy + Math.sin(t * 2 + p.ph) * 3) * dt;
          if (p.x < -10) { p.on = false; continue; }
          if (!draw) continue;
          const x = Math.round(p.x), y = Math.round(p.y), up = Math.sin(t * 11 + p.ph) > 0;
          g.fillStyle = '#12101e';
          g.fillRect(x, y, 4, 2); g.fillRect(x - 1, y - 1, 2, 2); g.fillRect(x + 4, y, 2, 1);
          if (up) { g.fillRect(x + 1, y - 1, 2, 1); g.fillRect(x + 2, y - 3, 2, 2); } else { g.fillRect(x + 1, y + 2, 2, 1); g.fillRect(x + 2, y + 3, 1, 1); }
          g.fillStyle = '#d8a040'; g.fillRect(x - 2, y, 1, 1);
          continue;
        }
        case K.ICE: {
          if (!draw) continue;
          alpha = Math.sin(u * Math.PI);
          g.globalAlpha = alpha; g.fillStyle = '#f4fbff';
          if (alpha > 0.75) plus(g, Math.round(p.x), Math.round(p.y), 1); else g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
          continue;
        }
        // ---- bursts (p.z = integer pixel scale) ----
        case K.SPARK: {
          const dr = 1 - 3.2 * dt; p.vx *= dr; p.vy = p.vy * dr + p.g * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (!draw) continue;
          const z = p.z, sz = (u < 0.45 ? 2 : 1) * z, x = Math.round(p.x), y = Math.round(p.y);
          g.globalAlpha = 0.5; g.fillStyle = '#2a1d1a'; g.fillRect(x + z, y + z, sz, sz); // ink shadow reads on bright skies
          g.fillStyle = rampAt(p.ramp, u + 0.2);
          g.globalAlpha = 0.75; g.fillRect(Math.round(p.x - p.vx * 0.022), Math.round(p.y - p.vy * 0.022), z, z);
          g.globalAlpha = 0.4; g.fillRect(Math.round(p.x - p.vx * 0.044), Math.round(p.y - p.vy * 0.044), z, z);
          g.globalAlpha = 1; g.fillStyle = rampAt(p.ramp, u); g.fillRect(x, y, sz, sz);
          continue;
        }
        case K.STAR: {
          if (!draw) continue;
          const z = p.z, s = Math.max(z, Math.round(p.s * (1 - u * 0.75))), x = Math.round(p.x), y = Math.round(p.y);
          g.globalAlpha = 0.5; g.fillStyle = '#2a1d1a'; plusT(g, x + z, y + z, s, z);
          g.globalAlpha = 1; g.fillStyle = '#ffd35c'; plusT(g, x, y, s, z);
          const dg = Math.round(s * 0.55);
          for (let j = z; j <= dg; j += z) { g.fillRect(x - j, y - j, z, z); g.fillRect(x + j, y - j, z, z); g.fillRect(x - j, y + j, z, z); g.fillRect(x + j, y + j, z, z); }
          g.fillStyle = '#ffffff'; plusT(g, x, y, Math.max(0, s - 2 * z), z);
          if (u < 0.35) g.fillRect(x - z, y - z, 3 * z, 3 * z);
          continue;
        }
        case K.SHARD: {
          const dr = 1 - 7 * dt; p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt;
          if (!draw) continue;
          g.globalAlpha = 1 - u * u; g.fillStyle = u < 0.45 ? '#ffffff' : '#ffd35c';
          for (let j = 0; j < 4; j++) g.fillRect(Math.round(p.x - p.vx * 0.011 * j), Math.round(p.y - p.vy * 0.011 * j), p.z, p.z);
          continue;
        }
        case K.BLEAF: case K.BPETAL: {
          const dr = 1 - 2.2 * dt; p.vx *= dr; p.vy = Math.min(16 * p.z, p.vy * dr + p.g * dt);
          p.x += (p.vx + Math.sin(t * 5 + p.ph) * 10 * p.z) * dt; p.y += p.vy * dt;
          if (!draw) continue;
          const al = u > 0.7 ? (1 - u) / 0.3 : 1;
          const face = Math.sin(t * 7 + p.ph) > 0, x = Math.round(p.x), y = Math.round(p.y), w = face ? p.s + p.z : p.z;
          g.globalAlpha = al * 0.4; g.fillStyle = '#2a1d1a'; g.fillRect(x, y + p.z, w, p.s);
          g.globalAlpha = al; g.fillStyle = p.c; g.fillRect(x, y, w, p.s);
          continue;
        }
        case K.HEART: {
          p.y += p.vy * dt; p.vy *= 1 - 0.6 * dt; p.x = p.cx + Math.sin(t * 4 + p.ph) * 2 * p.z;
          if (!draw) continue;
          g.globalAlpha = Math.min(1, t * 6, u > 0.65 ? (1 - u) / 0.35 : 1);
          const z = p.z, x = Math.round(p.x) - 2 * z, y = Math.round(p.y) - 2 * z;
          g.fillStyle = '#5a3848'; heartShape(g, x, y + z, z);
          g.fillStyle = p.c; heartShape(g, x, y, z);
          g.fillStyle = '#ffffff'; g.fillRect(x + z, y + z, z, z);
          continue;
        }
        case K.CHIP: {
          p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          if (!draw) continue;
          const z = p.z, al = u > 0.75 ? (1 - u) / 0.25 : 1, x = Math.round(p.x), y = Math.round(p.y), fl = (t * 14 + p.ph) & 1;
          g.globalAlpha = al * 0.45; g.fillStyle = '#2a1d1a'; g.fillRect(x, y + z, (fl ? 3 : 2) * z, (fl ? 1 : 2) * z);
          g.globalAlpha = al; g.fillStyle = p.c; g.fillRect(x, y, (fl ? 3 : 2) * z, (fl ? 1 : 2) * z);
          continue;
        }
        case K.COIN: {
          p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt;
          if (!draw) continue;
          g.globalAlpha = u > 0.75 ? (1 - u) / 0.25 : 1;
          const z = p.z, w = Math.abs(Math.cos(t * 9 + p.ph)), x = Math.round(p.x), y = Math.round(p.y);
          if (w > 0.6) {
            g.fillStyle = '#b87a1a'; g.fillRect(x + z, y + 3 * z, 2 * z, z); g.fillRect(x + 3 * z, y + z, z, 2 * z);
            g.fillStyle = '#f2b53a'; g.fillRect(x + z, y, 2 * z, z); g.fillRect(x, y + z, 3 * z, 2 * z);
            g.fillStyle = '#fff4b0'; g.fillRect(x + z, y + z, z, z);
          } else if (w > 0.25) { g.fillStyle = '#f2b53a'; g.fillRect(x + z, y, 2 * z, 4 * z); g.fillStyle = '#fff4b0'; g.fillRect(x + z, y + z, z, z); }
          else { g.fillStyle = '#d0922a'; g.fillRect(x + z, y, z, 4 * z); }
          continue;
        }
        case K.WISP: {
          p.x += (p.vx + Math.sin(t * 2.5 + p.ph) * 6 * p.z) * dt; p.y += p.vy * dt; p.vy *= 1 - 0.5 * dt;
          if (!draw) continue;
          const z = p.z, s = (1 + Math.round(u * 2.4)) * z;
          g.globalAlpha = Math.min(1, t * 5) * (1 - u) * 0.9; g.fillStyle = rampAt(p.ramp, u);
          const x = Math.round(p.x), y = Math.round(p.y);
          g.fillRect(x, y, s, s);
          if (s > z) { g.fillRect(x + z, y - z, s - z, z); g.fillRect(x - z, y + z, z, s - z); }
          continue;
        }
        case K.TWINKLE: {
          const dr = 1 - 2.5 * dt; p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt;
          if (!draw) continue;
          const z = p.z, tw = Math.sin(t * 12 + p.ph);
          const al = Math.min(1, t * 8, (1 - u) * 2), x = Math.round(p.x), y = Math.round(p.y);
          g.globalAlpha = al * 0.25; g.fillStyle = '#2a1d1a'; plusT(g, x + z, y + z, z, z);
          g.globalAlpha = al; g.fillStyle = p.c; plusT(g, x, y, tw > 0.2 ? z : 0, z);
          continue;
        }
        case K.MEND: {
          if (!draw) { continue; }
          const z = p.z, ang = p.a + p.w * t, rad = p.r + p.vx * t;
          const x = Math.round(p.cx + Math.cos(ang) * rad), y = Math.round(p.cy - p.vy * t + Math.sin(ang) * rad * 0.38);
          g.globalAlpha = Math.min(1, t * 6) * (u > 0.8 ? (1 - u) / 0.2 : 1);
          g.fillStyle = rampAt(p.ramp, u);
          const tw = Math.sin(t * 15 + p.ph);
          plusT(g, x, y, tw > 0.55 || u > 0.82 ? z : 0, z);
          const a2 = ang - p.w * 0.06;
          g.globalAlpha *= 0.45;
          g.fillRect(Math.round(p.cx + Math.cos(a2) * rad), Math.round(p.cy - p.vy * (t - 0.06) + Math.sin(a2) * rad * 0.38), z, z);
          continue;
        }
        case K.RING: {
          if (!draw) continue;
          const z = p.z, rad = 2 + p.s * Math.sqrt(u);
          g.globalAlpha = (1 - u) * 0.9; g.fillStyle = rampAt(p.ramp, u * 0.9 + 0.1);
          const steps = Math.max(12, (rad * 4 / z) | 0), cx = p.x, cy = p.y;
          for (let j = 0; j < steps; j++) { const a = (j / steps) * TAU; g.fillRect(Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad * 0.7), z, z); }
          continue;
        }
      }
    }
    g.globalAlpha = 1;
  }

  _render(dt) {
    const d = this.dyn; if (!d || !this.W) return;
    const g = this.fg, W = this.W, H = this.H, wl = this.wl, sc = this.scene;
    this.t += dt;
    const t = this.t;
    // weather crossfade
    const outdoor = !d.indoor;
    for (let i = 0; i < WKEYS.length; i++) {
      const k = WKEYS[i], target = outdoor && sc.weather === k ? 1 : 0;
      const v = wl[k], step = dt / FADE;
      wl[k] = v < target ? Math.min(target, v + step) : Math.max(target, v - step);
    }
    const cov = wl.rain > wl.fog * 0.9 ? wl.rain : wl.fog * 0.9; // overcast amount
    this.danger += (this.dangerT - this.danger) * Math.min(1, dt * 3);
    // pointer parallax + slow drift
    this.ptx += (this.ptxT - this.ptx) * Math.min(1, dt * 2);
    const pan = d.noPan || this.reduced || this.quality === 'low' ? 0 : Math.sin(t * 0.08) * 0.8 + this.ptx * 1.6;
    for (let i = 0; i < 4; i++) this.off[i] = Math.round(pan * DEPTH[i] * 3);
    // shake
    if (this.shakeAmp > 0.4) {
      this.shakeAmp *= Math.exp(-dt * 9);
      const a = this.shakeAmp;
      this._applyShake(Math.round((Math.random() * 2 - 1) * a), Math.round((Math.random() * 2 - 1) * a));
      this._shaking = true;
    } else if (this._shaking) { this._shaking = false; this.shakeAmp = 0; this._applyShake(0, 0); }

    this._spawnAmbient(dt);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    const o = this.off, L = this.layers;
    // sky
    g.drawImage(L[0], o[0] - M, 0);
    if (d.stars) {
      const st = d.stars;
      for (let i = 0; i < st.length; i += 4) {
        const b = Math.sin(t * 1.3 + st[i + 2]) + Math.sin(t * 0.37 + st[i + 2] * 3);
        const x = st[i] + o[0], y = st[i + 1];
        if (b > 1.2) { g.fillStyle = '#fff8e0'; if (st[i + 3] && b > 1.6) plus(g, x, y, 1); else g.fillRect(x, y, 1, 1); }
        else if (b > -0.6) { g.fillStyle = '#c8c8f0'; g.globalAlpha = 0.7; g.fillRect(x, y, 1, 1); g.globalAlpha = 1; }
      }
    }
    if (d.aurora) this._aurora(g, this.quality === 'low' ? 0 : t, 1 - cov);
    for (let i = 0; i < d.clouds.length; i++) {
      const c = d.clouds[i];
      c.x += c.v * (1 + wl.wind * 4) * dt;
      if (c.x > W + M) c.x = -c.c.width - M;
      g.drawImage(c.c, Math.round(c.x) + o[0], c.y);
    }
    // rain/fog roll a grey sky over the sun, moon and stars
    if (cov > 0.01 && d.overcast) { g.globalAlpha = cov; g.drawImage(d.overcast, o[0] - M, 0); g.globalAlpha = 1; }
    g.drawImage(L[1], o[1] - M, 0);
    this._windows(g, 1, t);
    g.drawImage(L[2], o[2] - M, 0);
    this._windows(g, 2, t);
    this._water(g, 2, t);
    g.drawImage(L[3], o[3] - M, 0);
    this._water(g, 3, t);
    this._windows(g, 3, t);
    // grass blades
    const bl = d.blades, bc = d.bladeCols, ox = o[3];
    if (bl.length) {
      const amp = 0.7 + wl.wind * 2.2, bias = wl.wind * 1.4;
      let ci = -1;
      for (let i = 0; i < bl.length; i += 5) {
        const x = bl[i] + ox, y = bl[i + 1], h = bl[i + 2];
        if (bl[i + 4] !== ci) { ci = bl[i + 4]; g.fillStyle = bc[ci]; }
        const s = Math.sin(t * 1.8 + bl[i] * 0.09 + bl[i + 3] * 0.3) * amp + bias;
        const tip = Math.round((s * h) / 4);
        const low = Math.ceil(h / 2);
        g.fillRect(x, y - low + 1, 1, low);
        if (h - low > 0) {
          const mid = Math.round(tip / 2), up = h - low;
          if (up > 1) { g.fillRect(x + mid, y - low - ((up / 2) | 0) + 1, 1, (up / 2) | 0); g.fillRect(x + tip, y - h + 1, 1, up - ((up / 2) | 0)); }
          else g.fillRect(x + tip, y - h + 1, 1, 1);
        }
      }
    }
    if (d.fire) this._fire(g, t);
    for (let i = 0; i < d.candles.length; i++) {
      const c = d.candles[i], fl = Math.sin(t * 13 + i * 2) + Math.sin(t * 7.1 + i);
      g.fillStyle = '#ffd35c'; g.fillRect(c[0], c[1] + (fl > 1.2 ? 1 : 0), 1, 2 - (fl > 1.2 ? 1 : 0));
      g.fillStyle = '#fff4c0'; g.fillRect(c[0] + (fl < -1 ? 1 : 0), c[1] + 1, 1, 1);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.75 + fl * 0.1;
      g.drawImage(this.halo, c[0] - 6, c[1] - 5);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    if (d.bunting.length) {
      const bu = d.bunting;
      for (let i = 0; i < bu.length; i += 3) {
        const x = bu[i] + ox, y = bu[i + 1], sw = Math.sin(t * 2.2 + i * 0.37) * (0.6 + wl.wind * 1.6) + wl.wind;
        g.fillStyle = bu[i + 2];
        g.fillRect(x, y, 5, 1); g.fillRect(x, y + 1, 5, 1);
        g.fillRect(x + 1 + Math.round(sw * 0.5), y + 2, 3, 1); g.fillRect(x + 1 + Math.round(sw * 0.7), y + 3, 3, 1);
        g.fillRect(x + 2 + Math.round(sw), y + 4, 1, 1);
        g.fillStyle = '#ffffff'; g.globalAlpha = 0.35; g.fillRect(x, y, 2, 1); g.globalAlpha = 1;
      }
    }
    if (d.glow && cov < 0.98) {
      const fl = d.glow.slow ? 0.8 + Math.sin(t * 0.8) * 0.2 : 0.66 + Math.sin(t * 9.3) * 0.08 + Math.sin(t * 14.1) * 0.06 + Math.sin(t * 3.1) * 0.06;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = fl * (d.glow.a || 1) * (1 - cov);
      g.drawImage(d.glow.c, Math.round(d.glow.x - d.glow.c.width / 2), Math.round(d.glow.y - d.glow.c.height / 2));
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    // light rays: scene rays and/or sunny weather
    const rayA = (d.rays * 0.065 + wl.sun * 0.12) * (1 - cov);
    if (rayA > 0.005) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = rayA * (0.8 + 0.2 * Math.sin(t * 0.7));
      g.drawImage(d.rayCanvas, o[1], 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    this._pool(g, this.amb, dt, true);
    this._weather(g, t);
    this._pool(g, this.bur, dt, true);
    if (this.danger > 0.01 && this.vign) {
      const calm = this.reduced || this.quality === 'low';
      const pulse = calm ? 0.85 : 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * (2.2 + this.danger * 2.2)));
      g.globalAlpha = Math.min(1, this.danger * pulse * 1.1); g.drawImage(this.vign, 0, 0); g.globalAlpha = 1;
    }
    if (this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt / FADE);
      g.globalAlpha = this.fade * this.fade * (3 - 2 * this.fade);
      g.drawImage(this.prev, 0, 0);
      g.globalAlpha = 1;
    }
    // blit (with shake offset and drought heat shimmer)
    const m = this.ctx, sx = this.sx, sy = this.sy;
    m.drawImage(this.fb, sx, sy);
    const shim = Math.max(wl.drought, this.quality === 'low' ? 0 : d.shimmer * (1 - cov));
    if (shim > 0.02) {
      const hz = d.horizon, y0 = Math.max(0, hz - 16);
      for (let y = y0; y < H; y += 2) {
        const k = 1.3 - 0.8 * clamp((y - hz) / Math.max(1, H - hz), 0, 1);
        const off = Math.round(Math.sin(y * 0.45 + t * 7) * shim * k * 1.3);
        if (off) m.drawImage(this.fb, 0, y, W, 2, off + sx, y + sy, W, 2);
      }
    }
    if (dt > 0) this._drawn = true; // only crossfade from frames the player actually saw
  }

  _windows(g, layer, t) {
    const ws = this.dyn.windows; if (!ws.length) return;
    const ox = this.off[layer];
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w.layer !== layer) continue;
      const fl = 0.75 + 0.15 * Math.sin(t * 2.3 + i * 1.7) + 0.1 * Math.sin(t * 7.7 + i);
      g.globalAlpha = fl * 0.5; g.fillStyle = '#fff2b0'; g.fillRect(w.x + ox, w.y, w.w, w.h);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = fl * (w.tiny ? 0.5 : 0.9);
      if (w.big) g.drawImage(this.halo2, Math.round(w.x + ox + w.w / 2 - 12), Math.round(w.y + w.h / 2 - 12));
      else g.drawImage(this.halo, Math.round(w.x + ox + w.w / 2 - 6), Math.round(w.y + w.h / 2 - 6));
      g.globalCompositeOperation = 'source-over';
    }
    g.globalAlpha = 1;
  }

  _water(g, layer, t) {
    const wa = this.dyn.water; if (!wa.length) return;
    const ox = this.off[layer];
    g.fillStyle = this.dyn.waterHi;
    const frozen = this.dyn.frozen;
    const thr = frozen ? 1.85 : 1.45;
    for (let i = 0; i < wa.length; i += 3) {
      if (wa[i + 2] !== layer) continue;
      const x = wa[i], y = wa[i + 1];
      const v = Math.sin(x * 0.55 + y * 1.9 - t * 2.4) + Math.sin(x * 0.21 - y * 0.7 + t * 1.3);
      if (v > thr) g.fillRect(x + ox, y, v > thr + 0.25 ? 2 : 1, 1);
    }
  }

  _fire(g, t) {
    const f = this.dyn.fire, hs = this.fireH, w = Math.min(64, f.w);
    for (let i = 0; i < w; i++) {
      const e = 1 - Math.abs(((i + 0.5) / w) * 2 - 1);
      const n = 0.55 + 0.22 * Math.sin(i * 1.7 + t * 9.3) + 0.18 * Math.sin(i * 0.63 - t * 13.1 + Math.sin(t * 3 + i)) + 0.08 * Math.sin(t * 23 + i * 3.1);
      hs[i] = Math.max(1, f.h * Math.pow(e, 0.7) * n);
    }
    const cols = ['#a8321e', '#e0662a', '#ffb23a', '#fff0b0'], fr = [1, 0.74, 0.46, 0.2];
    for (let c = 0; c < 4; c++) {
      g.fillStyle = cols[c];
      for (let i = 0; i < w; i++) {
        const h = Math.round(hs[i] * fr[c]);
        if (h <= 0) continue;
        if (c === 3 && (i < w * 0.25 || i > w * 0.75)) continue;
        g.fillRect(f.x + i, f.y - h + 1, 1, h);
      }
    }
  }

  _weather(g, t) {
    const wl = this.wl, W = this.W, H = this.H, d = this.dyn;
    if (wl.rain > 0.01) { g.globalAlpha = 0.22 * wl.rain; g.fillStyle = '#2e3a5c'; g.fillRect(0, 0, W, H); }
    if (wl.drought > 0.01) {
      g.globalAlpha = 0.16 * wl.drought; g.fillStyle = '#fff2c8'; g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.1 * wl.drought; g.fillStyle = '#ff9a40'; g.fillRect(0, 0, W, H);
    }
    if (wl.sun > 0.01) { g.globalAlpha = 0.05 * wl.sun; g.fillStyle = '#fff4c0'; g.fillRect(0, 0, W, H); }
    if (wl.frost > 0.01) {
      g.globalAlpha = 0.14 * wl.frost; g.fillStyle = '#a8d4ff'; g.fillRect(0, 0, W, H);
      g.globalAlpha = 0.9 * wl.frost; g.drawImage(this.frostEdge, 0, 0);
    }
    if (wl.fog > 0.01) {
      g.globalAlpha = 0.22 * wl.fog; g.fillStyle = '#e6ecf0'; g.fillRect(0, 0, W, H);
      const hz = d.horizon, ys = [hz - H * 0.12, hz + H * 0.02, hz + (H - hz) * 0.45];
      for (let k = 0; k < this.fog.length; k++) {
        const c = this.fog[k], cw = c.width;
        const x = -(((t * (3 + k * 2.5)) % cw + cw) % cw);
        g.globalAlpha = (0.42 + k * 0.1) * wl.fog;
        g.drawImage(c, Math.round(x), Math.round(ys[k] - c.height / 2));
        g.drawImage(c, Math.round(x + cw), Math.round(ys[k] - c.height / 2));
      }
    }
    g.globalAlpha = 1;
  }

  // Aurora curtains: per-column height/brightness into scratch arrays, then three colour passes.
  _aurora(g, t, vis) {
    const a = this.dyn.aurora, W = this.W, ox = this.off[0], S = this.aurS, B = this.aurB;
    if (vis < 0.02 || S.length < W * 2) return;
    for (let r = 0; r < 2; r++) {
      const ph = r * 2.1, o = r * W, len0 = a.span * (r ? 0.5 : 0.8), y0 = a.y + r * a.span * 0.3;
      for (let x = 0; x < W; x++) {
        S[o + x] = y0 + len0 + Math.sin(x * 0.03 + t * 0.25 + ph) * a.amp + Math.sin(x * 0.011 - t * 0.13 + ph * 2) * a.amp * 1.3;
        B[o + x] = clamp(0.5 + 0.5 * Math.sin(x * 0.045 - t * 0.7 + ph) * Math.sin(x * 0.013 + t * 0.21 + ph), 0, 1) * vis;
      }
    }
    const bands = AUR_BANDS;
    for (let bi = 0; bi < 3; bi++) {
      const band = bands[bi];
      g.fillStyle = band[0];
      for (let r = 0; r < 2; r++) {
        const o = r * W, len0 = a.span * (r ? 0.5 : 0.8);
        for (let x = 0; x < W; x++) {
          const b = B[o + x]; if (b < 0.08) continue;
          const len = len0 * (0.55 + 0.45 * b), bot = S[o + x];
          const y1 = Math.round(bot - len * band[3]), y0 = Math.round(bot - len * band[2]);
          if (y1 <= y0) continue;
          g.globalAlpha = band[1] * b; g.fillRect(x + ox, y0, 1, y1 - y0);
        }
      }
    }
    g.globalAlpha = 1;
  }

  // ---- top-layer overlay: transitions + flash ----
  _ovEnsure() {
    if (typeof document === 'undefined' || !document.body) return false;
    if (this._dirtySize) { this._dirtySize = false; if (this._measure()) this._dirtyScene = true; }
    if (!this.W) return false;
    if (!this._ov) {
      const c = document.createElement('canvas'), st = c.style;
      st.position = 'fixed'; st.left = '0'; st.top = '0'; st.zIndex = '200'; st.pointerEvents = 'none';
      st.imageRendering = 'pixelated'; st.display = 'none';
      c.setAttribute('aria-hidden', 'true'); c.className = 'scenery-cover';
      document.body.appendChild(c);
      this._ov = c; this._og = c.getContext('2d');
    }
    const c = this._ov;
    if (c.width !== this.W || c.height !== this.H) {
      c.width = this.W; c.height = this.H; this._og.imageSmoothingEnabled = false;
      this._ovImg = this._og.createImageData(this.W, this.H);
      this._ovPix = new Uint32Array(this._ovImg.data.buffer);
      this._trBaked = {};
    }
    c.style.width = this.W * this.px + 'px'; c.style.height = this.H * this.px + 'px';
    return true;
  }
  _trBake(type) {
    const key = type === 'leaves' ? type + this.scene.season : type;
    return this._trBaked[key] || (this._trBaked[key] = bakeTransition(type, this.W, this.H, this.scene.season));
  }
  _trFlush() { const r = this._tr.res; this._tr.res = []; for (let i = 0; i < r.length; i++) r[i](); }
  // Drive by elapsed time from both rAF and a timer, so a throttled tab still finishes; plus a deadline.
  _ovKick(ms) {
    clearTimeout(this._ovDeadline);
    this._ovDeadline = setTimeout(this._ovTickFn, ms + 60);
    this._ovSchedule();
  }
  _ovSchedule() {
    if (this._ovPending) return;
    this._ovPending = true;
    this._ovRaf = requestAnimationFrame(this._ovTickFn);
    this._ovTo = setTimeout(this._ovTickFn, 34);
  }
  _ovTick() {
    this._ovPending = false; cancelAnimationFrame(this._ovRaf); clearTimeout(this._ovTo);
    if (!this._ov) return;
    const now = performance.now(), tr = this._tr, f = this._fl;
    let busy = false;
    if (tr.state === 'covering' || tr.state === 'uncovering') {
      const p = clamp((now - tr.t0) / tr.dur, 0, 1);
      this._coverFrame(tr.type, p * p * (3 - 2 * p), tr.state === 'covering' ? 'in' : 'out', now);
      if (p >= 1) {
        if (tr.state === 'covering') tr.state = 'covered';
        else { tr.state = 'idle'; this._ov.style.pointerEvents = 'none'; this._og.clearRect(0, 0, this.W, this.H); }
        this._trFlush();
      } else busy = true;
    } else if (tr.state === 'covered') this._coverFrame(tr.type, 1, 'in', now);
    else this._og.clearRect(0, 0, this.W, this.H);
    if (f.on) {
      const e = (now - f.t0) / f.ms;
      if (e >= 1) f.on = false;
      else {
        const og = this._og;
        og.globalAlpha = f.peak * (1 - e) * (1 - e); og.fillStyle = f.c; og.fillRect(0, 0, this.W, this.H); og.globalAlpha = 1;
        busy = true;
      }
    }
    if (busy) this._ovSchedule();
    else { clearTimeout(this._ovDeadline); if (tr.state === 'idle') this._ov.style.display = 'none'; }
  }
  // Renders one transition frame. p: 0..1 progress of this phase ('in' covers, 'out' reveals).
  _coverFrame(type, p, phase = 'in', now = performance.now()) {
    if (!this._ovEnsure()) return;
    this._ov.style.display = 'block';
    const B = this._trBake(type), W = this.W, H = this.H, thr = B.thr, src = B.pix, out = this._ovPix;
    const E = B.edgeW, Sh = B.shW, span = 1 + E + Sh, ec = B.edgeC, et = B.edgeT, ne = ec.length, sc = B.shC;
    const below = phase === 'in' || B.lifo;
    const f = phase === 'in' ? p * span - Sh : B.lifo ? (1 - p) * span - Sh : p * span - E;
    for (let y = 0, i = 0; y < H; y++) {
      const by = (y & 3) * 4;
      for (let x = 0; x < W; x++, i++) {
        const dd = below ? f - thr[i] : thr[i] - f; // >= 0: covered, and how deep behind the front
        if (dd >= 0) {
          let c = src[i];
          if (dd < E) for (let j = 0; j < ne; j++) if (dd < et[j]) { c = ec[j]; break; }
          out[i] = c;
        } else if (-dd < Sh && BAY[by + (x & 3)] < (1 + dd / Sh) * 0.85) out[i] = sc;
        else out[i] = 0;
      }
    }
    this._og.putImageData(this._ovImg, 0, 0);
    if (B.extra) B.extra(this, B, f, p, phase, now);
  }
}
