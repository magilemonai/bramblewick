// Characters A: farmer, almanac, villager portraits, spring + summer critters and bosses.
// Sprites are painted with a tiny procedural brush kit (shaded ellipses, tubes, polygons) and
// hand-placed detail pixels, then baked to the row/palette format. DOM-free.
import { registerSprites, PAL } from '../pixel.js';

// ---------------------------------------------------------------- brush kit
const LIGHT = (() => { const v = [-0.55, -0.68, 0.48]; const m = Math.hypot(...v); return v.map(n => n / m); })();
const TH = { 2: [0.3], 3: [0.22, 0.74], 4: [0.16, 0.58, 0.86], 5: [0.05, 0.3, 0.62, 0.86] };
const pick = (d, n, t = TH[n]) => { let i = 0; while (i < t.length && d > t[i]) i++; return i; };
const lit = (nx, ny) => { const r = nx * nx + ny * ny; const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r))); return LIGHT[0] * nx + LIGHT[1] * ny + LIGHT[2] * nz; };

function canvas(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill(null));
  const c = { w, h, g, clip: null, noOut: new Set(), ox: 0, oy: 0 };
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  // c.at(dx, dy): integer offset applied to everything painted until reset (used to pose body parts)
  c.at = (dx = 0, dy = 0) => { c.ox = dx; c.oy = dy; };
  c.get = (x, y) => { x += c.ox; y += c.oy; return inb(x, y) ? g[y][x] : null; };
  c.put = (x, y, col) => { x += c.ox; y += c.oy; if (inb(x, y)) g[y][x] = col; };
  c.set = (x, y, col) => {
    x = Math.round(x) + c.ox; y = Math.round(y) + c.oy;
    if (!inb(x, y) || col === undefined) return;
    if (c.clip && !c.clip(g[y][x], x, y)) return;
    g[y][x] = col;
  };
  c.px = (list, col) => { for (const [x, y] of list) c.set(x, y, col); };
  c.rect = (x, y, rw, rh, col) => { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) c.set(x + i, y + j, col); };
  c.hline = (x0, x1, y, col) => { for (let x = x0; x <= x1; x++) c.set(x, y, col); };
  c.vline = (x, y0, y1, col) => { for (let y = y0; y <= y1; y++) c.set(x, y, col); };
  c.each = (x0, y0, x1, y1, fn) => { for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) fn(x, y); };
  c.ell = (cx, cy, rx, ry, col) => c.each(cx - rx - 1, cy - ry - 1, cx + rx, cy + ry, (x, y) => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) c.set(x, y, col);
  });
  // Sphere-lit ellipse. ramp dark->light. t = custom thresholds.
  c.sh = (cx, cy, rx, ry, ramp, t) => c.each(cx - rx - 1, cy - ry - 1, cx + rx, cy + ry, (x, y) => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) c.set(x, y, ramp[pick(lit(dx, dy), ramp.length, t)]);
  });
  const inPoly = (pts, px, py) => {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  };
  const bbox = pts => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  c.poly = (pts, col) => { const [x0, y0, x1, y1] = bbox(pts); c.each(x0 - 1, y0 - 1, x1, y1, (x, y) => { if (inPoly(pts, x + 0.5, y + 0.5)) c.set(x, y, col); }); };
  c.shPoly = (pts, ramp, t) => {
    const [x0, y0, x1, y1] = bbox(pts); const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2 || 1, ry = (y1 - y0) / 2 || 1;
    c.each(x0 - 1, y0 - 1, x1, y1, (x, y) => { if (inPoly(pts, x + 0.5, y + 0.5)) c.set(x, y, ramp[pick(lit((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry), ramp.length, t)]); });
  };
  // Shaded tube along a polyline, radius r (can taper: r0 -> r1).
  c.tube = (pts, r0, ramp, r1 = r0, t) => {
    const [x0, y0, x1, y1] = bbox(pts); const R = Math.max(r0, r1);
    const segs = []; let total = 0;
    for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push([pts[i], pts[i + 1], total, L]); total += L; }
    c.each(x0 - R - 1, y0 - R - 1, x1 + R, y1 + R, (x, y) => {
      const px = x + 0.5, py = y + 0.5; let best = null;
      for (const [a, b, s0, L] of segs) {
        const vx = b[0] - a[0], vy = b[1] - a[1]; let u = L ? ((px - a[0]) * vx + (py - a[1]) * vy) / (L * L) : 0; u = Math.max(0, Math.min(1, u));
        const qx = a[0] + vx * u, qy = a[1] + vy * u, d = Math.hypot(px - qx, py - qy);
        if (!best || d < best.d) best = { d, qx, qy, s: (s0 + u * L) / (total || 1) };
      }
      const r = r0 + (r1 - r0) * best.s;
      if (best.d <= r) c.set(x, y, ramp[pick(lit((px - best.qx) / r, (py - best.qy) / r), ramp.length, t)]);
    });
  };
  c.line = (x0, y0, x1, y1, col) => {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (;;) { c.set(x0, y0, col); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  };
  c.path = (pts, col) => { for (let i = 0; i < pts.length - 1; i++) c.line(...pts[i], ...pts[i + 1], col); };
  // Restrict painting to pixels already filled (optionally with specific colours).
  c.onto = (fn, cols) => { const prev = c.clip; c.clip = cols ? (cur => cols.includes(cur)) : (cur => cur !== null); fn(); c.clip = prev; };
  c.behind = fn => { const prev = c.clip; c.clip = cur => cur === null; fn(); c.clip = prev; };
  c.recolor = (from, to) => { for (const row of g) for (let x = 0; x < w; x++) { const i = from.indexOf(row[x]); if (i >= 0) row[x] = to[Math.min(i, to.length - 1)]; } };
  c.mirror = () => { for (const row of g) for (let x = 0; x < w / 2; x++) row[w - 1 - x] = row[x]; };
  c.outline = (col = PAL.ink) => {
    const src = g.map(r => r.slice());
    const solid = (x, y) => inb(x, y) && src[y][x] !== null && !c.noOut.has(src[y][x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y][x] !== null) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) g[y][x] = col;
    }
  };
  c.bake = () => {
    const keys = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{};:,<>/?|~`\'"' + Array.from({ length: 160 }, (_, i) => String.fromCharCode(0xc0 + i)).join('');
    const map = new Map(); const palette = {};
    const rows = g.map(r => r.map(col => {
      if (col === null) return '.';
      if (!map.has(col)) { const k = keys[map.size]; map.set(col, k); palette[k] = col; }
      return map.get(col);
    }).join(''));
    return { palette, rows };
  };
  return c;
}

// ---------------------------------------------------------------- shared ramps
const INK = PAL.ink, INK2 = PAL.inkSoft, WHITE = '#ffffff';
const GLOAM = ['#2f2a3d', '#3a3448', '#5b5470', '#7a7194'];
const GLOW = { rim: '#8a7cc4', mid: PAL.gloomGlow, core: '#d8ccff', hot: '#f6f0ff' };
const SKIN = {
  fair: ['#c98567', '#f2c29b', '#fcdcbf'],
  rosy: ['#c77a64', '#eab094', '#f7cfb4'],
  olive: ['#a8744c', '#d6a477', '#ecc49c'],
  tan: ['#8f5a3e', '#b97c55', '#d49b70'],
  brown: ['#5e3826', '#80503a', '#a06a4c'],
  deep: ['#3f261c', '#5a3a2a', '#7a5038'],
  pale: ['#a8948a', '#d8c4b4', '#efe0d2'],
};
const BLUSH = '#e8837a';
const METAL = ['#4d4a52', '#77737c', '#a9a6ae', '#dedce4'];
const WOOD = [PAL.woodDark, PAL.wood, PAL.woodLight, '#d9a877'];
const LEAF = ['#2f5e2e', PAL.leafDark, PAL.leaf, PAL.leafLight];
const BLOSSOM = ['#c2587a', PAL.rose, PAL.pink, '#ffd0dc'];

// Glowing gloam eye, w x h, with a spark. brow: -1 = angry brow sloping down toward the left (critter faces left)
function gEye(c, x, y, w = 2, h = 2, brow = -1) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.set(x + i, y + j, GLOW.mid);
  if (w >= 3 && h >= 3) { for (let j = 1; j < h; j++) for (let i = 1; i < w; i++) c.set(x + i - (i === w - 1 ? 1 : 0), y + j, GLOW.core); c.hline(x, x + w - 1, y + h - 1, GLOW.mid); }
  c.set(x, y, GLOW.hot);
  if (brow) {
    // grumpy lid: top row of the eye goes dark on the inner side, heavy ink brow above
    if (brow < 0) { c.line(x - 1, y, x + w, y - 1 - (w > 2 ? 1 : 0), INK); c.set(x, y + 0, INK); c.set(x, y + 1, GLOW.hot); }
    else { c.line(x + w, y, x - 1, y - 1 - (w > 2 ? 1 : 0), INK); c.set(x + w - 1, y, INK); c.set(x + w - 2 < x ? x : x + w - 2, y + 1, GLOW.hot); }
  }
}
// Colour mixing for stains.
const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('') + (a.length === 9 ? a.slice(7) : ''); };
// Gloam patch: a grey-violet stain soaked into existing pixels (keeps the form shading), with a glow speck.
function patch(c, cx, cy, rx, ry, specks = true) {
  c.each(cx - rx - 1, cy - ry - 1, cx + rx, cy + ry, (x, y) => {
    const cur = c.get(x, y); if (!cur || cur === INK) return;
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, r = dx * dx + dy * dy;
    if (r > 1) return;
    const target = lit(dx, dy) < 0.35 ? GLOAM[1] : GLOAM[2];
    c.put(x, y, mix(cur, target, r > 0.6 ? 0.5 : 0.8));
  });
  if (specks && rx > 1.5) { c.set(Math.round(cx - rx * 0.35), Math.round(cy - ry * 0.2), GLOW.mid); c.set(Math.round(cx + rx * 0.3), Math.round(cy + ry * 0.1), GLOAM[3]); }
}
// Gloam drip hanging from (x,y) downward.
function drip(c, x, y, len) {
  for (let i = 0; i < len; i++) c.set(x, y + i, i < len - 1 ? GLOAM[2] : GLOAM[1]);
  c.set(x, y + len, GLOAM[1]); c.set(x + 1, y + len, GLOAM[1]); c.set(x, y + len - 1 > y ? y + len - 1 : y, GLOAM[2]);
  c.set(x, y + len, GLOAM[2]);
}
const bake = (c, extra = {}) => ({ ...c.bake(), ...extra });

// ---------------------------------------------------------------- animation helpers
// Frames: pose 'base' | 'idle' (<id>~1) | 'atk' (<id>~atk) | 'hurt' (<id>~hurt). Same size + ground row as base.
// Remove row y and drop everything above it by n px (breathing bob; the ground row never moves).
function squash(c, y, n = 1) {
  for (let k = 0; k < n; k++) { for (let r = y; r > 0; r--) c.g[r] = c.g[r - 1]; c.g[0] = Array(c.w).fill(null); }
}
function shiftRow(c, y, s) {
  const row = Array(c.w).fill(null);
  c.g[y].forEach((v, x) => { if (v !== null && x + s >= 0 && x + s < c.w) row[x + s] = v; });
  c.g[y] = row;
}
// Lean everything above row y0: dir -1 = forward (toward the left-facing critter's target), +1 = back.
// k = px per row; scaled down so nothing leaves the canvas (1px kept for the outline).
function shear(c, k, y0, dir) {
  let f = 1;
  for (let y = 0; y < y0; y++) {
    const s = Math.round((y0 - y) * k); if (!s) continue;
    const xs = []; c.g[y].forEach((v, x) => { if (v !== null) xs.push(x); }); if (!xs.length) continue;
    const room = dir < 0 ? Math.min(...xs) - 1 : c.w - 2 - Math.max(...xs);
    f = Math.min(f, Math.max(0, room) / s);
  }
  for (let y = 0; y < y0; y++) { const s = Math.floor(Math.round((y0 - y) * k) * f + 1e-9); if (s) shiftRow(c, y, s * dir); }
}
// Slide rows y0..y1 sideways by dx.
function nudge(c, dx, y0 = 0, y1 = c.h - 1) { for (let y = y0; y <= y1; y++) shiftRow(c, y, dx); }
// Hurt squint: '>' (dir 1) or '<' (dir -1) in an eye box at x,y of size s.
function squint(c, x, y, s = 3, dir = 1) {
  const pts = s >= 3 ? [[0, 0], [1, 1], [2, 1], [0, 2]] : [[0, 0], [1, 1], [0, 2]];
  for (const [i, j] of pts) c.set(dir > 0 ? x + i : x + s - 1 - i, y + j, INK);
}
// Little burst of gloam wisps knocked loose on a hit (drawn after the outline, no ink).
function poof(c, x, y, big = false) {
  c.at();
  const blobs = big ? [[0, 2], [3, 0], [6, 2], [2, 4]] : [[0, 1], [3, 0], [5, 2]];
  for (const [i, j] of blobs) { c.rect(x + i, y + j, 2, 2, GLOAM[2]); c.set(x + i, y + j, GLOAM[3]); c.set(x + i + 1, y + j + 1, GLOAM[1]); }
  c.set(x + 2, y + 3, GLOW.mid); c.set(x + (big ? 8 : 7), y, GLOW.mid); c.set(x + 5, y - 1, GLOW.hot); c.set(x - 1, y, GLOW.core);
}
// Impact star (white core, cream arms).
function star(c, x, y) { c.at(); c.set(x, y, WHITE); for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + i, y + j, '#fff4d6'); }
// Motion streaks: short light dashes.
function streaks(c, list, col = '#fff4d6') { c.at(); for (const [x, y, len] of list) c.hline(x, x + len - 1, y, col); }
const framesOf = (id, fn) => ({ [id]: fn('base'), [id + '~1']: fn('idle'), [id + '~atk']: fn('atk'), [id + '~hurt']: fn('hurt') });

// ---------------------------------------------------------------- farmer
function farmer(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(32, 32);
  const STRAW = ['#a8742a', '#d9a441', '#f0c865', '#fbe39a'];
  const SK = SKIN.fair;
  const HAIR = ['#5e3b26', '#8a5a3b', '#b07a4c'];
  const DENIM = ['#2c4870', '#3f6699', '#5b88bd', '#86ade0'];
  const SHIRT = ['#d9bf85', '#f3e2b3', '#fff4d6'];
  const RED = ['#8f2a2a', '#d6453d', '#f07a5e'];
  const BOOT = ['#3e2718', '#5e3b26', '#7e5436'];
  const POLE = [PAL.woodDark, PAL.wood, PAL.woodLight];
  // back arm
  if (A) { c.tube([[10, 20], [12, 17], [16, 15]], 1.4, SHIRT); }
  else { c.tube([[10, 20], [9, 24]], 1.4, SHIRT); c.sh(9.5, 25, 1.6, 1.4, SK); }
  // legs + boots
  c.rect(11, 25, 10, 4, DENIM[1]);
  c.vline(15, 27, 28, DENIM[0]); c.hline(11, 14, 28, DENIM[0]);
  c.hline(16, 20, 28, DENIM[0]); c.set(20, 26, DENIM[0]); c.set(20, 27, DENIM[0]);
  c.sh(12.5, 29.6, 2.8, 1.5, BOOT); c.sh(18.8, 29.6, 3.2, 1.5, BOOT);
  // torso (shirt) + overalls
  c.shPoly([[10, 19], [22, 19], [22, 26], [10, 26]], SHIRT);
  c.shPoly([[12, 21], [20, 21], [21, 27], [11, 27]], DENIM);
  c.vline(12, 19, 21, DENIM[1]); c.vline(19, 19, 21, DENIM[1]);
  c.set(12, 22, PAL.gold); c.set(19, 22, PAL.gold);
  c.hline(14, 17, 23, DENIM[3]); c.hline(14, 17, 24, DENIM[2]); c.set(13, 23, DENIM[0]); c.set(18, 23, DENIM[0]); // bib pocket
  if (A) {
    // wind-up: hoe hoisted over the shoulder, blade high and forward, both hands on the haft
    c.tube([[20, 20], [22, 17]], 1.4, SHIRT);
    c.tube([[10, 25], [21, 14], [27, 5]], 1, POLE);
    c.shPoly([[26, 2], [31, 5], [31, 11], [29, 10], [29, 6], [26, 4]], METAL);
    c.set(27, 2, METAL[3]); c.set(28, 3, METAL[3]); c.set(26, 3, METAL[0]);
    c.sh(16.5, 15.6, 1.7, 1.6, SK); c.sh(22.5, 16.5, 1.7, 1.6, SK);
  } else {
    // front arm reaching to the hoe
    c.tube([[21, 20], [23, 22]], 1.4, SHIRT);
    if (H) { c.tube([[26.5, 5], [25.5, 30]], 1, POLE); c.shPoly([[25, 4], [31, 4], [31, 10], [29, 9], [29, 6], [25, 6]], METAL); c.hline(26, 30, 4, METAL[3]); }
    else { c.tube([[25.5, 4], [25.5, 30]], 1, POLE); c.shPoly([[24, 3], [30, 3], [30, 9], [28, 8], [28, 5], [24, 5]], METAL); c.hline(25, 29, 3, METAL[3]); c.set(24, 4, METAL[0]); c.set(25, 4, METAL[0]); }
    c.sh(24, 22.5, 1.7, 1.6, SK);
    c.set(23, 21, SK[2]);
  }
  // hair (back of head, left)
  c.sh(12, 13.5, 3.6, 4.2, HAIR);
  // face
  c.sh(16.5, 14.2, 6.4, 5.4, SK, [-0.55, 0.93]);
  c.set(11, 14, SK[0]); c.set(11, 15, SK[0]); // ear
  // hair fringe under brim
  c.hline(14, 21, 10, HAIR[1]); c.hline(15, 19, 11, HAIR[1]); c.set(14, 11, HAIR[0]); c.set(20, 11, HAIR[2]); c.set(21, 11, HAIR[1]);
  if (H) {
    // squeezed eyes, little "oof" mouth, sweat drop
    squint(c, 15, 12, 2, 1); squint(c, 19, 12, 2, -1);
    c.hline(14, 15, 15, BLUSH); c.hline(20, 21, 15, BLUSH);
    c.rect(17, 16, 2, 2, '#8a3a30'); c.set(17, 16, '#5a2420');
  } else {
    // eyes (2x2, spark top-left)
    for (const ex of [15, 19]) { c.rect(ex, 13, 2, 2, INK); c.set(ex, 13, WHITE); }
    c.hline(14, 15, 15, BLUSH); c.hline(20, 21, 15, BLUSH);
    if (A) { c.line(14, 11, 16, 12, INK); c.line(19, 12, 21, 11, INK); c.hline(17, 19, 16, '#b85a50'); } // determined
    else { c.set(18, 16, '#b85a50'); c.set(19, 16, '#b85a50'); c.set(17, 15, SK[0]); } // smile
  }
  c.set(22, 14, SK[0]); // nose shadow
  // neckerchief
  c.hline(12, 20, 18, RED[1]); c.hline(11, 21, 19, RED[1]);
  c.set(12, 19, RED[0]); c.set(21, 19, RED[0]); c.hline(13, 19, 18, RED[2]);
  if (I) { c.sh(18.5, 20.8, 1.6, 1.4, RED); c.set(18, 22, RED[1]); c.set(17, 22, RED[0]); } // knot tail flicks
  else { c.sh(19.5, 20.5, 1.6, 1.4, RED); c.set(19, 22, RED[1]); c.set(20, 22, RED[0]); }
  c.set(15, 19, '#fff4d6'); c.set(17, 19, '#fff4d6'); // polka dots
  // hat (hops up on a hit)
  if (H) c.at(-1, -2);
  c.sh(15.6, 6.6, 5.2, 3.8, STRAW);
  c.onto(() => { c.hline(10, 21, 7, RED[1]); c.hline(10, 21, 8, RED[0]); }, STRAW);
  c.sh(16, 9.6, 9.6, 2.1, STRAW, [0.05, 0.5, 0.9]);
  c.hline(8, 23, 10, STRAW[0]);
  // straw weave ticks
  for (const [x, y] of [[13, 4], [17, 5], [12, 6], [19, 6], [9, 9], [13, 9], [22, 9], [18, 9]]) c.set(x, y, STRAW[0]);
  if (I) { c.set(21, 6, PAL.leafLight); c.set(22, 6, PAL.leaf); c.set(23, 5, PAL.leafDark); } // sprig sways
  else { c.set(21, 6, PAL.leafLight); c.set(22, 5, PAL.leaf); c.set(21, 5, PAL.leafDark); } // sprig in band
  c.at();
  if (I) squash(c, 24);
  if (A) shear(c, 0.1, 27, 1);
  if (H) shear(c, 0.12, 27, -1);
  c.outline();
  if (A) streaks(c, [[21, 1, 3], [18, 3, 2]]);
  if (H) { c.set(8, 11, PAL.sky); c.set(8, 12, PAL.skyDeep); c.set(7, 12, PAL.sky); star(c, 29, 16); }
  return bake(c);
}

// ---------------------------------------------------------------- almanac
function almanac() {
  const c = canvas(24, 24);
  const COVER = ['#3f5f2a', '#56733a', '#6f9448', '#9cc26a'];
  const PAGES = ['#cdb07a', '#f3e2b3', '#fff4d6'];
  // page block (right + bottom edges)
  c.rect(5, 4, 15, 16, PAGES[1]);
  for (let y = 5; y < 20; y += 2) c.hline(18, 19, y, PAGES[0]);
  c.hline(6, 19, 19, PAGES[0]);
  // cover
  c.shPoly([[3, 3], [18, 3], [18, 18], [3, 18]], COVER);
  c.rect(3, 3, 2, 16, '#3a5226'); c.vline(5, 3, 18, COVER[0]); // spine
  c.set(4, 5, '#6f9448'); c.set(4, 9, '#6f9448'); c.set(4, 13, '#6f9448'); // spine bands
  // gold corners
  c.px([[17, 18], [16, 18], [17, 17], [6, 3], [7, 3], [6, 4]], PAL.gold);
  // torn top-right corner: bite out and show ragged pages
  for (const [x, y] of [[15, 3], [16, 3], [17, 3], [18, 3], [19, 3], [16, 4], [17, 4], [18, 4], [19, 4], [18, 5], [19, 5], [19, 6], [17, 5]]) c.g[y][x] = null;
  c.px([[15, 4], [16, 5], [17, 6], [18, 6], [18, 7]], PAGES[2]);
  c.px([[14, 3], [15, 3]], COVER[3]);
  // emblem: little sun-leaf
  c.px([[11, 6], [10, 7], [11, 7], [12, 7], [11, 8]], PAL.gold); c.set(11, 7, PAL.sun);
  // face
  for (const ex of [8, 13]) { c.rect(ex, 10, 2, 3, INK); c.set(ex, 10, WHITE); c.set(ex + 1, 11, '#3b4a6b'); }
  c.hline(7, 8, 13, BLUSH); c.hline(14, 15, 13, BLUSH);
  c.px([[10, 14], [11, 15], [12, 14]], INK);
  // ribbon bookmark
  c.vline(13, 19, 21, PAL.red); c.vline(14, 19, 20, '#a8302c');
  c.set(12, 22, PAL.red); c.set(14, 22, PAL.red); c.set(13, 21, '#a8302c');
  c.outline();
  return bake(c);
}

// ---------------------------------------------------------------- villager portraits
function head(c, sk, { cx = 16, cy = 14.5, rx = 6.6, ry = 7, ears = true } = {}) {
  if (ears) { c.sh(cx - rx - 0.3, cy + 0.8, 1.4, 1.8, sk); c.sh(cx + rx + 0.3, cy + 0.8, 1.4, 1.8, sk); }
  c.sh(cx, cy, rx, ry, sk, [-0.15, 0.9]);
}
function eyes(c, y, lx = 12, rx = 18, h = 2, iris = INK) {
  for (const ex of [lx, rx]) { c.rect(ex, y, 2, h, iris); c.set(ex, y, WHITE); if (iris !== INK) c.set(ex + 1, y + h - 1, INK); }
}
function shoulders(c, ramp, cy = 31, rx = 14, ry = 8.5) { c.sh(16, cy, rx, ry, ramp); }

function vil_odile() {
  const c = canvas(32, 32);
  const SK = SKIN.tan, COAT = ['#1c2a44', '#2a3d5e', '#3c557c', '#5a76a0'], HAIR = ['#8e8a9a', '#c4c2cc', '#eeeef2'];
  shoulders(c, COAT);
  c.rect(13, 21, 6, 3, SK[0]);
  // collar + scarf
  c.shPoly([[9, 24], [16, 27], [23, 24], [23, 26], [16, 30], [9, 26]], ['#8a2f2a', PAL.red, '#ea6a52']);
  c.px([[12, 29], [20, 29], [12, 31], [20, 31]], PAL.gold); c.set(12, 29, PAL.sun);
  head(c, SK);
  // grey hair bun at sides
  c.sh(9.6, 13, 2.4, 3.2, HAIR); c.sh(22.4, 13, 2.4, 3.2, HAIR);
  c.onto(() => c.sh(16, 14.5, 6.6, 7, SK, [-0.15, 0.9]), [HAIR[0], HAIR[1], HAIR[2]].slice(0, 0));
  // captain's cap
  c.sh(16, 7.5, 8, 4.2, COAT);
  c.hline(8, 24, 9, '#e8e4d8'); c.hline(8, 24, 10, '#c8c2b0'); // white band
  c.shPoly([[8, 11], [24, 11], [22, 13], [10, 13]], ['#15151c', '#262630', '#40404e']); // brim
  c.px([[15, 9], [16, 9], [17, 9], [16, 8], [16, 10]], PAL.gold); c.set(16, 9, PAL.sun); // anchor badge
  c.set(12, 5, COAT[3]); c.set(13, 5, COAT[3]);
  // heavy brows, squinty eyes, crow's feet
  c.hline(10, 14, 14, HAIR[0]); c.hline(18, 22, 14, HAIR[0]); c.set(14, 15, HAIR[0]); c.set(18, 15, HAIR[0]); c.set(10, 14, HAIR[1]); c.set(22, 14, HAIR[1]);
  c.rect(12, 16, 2, 1, INK); c.rect(18, 16, 2, 1, INK); c.set(12, 16, '#2c3a5a'); c.set(18, 16, '#2c3a5a');
  c.set(11, 17, SK[0]); c.set(21, 17, SK[0]);
  c.set(16, 18, SK[0]); c.set(15, 18, SK[0]);
  // mouth: flat gruff line + pipe
  c.hline(14, 17, 20, '#5a3024');
  c.px([[18, 20], [19, 20], [20, 21], [21, 21]], PAL.woodDark);
  c.sh(23, 20.5, 1.8, 2.2, [PAL.woodDark, PAL.wood, PAL.woodLight]); c.hline(22, 23, 18, '#3a2418');
  c.px([[23, 16], [24, 15], [24, 13], [25, 12]], '#d8d4e0'); c.px([[25, 14], [26, 11]], '#eeeef2');
  c.noOut.add('#d8d4e0'); c.noOut.add('#eeeef2');
  c.set(12, 19, BLUSH); c.set(20, 19, BLUSH);
  c.outline();
  return bake(c);
}

function vil_rue() {
  const c = canvas(32, 32);
  const SK = SKIN.brown, SHAWL = ['#2f5a3a', '#3f7a4a', '#5f9e5e', '#8cc478'], SCARF = ['#7a2446', PAL.berry, '#d0587a', '#f09aa8'];
  shoulders(c, SHAWL);
  // shawl knot + herb bundle on shoulder
  c.sh(16, 26.5, 2.5, 2, ['#7a5a2a', PAL.gold, PAL.sun]);
  c.rect(12, 21, 8, 3, SK[0]);
  // scarf back mass
  c.sh(16, 13, 9, 9.5, SCARF);
  head(c, SK, { cy: 15, rx: 6.2, ry: 6.6, ears: false });
  // scarf front band over forehead
  c.shPoly([[8, 11], [16, 7], [24, 11], [24, 13], [16, 11], [8, 13]], SCARF);
  c.shPoly([[7, 5], [16, 2], [25, 5], [25, 11], [16, 8], [7, 11]], SCARF);
  c.onto(() => { for (const [x, y] of [[10, 5], [14, 4], [19, 4], [22, 6], [12, 8], [17, 6], [20, 9], [9, 16], [22, 17], [8, 12], [24, 14]]) { c.set(x, y, '#ffe9a8'); } }, SCARF);
  // scarf knot tails at side
  c.sh(24.6, 17.5, 2.2, 3, SCARF); c.set(25, 20, SCARF[1]); c.set(26, 21, SCARF[0]);
  // herbs tucked in scarf
  c.tube([[22, 4], [26, 1.5]], 0.7, LEAF); c.px([[26, 1], [27, 2], [24, 1], [25, 3]], PAL.leafLight);
  c.px([[23, 2], [21, 1]], PAL.lilac); c.set(22, 1, '#d7c4f2');
  // warm face
  c.hline(11, 13, 13, INK2); c.hline(18, 20, 13, INK2);
  // round spectacles
  for (const ex of [11, 18]) { c.px([[ex, 14], [ex + 3, 14], [ex, 17], [ex + 3, 17]], PAL.gold); c.hline(ex + 1, ex + 2, 13 + 0, null); }
  for (const ex of [11, 18]) { c.hline(ex + 1, ex + 2, 14, PAL.gold); c.hline(ex + 1, ex + 2, 17, PAL.gold); c.vline(ex, 15, 16, PAL.gold); c.vline(ex + 3, 15, 16, PAL.gold); }
  c.hline(15, 17, 15, PAL.gold);
  // eyes inside the lenses
  c.rect(12, 15, 2, 2, INK); c.set(12, 15, WHITE); c.rect(19, 15, 2, 2, INK); c.set(19, 15, WHITE);
  c.px([[12, 14], [13, 14], [19, 14], [20, 14]], '#e8d8b0');
  c.set(10, 18, BLUSH); c.set(22, 18, BLUSH);
  c.set(16, 18, SK[0]);
  // big smile
  c.hline(14, 18, 19, WHITE); c.set(13, 18, '#2a1410'); c.set(19, 18, '#2a1410'); c.hline(14, 18, 20, '#2a1410'); c.hline(15, 17, 21, '#6a2a24');
  // earring
  c.set(9, 18, PAL.gold); c.set(9, 19, PAL.sun);
  c.outline();
  return bake(c);
}

function vil_bram() {
  const c = canvas(32, 32);
  const SK = SKIN.rosy, BEARD = ['#7a3218', '#b8522e', '#d9743e', '#f09a5a'], SHIRT = ['#3a4a5e', '#50667e', '#6a86a0'], APRON = ['#4a2e1e', '#6e4630', '#8e6040', '#b07e56'];
  shoulders(c, SHIRT, 31, 15, 9);
  c.shPoly([[9, 24], [23, 24], [25, 31], [7, 31]], APRON);
  c.vline(10, 23, 31, '#3a2418'); c.vline(22, 23, 31, '#3a2418');
  c.px([[10, 25], [22, 25]], METAL[2]);
  c.rect(13, 20, 6, 3, SK[0]);
  head(c, SK, { rx: 7, ry: 7 });
  // bald crown with a fringe of ginger + shine
  c.sh(9.5, 12, 1.6, 3, BEARD); c.sh(22.5, 12, 1.6, 3, BEARD);
  c.set(13, 9, SK[2]); c.set(14, 9, SK[2]); c.set(13, 10, WHITE);
  // goggles on forehead
  c.hline(9, 23, 11, '#3a2418'); c.hline(9, 23, 12, '#5e3b26');
  for (const gx of [12.5, 19.5]) { c.sh(gx, 11.5, 2.4, 2.2, ['#8a5a1c', PAL.gold, PAL.sun]); c.sh(gx, 11.5, 1.4, 1.2, [PAL.skyDeep, PAL.sky, '#e8f8ff']); }
  // brows + eyes
  c.hline(11, 14, 14, BEARD[1]); c.hline(18, 21, 14, BEARD[1]);
  eyes(c, 15, 12, 18);
  c.px([[15, 17], [16, 17], [16, 18], [15, 18]], SK[0]); c.set(15, 17, SK[1]); // nose
  c.set(11, 18, BLUSH); c.set(21, 18, BLUSH);
  // big beard
  c.shPoly([[9, 17], [11, 19], [21, 19], [23, 17], [23, 21], [20, 26], [16, 27], [12, 26], [9, 21]], BEARD);
  c.hline(14, 18, 19, BEARD[2]);
  c.hline(14, 18, 21, '#5a2010'); c.hline(15, 17, 22, '#5a2010'); // mouth under moustache
  c.hline(13, 19, 20, BEARD[1]); c.set(12, 20, BEARD[0]); c.set(20, 20, BEARD[0]);
  c.px([[12, 23], [15, 24], [18, 23], [13, 25], [17, 26]], BEARD[0]);
  c.px([[11, 21], [14, 23], [19, 22]], BEARD[3]);
  c.outline();
  return bake(c);
}

function vil_juniper() {
  const c = canvas(32, 32);
  const SK = SKIN.olive, HAIR = ['#1f1a1a', '#342a2a', '#4e4040'], TUNIC = ['#8a2a2a', '#c23c34', '#e0605a', '#f59080'], POT = ['#3e3a40', '#6a6670', '#9a98a2', '#d8d6de'];
  // cape + small shoulders
  shoulders(c, TUNIC, 32, 12, 8);
  c.shPoly([[11, 24], [21, 24], [22, 31], [10, 31]], ['#b89a5a', '#d9bf85', '#f3e2b3']); // cardboard breastplate
  c.px([[16, 26], [15, 27], [17, 27], [16, 28], [16, 27]], PAL.gold); // heart-ish emblem
  c.set(16, 27, PAL.red); c.set(15, 27, PAL.red); c.set(17, 27, PAL.red); c.set(16, 28, PAL.red); c.set(15, 26, PAL.red); c.set(17, 26, PAL.red); c.set(16, 26, '#d9bf85');
  c.rect(14, 21, 4, 3, SK[0]);
  // messy hair poking out
  c.sh(16, 15, 7.4, 6.5, HAIR);
  head(c, SK, { cy: 16, rx: 6, ry: 6 });
  c.px([[9, 17], [8, 18], [23, 17], [24, 18], [9, 19]], HAIR[1]);
  // cooking-pot helmet, a little too big, tilted
  c.shPoly([[7, 12], [8, 5], [11, 3], [21, 3], [24, 5], [25, 12]], POT);
  c.hline(6, 26, 12, POT[1]); c.hline(6, 26, 13, POT[0]); c.hline(7, 25, 11, POT[2]);
  c.set(9, 5, POT[3]); c.set(9, 6, POT[3]); c.set(10, 4, POT[3]);
  // pot handle sticking out
  c.tube([[25, 7], [29, 6]], 0.9, ['#3a2418', PAL.woodDark, PAL.wood]);
  c.px([[16, 2], [15, 2], [17, 2]], POT[1]); c.set(16, 1, PAL.red); c.set(15, 0, null); // lid knob as plume
  c.px([[16, 1], [17, 0], [15, 1]], PAL.red);
  // big bright eyes
  eyes(c, 15, 12, 18, 3, '#3b2a20');
  c.set(12, 16, INK); c.set(18, 16, INK);
  c.px([[11, 18], [13, 19], [19, 19], [21, 18], [12, 19]], '#b07a52'); // freckles
  c.set(10, 18, BLUSH); c.set(22, 18, BLUSH);
  // gap-tooth grin
  c.hline(14, 18, 19, '#3a1a14'); c.hline(15, 17, 20, '#3a1a14'); c.set(15, 19, WHITE); c.set(17, 19, WHITE);
  c.outline();
  return bake(c);
}

function vil_pell() {
  const c = canvas(32, 32);
  const SK = SKIN.fair, HAIR = ['#141418', '#24242c', '#383844'], SUIT = ['#b8b09a', '#e4dcc4', '#f6f0de', WHITE], HAT = ['#b89a5a', '#d9c08a', '#f0dcae', '#fff4d6'];
  shoulders(c, SUIT);
  c.shPoly([[14, 23], [18, 23], [16, 29]], ['#a8742a', PAL.gold, PAL.sun]); // honey-coloured bandana
  c.rect(14, 21, 4, 2, SK[0]);
  // veil mesh hanging behind (pushed back)
  c.shPoly([[5, 9], [27, 9], [29, 24], [3, 24]], ['#9a9aa4', '#c4c4cc', '#e2e2e8']);
  for (let y = 10; y < 24; y++) for (let x = 3; x < 30; x++) { const v = c.get(x, y); if (v && (x % 3 === 0 || y % 3 === 0)) c.g[y][x] = mix(v, '#5a5a66', 0.35); }
  // hair: neat black bob
  c.sh(16, 13.5, 7.6, 7.6, HAIR);
  head(c, SK, { cy: 15, rx: 6.2, ry: 6.6 });
  c.shPoly([[9, 11], [16, 9], [23, 11], [23, 13], [20, 12], [17, 13], [14, 12], [9, 13]], HAIR);
  // wide beekeeper hat tipped back
  c.sh(16, 8.5, 12, 2.6, HAT, [0.05, 0.5, 0.88]);
  c.sh(16, 5.5, 6, 4, HAT);
  c.onto(() => c.hline(9, 22, 7, '#a8742a'), HAT);
  // a bee on the brim
  c.px([[24, 5], [25, 5]], PAL.sun); c.set(24, 5, INK); c.px([[24, 4], [25, 4]], '#e8f8ff');
  // soft eyes (gentle closed-ish)
  c.rect(12, 15, 2, 2, INK); c.set(12, 15, WHITE); c.set(11, 15, INK);
  c.rect(19, 15, 2, 2, INK); c.set(19, 15, WHITE); c.set(21, 15, INK);
  c.hline(11, 13, 13, INK2); c.hline(19, 21, 13, INK2);
  c.set(10, 18, BLUSH); c.set(11, 18, BLUSH); c.set(21, 18, BLUSH); c.set(22, 18, BLUSH);
  c.set(16, 18, SK[0]);
  c.px([[15, 20], [16, 20]], '#8a3a30'); c.set(14, 19, '#8a3a30'); c.set(17, 19, '#8a3a30');
    c.outline();
  return bake(c);
}

function vil_mossy() {
  const c = canvas(32, 32);
  const SK = SKIN.pale, HOOD = ['#2e3a22', '#3f4e2c', '#56673a', '#728a4c'], BEARD = ['#a8a6a0', '#d4d2cc', '#f0eee8', WHITE], MOSS = ['#3f6a2a', '#5e8a36', '#8cb452'];
  shoulders(c, HOOD, 31, 15, 10);
  // hood
  c.shPoly([[5, 30], [6, 12], [10, 4], [16, 1], [22, 4], [26, 12], [27, 30]], HOOD);
  c.poly([[9, 26], [9, 13], [12, 7], [16, 6], [20, 7], [23, 13], [23, 26]], '#1c2414');
  head(c, SK, { cy: 15, rx: 6, ry: 6.4, ears: false });
  // mushrooms on the hood
  c.sh(8, 8.5, 2.4, 1.6, ['#8a2a2a', PAL.red, '#f07a5e']); c.set(7, 8, WHITE); c.vline(8, 10, 10, '#e8dcc4');
  c.sh(24.5, 7, 1.8, 1.3, ['#8a5a1c', PAL.gold, PAL.sun]); c.vline(24, 8, 9, '#e8dcc4');
  c.onto(() => { for (const [x, y] of [[6, 16], [7, 20], [25, 18], [26, 23], [11, 3], [20, 3], [5, 25]]) c.sh(x, y, 1.6, 1.2, MOSS); }, HOOD);
  // bushy brows: two drooping tufts that flick outward, shadowed underneath so they sit apart from the beard
  c.shPoly([[9, 13], [11, 11], [15, 12], [15, 14], [9, 14]], BEARD); c.shPoly([[17, 12], [21, 11], [23, 13], [23, 14], [17, 14]], BEARD);
  c.set(8, 14, BEARD[1]); c.set(24, 14, BEARD[0]); c.set(15, 13, BEARD[0]); c.set(17, 13, BEARD[0]);
  c.hline(10, 14, 15, SK[0]); c.hline(18, 22, 15, SK[0]);
  c.set(12, 15, GLOW.hot); c.set(13, 15, INK); c.set(20, 15, GLOW.hot); c.set(19, 15, INK); // twinkle under brows
  c.set(10, 17, BLUSH); c.set(22, 17, BLUSH);
  // big nose
  c.sh(16, 17, 1.8, 2, SK);
  // long mossy beard to the bottom (starts below the cheeks)
  c.shPoly([[8, 19], [12, 18], [14, 20], [18, 20], [20, 18], [24, 19], [24, 23], [20, 31], [16, 32], [12, 31], [8, 23]], BEARD);
  // moustache: its own sweep, lighter, with a shadow line under it
  c.shPoly([[10, 20], [13, 19], [16, 19.5], [19, 19], [22, 20], [21, 22], [16, 21.5], [11, 22]], [BEARD[1], BEARD[2], BEARD[3]]);
  c.hline(12, 20, 22, BEARD[0]); c.hline(15, 17, 23, '#6a5a50');
  c.sh(16, 17.6, 1.6, 1.6, SK);
  c.onto(() => { for (const [x, y] of [[11, 24], [19, 25.5], [15, 28.5], [21, 24], [12.5, 28]]) { c.sh(x, y, 1.3, 1, MOSS); c.set(Math.round(x) + 1, Math.round(y) + 1, MOSS[0]); } }, BEARD);
  c.px([[16, 28], [11, 23]], '#f2a8c0'); // tiny blossoms in the moss
  c.vline(14, 24, 27, BEARD[0]); c.vline(18, 24, 28, BEARD[0]);
  c.outline();
  return bake(c);
}

// ---------------------------------------------------------------- spring critters
function en_gloamslug(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(32, 32);
  const S = ['#8a4a66', '#c06a86', '#e8949e', '#fcc6c0'];
  const FOOT = ['#b05a78', '#e0a0aa'];
  // slime trail
  c.hline(18, 30, 29, GLOAM[2]); c.hline(22, 29, 28, GLOAM[3]); c.set(30, 28, GLOAM[2]);
  // body and tail
  c.sh(19, 22.5, 10.5, 5.5, S);
  c.sh(26, 24.5, 4.8, 3.6, S);
  c.hline(9, 28, 27, FOOT[0]); c.hline(10, 26, 26, FOOT[1]);
  // head, raised (rears up on the attack, snaps back on a hit)
  if (A) c.at(-1, -2); if (H) c.at(2, 0);
  c.sh(10.5, 18.5, 6.2, 6.4, S);
  // eyestalks
  const tl = A ? [9, 6] : H ? [10, 9] : I ? [7, 7] : [6, 7], tr = A ? [16, 5] : H ? [16, 8] : I ? [14.5, 6] : [13.5, 6];
  c.tube([[8, 14], tl], 0.8, [S[0], S[1]]);
  c.tube([[12.5, 13.5], tr], 0.8, [S[0], S[1]]);
  const EB = [GLOW.rim, GLOW.mid, GLOW.core];
  c.sh(tl[0], tl[1] - 0.5, 2.4, 2.4, H ? [S[0], S[1], S[2]] : EB); c.sh(tr[0], tr[1] - 0.5, 2.4, 2.4, H ? [S[0], S[1], S[2]] : EB);
  if (H) { squint(c, Math.round(tl[0]) - 1, Math.round(tl[1]) - 2, 3, 1); squint(c, Math.round(tr[0]) - 1, Math.round(tr[1]) - 2, 3, -1); }
  else {
    const [lx, ly] = tl.map(Math.round), [rx, ry] = tr.map(Math.round);
    c.set(lx - 1, ly - 2, GLOW.hot); c.set(rx - 2, ry - 2, GLOW.hot);
    c.hline(lx - 2, lx + 1, ly - 3, GLOAM[1]); c.set(lx + 2, ly - 2, GLOAM[1]); c.hline(rx - 2, rx + 1, ry - 3, GLOAM[1]); c.set(rx - 3, ry - 2, GLOAM[1]); // heavy grumpy lids
  }
  c.at();
  // back ridge + gloam patches, drips
  patch(c, 21, 18.5, 3.5, 2.2); patch(c, 27, 22, 2, 1.6, false); patch(c, 15, 20.5, 1.6, 1.3, false);
  drip(c, 21, 21, I ? 3 : 2); drip(c, 26, 24, 2);
  if (A) c.at(-1, -2); if (H) c.at(2, 0);
  if (A) {
    // wide gloam-spitting maw
    c.ell(6, 21.2, 2.6, 1.8, INK); c.hline(5, 7, 22, GLOAM[1]); c.set(6, 21, GLOW.mid); c.set(4, 20, '#fff4d6'); c.set(8, 20, '#fff4d6');
  } else if (H) {
    c.px([[4, 21], [5, 20], [6, 21], [7, 20], [8, 21]], INK);
  } else {
    c.px([[4, 21], [5, 20], [6, 20], [7, 20], [8, 21]], INK);
  }
  c.set(6, 18, S[0]); c.set(7, 17, S[0]); c.hline(9, 10, 19, BLUSH);
  c.at();
  c.px([[16, 23], [18, 24], [24, 26]], S[3]);
  if (I) squash(c, 23);
  if (H) shear(c, 0.08, 26, 1);
  c.outline();
  if (A) { c.at(); c.ell(1.5, 17.5, 1.6, 1.4, GLOAM[2]); c.set(1, 17, GLOW.mid); c.set(0, 16, GLOW.hot); c.set(3, 14, GLOW.mid); c.set(0, 21, GLOAM[2]); c.set(1, 22, GLOW.core); }
  if (H) { poof(c, 20, 10); star(c, 3, 14); }
  return bake(c);
}

function en_burrlet(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(32, 32);
  const B = ['#5e4a1e', '#8a7030', '#b8983e', '#dcc06a'];
  const SP = ['#4a3818', '#7a5e24', '#a8883a'];
  // spikes (bristle out to attack, flatten when hit, drift a few degrees at idle)
  const reach = A ? 14 : H ? 11 : 12.5;
  for (let a = I ? 9 : 0; a < 360; a += 26) {
    const r = (a * Math.PI) / 180, x0 = 16 + Math.cos(r) * 8, y0 = 17 + Math.sin(r) * 8, x1 = 16 + Math.cos(r) * reach, y1 = 17 + Math.sin(r) * (reach - 0.5);
    if (y1 > 27) continue;
    c.tube([[x0, y0], [x1, y1]], 1.1, SP, 0.5);
    c.set(Math.round(x1 + Math.cos(r + 1.6) * 1), Math.round(y1 + Math.sin(r + 1.6) * 1), SP[0]); // hooked tip
  }
  // feet
  c.sh(11.5, 27.5, 2.4, 1.6, [PAL.woodDark, PAL.wood, PAL.woodLight]); c.sh(20.5, 27.5, 2.4, 1.6, [PAL.woodDark, PAL.wood, PAL.woodLight]);
  c.sh(16, 17, 9, 8.6, B);
  // bristly texture
  c.onto(() => { for (const [x, y] of [[18, 11], [22, 14], [20, 20], [23, 19], [13, 22], [19, 23], [10, 12], [14, 10]]) { c.set(x, y, B[0]); c.set(x + 1, y - 1, B[3]); } }, B);
  // sprout on top
  const tip = I ? 18 : H ? 19 : 17;
  c.tube([[16, 9], [tip, 4]], 0.6, LEAF); c.sh(tip + 2.5, I ? 4.5 : 3.5, 2.2, 1.2, LEAF); c.sh(tip - 2.5, 4, 1.8, 1.1, LEAF);
  // gloam
  patch(c, 21.5, 12.5, 3, 2.4); patch(c, 23, 19, 1.6, 2, false);
  drip(c, 24, 21, I ? 4 : 3); drip(c, 20, 15, 1);
  // face (looks left)
  if (H) { squint(c, 9, 15, 3, 1); squint(c, 14, 15, 3, -1); c.rect(11, 20, 2, 2, INK); c.set(11, 20, '#5a2420'); }
  else {
    gEye(c, 9, 15, 3, 3); gEye(c, 14, 15, 3, 3);
    if (A) { c.ell(11.5, 21.2, 3, 1.8, INK); c.hline(10, 13, 20, '#fff4d6'); c.set(11, 20, INK); c.set(12, 21, '#a8325c'); }
    else { c.px([[9, 21], [10, 20], [11, 20], [12, 20], [13, 21]], INK); c.set(11, 21, '#fff4d6'); }
  }
  if (I) squash(c, 20);
  if (A) nudge(c, -1, 0, 26);
  if (H) shear(c, 0.08, 27, 1);
  c.outline();
  if (A) streaks(c, [[28, 10, 3], [29, 16, 3], [28, 22, 2]], '#f3e2b3');
  if (H) { poof(c, 23, 3); star(c, 4, 12); }
  return bake(c);
}

function en_greycrow(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(32, 32);
  const F = ['#1c1e30', '#2c3148', '#434d6c', '#6a7a9e'];
  const BEAK = ['#8a5a1c', PAL.gold, PAL.sun, '#ffe9a8'];
  // tail (flicks up at idle)
  c.shPoly(I ? [[21, 19], [30, 22], [31, 25], [28, 27], [20, 24]] : [[21, 19], [30, 24], [30, 27], [27, 28], [20, 24]], F);
  if (I) c.line(24, 22, 30, 24, F[0]); else c.line(24, 23, 29, 26, F[0]);
  // legs
  c.vline(15, 25, 29, BEAK[0]); c.vline(19, 25, 29, BEAK[0]); c.hline(13, 16, 29, BEAK[0]); c.hline(17, 20, 29, BEAK[0]);
  // body
  c.sh(17, 19.5, 8, 6.6, F);
  // head
  if (H) c.at(1, -1);
  c.sh(11, 12, 5.5, 5, F);
  // feather tuft
  if (I || H) { c.px([[12, 6], [12, 5], [13, 4], [11, 5], [14, 6]], F[1]); c.set(12, 4, F[2]); }
  else { c.px([[12, 6], [13, 5], [14, 6], [11, 5], [15, 7]], F[1]); c.set(13, 5, F[2]); }
  c.at();
  // wing (flared high to strike)
  if (A) {
    c.shPoly([[14, 18], [17, 10], [23, 4], [30, 3], [29, 8], [27, 13], [24, 19], [17, 22]], [F[0], F[1], F[2]]);
    for (const [x0, y0, x1, y1] of [[18, 16, 28, 5], [20, 18, 28, 10], [22, 19, 26, 14]]) c.line(x0, y0, x1, y1, F[0]);
    c.line(16, 12, 22, 5, F[3]); c.line(23, 4, 29, 3, F[3]);
  } else {
    c.shPoly([[14, 17], [22, 15], [27, 20], [24, 25], [16, 24]], [F[0], F[1], F[2]]);
    for (const y of [19, 21, 23]) c.line(18, y, 24, y + 1, F[0]);
    c.line(16, 17, 23, 16, F[3]);
  }
  if (H) c.at(1, -1);
  // beak (gapes open to caw / squawk)
  if (A || H) {
    c.shPoly([[1, 11], [7, 9], [8, 13], [3, 12]], BEAK);
    c.shPoly([[3, 15], [8, 14], [8, 16], [5, 16]], BEAK);
    c.px([[4, 13], [5, 13], [6, 13], [7, 13], [5, 14], [6, 14], [7, 14]], '#8a2a3a');
  } else { c.shPoly([[2, 13], [7, 10], [8, 15]], BEAK); c.line(3, 13, 7, 13, BEAK[0]); }
  c.at();
  // belly fluff
  c.onto(() => c.sh(12.5, 21, 3.5, 3.5, [F[2], F[3]]), F);
  // gloam: wing tips and chest
  patch(c, 24, 21, 2.6, 2.2); patch(c, 13, 20, 2, 2, false);
  drip(c, 12, 22, I ? 4 : 3); drip(c, 23, 24, 2);
  // eye
  if (H) { c.at(1, -1); squint(c, 9, 10, 3, 1); c.set(7, 14, BLUSH); c.at(); }
  else { gEye(c, 9, 11, 3, 3); c.set(7, 14, BLUSH); }
  if (I) squash(c, 21);
  if (A) shear(c, 0.08, 28, -1);
  if (H) shear(c, 0.06, 28, 1);
  c.outline();
  if (A) streaks(c, [[27, 13, 3], [26, 17, 4]], F[3]);
  if (H) {
    for (const [x, y] of [[26, 6], [29, 11]]) { c.at(); c.px([[x, y], [x + 1, y - 1], [x + 1, y]], F[3]); c.set(x + 2, y - 2, F[2]); }
    poof(c, 21, 9); star(c, 2, 8);
  }
  return bake(c);
}

function en_moleling(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(32, 32);
  const M = ['#2c2026', '#46343c', '#654c56', '#8a6e78'];
  const PINK = ['#b05a6a', '#e08a92', '#f6b4b4', '#ffdcd6'];
  const SOIL = ['#4a2e1e', '#6e4630', '#8e6040', '#b07e56'];
  c.sh(16, 28.8, 14, 2.1, SOIL);
  c.px([[5, 28], [9, 27], [24, 27], [27, 28], [14, 27]], SOIL[3]);
  c.sh(17, 19.5, 10.5, 8.8, M);
  // snout (nose wiggles up at idle)
  c.sh(7.5, 21, 4.6, 3, [M[1], M[2], M[3]]);
  c.sh(3.8, I ? 19.8 : 20.5, 2, 1.8, PINK);
  // velvet sheen
  c.onto(() => { c.line(14, 12, 20, 11, M[3]); c.set(12, 13, M[3]); }, M);
  // gloam on the back
  patch(c, 23.5, 15, 4, 3); patch(c, 25, 21, 1.8, 1.8, false);
  drip(c, 25, 23, I ? 4 : 3); drip(c, 21, 18, 1);
  // eyes + brows
  if (H) { squint(c, 10, 16, 3, 1); squint(c, 15, 16, 3, -1); }
  else {
    c.hline(10, 12, 17, GLOW.mid); c.set(10, 17, GLOW.hot); c.line(9, 16, 13, 15, INK);
    c.hline(15, 17, 17, GLOW.mid); c.set(15, 17, GLOW.hot); c.line(14, 15, 18, 16, INK);
    c.set(13, 17, INK); c.set(14, 17, INK);
    if (A) { c.line(9, 15, 13, 16, INK); c.line(14, 16, 18, 15, INK); } // brows clamp down
  }
  // mouth
  if (A) { c.ell(7.5, 24, 2.2, 1.4, INK); c.hline(7, 8, 24, PINK[0]); c.set(6, 23, '#fff4d6'); c.set(8, 23, '#fff4d6'); }
  else if (H) c.px([[5, 24], [6, 23], [7, 24], [8, 23], [9, 24]], INK);
  else c.px([[6, 24], [7, 23], [8, 23], [9, 24]], INK);
  // big digging paws (the front one rears up, claws out, to swipe)
  const paws = A ? [[5.5, 12.5], [20, 26.8]] : [[8, 26.5], [20, 26.8]];
  for (const [px, py] of paws) {
    c.sh(px, py, 3.2, 2.2, PINK);
    if (A && py < 20) { c.tube([[8, 17], [6, 14]], 1.6, PINK); c.sh(px, py, 3.2, 2.2, PINK); for (let i = 0; i < 3; i++) { const x = Math.round(px) - 2 + i * 2; c.set(x, Math.round(py) - 2, '#fff4d6'); c.set(x - 1, Math.round(py) - 3, '#fff4d6'); } }
    else for (let i = 0; i < 3; i++) c.set(Math.round(px) - 2 + i * 2, Math.round(py + 1.6), '#fff4d6');
  }
  // little flower on the head (sways at idle, droops on a hit)
  const fx = I ? 19 : 18;
  if (H) { c.vline(18, 9, 11, PAL.leafDark); c.px([[20, 9], [20, 11], [19, 10], [21, 10]], PAL.pink); c.set(20, 10, PAL.sun); c.set(19, 9, PAL.leafDark); }
  else { c.vline(18, 9, 11, PAL.leafDark); if (I) c.set(18, 9, null); c.px([[fx - 1, 8], [fx + 1, 8], [fx, 7], [fx, 9]], PAL.pink); c.set(fx, 8, PAL.sun); }
  if (I) squash(c, 19);
  if (A) shear(c, 0.07, 26, -1);
  if (H) shear(c, 0.07, 26, 1);
  c.outline();
  if (A) streaks(c, [[1, 13, 2], [0, 16, 2]], SOIL[3]);
  if (H) { poof(c, 23, 6); star(c, 2, 16); c.at(); c.set(29, 22, SOIL[2]); c.set(30, 20, SOIL[3]); c.set(3, 26, SOIL[2]); }
  return bake(c);
}

function en_bramblehog(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(40, 40);
  const QUILL = ['#2e2014', '#4e3420', '#6e4a2c', '#8e6a40'];
  const FACE = ['#a0744a', '#cfa070', '#ecc898', '#fbe4bc'];
  const VINE = ['#24401e', '#355e2a', '#4e7e36'];
  // quills / bramble spikes along the back (radial): bristle up to attack, flatten when hit
  const cx = 22, cy = 27;
  for (let a = 185; a <= 370; a += 11) {
    const r = (a * Math.PI) / 180;
    const len = 15 + ((a * 7) % 3) + (A ? 5 * Math.max(0, -Math.sin(r)) : H ? -2.5 : 0);
    const x1 = cx + Math.cos(r) * len, y1 = cy + Math.sin(r) * len * 0.92;
    if (y1 > 34) continue;
    c.tube([[cx + Math.cos(r) * 8, cy + Math.sin(r) * 7], [x1, y1]], A ? 1.8 : 1.6, QUILL, 0.4);
  }
  c.sh(cx, cy, 13.5, 10, QUILL);
  // tangled bramble vines woven over the quills
  c.tube([[9, 20], [14, 14], [20, 13], [27, 12], [33, 16], [36, 22]], 1, VINE);
  c.tube([[12, 27], [17, 20], [24, 19], [31, 21], [34, 28]], 0.9, VINE);
  for (const [x, y] of [[13, 15], [19, 12], [26, 11], [33, 15], [17, 19], [28, 19], [34, 26], [22, 19]]) { c.set(x, y - 1, '#c8d890'); }
  for (const [x, y] of [[16, 11], [30, 10], [36, 19], [23, 16]]) { c.sh(x, y, 1.4, 1.4, ['#6a1830', PAL.berry, PAL.rose]); c.set(x - 1, y - 1, PAL.pink); }
  // gloam in the spines
  patch(c, 28, 17, 3.5, 2.5); patch(c, 19, 23, 2.4, 2, false); patch(c, 33, 26, 2, 2, false);
  drip(c, 31, 27, I ? 5 : 4); drip(c, 26, 30, 3);
  // face + belly
  c.sh(12, 29, 7.5, 6.2, FACE);
  c.sh(5.5, 30.5, 3.6, 2.6, FACE);
  c.sh(2.6, I ? 29.4 : 30, 1.4, 1.3, [INK, '#4a3a40', '#8a7a86']);
  // feet
  c.sh(10, 36, 2.4, 1.4, [QUILL[1], QUILL[2]]); c.sh(20, 36.5, 2.6, 1.4, [QUILL[1], QUILL[2]]); c.sh(29, 36.5, 2.6, 1.4, [QUILL[1], QUILL[2]]);
  // eye + brow
  if (H) squint(c, 9, 26, 3, 1);
  else { gEye(c, 9, 26, 3, 3); c.hline(12, 13, 25, QUILL[1]); }
  if (A) { c.ell(5.5, 33.4, 2.6, 1.3, INK); c.hline(4, 7, 33, '#fff4d6'); c.set(5, 33, INK); c.set(6, 34, '#a8325c'); }
  else if (H) c.px([[3, 33], [4, 32], [5, 33], [6, 32], [7, 33]], INK);
  else c.px([[4, 33], [5, 32], [6, 32], [7, 33]], INK);
  c.set(11, 31, BLUSH); c.set(12, 31, BLUSH);
  if (I) squash(c, 21);
  if (A) nudge(c, -1, 0, 35);
  if (H) shear(c, 0.06, 35, 1);
  c.outline();
  if (A) streaks(c, [[36, 30, 3], [36, 34, 2]], FACE[2]);
  if (H) { poof(c, 30, 5, true); star(c, 3, 25); c.at(); c.set(8, 8, PAL.rose); c.set(4, 12, PAL.berry); }
  return bake(c);
}

function boss_rootstag(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(56, 56);
  const FUR = ['#5a3420', '#86532e', '#b27a44', '#d8a468'];
  const CREAM = ['#c8a67c', '#ead0a6', '#fbecd0'];
  const ROOT = ['#3a2416', '#5e3b26', '#8a5a3b', '#b98356'];
  const HOOF = ['#241810', '#3a2618', '#5a3e28'];
  // head group offset: lowered to charge antlers-first, thrown up and back on a hit
  const HD = A ? [-1, 5] : H ? [2, -1] : [0, 0];
  // far legs (darker)
  c.tube([[26, 40], [25, 47], [26, 52]], 1.8, [FUR[0], FUR[1]], 1.3);
  c.tube([[44, 40], [46, 46], [45, 52]], 1.9, [FUR[0], FUR[1]], 1.3);
  // body
  c.sh(35, 36, 14.5, 8.6, FUR);
  c.sh(49, I ? 31 : 32, 2.6, 2.4, CREAM); // tail
  // near legs (front one paws the ground before the charge)
  if (A) c.tube([[21, 40], [17, 44], [18, 48]], 2.2, FUR, 1.4); else c.tube([[21, 40], [20, 46], [21, 52]], 2.2, FUR, 1.4);
  c.tube([[40, 40], [41.5, 46], [40, 52]], 2.4, FUR, 1.4);
  for (const x of [21, 26, 40, 45]) if (!(A && x === 21)) c.sh(x, 53, 2, 1.4, HOOF);
  if (A) c.sh(18, 49, 2, 1.4, HOOF);
  // chest + neck
  c.sh(22, 33.5, 7.4, 8.2, FUR);
  c.shPoly([[13, 22], [21, 19], [27, 30], [22, 38], [15, 34]], FUR);
  c.onto(() => c.sh(19, 33, 4, 6, CREAM), FUR);
  // moss mantle over the shoulders
  c.shPoly([[16, 25], [22, 22], [33, 27], [36, 31], [28, 34], [20, 32]], LEAF);
  for (const [x, y] of [[20, 33], [24, 34], [29, 35], [33, 33]]) c.vline(x, y, y + 2, LEAF[1]);
  c.onto(() => { for (const [x, y] of [[19, 25], [23, 24], [27, 27], [31, 29], [24, 29], [20, 29], [29, 32]]) { c.set(x, y, LEAF[3]); c.set(x + 1, y + 1, LEAF[0]); } }, LEAF);
  for (const [x, y] of [[22, 26], [30, 30]]) { c.px([[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]], '#fff4d6'); c.set(x, y, PAL.sun); }
  // head + muzzle
  c.at(...HD);
  c.sh(13, 20.5, 6, 5, FUR);
  c.sh(7.5, 23.5, 4.4, 3.2, FUR);
  c.onto(() => c.sh(6.5, 24.5, 3.2, 2.2, CREAM), FUR);
  c.sh(3.8, 22.8, 1.3, 1.2, [INK, '#3a2a2a', '#6a5a5a']);
  if (A || H) c.px([[4, 26], [5, 26], [6, 26], [5, 27]], INK); else c.px([[4, 26], [5, 26], [6, 25]], INK);
  // ear
  c.shPoly(H ? [[18, 17], [25, 16], [22, 19]] : [[18, 17], [24, 14], [22, 19]], FUR); c.set(21, 16, PAL.pink); c.set(22, 16, PAL.pink);
  // antlers: tangled roots
  const antlers = [
    [[15, 16], [14, 11], [10, 7], [6, 5], [3, 6]],
    [[14, 11], [16, 6], [15, 2]],
    [[10, 7], [9, 3]],
    [[17, 16], [22, 11], [27, 8], [33, 7], [38, 3]],
    [[27, 8], [26, 3]],
    [[22, 11], [23, 5], [20, 2]],
    [[33, 7], [36, 10], [40, 11]],
  ];
  for (const p of antlers) c.tube(p, 1.5, ROOT, 0.7);
  c.path([[6, 8], [9, 10], [12, 9]], ROOT[1]); c.path([[29, 10], [32, 12], [35, 12]], ROOT[1]); c.path([[18, 8], [20, 9]], ROOT[1]);
  c.px([[2, 7], [2, 8], [41, 12], [41, 13], [39, 2], [15, 1]], ROOT[2]);
  // leaves + blossoms on the antlers
  for (const [x, y] of [[11, 5], [24, 8], [34, 5], [18, 12], [5, 8]]) { c.sh(x, y, 1.6, 1, LEAF); }
  for (const [x, y] of [[3, 5], [16, 2.8], [26, 2.8], [38, 2.8], [40, 11], [9, 2.8], [21, 2.8]]) { c.sh(x, y, 1.6, 1.6, BLOSSOM); c.set(Math.floor(x), Math.floor(y), PAL.sun); }
  // gloam: on antlers
  patch(c, 30, 8, 2.6, 1.6, false); patch(c, 12.5, 10, 2, 1.6, false);
  drip(c, 30, 10, 4); drip(c, 13, 12, 2); drip(c, 36, 11, I ? 4 : 3);
  // eye
  if (H) squint(c, 10, 19, 3, 1);
  else { gEye(c, 10, 19, 3, 3); if (A) c.line(9, 17, 13, 18, INK); }
  c.set(8, 22, BLUSH);
  c.at();
  // gloam: flank, drips
  patch(c, 38, 32, 5, 3.5); patch(c, 44, 38, 2.6, 2.2, false); patch(c, 30, 39, 2.4, 2, false);
  drip(c, 37, 36, 4); drip(c, 45, 41, 3); drip(c, 30, 41, 2);
  // flank highlight dapples
  c.onto(() => { for (const [x, y] of [[33, 30], [36, 29], [42, 30], [28, 31]]) c.set(x, y, FUR[3]); }, FUR);
  if (I) squash(c, 37);
  if (H) shear(c, 0.05, 44, 1);
  c.outline();
  if (I) { c.set(7, 14, PAL.pink); c.set(33, 16, '#ffd0dc'); }
  if (A) { c.at(); c.px([[1, 27], [0, 26], [1, 29]], '#fff4d6'); c.px([[11, 53], [13, 52], [9, 54], [15, 54]], PAL.parchDark); c.px([[12, 54], [10, 52]], PAL.parchment); streaks(c, [[50, 22, 4], [48, 26, 5], [51, 30, 3]], FUR[3]); }
  if (H) { poof(c, 40, 22, true); star(c, 5, 17); c.at(); for (const [x, y] of [[44, 8], [47, 13], [8, 30], [50, 5]]) c.set(x, y, PAL.pink); }
  return bake(c);
}

function en_sunwasp(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(32, 32);
  const Y = ['#b87818', PAL.gold, PAL.sun, '#ffec9e'];
  const BLK = ['#241818', '#3a2828', '#54403a'];
  const WING = ['#a8d0e0cc', '#d8f0f8cc', '#ffffffdd'];
  // wings (behind): base / downstroke / raised high / bent back
  const wl = A ? [11, 2] : H ? [18, 5] : I ? [10, 7] : [13, 4], wr = A ? [19, 2] : H ? [25, 8] : I ? [23, 8] : [21, 5];
  c.tube([[15, 12], wl], 3, WING, 2.4); c.tube([[18, 12], wr], 2.8, WING, 2.2);
  c.path([[15, 11], [wl[0] + 0.5, wl[1] + 1]], '#8ab8cc'); c.path([[18, 11], [wr[0] - 0.5, wr[1] + 1]], '#8ab8cc');
  // legs (tucked in the dive)
  if (A) { c.path([[12, 18], [10, 21], [8, 21]], BLK[0]); c.path([[15, 19], [14, 22]], BLK[0]); }
  else { c.path([[12, 18], [10, 22], [9, 24]], BLK[0]); c.path([[15, 19], [15, 23], [14, 25]], BLK[0]); c.path([[18, 19], [20, 23], [21, 25]], BLK[0]); }
  c.noOut.add(BLK[0]);
  // abdomen with stripes (curls under to aim the stinger forward)
  if (A) {
    c.sh(22.5, 18.5, 6.2, 4.8, Y); c.sh(18, 23, 2.8, 2.2, Y);
    c.onto(() => { for (const x of [20, 24, 28]) { c.vline(x, 12, 25, BLK[1]); c.vline(x + 1, 12, 25, BLK[1]); } c.line(16, 21, 19, 24, BLK[1]); }, Y);
    c.onto(() => { c.sh(22.5, 18.5, 6.2, 4.8, [BLK[0], BLK[1], BLK[2], BLK[2]]); }, [BLK[1]]);
    c.shPoly([[16, 23], [11, 25.9], [17, 25.9]], [BLK[0], BLK[1], BLK[2]]); // stinger, aimed forward
  } else {
    c.sh(23, 18.5, 6.6, 5, Y);
    c.onto(() => { for (const x of [20, 24, 28]) { c.vline(x, 12, 25, BLK[1]); c.vline(x + 1, 12, 25, BLK[1]); } }, Y);
    c.onto(() => { c.sh(23, 18.5, 6.6, 5, [BLK[0], BLK[1], BLK[2], BLK[2]]); }, [BLK[1]]);
    c.shPoly(I ? [[29, 19], [31, 21], [29, 22]] : [[29, 18], [31, 20], [29, 21]], [BLK[0], BLK[1], BLK[2]]); // stinger
  }
  // thorax + head
  c.sh(15, 15.5, 4, 3.8, [BLK[0], BLK[1], '#6a5040', '#8a6a50']);
  c.onto(() => c.hline(13, 16, 13, Y[2]), [BLK[1], '#6a5040', '#8a6a50']);
  c.sh(8.5, 15, 4.6, 4.2, Y);
  // antennae
  if (I) { c.path([[7, 11], [4, 8], [2, 8]], BLK[0]); c.path([[10, 11], [9, 7], [7, 6]], BLK[0]); }
  else if (H) { c.path([[7, 11], [6, 8], [7, 6]], BLK[0]); c.path([[10, 11], [12, 8], [13, 6]], BLK[0]); }
  else { c.path([[7, 11], [5, 7], [3, 6]], BLK[0]); c.path([[10, 11], [10, 7], [8, 5]], BLK[0]); }
  // gloam
  patch(c, 24, 15.5, 2.4, 1.8); drip(c, 24, 23, 3); drip(c, 27, 22, I ? 2 : 1);
  // face
  if (H) { squint(c, 5, 14, 3, 1); c.px([[5, 19], [6, 18], [7, 19], [8, 18]], INK); }
  else {
    gEye(c, 5, 14, 3, 3);
    if (A) { c.px([[5, 18], [6, 18], [7, 18], [8, 18]], INK); c.px([[3, 19], [2, 20]], BLK[0]); c.px([[4, 17], [3, 16]], BLK[0]); } // mandibles open
    else { c.px([[5, 18], [6, 17], [7, 17], [8, 18]], INK); c.px([[4, 19], [3, 20]], BLK[0]); }
  }
  if (H) shear(c, 0.08, 26, 1);
  c.outline();
  if (A) streaks(c, [[26, 26, 3], [29, 15, 2], [28, 11, 3]], '#fff4d6');
  if (H) { poof(c, 22, 6); star(c, 3, 11); }
  return bake(c);
}

function en_dusttoad(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(32, 32);
  const T = ['#7a5428', '#aa7c3e', '#d0a45e', '#ead08e'];
  const BELLY = ['#d0b080', '#f0dcae', '#fff0cc'];
  // back leg
  c.sh(25, 26, 5, 3.4, T);
  // body
  c.sh(16.5, 21.5, 12.5, 7.4, T);
  c.onto(() => c.sh(12, 26, 9, 3.6, BELLY), T);
  // eye bumps
  c.sh(9, 13.8, 3.6, 3.4, T); c.sh(17, 13, 3.6, 3.4, T);
  // warts
  c.onto(() => { for (const [x, y] of [[20, 18], [24, 20], [27, 22], [22, 23], [26, 17], [18, 21]]) { c.set(x, y, T[0]); c.set(x - 1, y - 1, T[3]); } }, T);
  // gloam
  patch(c, 23, 16, 3.6, 2.4); patch(c, 28, 21, 1.6, 2, false); drip(c, 28, 23, I ? 2 : 3); drip(c, 21, 18, I ? 2 : 1);
  // throat sac puffs out on the breath
  if (I) { c.sh(8.5, 24.2, 4.2, 2.8, BELLY); c.set(7, 23, BELLY[2]); }
  // front feet
  c.sh(7, 28.5, 3, 1.6, T); c.sh(17, 29, 3, 1.5, T);
  c.px([[5, 29], [7, 29], [9, 29], [15, 29], [17, 29], [19, 29]], T[0]);
  // eyes
  if (H) { squint(c, 8, 12, 3, 1); squint(c, 15, 12, 3, -1); }
  else if (A) { for (const ex of [7, 15]) { c.rect(ex, 12, 4, 3, GLOW.mid); c.rect(ex + 1, 13, 2, 2, GLOW.core); c.set(ex, 12, GLOW.hot); c.line(ex - 1, 10 + (ex === 7 ? 0 : 1), ex + 3, 11 - (ex === 7 ? 0 : 1) + (ex === 7 ? 1 : 0), INK); } }
  else {
    // half-lidded glowing eyes
    for (const ex of [7, 15]) { c.rect(ex, 13, 4, 2, GLOW.mid); c.hline(ex, ex + 3, 12, T[1]); c.hline(ex, ex + 3, 12, INK); c.set(ex, 13, GLOW.hot); c.set(ex + 1, 14, GLOW.core); }
    c.set(6, 12, INK); c.set(15, 11, INK);
  }
  // mouth: wide grumpy line / gaping with the tongue lashing out / wobbly on a hit
  if (A) {
    c.poly([[2, 20], [8, 19], [15, 21], [17, 22], [12, 25], [5, 25], [2, 23]], INK);
    c.poly([[4, 21], [8, 20.5], [14, 22], [11, 24], [6, 24]], '#8a2a3a');
    c.tube([[9, 23], [5, 23], [1, 22]], 1, [PAL.rose, PAL.pink, '#ffd0dc']); c.sh(1.2, 21.5, 1.4, 1.4, [PAL.rose, PAL.pink, '#ffd0dc']);
  } else if (H) {
    c.path([[3, 21], [5, 20], [7, 21], [9, 20], [11, 21], [14, 21], [17, 22]], INK);
  } else c.path([[3, 21], [7, 20], [14, 21], [17, 22]], INK);
  c.set(5, 22, BLUSH); c.set(6, 22, BLUSH);
  if (!A) { c.set(3, 19, T[0]); c.set(5, 19, T[0]); } // nostrils
  if (A) shear(c, 0.06, 27, -1);
  if (H) shear(c, 0.07, 27, 1);
  c.outline();
  if (A) { c.at(); c.px([[23, 30], [26, 29], [29, 30], [21, 29]], PAL.parchDark); c.px([[25, 30], [28, 29]], PAL.parchment); }
  if (H) { poof(c, 22, 7); star(c, 2, 16); c.at(); c.px([[4, 30], [2, 29], [11, 30]], PAL.parchDark); }
  return bake(c);
}

function en_brassbeetle(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(32, 32);
  const BR = ['#5a3a14', '#96621e', '#d09a3a', '#f6d77e', '#fffbe0'];
  const DARK = ['#1e1a18', '#342a22', '#4e3e30'];
  const WING = ['#b8a8a0bb', '#e0d8d0cc', '#fffaf0dd'];
  // flight wings unfurl from under the shell on the charge
  if (A) {
    c.shPoly([[17, 16], [20, 6], [26, 2], [30, 4], [27, 11], [22, 17]], WING);
    c.path([[18, 15], [22, 7], [27, 3]], '#9a8a80'); c.path([[20, 16], [26, 9]], '#9a8a80');
  }
  // legs (shuffle at idle)
  const f = I ? 1 : 0;
  c.path([[10, 24], [8 - f, 28], [6 - f, 29]], DARK[0]); c.path([[16, 25], [15 + f, 29], [13 + f, 29]], DARK[0]); c.path([[23, 25], [25 - f, 28], [27 - f, 29]], DARK[0]);
  c.noOut.add(DARK[0]);
  // head + horn (lowered forward to ram, knocked up on a hit)
  if (A) c.at(-1, 1); if (H) c.at(1, -1);
  c.sh(8, 20, 4.4, 4, DARK);
  if (A) c.tube([[6, 19], [3, 16], [1, 13]], 1.3, BR.slice(0, 4), 0.6);
  else c.tube([[6, 18], [4, 13], I ? [4.5, 8.5] : [5, 8]], 1.3, BR.slice(0, 4), 0.6);
  if (!A) c.set(4, 9, BR[3]);
  c.at();
  // shell
  c.sh(19, 18.5, 10, 7.6, BR, TH[5]);
  c.line(12, 18, 28, 18, BR[0]); c.line(12, 19, 28, 19, BR[1]); // wing split
  if (A) { c.line(13, 17, 28, 16, BR[0]); c.line(20, 17, 28, 17, BR[1]); } // shell cracks open
  c.onto(() => { for (const [x, y] of [[14, 14], [19, 12], [24, 14], [15, 22], [20, 23], [25, 21]]) { c.set(x, y, BR[0]); c.set(x, y - 1, BR[3]); } }, BR);
  c.onto(() => { c.hline(12, 26, 25, BR[0]); }, BR);
  if (I) c.onto(() => { c.set(16, 12, BR[4]); c.set(17, 12, BR[4]); c.set(15, 13, BR[4]); }, BR); // glint travels
  // gloam
  patch(c, 24, 13.5, 3, 2); patch(c, 17, 23, 2, 1.6, false); drip(c, 22, 25, 3); drip(c, 17, 25, I ? 2 : 1);
  // eye
  if (A) c.at(-1, 1); if (H) c.at(1, -1);
  if (H) { squint(c, 6, 18, 3, 1); c.px([[4, 23], [5, 22], [6, 23], [7, 22]], INK); }
  else { gEye(c, 6, 19, 3, 2); c.px([[4, 23], [5, 22], [7, 23]], INK); }
  c.at();
  if (H) shear(c, 0.06, 27, 1);
  c.outline();
  if (A) streaks(c, [[28, 20, 3], [29, 23, 2], [27, 26, 3]], BR[3]);
  if (H) { poof(c, 20, 5); star(c, 1, 13); c.at(); c.set(24, 10, BR[3]); c.set(27, 8, BR[2]); }
  return bake(c);
}

function en_emberfly(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(32, 32);
  const DARK = ['#2a1e22', '#40302e', '#5a4440'];
  const EMBER = H ? ['#7a2a1e', '#b8422a', PAL.orange, '#ffb04a', PAL.sun] : ['#b8422a', PAL.orange, '#ffb04a', PAL.sun, '#fff6c8'];
  const HALO = ['#ffb04a33', '#ffd35c55'];
  c.noOut.add(HALO[0]); c.noOut.add(HALO[1]);
  // glow halo around the tail (breathes with the flame; bottom edge fixed)
  if (A) { c.ell(22, 18.5, 9.8, 9.5, HALO[0]); c.ell(22, 19, 9, 8.2, HALO[1]); }
  else if (H) { c.ell(22, 20, 7.5, 8, HALO[0]); }
  else { c.ell(22, 19, 9, 9, HALO[0]); c.ell(22, 19, I ? 7.2 : 8.2, I ? 6.4 : 7.2, HALO[1]); }
  // wings
  const WG = ['#c0d8e0bb', '#e8f6fabb', '#ffffffcc'];
  const wl = A ? [10, 3] : H ? [17, 6] : I ? [10, 7] : [12, 5], wr = A ? [19, 3] : H ? [24, 8] : I ? [23, 8] : [21, 6];
  c.tube([[14, 13], wl], 3.2, WG, 2.2); c.tube([[17, 13], wr], 2.8, WG, 2);
  c.path([[14, 12], [wl[0] + 0.5, wl[1] + 1]], '#9ac0cc'); c.path([[17, 12], [wr[0] - 1, wr[1] + 1]], '#9ac0cc');
  // legs
  c.path([[12, 18], [11, 22]], DARK[0]); c.path([[15, 19], [15, 23]], DARK[0]);
  c.noOut.add(DARK[0]);
  // glowing abdomen (flickers brighter at idle, blazes to attack)
  c.sh(22, 19, 6, 5, EMBER, A ? [-0.6, -0.2, 0.15, 0.5] : I ? [-0.35, 0.05, 0.4, 0.7] : [-0.2, 0.2, 0.5, 0.8]);
  c.onto(() => { c.vline(19, 13, 25, '#8a2e1e'); }, EMBER);
  // thorax (dark with red shoulder band) and head
  c.sh(14.5, 16, 3.8, 3.6, DARK);
  c.onto(() => c.hline(12, 17, 14, '#c8402e'), DARK);
  c.sh(9, 15.5, 3.8, 3.6, DARK);
  // antennae
  if (I) { c.path([[8, 12], [5, 9], [3, 9]], DARK[0]); c.path([[10, 12], [10, 8], [8, 6]], DARK[0]); }
  else if (H) { c.path([[8, 12], [7, 9], [8, 7]], DARK[0]); c.path([[10, 12], [12, 9], [13, 7]], DARK[0]); }
  else { c.path([[8, 12], [6, 8], [4, 7]], DARK[0]); c.path([[10, 12], [11, 8], [10, 6]], DARK[0]); }
  // gloam
  patch(c, 15, 17, 1.8, 1.4, false); drip(c, 15, 19, I ? 3 : 2); patch(c, 25, 16, 1.6, 1.4, false);
  // face
  if (H) { squint(c, 6, 14, 3, 1); c.px([[6, 18], [7, 17], [8, 18]], GLOW.rim); }
  else if (A) { gEye(c, 6, 14, 3, 3); c.rect(5, 18, 3, 1, INK); c.set(4, 18, EMBER[2]); }
  else { gEye(c, 6, 14, 3, 3); c.px([[6, 18], [7, 17], [8, 18]], GLOW.rim); }
  if (H) shear(c, 0.08, 24, 1);
  c.outline();
  // sparks
  c.at();
  const sparks = A ? [[29, 11], [30, 14], [27, 27], [26, 8]] : H ? [[28, 25], [12, 26]] : I ? [[28, 10], [31, 15], [26, 26], [13, 27]] : [[29, 11], [30, 14], [27, 27], [12, 26]];
  for (const [x, y] of sparks) c.set(x, y, PAL.sun);
  if (A) { for (const [x, y, col] of [[3, 18, PAL.sun], [2, 18, PAL.orange], [1, 17, '#ffb04a'], [0, 19, PAL.orange], [2, 20, PAL.sun], [3, 16, '#fff6c8']]) c.set(x, y, col); }
  if (H) { poof(c, 21, 6); star(c, 3, 11); }
  return bake(c);
}

function en_sandmantis(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(40, 40);
  const S = ['#6e5028', '#a07c44', '#cca868', '#ead49c'];
  const SB = ['#5a4020', S[0], S[1]];
  const WING = ['#6e7a3e', '#96a45a', '#c4cc88', '#e4e8b4'];
  const EYE = [GLOW.rim, GLOW.mid, GLOW.core];
  const LEG = '#5a4020';
  // walking legs: thin stilts, back knees high
  for (const pts of [[[21, 29], [18, 32], [16, 37]], [[23, 30], [25, 33], [24, 37]], [[27, 30], [31, 28], [33, 37]], [[30, 30], [36, 28], [38, 37]]]) c.path(pts, LEG);
  c.px([[15, 37], [23, 37], [32, 37], [37, 37]], LEG);
  c.noOut.add(LEG);
  // plump leaf-shaped abdomen, resting low
  c.tube([[21, 27], [28, 28.5], [34, 29.5], [37, 29]], 4, S, 2);
  c.onto(() => { for (const x of [27, 30, 33]) c.line(x, 29, x, 32, S[0]); }, S);
  // folded leafy wings over the back
  c.tube([[20, 24.5], [28, 24.8], [35, 26.8]], 2.6, WING, 1.2);
  c.line(22, 23, 33, 25, WING[3]); c.line(23, 26, 34, 27, WING[0]);
  // gloam
  patch(c, 30, 29.5, 3, 2.2); patch(c, 25, 25, 2, 1.4, false);
  drip(c, 31, 31, I ? 4 : 3); drip(c, 35, 30, 2);
  // head group: tips forward to strike, snaps back on a hit
  const HD = A ? [-1, 1] : H ? [2, -1] : [0, 0];
  // slim neck (prothorax), rearing up
  c.tube([[22, 27], [18, 21], [14 + HD[0], 13 + HD[1]]], 1.9, S, 1.4);
  // forelegs: praying under the chin / raptorial strike / dropped limp on a hit
  const arm = (dx, R, spines) => {
    if (A) { c.tube([[16 + dx, 19], [13 + dx, 22]], 1.2, R); c.tube([[13 + dx, 22], [5 + dx, 15]], 1.5, R, 1.1); c.tube([[5 + dx, 15], [2 + dx, 19], [3 + dx, 23]], 1, R, 0.5); if (spines) { c.px([[8, 19], [10, 20]], S[3]); c.px([[2, 18], [2, 20]], S[3]); } }
    else if (H) { c.tube([[16 + dx, 19], [13 + dx, 23]], 1.2, R); c.tube([[13 + dx, 23], [9 + dx, 26]], 1.5, R, 1.1); c.tube([[9 + dx, 26], [7 + dx, 29], [8 + dx, 31]], 1, R, 0.5); }
    else { c.tube([[16 + dx, 19], [13 + dx, 23]], 1.2, R); c.tube([[13 + dx, 23], [8 + dx, 18.5]], 1.5, R, 1.1); c.tube([[8 + dx, 18.5], [6.5 + dx, 21], [8 + dx, 23]], 1, R, 0.5); if (spines) { c.px([[10, 22], [11, 23]], S[3]); c.set(6, 21, S[3]); } }
  };
  arm(2, SB, false);
  // head: wide and round, big glassy eyes perched on the corners, facing left
  c.at(...HD);
  c.sh(12, 10, 6.4, 5, S);
  c.shPoly([[8, 12], [16, 12], [12, 16.5]], S); c.set(12, 16, S[1]); // little chin
  // antennae (flick at idle, perk up to strike, flop on a hit)
  const [al, ar] = I ? [[[10, 6], [8, 3], [5, 3], [4, 4]], [[14, 6], [16, 2], [19, 1], [20, 2]]]
    : A ? [[[10, 6], [8, 2], [5, 0], [3, 0]], [[14, 6], [15, 1], [18, 0], [20, 0]]]
    : H ? [[[10, 6], [8, 4], [6, 5], [5, 7]], [[14, 6], [17, 4], [20, 5], [21, 7]]]
    : [[[10, 6], [8, 2], [5, 1], [4, 2]], [[14, 6], [16, 2], [19, 0], [20, 1]]];
  c.path(al, S[0]); c.path(ar, S[0]);
  if (H) { c.sh(7, 8.5, 2.8, 2.8, S); c.sh(17, 8.5, 2.4, 2.6, S); squint(c, 6, 7, 3, 1); squint(c, 16, 7, 3, -1); }
  else {
    c.sh(7, 8.5, 3, 3.1, EYE); c.sh(17, 8.4, 2.5, 2.9, EYE);
    c.rect(5, 8, 2, 2, '#6a5aa8'); c.rect(15, 8, 2, 2, '#6a5aa8'); // pupils glance left
    c.set(6, 7, WHITE); c.set(7, 7, GLOW.hot); c.set(16, 7, WHITE);
    if (A) { c.line(4, 5, 9, 7, INK); c.line(15, 7, 19, 5, INK); } // focused
    else { c.px([[8, 5], [9, 5]], INK); c.px([[15, 5], [16, 5]], INK); } // small grumpy brows
  }
  c.px([[9, 12], [15, 12]], BLUSH);
  if (A) { c.rect(11, 13, 2, 2, INK); c.set(11, 14, '#a8325c'); } else if (H) c.px([[10, 14], [11, 13], [12, 14], [13, 13]], INK); else c.px([[11, 14], [12, 13], [13, 14]], INK);
  c.at();
  arm(0, S, true);
  if (I) squash(c, 22);
  if (H) shear(c, 0.07, 32, 1);
  c.outline();
  if (A) { c.at(); c.path([[1, 8], [0, 12], [0, 17]], '#fff4d6'); c.path([[3, 6], [2, 7]], '#fff4d6'); }
  if (H) { poof(c, 27, 14); star(c, 2, 10); }
  return bake(c);
}

function boss_scorchmoth(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = canvas(56, 56);
  const WING = ['#7a2a1a', '#b84a24', '#e07a34', '#f5a850'];
  const WING2 = ['#6a2418', '#a04022', '#c86a30', '#e8904a'];
  const EDGE = ['#3e1a14', '#5a2418'];
  const FUZZ = ['#b89a6a', '#e8d4a4', '#fff4d6', WHITE];
  const SUN = ['#b87818', PAL.gold, PAL.sun, '#fff2b0'];
  // upper wings lift at idle, flare up to attack, droop on a hit; lower wings stay planted
  const UW = A ? [0, -3] : H ? [1, 2] : I ? [0, -1] : [0, 0];
  // left half, then mirror (paint order matches the base; upper-wing parts ride the UW offset)
  const up = () => c.at(...UW), low = () => c.at();
  // lower wing
  low(); c.shPoly([[26, 30], [18, 30], [9, 36], [7, 44], [12, 50], [19, 49], [25, 42]], WING2);
  // upper wing
  up(); c.shPoly([[26, 24], [20, 13], [12, 6], [4, 5], [1, 12], [2, 22], [7, 30], [16, 33], [26, 30]], WING);
  // dark scalloped edge + cream dots
  up(); c.onto(() => { c.path([[4, 5], [1, 12], [2, 22], [7, 30]], EDGE[0]); c.path([[5, 6], [2, 12], [3, 22], [8, 29]], EDGE[1]); });
  low(); c.onto(() => { c.path([[9, 36], [7, 44], [12, 50], [19, 49]], EDGE[0]); c.path([[10, 37], [8, 44], [12, 49], [18, 48]], EDGE[1]); });
  up(); for (const [x, y] of [[3, 9], [2, 15], [3, 21], [6, 26]]) c.set(x, y, '#fff4d6');
  low(); for (const [x, y] of [[9, 41], [9, 46], [14, 48]]) c.set(x, y, '#fff4d6');
  // wing veins
  up(); c.onto(() => { c.path([[25, 25], [14, 16], [6, 9]], WING[0]); c.path([[24, 28], [10, 25]], WING[0]); });
  low(); c.onto(() => c.path([[24, 33], [14, 43]], WING2[0]));
  // sun-eye on upper wing (rays blaze out to attack, the eye shuts on a hit)
  up();
  const ex = 12.5, ey = 17, ray = A ? 9 : 7;
  for (let a = I ? 22 : 0; a < 360; a += 45) { const r = (a * Math.PI) / 180; c.tube([[ex + Math.cos(r) * 5, ey + Math.sin(r) * 5], [ex + Math.cos(r) * ray, ey + Math.sin(r) * ray]], A ? 1 : 0.8, [SUN[1], SUN[2]], 0.4); }
  c.sh(ex, ey, 5.2, 5.2, SUN);
  if (H) { c.sh(ex, ey, 3.6, 3.6, ['#8a2020', '#a83030', '#c04a3a']); c.hline(9, 16, 17, INK); c.hline(10, 15, 16, '#8a2020'); }
  else {
    if (!A) c.ell(ex, ey, 3.6, 3.6, PAL.red);
    c.sh(ex, ey, 3.6, 3.6, A ? [PAL.red, '#f06a50', '#ffb04a'] : ['#8a2020', PAL.red, '#f06a50']);
    c.sh(ex, ey, A ? 1.8 : 2.2, A ? 1.8 : 2.2, [INK, '#3a1e2a', '#5a2e40']);
    c.set(11, 15, WHITE); c.set(12, 15, GLOW.core);
  }
  // small eye on lower wing
  low(); c.sh(15, 42, 2.8, 2.8, SUN);
  if (H) c.hline(13, 17, 42, INK); else { c.sh(15, 42, 1.6, 1.6, [INK, '#3a1e2a']); c.set(14, 41, WHITE); }
  // gloam on lower wing and upper wing edge
  low(); patch(c, 19, 36, 2.8, 2.2); up(); patch(c, 6, 24, 2, 2.4, false);
  low(); drip(c, 17, 50, 3); up(); drip(c, 8, 30, 3); low(); drip(c, 20, 39, 2);
  // antenna (feathery)
  const ant = A ? [[26, 12], [22, 6], [19, 1], [16, 0]] : I ? [[26, 12], [23, 7], [20, 4], [17, 4]] : [[26, 12], [23, 7], [19, 3], [16, 2]];
  c.at(UW[0], Math.min(0, UW[1]));
  c.path(ant, '#5a3a28');
  const barbs = pose === 'base' ? [[22, 5], [20, 3], [18, 2], [24, 7]] : ant.slice(1);
  for (const [x, y] of barbs) { c.set(x, y - 1, '#b89a6a'); c.set(x - 1, y + 1, '#b89a6a'); }
  c.at();
  c.noOut.add('#5a3a28'); c.noOut.add('#b89a6a');
  c.mirror();
  // body (drawn after mirroring, centred on x=28)
  c.sh(28, 39, 3.6, 9, FUZZ);
  c.onto(() => { for (const y of [34, 37, 40, 43, 46]) c.hline(24, 32, y, FUZZ[0]); }, FUZZ);
  patch(c, 28, 44, 2.4, 2, false); drip(c, 28, 48, 3);
  c.sh(28, 25.5, 5, 5.2, FUZZ);
  c.sh(28, 16.5, 4.4, 3.8, ['#6a4a30', '#8e6a44', '#b08a5a', '#d0aa74']);
  // ruff collar
  for (let i = 0; i < 9; i++) c.sh(23.5 + i * 1.15, 20.5 + (i % 2), 1.3, 1.5, FUZZ);
  // crown
  c.hline(25, 30, 12, SUN[1]); c.px([[25, 11], [27, 10], [28, 10], [30, 11], [25, 10], [30, 10], [27.5, 9]], SUN[2]);
  c.set(27, 11, PAL.red); c.set(28, 11, PAL.red); c.set(27, 9, SUN[3]); c.set(28, 9, SUN[3]);
  if (I) c.set(25, 10, SUN[3]);
  // eyes + grumpy brows (symmetric)
  if (H) { squint(c, 24, 14, 3, 1); squint(c, 29, 14, 3, -1); c.rect(27, 18, 2, 2, INK); }
  else {
    for (const x of [24, 30]) { c.rect(x, 15, 2, 2, GLOW.mid); c.set(x, 15, GLOW.hot); c.set(x + 1, 16, GLOW.core); }
    c.line(23, 13, 26, 14, INK); c.line(32, 13, 29, 14, INK); c.set(25, 15, INK); c.set(30, 15, INK);
    if (A) { c.hline(26, 29, 18, INK); c.hline(26, 29, 19, INK); c.set(26, 19, '#fff4d6'); c.set(29, 19, '#fff4d6'); }
    else c.px([[26, 19], [27, 18], [28, 18], [29, 19]], INK);
  }
  c.outline();
  if (A) { c.at(); for (const [x, y] of [[4, 2], [51, 2], [1, 26], [54, 26], [10, 3], [45, 3]]) c.set(x, y, x % 3 ? PAL.sun : PAL.orange); }
  if (H) { poof(c, 34, 4, true); star(c, 17, 10); c.at(); c.set(4, 34, PAL.orange); c.set(51, 36, PAL.gold); }
  return bake(c);
}

registerSprites({
  ...framesOf('farmer', farmer),
  almanac: almanac(),
  vil_odile: vil_odile(),
  vil_rue: vil_rue(),
  vil_bram: vil_bram(),
  vil_juniper: vil_juniper(),
  vil_pell: vil_pell(),
  vil_mossy: vil_mossy(),
  ...framesOf('en_gloamslug', en_gloamslug),
  ...framesOf('en_burrlet', en_burrlet),
  ...framesOf('en_greycrow', en_greycrow),
  ...framesOf('en_moleling', en_moleling),
  ...framesOf('en_bramblehog', en_bramblehog),
  ...framesOf('boss_rootstag', boss_rootstag),
  ...framesOf('en_sunwasp', en_sunwasp),
  ...framesOf('en_dusttoad', en_dusttoad),
  ...framesOf('en_brassbeetle', en_brassbeetle),
  ...framesOf('en_emberfly', en_emberfly),
  ...framesOf('en_sandmantis', en_sandmantis),
  ...framesOf('boss_scorchmoth', boss_scorchmoth),
});
