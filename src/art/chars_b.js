// Fall + winter critters and bosses for Bramblewick.
// Sprites are composed with a tiny DOM-free raster toolkit (shaded ellipses, tubes, polygons,
// gloam patches) and then hand-detailed pixel by pixel. Output is plain rows for registerSprites.
import { registerSprites, PAL } from '../pixel.js';

// ---------------------------------------------------------------- palette (char -> colour)
const P = {
  k: PAL.ink, K: PAL.inkSoft,
  // gloam
  g: PAL.gloom, G: PAL.gloomDark, v: PAL.gloomGlow, V: '#e2d8ff', w: PAL.white,
  // pumpkin
  a: '#ffc56e', b: '#f29a3f', c: '#d06e2d', d: '#a2462a', e: '#6a2c1f',
  // wood / fur browns
  h: PAL.woodLight, i: PAL.wood, j: PAL.woodDark, J: '#3b2519',
  // leaf
  l: PAL.leafLight, m: PAL.leaf, n: PAL.leafDark, N: PAL.moss,
  // mustard
  p: '#f7d56a', q: '#e0a93c', r: '#ad7a2c',
  // straw
  s: '#fbe7a2', t: '#ecc466', u: '#c9953f', U: '#8f652d',
  // cream / parchment
  x: PAL.cream, y: PAL.parchment, z: PAL.parchDark, Z: '#b0925f',
  // plum
  P: '#a585cf', Q: PAL.purple, R: PAL.plum, S: '#30213f',
  // mushroom red
  A: '#ff9f76', B: '#e05a41', C: '#b23b33', D: '#782432',
  // winter
  W: PAL.snow, X: PAL.ice, Y: PAL.frost, E: '#6a8fc0', F: '#4a6697', H: '#33466f', I: '#232c50', L: '#161a35',
  // stars
  '*': '#fff6c9', '+': '#ffe07a',
  // crow
  5: '#4a4262', 6: '#2a2439', 7: '#6d6690',
  8: PAL.pink, o: PAL.blush, f: PAL.sun,
};

// ---------------------------------------------------------------- toolkit
const LIGHT = (() => { const v = [-0.5, -0.6, 0.62], l = Math.hypot(...v); return v.map(a => a / l); })();
const TH = { 1: [], 2: [0.35], 3: [0.72, 0.25], 4: [0.88, 0.6, 0.15], 5: [0.93, 0.75, 0.45, 0.05] };
const level = (l, n) => { const t = TH[n]; for (let i = 0; i < t.length; i++) if (l > t[i]) return i; return n - 1; };

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function mk(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const key = (x, y) => y * w + x;
  const c = {
    w, h, g, ox: 0, oy: 0,
    // c.at(dx, dy): integer offset applied to everything painted until reset (used to pose body parts)
    at(dx = 0, dy = 0) { c.ox = dx; c.oy = dy; },
    set(x, y, ch) { x = Math.floor(x) + c.ox; y = Math.floor(y) + c.oy; if (inb(x, y) && ch) g[y][x] = ch; },
    get(x, y) { x += c.ox; y += c.oy; return inb(x, y) ? g[y][x] : '.'; },
    solid(x, y) { return c.get(x, y) !== '.'; },
    clear(x, y) { x += c.ox; y += c.oy; if (inb(x, y)) g[y][x] = '.'; },
    // pixel runs: c.pts('k', [x,y], [x,y]...)
    pts(ch, ...ps) { for (const [x, y] of ps) c.set(x, y, ch); },
    line(x0, y0, x1, y1, ch) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) { c.set(x0, y0, ch); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    },
    path(ch, ps) { for (let i = 1; i < ps.length; i++) c.line(ps[i - 1][0], ps[i - 1][1], ps[i][0], ps[i][1], ch); },
    // ---- masks (Set of y*w+x)
    ell(cx, cy, rx, ry, clip) {
      const m = new Set();
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        if (!inb(x, y)) continue;
        const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1 && (!clip || clip(x, y))) m.add(key(x, y));
      }
      return m;
    },
    poly(pts) {
      const m = new Set();
      const ys = pts.map(p => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = 0; x < w; x++) {
        const px = x + 0.5, py = y + 0.5; let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
        }
        if (inside && inb(x, y)) m.add(key(x, y));
      }
      return m;
    },
    tube(pts, r0, r1 = r0) {
      const m = new Set();
      let total = 0; const segs = [];
      for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(L); total += L; }
      let acc = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = segs[i - 1];
        for (let s = 0; s <= L; s += 0.25) {
          const t = s / (L || 1), r = r0 + (r1 - r0) * ((acc + s) / (total || 1));
          const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t;
          for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++)
            if (inb(x, y) && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) m.add(key(x, y));
        }
        acc += L;
      }
      return m;
    },
    // hand-drawn mask: rows of '#' (in) / '.' (out), placed at x0,y0; mirror flips horizontally
    hand(rows, x0, y0, mirror = false) {
      const m = new Set();
      rows.forEach((row, yy) => [...row].forEach((ch, xx) => {
        const x = x0 + (mirror ? row.length - 1 - xx : xx), y = y0 + yy;
        if (ch === '#' && inb(x, y)) m.add(key(x, y));
      }));
      return m;
    },
    union(...ms) { const m = new Set(); for (const s of ms) for (const k of s) m.add(k); return m; },
    minus(a, b) { const m = new Set(); for (const k of a) if (!b.has(k)) m.add(k); return m; },
    each(m, fn) { for (const k of m) fn(k % w, Math.floor(k / w)); },
    fill(m, ch) { c.each(m, (x, y) => c.set(x, y, ch)); return m; },
    // ---- painters
    // sphere-shaded (optionally rotated) ellipse
    ball(cx, cy, rx, ry, ramp, o = {}) {
      const ang = o.ang || 0, co = Math.cos(ang), si = Math.sin(ang), R = Math.max(rx, ry);
      const m = new Set();
      for (let y = Math.floor(cy - R - 1); y <= cy + R + 1; y++) for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
        if (!inb(x, y) || (o.clip && !o.clip(x, y))) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const u = (dx * co + dy * si) / rx, v = (-dx * si + dy * co) / ry, d = u * u + v * v;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d), sx = u * co - v * si, sy = u * si + v * co;
        const l = sx * LIGHT[0] + sy * LIGHT[1] + nz * LIGHT[2];
        c.set(x, y, ramp[level(l + (o.bias || 0), ramp.length)]);
        m.add(key(x, y));
      }
      return m;
    },
    // soft "pillow" shading for any mask, from a rounded height field
    puff(m, ramp, R = 3, bias = 0) {
      const dist = new Map();
      c.each(m, (x, y) => {
        let best = R;
        for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) {
          if (!m.has(key(x + xx, y + yy)) || !inb(x + xx, y + yy)) { const d = Math.hypot(xx, yy) - 0.5; if (d < best) best = d; }
        }
        dist.set(key(x, y), best);
      });
      const H = (x, y) => { const d = dist.get(key(x, y)); if (d === undefined || !inb(x, y)) return 0; const t = Math.min(d, R) / R; return Math.sqrt(1 - (1 - t) * (1 - t)) * R; };
      c.each(m, (x, y) => {
        const hx = (H(x + 1, y) - H(x - 1, y)) / 2, hy = (H(x, y + 1) - H(x, y - 1)) / 2;
        const n = [-hx, -hy, 1], L = Math.hypot(...n);
        const l = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / L;
        c.set(x, y, ramp[level(l + bias, ramp.length)]);
      });
      return m;
    },
    // dark seam where a front part meets something already drawn behind it
    sep(m, ch, sides = 'all') {
      const out = [];
      c.each(m, (x, y) => {
        const nb = sides === 'lower' ? [[1, 0], [0, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of nb) { const k = key(x + dx, y + dy); if (inb(x + dx, y + dy) && !m.has(k) && c.solid(x + dx, y + dy)) { out.push([x, y]); break; } }
      });
      for (const [x, y] of out) c.set(x, y, ch);
    },
    // glowing lilac critter eye, top-left glint
    eye(x, y, size = 2, socket = null) {
      const n = size;
      if (socket) {
        for (let yy = 0; yy <= n; yy++) for (let xx = -1; xx <= n; xx++) {
          if (xx >= 0 && xx < n && yy < n) continue;
          if (yy === n && (xx < 0 || xx >= n)) continue;
          c.set(x + xx, y + yy, socket);
        }
      }
      if (n === 2) { c.pts('w', [x, y]); c.pts('V', [x + 1, y], [x, y + 1]); c.pts('v', [x + 1, y + 1]); }
      else { for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) c.set(x + xx, y + yy, (xx + yy) >= 3 ? 'v' : 'V'); c.set(x, y, 'w'); c.set(x + 1, y, 'w'); c.set(x, y + 1, 'w'); }
    },
    // grey-violet gloam blotch painted over existing solid pixels, with hanging drips
    gloam(cx, cy, r, o = {}) {
      const rnd = rng(o.seed || (cx * 97 + cy * 13));
      const lobes = Array.from({ length: 12 }, () => 0.7 + rnd() * 0.55);
      const protect = o.protect || 'wVvk';
      const cols = new Map();
      for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        if (!c.solid(x, y) || protect.includes(c.get(x, y))) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
        const li = a * 12, i0 = Math.floor(li) % 12, i1 = (i0 + 1) % 12, f = li - Math.floor(li);
        const rr = r * (lobes[i0] * (1 - f) + lobes[i1] * f);
        if (Math.hypot(dx, dy) > rr) continue;
        const lit = (dx + dy) < -rr * 0.35;
        c.set(x, y, lit ? 'g' : 'G');
        if (rnd() < (o.speck ?? 0.08)) c.set(x, y, 'v');
        if (!cols.has(x) || cols.get(x) < y) cols.set(x, y);
      }
      const xs = [...cols.keys()].sort((a, b) => a - b);
      const drips = o.drips ?? 2;
      for (let d = 0; d < drips && xs.length; d++) {
        const x = xs[Math.floor((d + 0.5) / drips * xs.length * 0.8 + xs.length * 0.1)];
        const len = (o.drip || 3) - Math.floor(rnd() * 2);
        const y0 = cols.get(x);
        for (let k = 1; k <= len; k++) c.set(x, y0 + k, k === len ? 'g' : 'G');
      }
    },
    // ink outline into transparent 4-neighbours
    outline(ch = 'k') {
      const add = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (c.solid(x, y)) continue;
        if (c.solid(x - 1, y) || c.solid(x + 1, y) || c.solid(x, y - 1) || c.solid(x, y + 1)) add.push([x, y]);
      }
      for (const [x, y] of add) g[y][x] = ch;
    },
    // light a rim: pixels of the given chars whose up/left neighbour is empty
    rim(chars, ch) {
      const add = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
        if (chars.includes(g[y][x]) && (!c.solid(x - 1, y) || !c.solid(x, y - 1))) add.push([x, y]);
      for (const [x, y] of add) g[y][x] = ch;
    },
    sparkle(x, y, core = 'w', arm = 'V') { c.set(x, y, core); c.set(x - 1, y, arm); c.set(x + 1, y, arm); c.set(x, y - 1, arm); c.set(x, y + 1, arm); },
    rows() { return g.map(r => r.join('')); },
  };
  return c;
}

const sprite = c => ({ palette: P, rows: c.rows() });

// ---------------------------------------------------------------- animation helpers
// Frames: pose 'base' | 'idle' (<id>~1) | 'atk' (<id>~atk) | 'hurt' (<id>~hurt). Same size + ground row as base.
// Remove row y and drop everything above it by n px (breathing bob; the ground row never moves).
function squash(c, y, n = 1) {
  for (let k = 0; k < n; k++) { for (let r = y; r > 0; r--) c.g[r] = c.g[r - 1]; c.g[0] = Array(c.w).fill('.'); }
}
function shiftRow(c, y, s) {
  const row = Array(c.w).fill('.');
  c.g[y].forEach((v, x) => { if (v !== '.' && x + s >= 0 && x + s < c.w) row[x + s] = v; });
  c.g[y] = row;
}
// Lean everything above row y0: dir -1 = forward (enemies face left), +1 = back. k = px per row,
// scaled down so nothing leaves the canvas (1px kept for the outline).
function shear(c, k, y0, dir) {
  let f = 1;
  for (let y = 0; y < y0; y++) {
    const s = Math.round((y0 - y) * k); if (!s) continue;
    const xs = []; c.g[y].forEach((v, x) => { if (v !== '.') xs.push(x); }); if (!xs.length) continue;
    const room = dir < 0 ? Math.min(...xs) - 1 : c.w - 2 - Math.max(...xs);
    f = Math.min(f, Math.max(0, room) / s);
  }
  for (let y = 0; y < y0; y++) { const s = Math.floor(Math.round((y0 - y) * k) * f + 1e-9); if (s) shiftRow(c, y, s * dir); }
}
function nudge(c, dx, y0 = 0, y1 = c.h - 1) { for (let y = y0; y <= y1; y++) shiftRow(c, y, dx); }
// Hurt squint: '>' (dir 1) or '<' (dir -1) in an eye box at x,y of size s (paint the lid colour first).
function squint(c, x, y, s = 2, dir = 1, ch = 'k') {
  const pts = s >= 3 ? [[0, 0], [1, 1], [2, 1], [0, 2]] : [[0, 0], [1, 1], [0, 2]];
  for (const [i, j] of pts) c.set(dir > 0 ? x + i : x + s - 1 - i, y + j, ch);
}
// Little burst of gloam wisps knocked loose on a hit (after the outline, no ink).
function poof(c, x, y, big = false) {
  c.at();
  const blobs = big ? [[0, 2], [3, 0], [6, 2], [2, 4]] : [[0, 1], [3, 0], [5, 2]];
  for (const [i, j] of blobs) { c.pts('g', [x + i, y + j], [x + i + 1, y + j], [x + i, y + j + 1]); c.set(x + i + 1, y + j + 1, 'G'); c.set(x + i, y + j, '7'); }
  c.set(x + 2, y + 3, 'v'); c.set(x + (big ? 8 : 7), y, 'v'); c.set(x + 5, y - 1, 'w'); c.set(x - 1, y, 'V');
}
// Impact star (white core, cream arms).
function star(c, x, y) { c.at(); c.set(x, y, 'w'); for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) c.set(x + i, y + j, 'x'); }
function streaks(c, list, ch = 'x') { c.at(); for (const [x, y, len] of list) c.line(x, y, x + len - 1, y, ch); }
const framesOf = (id, fn) => ({ [id]: fn('base'), [id + '~1']: fn('idle'), [id + '~atk']: fn('atk'), [id + '~hurt']: fn('hurt') });

// ramps (light -> dark)
const PUMP = ['a', 'b', 'c', 'd'];
const WOOD = ['h', 'i', 'j', 'J'];
const PLUM = ['P', 'Q', 'R', 'S'];
const CREAM = ['x', 'y', 'z', 'Z'];
const SNOW = ['w', 'W', 'X', 'Y'];
const ICE = ['W', 'X', 'Y', 'E', 'F'];
const NAVY = ['Y', 'E', 'F', 'H'];
const NIGHT = ['v', 'H', 'I', 'L'];
const STRAW = ['s', 't', 'u', 'U'];
const MUST = ['p', 'q', 'r', 'U'];
const LEAF = ['l', 'm', 'n'];
const RED = ['A', 'B', 'C', 'D'];

// ================================================================ FALL
function gourdling(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(32, 32);
  c.ball(11, 29.3, 3.3, 1.7, ['i', 'j', 'J']);
  c.ball(21, 29.3, 3.3, 1.7, ['i', 'j', 'J']);
  c.ball(21.5, 20.5, 7.5, 8, PUMP, { bias: -0.05 });
  c.ball(8.5, 20.5, 5.5, 7.5, PUMP);
  const mid = c.ball(14.5, 20, 7.5, 8.7, PUMP, { bias: 0.05 });
  c.sep(mid, 'd');
  // little arm (raised as a fist to attack)
  if (A) { c.ball(3.5, 16.5, 1.9, 1.7, ['b', 'c', 'd']); c.pts('c', [4, 18], [5, 19]); }
  else if (H) c.ball(4, 24, 1.8, 1.5, ['c', 'd']);
  else c.ball(4, 23, 1.8, 1.5, ['c', 'd']);
  // stem + leaf + tendril (leaf flutters at idle, perks up to attack, bends on a hit)
  c.puff(c.poly([[14, 12], [14, 9], [15, 7], [17, 7], [17, 9], [17, 12]]), ['h', 'i', 'j'], 2);
  c.pts('J', [15, 7], [16, 7]);
  if (I) { c.ball(20.5, 10, 3.4, 1.8, LEAF, { ang: -0.15 }); c.line(18, 11, 22, 10, 'n'); }
  else if (A) { c.ball(20, 8.5, 3.4, 1.8, LEAF, { ang: -0.8 }); c.line(18, 10, 21, 7, 'n'); }
  else if (H) { c.ball(20.5, 11, 3.4, 1.8, LEAF, { ang: 0.3 }); c.line(18, 11, 22, 12, 'n'); }
  else { c.ball(20.5, 9.5, 3.4, 1.8, LEAF, { ang: -0.45 }); c.line(18, 11, 22, 8, 'n'); }
  if (I) c.pts('n', [13, 10], [12, 9], [11, 9], [10, 8], [9, 8], [9, 7]);
  else c.pts('n', [13, 10], [12, 9], [11, 9], [10, 8], [10, 7], [11, 6]);
  // gloam
  c.gloam(24, 16, 3.6, { seed: 3, drips: 2, drip: I ? 4 : 3 });
  c.gloam(6.5, 25, 2, { seed: 9, drips: 1, drip: 2 });
  // face (turned left)
  if (H) {
    squint(c, 9, 18, 2, 1); squint(c, 15, 18, 2, -1);
    c.pts('e', [11, 22], [12, 22], [11, 23], [12, 23]); c.pts('k', [11, 22]);
  } else {
    c.eye(9, 19); c.eye(15, 19);
    if (A) {
      c.pts('k', [8, 17], [9, 18], [10, 18], [15, 18], [16, 18], [17, 17]);
      c.fill(c.ell(12.5, 23, 3.4, 1.8), 'e'); c.pts('x', [10, 22], [12, 22], [14, 22]); c.pts('D', [12, 24], [13, 24]);
    } else {
      c.pts('k', [8, 17], [9, 17], [10, 18], [15, 18], [16, 17], [17, 17]);
      c.pts('e', [10, 23], [11, 22], [12, 22], [13, 22], [14, 22], [15, 23]);
      c.pts('x', [12, 23]);
    }
  }
  if (I) squash(c, 24);
  if (A) shear(c, 0.07, 27, -1);
  if (H) shear(c, 0.07, 27, 1);
  c.outline();
  if (A) streaks(c, [[29, 14, 2], [29, 20, 2]], 'z');
  if (H) { poof(c, 22, 5); star(c, 3, 14); }
  return sprite(c);
}

function sporecap(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(32, 32);
  // stem body + arms (flung up to puff spores)
  if (A) { c.ball(6.5, 20, 2.2, 1.7, ['y', 'z', 'Z']); c.ball(26, 20, 2.2, 1.7, ['y', 'z', 'Z']); }
  else { c.ball(7.5, 24.5, 2.2, 1.7, ['y', 'z', 'Z']); c.ball(25, 25, 2.2, 1.7, ['y', 'z', 'Z']); }
  const stem = c.ball(16, 23.5, 7.5, 7, CREAM);
  c.sep(stem, 'Z');
  // cap
  const cap = c.ball(16, 13.5, 13.5, 9.5, RED, { clip: (x, y) => y <= 15 });
  // underside / gills shadow on stem
  for (let x = 6; x <= 26; x++) c.set(x, 16, x % 2 ? 'Z' : 'z');
  for (let x = 10; x <= 22; x++) c.set(x, 17, 'z');
  // spots
  const inCap = (x, y) => cap.has(y * 32 + x);
  c.ball(9, 9, 2.4, 1.8, ['x', 'y', 'z'], { clip: inCap });
  c.ball(17, 6.5, 2, 1.4, ['x', 'y', 'z'], { clip: inCap });
  c.ball(13.5, 13, 1.6, 1.1, ['x', 'y', 'z'], { clip: inCap });
  c.ball(5, 13.5, 1.3, 1.1, ['y', 'z'], { clip: inCap });
  c.ball(21, 12, 1.6, 1.2, ['y', 'z'], { clip: inCap });
  c.gloam(24.5, 7.5, 3.5, { seed: 21, drips: 1, drip: 2 });
  c.gloam(27, 13.5, 2, { seed: 5, drips: 1, drip: I ? 4 : 3 });
  // face
  if (H) {
    squint(c, 11, 19, 2, 1); squint(c, 16, 19, 2, -1);
    c.pts('Z', [12, 25], [13, 24], [14, 25], [15, 24], [16, 25]);
  } else {
    c.eye(11, 20, 2, 'Z'); c.eye(16, 20, 2, 'Z');
    c.pts('k', [10, 18], [11, 18], [12, 19], [16, 19], [17, 18], [18, 18]);
    if (A) { c.fill(c.ell(14, 25, 2.2, 1.5), 'J'); c.pts('C', [14, 25]); }
    else c.pts('Z', [12, 25], [13, 24], [14, 24], [15, 24], [16, 25]);
  }
  c.pts('o', [9, 22], [19, 22]);
  if (I) squash(c, 26);
  if (A) shear(c, 0.12, 17, -1);
  if (H) shear(c, 0.12, 17, 1);
  c.outline();
  // floating spores (no outline): drift at idle, burst out front on the attack
  if (I) { c.pts('v', [3, 5], [28, 3], [2, 17], [30, 22], [25, 1]); c.pts('V', [5, 3], [29, 20]); }
  else if (A) {
    c.pts('v', [1, 16], [3, 13], [2, 20], [4, 22], [0, 12], [5, 18], [2, 24], [28, 2], [30, 20]);
    c.pts('V', [1, 18], [3, 16], [0, 21], [4, 11], [2, 14]); c.pts('P', [2, 17], [3, 19], [1, 14], [4, 15]);
  } else if (H) { c.pts('v', [3, 1], [28, 0], [6, 0], [30, 5], [24, 1]); c.pts('V', [2, 3], [29, 3]); poof(c, 23, 21); star(c, 2, 10); }
  else { c.pts('v', [3, 4], [28, 2], [2, 19], [30, 20], [26, 1]); c.pts('V', [4, 3], [29, 19]); }
  return sprite(c);
}

function hollowbat(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(32, 32);
  // wing pose: rotate about the shoulder - down at idle, up to attack, folded in on a hit
  const [phi, k] = I ? [-0.33, 0.92] : A ? [0.24, 1] : H ? [-0.3, 0.72] : [0, 1];
  const T = ([x, y]) => {
    const dx = (x - 14) * k, dy = y - 12, co = Math.cos(phi), si = Math.sin(phi);
    return [14 + dx * co - dy * si, 12 + dx * si + dy * co].map(v => Math.round(v * 2) / 2);
  };
  const TR = ([x, y]) => { const [a, b] = T([31 - x, y]); return [31 - a, b]; };
  const wingL = [[13, 12], [8, 6], [2, 4], [1, 9], [2, 16], [4, 13], [6, 17], [8, 14], [10, 18], [12, 15], [14, 18]];
  const wingR = wingL.map(([x, y]) => [31 - x, y]);
  const WING = ['P', 'Q', 'R', 'S'];
  c.puff(c.poly(wingL.map(T)), WING, 2);
  c.puff(c.poly(wingR.map(TR)), WING, 2);
  // wing bones
  const bone = (pts, f) => c.path('S', pts.map(f));
  bone([[13, 12], [7, 7], [2, 5]], T); bone([[8, 8], [4, 13]], T); bone([[11, 11], [8, 14]], T); bone([[12, 13], [12, 15]], T);
  bone([[18, 12], [24, 7], [29, 5]], TR); bone([[23, 8], [27, 13]], TR); bone([[20, 11], [23, 14]], TR); bone([[19, 13], [19, 15]], TR);
  // tatter holes
  for (const p of [[27, 12], [28, 12], [28, 13]]) { const [x, y] = TR(p); c.clear(Math.floor(x), Math.floor(y)); }
  // ears (flick at idle, pin back on a hit)
  c.puff(c.poly(I ? [[10, 12], [9, 4], [15, 10]] : H ? [[10, 12], [8, 5], [14, 11]] : [[10, 12], [10, 3], [15, 10]]), WOOD, 2);
  c.puff(c.poly(H ? [[17, 11], [22, 5], [21, 12]] : [[17, 10], [21, 3], [21, 12]]), WOOD, 2);
  c.pts('8', [11, 7], [11, 8], [12, 9], [20, 7], [20, 8], [19, 9]);
  // body
  const body = c.ball(15.5, 16, 6, 6.8, WOOD);
  c.ball(14.5, 18.5, 3.2, 3.2, ['y', 'z', 'Z'], { clip: (x, y) => body.has(y * 32 + x) && y > 16 });
  // feet
  c.pts('J', [13, 23], [13, 24], [17, 23], [17, 24]);
  c.gloam(25, 9, 3, { seed: 44, drips: 2, drip: 3 });
  c.gloam(17.5, 11, 2.2, { seed: 12, drips: 0 });
  // face
  if (H) {
    c.pts('i', [11, 14], [12, 14], [11, 15], [12, 15], [15, 14], [16, 14], [15, 15], [16, 15]);
    squint(c, 11, 13, 2, 1); squint(c, 15, 13, 2, -1);
    c.pts('J', [12, 18], [13, 17], [14, 18], [15, 17]);
  } else {
    c.eye(11, 14); c.eye(15, 14);
    c.pts('k', [10, 12], [11, 12], [12, 13], [15, 13], [16, 12], [17, 12]);
    if (A) { c.pts('J', [12, 17], [13, 17], [14, 17], [15, 17], [12, 18], [13, 18], [14, 18], [15, 18], [13, 19], [14, 19]); c.pts('w', [12, 18], [15, 18]); c.pts('C', [13, 19]); }
    else { c.pts('J', [12, 18], [13, 17], [14, 17], [15, 18]); c.pts('w', [13, 18]); }
  }
  if (A) nudge(c, -1, 0, 22);
  if (H) nudge(c, 1, 0, 22);
  c.outline();
  if (A) streaks(c, [[29, 17, 2], [28, 20, 3]], 'z');
  if (H) { poof(c, 22, 2); star(c, 4, 18); }
  return sprite(c);
}

function leafling(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(32, 32);
  const inMound = (x, y) => y <= 30;
  const mound = c.ell(16, 22.5, 12.5, 8.8, inMound);
  c.ball(16, 22.5, 12.5, 8.8, ['c', 'd', 'e'], { clip: inMound });
  const rnd = rng(19);
  const SETS = [PUMP, MUST, RED, PUMP, ['q', 'c', 'd', 'e'], MUST, PUMP, RED];
  // scattered overlapping leaves, painted back (top) to front (bottom)
  const leaves = [];
  for (let n = 0; n < 60; n++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.95;
    leaves.push([16 + Math.cos(a) * r * 12, 22.5 + Math.sin(a) * r * 8.5]);
  }
  leaves.sort((p, q) => p[1] - q[1]);
  for (const [cx, cy] of leaves) {
    const set = SETS[Math.floor(rnd() * SETS.length)];
    const nx = (cx - 16) / 12.5, ny = (cy - 22.5) / 8.8;
    const m = c.ball(cx, cy, 2.5 + rnd(), 1.5, set, { ang: (rnd() - 0.5) * 2.2, clip: (px, py) => py <= 30 && (cy < 17 || mound.has(py * 32 + px)), bias: (nx * 0.5 + ny) * -0.35 });
    c.sep(m, set[3], 'lower');
  }
  // maple leaf on top (tilts at idle)
  const maple = c.hand([
    '..#..',
    '#.#.#',
    '#####',
    '.###.',
    '#####',
    '..#..',
  ], I ? 17 : 16, 9);
  c.puff(maple, RED, 2);
  const mx = I ? 1 : 0;
  c.pts('D', [18 + mx, 11], [18 + mx, 12], [18 + mx, 13]);
  c.pts('j', [18 + mx, 15], [18, 16]);
  // twig arms (thrown up to attack)
  if (A) { c.path('i', [[5, 22], [3, 17], [2, 13]]); c.pts('h', [1, 15], [3, 13], [1, 12]); c.path('i', [[27, 21], [29, 16], [29, 12]]); c.pts('h', [30, 15], [28, 12]); }
  else { c.path('i', [[5, 24], [3, 22], [2, 19]]); c.pts('h', [1, 21], [2, 21], [3, 19]); c.path('i', [[27, 23], [29, 20], [30, 18]]); c.pts('h', [30, 21], [29, 21]); }
  c.gloam(24, 22, 2.8, { seed: 31, drips: 2, drip: 3 });
  c.gloam(9, 27, 1.6, { seed: 4, drips: 1, drip: 2 });
  // peeking eyes in a shadowy gap between leaves (glance at idle, flare to attack, scrunch on a hit)
  const ex = I ? -1 : 0;
  if (A) {
    c.fill(c.ell(12.5, 22, 5.8, 2.4), 'S');
    c.pts('V', [8, 21], [9, 21], [10, 21], [9, 22], [10, 22], [14, 22], [15, 22], [15, 21], [16, 21], [17, 21]);
    c.pts('w', [8, 21], [17, 21]); c.pts('v', [10, 22], [14, 22]);
    c.pts('x', [10, 24], [12, 24], [14, 24]); c.pts('k', [8, 20], [9, 20], [16, 20], [17, 20]);
  } else if (H) {
    c.fill(c.ell(12.5, 22, 5.2, 1.9), 'S');
    c.pts('V', [9, 21], [10, 22], [9, 23], [16, 21], [15, 22], [16, 23]);
  } else {
    c.fill(c.ell(12.5, 22, 5.2, 1.9), 'S');
    c.pts('V', ...[[9, 21], [10, 21], [10, 22], [11, 22], [14, 22], [15, 22], [15, 21], [16, 21]].map(([x, y]) => [x + ex, y]));
    c.pts('w', [9 + ex, 21], [16 + ex, 21]);
    c.pts('v', [9 + ex, 22], [16 + ex, 22]);
  }
  // drifting leaf
  if (I) c.ball(25.5, 7.5, 2.2, 1.3, PUMP, { ang: 0.1 });
  else if (!A && !H) c.ball(26.5, 6, 2.2, 1.3, PUMP, { ang: 0.6 });
  if (I) squash(c, 17);
  if (H) squash(c, 17, 2);
  if (A) shear(c, 0.08, 29, -1);
  c.outline();
  if (A) { c.at(); c.ball(4, 6, 2, 1.2, PUMP, { ang: -0.6 }); c.ball(26, 4, 2, 1.2, RED, { ang: 0.8 }); c.ball(16, 2, 1.8, 1.1, MUST, { ang: 0.2 }); c.pts('d', [3, 7], [26, 5]); }
  if (H) { c.ball(6, 6, 2, 1.2, PUMP, { ang: 0.9 }); c.ball(27, 8, 2, 1.2, MUST, { ang: -0.5 }); poof(c, 20, 3); star(c, 2, 16); }
  return sprite(c);
}

function mothowl(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(40, 40);
  // wings (plum edge, warm fill, eyespots): upper pair lifts at idle, flares up to attack, droops on a hit
  const UW = A ? [0, -3] : H ? [1, 2] : I ? [0, -1] : [0, 0];
  for (const s of [1, -1]) {
    const X = x => (s === 1 ? x : 39 - x);
    const up = () => c.at(UW[0] * s, UW[1]), low = () => c.at(0, A ? -1 : 0);
    up(); c.ball(X(9), 14, 8, 9, PLUM);
    up(); c.ball(X(9.5), 14.5, 6.3, 7.2, MUST);
    low(); c.ball(X(10), 27, 6, 6.3, PLUM);
    low(); c.ball(X(10.5), 27, 4.4, 4.8, PUMP);
    up(); c.ball(X(8), 13, 2.8, 2.8, ['R', 'R']);
    c.ball(X(8), 13, 1.8, 1.8, A ? ['v', 'V'] : ['x', 'y']);
    c.set(X(8) - (s === 1 ? 0 : 1), 13, A ? 'w' : 'R');
    c.line(X(15), 18, X(5), 9, 'r'); c.line(X(15), 20, X(4), 19, 'r');
    low(); c.line(X(15), 22, X(8), 30, 'c');
  }
  c.at();
  // body
  const body = c.ball(19.5, 26.5, 8.5, 10, WOOD);
  c.sep(body, 'J');
  c.ball(18.5, 28.5, 5.5, 7, CREAM, { clip: (x, y) => body.has(y * 40 + x) });
  for (const [x, y] of [[16, 26], [20, 26], [18, 29], [22, 29], [16, 32], [20, 32]]) c.pts('Z', [x - 1, y], [x, y + 1], [x + 1, y]);
  // talons (flexed open to attack)
  if (A) { c.pts('q', [14, 36], [15, 35], [17, 36], [21, 36], [23, 35], [24, 36]); c.pts('r', [14, 37], [17, 37], [21, 37], [24, 37]); }
  else { c.pts('q', [15, 36], [16, 36], [17, 36], [21, 36], [22, 36], [23, 36]); c.pts('r', [15, 37], [17, 37], [21, 37], [23, 37]); }
  // head
  if (H) c.at(1, -1);
  const head = c.ball(19.5, 13.5, 9, 7.5, WOOD);
  c.sep(head, 'J', 'lower');
  c.ball(15, 14, 4.2, 4.2, CREAM);
  c.ball(23.5, 14, 4.2, 4.2, CREAM);
  // antennae (feathery; flick at idle, sweep up to attack, flop on a hit)
  const aL = I ? [[16, 7], [13, 5], [11, 4], [9, 5]] : A ? [[16, 7], [14, 3], [13, 1], [11, 0]] : H ? [[16, 7], [13, 6], [11, 7], [10, 9]] : [[16, 7], [14, 4], [12, 2], [10, 2]];
  const aR = aL.map(([x, y]) => [39 - x, y]);
  c.path('r', aL); c.path('r', aR);
  const fe = [[], [[1, 0], [-1, 1]], [[1, 0], [-1, 1], [0, -1]], []]; // feathery barbs per antenna joint
  aL.forEach(([x, y], i) => { for (const [dx, dy] of fe[i]) { c.set(x + dx, y + dy, 'q'); c.set(39 - x - dx, y + dy, 'q'); } });
  c.at();
  c.gloam(26.5, 28, 3.4, { seed: 8, drips: 2, drip: 3 });
  c.gloam(30, 27, 2.4, { seed: 18, drips: 1, drip: I ? 3 : 2 });
  if (H) c.at(1, -1);
  c.gloam(23, 8.5, 2, { seed: 2, drips: 0 });
  // big glowing eyes + grumpy brow
  if (H) {
    squint(c, 13, 12, 3, 1); squint(c, 23, 12, 3, -1);
    c.pts('q', [18, 16], [19, 16]); c.pts('r', [18, 17], [19, 17]);
  } else {
    c.eye(13, 13, 3, 'G'); c.eye(22, 13, 3, 'G');
    c.pts('k', [11, 11], [12, 11], [13, 11], [14, 11], [15, 12], [16, 12], [21, 12], [22, 12], [23, 11], [24, 11], [25, 11], [26, 11]);
    if (A) { c.pts('q', [18, 15], [19, 15]); c.pts('J', [18, 16], [19, 16]); c.pts('r', [18, 17], [19, 17]); c.pts('k', [12, 10], [26, 10]); }
    else { c.pts('q', [18, 15], [19, 15]); c.pts('r', [18, 16], [19, 16]); c.pts('U', [18, 17]); }
  }
  c.at();
  c.outline();
  if (I) c.pts('v', [3, 29], [36, 32], [36, 3]); else c.pts('v', [2, 30], [36, 34], [37, 4]);
  if (A) { c.pts('v', [1, 8], [38, 8], [3, 3], [36, 2]); c.pts('V', [2, 6], [37, 5]); }
  if (H) { poof(c, 28, 2); star(c, 8, 22); c.pts('q', [4, 35], [35, 37]); c.pts('r', [5, 36]); }
  return sprite(c);
}

function hollowjack(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(56, 56);
  // pole + crossbar
  c.puff(c.poly([[26, 22], [30, 22], [30, 53], [26, 53]]), WOOD, 2);
  c.puff(c.poly([[4, 21], [52, 21], [52, 24], [4, 24]]), WOOD, 1);
  // ground tuft
  c.ball(28, 54, 7, 1.6, ['t', 'u', 'U']);
  for (const [x0, x1] of [[24, 21], [25, 23], [31, 33], [32, 35], [28, 28]]) c.line(x0, 53, x1, 49, 't');
  // hem straw (whips out on the attack)
  const hemStraw = [[19, 44, 17, 50], [21, 45, 20, 51], [24, 46, 23, 52], [27, 46, 27, 51], [31, 46, 32, 52], [34, 45, 35, 50], [37, 44, 39, 50], [22, 45, 22, 49], [33, 45, 33, 49]];
  hemStraw.forEach(([a, b, x, y], i) => c.line(a, b, A ? x + (x < 28 ? -2 : 2) : x, y, i % 3 === 0 ? 's' : i % 3 === 1 ? 't' : 'u'));
  // cuff straw (both sides; sway at idle, flare to attack)
  for (const s of [1, -1]) {
    const X = x => (s === 1 ? x : 56 - x);
    const ends = A ? [[1, 14], [0, 20], [1, 27], [1, 33], [3, 37], [4, 13], [6, 38]]
      : I ? [[2, 19], [1, 23], [2, 27], [3, 31], [5, 34], [5, 18], [7, 34]]
      : [[2, 18], [1, 22], [2, 26], [2, 30], [4, 33], [5, 17], [6, 34]];
    ends.forEach(([x, y], i) => c.line(X(9), 25 + (i % 3), X(x), y, i % 3 === 0 ? 's' : i % 3 === 1 ? 't' : 'u'));
  }
  // sleeves
  c.puff(c.poly([[24, 20], [9, 21], [8, 30], [22, 32]]), PLUM, 2);
  c.puff(c.poly([[32, 20], [47, 21], [48, 30], [34, 32]]), PLUM, 2);
  c.pts('S', [9, 21], [9, 22], [9, 23], [9, 24], [9, 25], [9, 26], [9, 27], [9, 28], [9, 29]);
  c.pts('S', [46, 21], [46, 22], [46, 23], [46, 24], [46, 25], [46, 26], [46, 27], [46, 28], [46, 29]);
  // torso with ragged hem
  const torso = c.poly([[20, 20], [36, 20], [40, 44], [37, 47], [34, 44], [31, 48], [28, 45], [25, 48], [22, 44], [19, 47], [16, 44]]);
  c.puff(torso, PLUM, 3);
  c.sep(torso, 'S', 'lower');
  c.line(28, 22, 28, 44, 'S'); c.line(27, 22, 27, 30, 'R');
  c.pts('q', [30, 27], [30, 32], [30, 38]);
  // patches with stitches
  c.puff(c.poly([[18, 29], [24, 29], [24, 35], [18, 35]]), MUST, 1);
  c.pts('k', [18, 29], [20, 29], [22, 29], [24, 30], [24, 32], [24, 34], [18, 31], [18, 33], [21, 35], [23, 35]);
  c.puff(c.poly([[33, 35], [37, 35], [38, 40], [33, 40]]), PUMP, 1);
  c.pts('k', [33, 35], [35, 35], [37, 36], [33, 37], [33, 39], [36, 40]);
  c.puff(c.poly([[13, 23], [18, 23], [18, 27], [13, 27]]), ['b', 'c', 'd'], 1);
  c.pts('k', [13, 23], [15, 23], [17, 23], [13, 25], [18, 25], [14, 27], [16, 27]);
  // rope belt
  c.line(17, 38, 39, 38, 'u'); c.pts('t', [19, 38], [22, 38], [25, 38], [31, 38], [34, 38], [37, 38]);
  c.pts('u', [26, 39], [25, 40], [26, 41], [29, 39], [30, 40], [30, 41]);
  // collar straw
  c.pts('t', [21, 19], [22, 20], [34, 19], [33, 20]); c.pts('s', [20, 20], [35, 20]);
  // gloam on coat
  c.gloam(35, 27, 3.2, { seed: 91, drips: 2, drip: 4 });
  c.gloam(42, 26, 2.2, { seed: 7, drips: 1, drip: 3 });
  c.gloam(22, 42, 2.4, { seed: 55, drips: 2, drip: I ? 4 : 3 });
  // crow: perched on the right arm, or launching off it (attack / hit)
  const C3 = ['7', '5', '6'];
  if (A || H) {
    const [ox, oy] = A ? [0, -9] : [5, -12];
    c.at(ox, oy);
    c.puff(c.poly([[45, 17], [50, 10], [53, 11], [49, 18]]), C3, 1); c.puff(c.poly([[42, 18], [37, 12], [36, 14], [41, 20]]), C3, 1);
    c.ball(45, 19, 3.2, 2.6, C3); c.ball(42, 16.5, 2.2, 2, C3);
    c.pts('q', [39, 16], [40, 16]); c.pts('r', [40, 17]); c.pts('V', [42, 15]);
    c.at();
  } else {
    c.puff(c.poly([[49, 18], [53, 21], [52, 22], [48, 21]]), C3, 1);
    c.ball(46.5, 18, 3.5, 3, C3);
    c.ball(43.5, I ? 15.5 : 15, 2.4, 2.2, C3);
    c.pts('q', [40, I ? 16 : 15], [41, I ? 16 : 15]); c.pts('r', [41, I ? 17 : 16]);
    c.pts('V', [43, I ? 15 : 14]);
    c.pts('q', [45, 21], [47, 21]);
  }
  // pumpkin lantern head: bobs at idle, lurches forward to attack, knocked askew on a hit
  const HD = A ? [-3, 1] : H ? [3, -1] : I ? [0, 1] : [0, 0];
  c.at(...HD);
  c.ball(34, 12.5, 7, 8, PUMP, { bias: -0.05 });
  c.ball(21, 12.5, 6, 7.5, PUMP);
  const head = c.ball(27, 12, 8, 8.8, PUMP, { bias: 0.05 });
  c.sep(head, 'd');
  // carved face glow (flickers at idle, blazes to attack, gutters on a hit)
  const holes = [];
  const add = (x, y) => holes.push([x, y]);
  if (H) {
    [[19, 10], [20, 11], [21, 12], [19, 12], [31, 10], [30, 11], [29, 12], [31, 12]].forEach(([x, y]) => add(x, y));
  } else {
    [[19, 9], [19, 10], [20, 10], [19, 11], [20, 11], [21, 11], [20, 12], [21, 12], [22, 12]].forEach(([x, y]) => add(x, y));
    [[31, 9], [30, 10], [31, 10], [29, 11], [30, 11], [31, 11], [28, 12], [29, 12], [30, 12]].forEach(([x, y]) => add(x, y));
  }
  [[25, 13], [24, 14], [25, 14], [26, 14]].forEach(([x, y]) => add(x, y));
  for (const x of [18, 19, 20, 30, 31, 32]) add(x, 16);
  for (let x = 19; x <= 31; x++) if (x !== 22 && x !== 28) add(x, 17);
  for (let x = 20; x <= 30; x++) if (x !== 25) add(x, 18);
  for (let x = 22; x <= 28; x++) add(x, 19);
  if (A) { for (let x = 21; x <= 29; x++) add(x, 20); for (const x of [17, 33]) add(x, 15); }
  const hs = new Set(holes.map(([x, y]) => y * 56 + x));
  const [hiC, loC] = H ? ['G', 'g'] : A ? ['w', 'V'] : I ? ['V', 'v'] : ['v', 'V'];
  for (const [x, y] of holes) {
    const top = !hs.has((y - 1) * 56 + x);
    c.set(x, y, top ? hiC : loC);
    if (!hs.has((y + 1) * 56 + x)) c.set(x, y + 1, 'a');
  }
  if (H) c.pts('v', [20, 11], [30, 11]);
  else if (A) c.pts('w', [20, 11], [21, 12], [30, 11], [29, 12], [25, 14], [24, 18], [25, 18], [23, 19], [27, 19]);
  else c.pts('w', [20, 11], [21, 12], [30, 11], [29, 12], [25, 14], [24, 18], [25, 18]);
  // hat (tips off a little on a hit)
  if (H) c.at(HD[0] + 2, HD[1] - 1);
  c.puff(c.poly([[21, 5], [22, 1], [28, 0], [33, 1], [35, 5]]), WOOD, 2);
  c.line(22, 4, 35, 4, 'c'); c.line(22, 5, 35, 5, 'd');
  c.ball(28, 6, 14, 2.2, ['i', 'j', 'J'], { ang: -0.1 });
  c.pts('b', [30, 2], [31, 2]); c.pts('k', [29, 2], [32, 2]);
  // crow feather in hat band
  c.path('6', [[35, 4], [37, 2], [39, 1]]); c.path('5', [[35, 5], [38, 2], [40, 2]]); c.pts('7', [36, 3], [38, 1]);
  c.at();
  c.outline();
  // loose feathers + gloam motes
  c.path('6', [[6, 9], [8, 11], [9, 13]]); c.pts('5', [7, 9], [8, 10], [9, 12]); c.pts('7', [10, 14]);
  c.path('6', [[48, 37], [50, 38], [52, 40]]); c.pts('5', [49, 37], [51, 38]);
  if (I) { c.pts('v', [14, 6], [43, 8], [11, 17], [45, 45], [10, 41]); c.pts('V', [13, 5], [42, 7]); }
  else { c.pts('v', [14, 5], [42, 7], [12, 16], [44, 46], [10, 42]); c.pts('V', [13, 6], [43, 8]); }
  if (A) { c.pts('v', [4, 4], [2, 12], [16, 1], [6, 18]); c.pts('V', [3, 8], [11, 2]); }
  if (H) { poof(c, 12, 2, true); star(c, 14, 14); c.line(4, 40, 6, 44, 't'); c.line(50, 44, 52, 41, 's'); c.pts('u', [8, 46], [47, 48]); }
  return sprite(c);
}

function snowhare(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(32, 32);
  // ears: up / twitch / pinned back to lunge / flopped on a hit
  const far = A ? [19.5, 10, 1.1] : H ? [18, 11, 1.4] : [16.5, 7, 0.5];
  const near = A ? [17, 9.5, 1.15] : H ? [15, 10, 1.5] : I ? [13.5, 6.5, 0.15] : [13, 6.5, 0.32];
  // far ear
  c.ball(far[0], far[1], 1.8, 5.5, ['X', 'Y', 'E'], { ang: far[2] });
  // body
  c.ball(28, 20, 2.4, 2.4, SNOW);
  c.ball(20, 23, 9, 7, SNOW);
  const foot = c.ball(19, 29.3, 5.5, 1.7, SNOW, { bias: -0.1 });
  c.sep(foot, 'Y', 'lower');
  // front paw: planted, or reaching forward in the lunge
  if (A) c.ball(6, 24.5, 3, 2, SNOW); else c.ball(12.5, 23, 4.5, 5.5, SNOW, { bias: 0.05 });
  if (A) c.ball(12.5, 23, 4.5, 5.5, SNOW, { bias: 0.05 });
  c.ball(10, 29.2, 2.6, 1.6, SNOW);
  // head
  const head = c.ball(10.5, 16, 5.8, 5.2, SNOW, { bias: 0.05 });
  c.sep(head, 'X', 'lower');
  c.ball(9, 19, 3, 2, ['w', 'W']);
  // near ear with pink inner
  c.ball(near[0], near[1], 2.2, 5.8, SNOW, { ang: near[2] });
  c.ball(near[0] - 0.2, near[1] + 0.5, 0.9, 4, ['8', 'o'], { ang: near[2] });
  c.gloam(22.5, 18.5, 3.3, { seed: 4, drips: 2, drip: I ? 4 : 3 });
  if (!A && !H) c.gloam(15, 1.8, 1.8, { seed: 6, drips: 0 });
  // face
  if (H) {
    squint(c, 7, 14, 3, 1);
    c.pts('Y', [5, 19], [6, 18], [7, 19]);
  } else {
    c.eye(7, 15, 2, 'G');
    c.pts('k', [6, 14], [7, 13], [8, 13], [9, 13], [10, 12]);
    if (A) { c.pts('k', [5, 19], [6, 19], [7, 19], [5, 20], [6, 20]); c.pts('w', [6, 19], [7, 19]); c.pts('k', [5, 13]); }
    else { c.pts('Y', [6, 19], [7, 19]); c.pts('X', [7, 18]); }
  }
  c.pts('8', I ? [5, 16] : [5, 17]);
  if (I) squash(c, 22);
  if (A) shear(c, 0.08, 27, -1);
  if (H) shear(c, 0.08, 27, 1);
  c.outline();
  if (A) streaks(c, [[29, 13, 2], [30, 17, 2], [29, 24, 3]], 'X');
  if (H) { poof(c, 20, 4); star(c, 2, 12); c.pts('W', [27, 9], [29, 13]); c.pts('X', [26, 12]); }
  return sprite(c);
}

function icewisp(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(32, 32);
  // flame silhouette: round bulb + three licking tongues
  // (tongues sway at idle, flare tall and lean forward to attack, gutter and bend back on a hit)
  const F = A ? { m: [[15, 17], [12, 11], [10, 6], [7, 1]], l: [[10, 17], [6, 13], [4, 9]], r: [[20, 16], [21, 10], [19, 5]] }
    : H ? { m: [[15, 17], [16, 13], [19, 10], [22, 9]], l: [[10, 17], [9, 14], [10, 12]], r: [[20, 17], [23, 14], [26, 13]] }
    : I ? { m: [[15, 17], [14, 11], [13, 6], [11, 2]], l: [[10, 17], [8, 13], [9, 9]], r: [[20, 16], [23, 12], [24, 8]] }
    : { m: [[15, 17], [15, 11], [17, 6], [20, 2]], l: [[10, 17], [7, 13], [7, 9]], r: [[20, 16], [23, 12], [22, 7]] };
  c.at(0, I ? -1 : 0);
  const body = c.union(
    c.ell(15, 20.5, 7.5, 6.5),
    c.tube(F.m, 5.2, 0.5),
    c.tube(F.l, 2.6, 0.5),
    c.tube(F.r, 3, 0.5),
  );
  c.puff(body, ICE, 5, 0.05);
  // white-hot inner flame
  const core = c.union(c.ell(15, 17.5, 3.6, 3), c.tube(F.m.slice(0, 3), 2.4, 0.5));
  c.puff(core, ['w', 'W', 'X'], 2);
  // deep blue lick at the base
  for (const [x, y] of [[9, 24], [10, 25], [12, 26], [18, 26], [20, 25], [21, 24]]) c.set(x, y, 'E');
  const g = F.r[1]; c.gloam(g[0] - 0.5, g[1] + 1.5, 2, { seed: 13, drips: 0, speck: 0.25 });
  // face on the bulb
  if (H) {
    squint(c, 9, 20, 3, 1, 'V'); squint(c, 17, 20, 3, -1, 'V');
    c.pts('F', [12, 25], [13, 24], [14, 25], [15, 24], [16, 25]);
  } else {
    c.eye(9, 20, 3, 'F'); c.eye(17, 20, 3, 'F');
    c.pts('H', [8, 19], [9, 19], [10, 19], [11, 20], [17, 20], [18, 19], [19, 19], [20, 19]);
    if (A) { c.fill(c.ell(14.5, 25, 2.2, 1.4), 'H'); c.pts('X', [13, 24], [15, 24]); }
    else c.pts('F', [13, 25], [14, 24], [15, 24], [16, 25]);
    c.pts('8', [8, 24], [20, 24]);
  }
  c.at();
  c.outline('H');
  // soft frost shadow on the ground, well below the bulb: it floats (shadow shrinks as it bobs up)
  c.fill(c.ell(15.5, 30.5, I ? 4.5 : H ? 6 : 5.5, 1), 'X'); c.fill(c.ell(15.5, 30.5, I ? 2.5 : 3.5, 0.7), 'Y');
  // drifting ice sparks (shift at idle, fired forward as shards on the attack, knocked loose on a hit)
  if (A) {
    for (const [x, y] of [[2, 16], [5, 21], [1, 24]]) { c.pts('X', [x, y], [x + 1, y]); c.pts('W', [x, y - 1]); c.pts('Y', [x + 1, y + 1]); }
    c.sparkle(27, 6, 'w', 'X'); c.pts('X', [28, 22]);
  } else if (H) {
    c.sparkle(5, 7, 'w', 'X'); c.pts('X', [28, 18], [26, 21], [3, 14]); poof(c, 22, 4); star(c, 3, 19);
  } else if (I) { c.sparkle(5, 9, 'w', 'X'); c.sparkle(27, 24, 'w', 'X'); c.pts('X', [27, 5], [6, 3], [2, 17]); }
  else { c.sparkle(4, 8, 'w', 'X'); c.sparkle(28, 25, 'w', 'X'); c.pts('X', [27, 4], [7, 2], [2, 16]); }
  return sprite(c);
}

function frostcrab(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(32, 32);
  const LEG = ['E', 'F', 'H'];
  for (const pts of [[[9, 22], [5, 24], [3, 28], [3, 30]], [[11, 23], [8, 27], [7, 30]], [[21, 23], [24, 27], [25, 30]], [[23, 22], [27, 24], [29, 28], [29, 30]]])
    c.puff(c.tube(pts, 1), LEG, 1);
  c.ball(16, 22, 8.5, 3.2, ['F', 'H', 'I']);
  // shell: wide, low dome
  const shell = c.ball(16, 20, 12, 7.5, ICE, { clip: (x, y) => y <= 21 });
  for (let x = 5; x <= 27; x++) if (shell.has(21 * 32 + x)) c.set(x, 21, 'F');
  c.gloam(23, 16.5, 3, { seed: 27, drips: 2, drip: I ? 4 : 3 });
  // frost crystals on the shell shoulders
  for (const [x, y] of [[8, 15], [25, 16]]) { c.pts('W', [x, y], [x, y - 1], [x, y - 2]); c.pts('X', [x + 1, y], [x + 1, y - 1], [x - 1, y]); }
  // arms + pincers: open / snapped shut at idle / hoisted wide to strike / dropped on a hit
  const OPEN = ['.##..#.', '####.##', '####.##', '#######', '#######', '.#####.', '..###..'];
  const SHUT = ['.#####.', '#######', '#######', '#######', '#######', '.#####.', '..###..'];
  const WIDE = ['##...##', '##...##', '###.###', '#######', '#######', '.#####.', '..###..'];
  const PIN = A ? WIDE : I ? SHUT : OPEN;
  const CL = ['W', 'X', 'Y', 'E'];
  if (A) {
    c.puff(c.tube([[7, 19], [3, 15], [3, 10]], 1.3), ['X', 'Y', 'E'], 1); c.puff(c.hand(PIN, 0, 3), CL, 2);
    c.puff(c.tube([[25, 19], [28, 15], [28, 11]], 1.2), ['X', 'Y', 'E'], 1); c.puff(c.hand(PIN.slice(1), 25, 5, true), CL, 2);
  } else if (H) {
    c.puff(c.tube([[7, 20], [4, 19]], 1.3), ['X', 'Y', 'E'], 1); c.puff(c.hand(PIN, 0, 12), CL, 2);
    c.puff(c.tube([[25, 20], [28, 19]], 1.2), ['X', 'Y', 'E'], 1); c.puff(c.hand(PIN.slice(1), 25, 13, true), CL, 2);
  } else {
    c.puff(c.tube([[7, 19], [4, 17], [4, 14]], 1.3), ['X', 'Y', 'E'], 1); c.puff(c.hand(PIN, 1, 6), CL, 2);
    c.puff(c.tube([[25, 19], [28, 17], [28, 14]], 1.2), ['X', 'Y', 'E'], 1); c.puff(c.hand(PIN.slice(1), 25, 8, true), CL, 2);
  }
  // eye stalks (sway at idle, droop on a hit)
  const sx = I ? -1 : 0, sy = H ? 2 : 0;
  c.line(13, 13, 13 + sx, 10 + sy, 'E'); c.line(18, 13, 18 + sx, 10 + sy, 'E');
  if (H) {
    c.pts('X', [12, 10], [13, 10], [12, 11], [13, 11], [17, 10], [18, 10], [17, 11], [18, 11]);
    squint(c, 12, 9, 2, 1, 'H'); squint(c, 17, 9, 2, -1, 'H');
  } else {
    c.eye(12 + sx, 8, 2, 'H'); c.eye(17 + sx, 8, 2, 'H');
    c.pts('k', [11 + sx, 7], [12 + sx, 7], [13 + sx, 8], [17 + sx, 8], [18 + sx, 7], [19 + sx, 7]);
    c.set(13 + sx, 8, 'k'); c.set(17 + sx, 8, 'k');
    c.set(13 + sx, 9, 'V'); c.set(17 + sx, 9, 'V');
  }
  // grumpy mouth + cheeks on the shell front
  if (A) { c.pts('H', [13, 18], [14, 18], [15, 18], [16, 18], [17, 18], [14, 19], [15, 19], [16, 19]); c.pts('W', [14, 18], [16, 18]); }
  else if (H) c.pts('F', [12, 19], [13, 18], [14, 19], [15, 18], [16, 19], [17, 18]);
  else c.pts('F', [13, 19], [14, 18], [15, 18], [16, 18], [17, 19]);
  c.pts('o', [10, 17], [20, 17]);
  if (I) squash(c, 21);
  if (H) shear(c, 0.05, 23, 1);
  c.outline();
  if (A) { c.sparkle(10, 3, 'w', 'X'); streaks(c, [[6, 0, 3]], 'X'); c.pts('X', [22, 2]); }
  else if (H) { poof(c, 21, 4); star(c, 3, 9); c.pts('X', [27, 5]); }
  else if (I) { c.sparkle(26, 5, 'w', 'X'); c.pts('X', [22, 2]); }
  else { c.sparkle(27, 4, 'w', 'X'); c.pts('X', [22, 3]); }
  return sprite(c);
}

function snowmite(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(32, 32);
  // legs (front pair rears up to attack)
  const legs = A ? [[[10, 22], [6, 19], [4, 16]], [[13, 24], [10, 22], [8, 20]], [[20, 25], [22, 28], [22, 30]], [[23, 23], [26, 26], [27, 29]]]
    : [[[10, 23], [7, 26], [6, 29]], [[13, 25], [11, 28], [11, 30]], [[20, 25], [22, 28], [22, 30]], [[23, 23], [26, 26], [27, 29]]];
  if (I) { legs[1] = [[13, 25], [12, 28], [12, 30]]; legs[2] = [[20, 25], [21, 28], [21, 30]]; }
  for (const pts of legs) c.path('F', pts);
  if (A) c.pts('E', [4, 16], [8, 20], [22, 30], [27, 29]);
  else if (I) c.pts('E', [6, 29], [12, 30], [21, 30], [27, 29]);
  else c.pts('E', [6, 29], [11, 30], [22, 30], [27, 29]);
  // antennae (flick at idle, point forward to attack, droop on a hit)
  if (I) { c.path('F', [[11, 14], [8, 11], [6, 10]]); c.path('F', [[14, 13], [15, 9], [17, 8]]); }
  else if (A) { c.path('F', [[11, 14], [7, 11], [4, 10]]); c.path('F', [[14, 13], [12, 9], [10, 7]]); }
  else if (H) { c.path('F', [[11, 14], [9, 12], [8, 13]]); c.path('F', [[14, 13], [16, 11], [18, 12]]); }
  else { c.path('F', [[11, 14], [9, 10], [7, 8]]); c.path('F', [[14, 13], [14, 9], [16, 7]]); }
  const body = c.ball(16, 20, 9, 7.5, SNOW);
  // fluff bumps along the rim (ruffle at idle)
  const rnd = rng(I ? 6 : 5);
  for (let a = 0; a < Math.PI * 2; a += 0.33) {
    if (rnd() < 0.35) continue;
    const x = Math.round(16 + Math.cos(a) * 9.3 - 0.5), y = Math.round(20 + Math.sin(a) * 7.8 - 0.5);
    if (!c.solid(x, y)) c.set(x, y, Math.sin(a) > 0.3 || Math.cos(a) > 0.4 ? 'X' : 'W');
  }
  void body;
  c.gloam(20, 15, 2.3, { seed: 3, drips: 0 });
  c.gloam(23.5, 21.5, 1.7, { seed: 8, drips: 1, drip: I ? 3 : 2 });
  c.gloam(12, 25, 1.3, { seed: 1, drips: 0 });
  // mandibles (gape wide to bite)
  if (A) { c.pts('Y', [5, 20], [4, 21], [5, 25], [4, 24]); c.pts('E', [3, 22], [3, 23]); c.pts('I', [6, 22], [6, 23], [7, 22], [7, 23]); }
  else { c.pts('Y', [6, 21], [5, 22], [6, 24]); c.pts('E', [5, 23], [6, 25]); }
  if (H) {
    squint(c, 9, 17, 2, 1); squint(c, 13, 17, 2, -1);
    c.pts('Y', [10, 22], [11, 21], [12, 22], [13, 21]);
  } else {
    c.eye(9, 18, 2, 'G'); c.eye(13, 18, 2, 'G');
    c.pts('k', [8, 16], [9, 16], [10, 17], [13, 17], [14, 16], [15, 16]);
    if (A) c.pts('k', [8, 17], [15, 17]);
    c.pts('Y', [10, 22], [11, 21], [12, 22]);
  }
  if (I) squash(c, 21);
  if (A) shear(c, 0.08, 26, -1);
  if (H) shear(c, 0.08, 27, 1);
  c.outline();
  if (I) { c.pts('V', [5, 9], [17, 7]); c.pts('v', [5, 10], [18, 7]); c.sparkle(25, 10, 'w', 'X'); }
  else if (A) { c.pts('V', [3, 10], [10, 6]); c.sparkle(26, 9, 'w', 'X'); streaks(c, [[27, 17, 3], [28, 21, 2]], 'X'); }
  else if (H) { c.pts('W', [25, 6], [28, 11], [4, 26]); poof(c, 19, 5); star(c, 3, 16); }
  else { c.pts('V', [6, 7], [16, 6]); c.pts('v', [6, 8], [17, 6]); c.sparkle(26, 9, 'w', 'X'); }
  return sprite(c);
}

function gloamwolf(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(40, 40);
  const DLEG = ['F', 'H', 'I'];
  // far legs
  c.puff(c.tube([[18, 28], [18, 33], [17, 36]], 1.4), DLEG, 1);
  c.puff(c.tube([[32, 28], [33, 32], [33, 36]], 1.4), DLEG, 1);
  // tail: up / wagging / bristled high / tucked on a hit
  const tail = I ? [[33, 22], [36, 18], [38, 13], [38, 9], [37, 6]] : A ? [[33, 22], [36, 17], [36, 12], [35, 7], [33, 4]] : H ? [[33, 22], [36, 24], [37, 28], [36, 31]] : [[33, 22], [36, 18], [37, 13], [36, 9], [34, 7]];
  c.puff(c.tube(tail, 3, 1.8), NAVY, 2);
  const tp = tail[tail.length - 1];
  c.pts('X', [tp[0], tp[1] - 1], [tp[0] + 1, tp[1] - 1], [tp[0] - 1, tp[1]], [tp[0], tp[1]]); c.pts('W', [tp[0], tp[1] - 1]);
  if (!H) c.pts('F', [37, 14], [36, 16], [37, 11]);
  // body
  c.ball(25, 24, 11, 7, NAVY);
  // near legs (front paw stamps forward on the attack)
  const legs = A ? [[[14, 27], [11, 31], [10, 36]], [[21, 28], [21, 32], [22, 36]], [[29, 27], [28, 31], [30, 36]]] : [[[14, 27], [13, 32], [13, 36]], [[21, 28], [21, 32], [22, 36]], [[29, 27], [28, 31], [30, 36]]];
  for (const pts of legs) {
    const m = c.puff(c.tube(pts, 1.6), ['E', 'F', 'H'], 1); c.sep(m, 'H', 'lower');
  }
  for (const x of [A ? 9 : 12, 21, 29]) c.pts('X', [x, 37], [x + 1, 37], [x + 2, 37]);
  // chest fluff
  c.puff(c.ell(15.5, 25, 4, 5), ['W', 'X', 'Y'], 2);
  // head group: lowered into a snarl to attack, thrown up and back on a hit
  const HD = A ? [-1, 2] : H ? [1, -2] : [0, 0];
  c.at(...HD);
  // ears (flick at idle, pinned on a hit)
  c.puff(c.poly(H ? [[15, 13], [20, 8], [19, 14]] : [[15, 13], [18, 6], [19, 14]]), ['E', 'F', 'H'], 1);
  // head
  const head = c.ball(12, 17.5, 6.5, 5.5, ['X', 'Y', 'E', 'F']);
  c.sep(head, 'F', 'lower');
  c.puff(c.poly(I ? [[9, 13], [10, 5], [15, 12]] : H ? [[9, 13], [13, 6], [15, 12]] : [[9, 13], [11, 5], [15, 12]]), ['Y', 'E', 'F'], 1);
  c.pts('G', [11, 8], [11, 9], [12, 10]);
  // snout + jaw
  c.ball(6.5, 20, 4.3, 2.6, ['W', 'X', 'Y']);
  c.pts('L', [2, 19], [3, 19], [2, 20]);
  if (A) {
    // jaw dropped open: dark maw with fangs
    c.fill(c.poly([[3, 22], [10, 21], [10, 25], [4, 24]]), 'I');
    c.pts('w', [4, 22], [8, 22], [5, 24]); c.pts('B', [6, 23], [7, 23]);
    c.ball(7, 25.4, 3.2, 1.1, ['X', 'Y']);
  } else {
    c.line(4, 22, 9, 22, 'I'); c.pts('w', [5, 23]);
    c.ball(8, 23.2, 2.5, 1, ['X', 'Y']);
  }
  c.at();
  // gloam mane (hackles rise on the attack)
  const hk = A ? -3 : 0;
  for (const t of [[[16, 13], [19, 8 + hk], [21, 14]], [[19, 14], [23, 10 + hk], [25, 17]], [[23, 16], [27, 13 + hk], [28, 19]]]) c.fill(c.poly(t), 'G');
  c.gloam(19.5, 17, 5, { seed: 40, drips: 3, drip: I ? 5 : 4, speck: 0.03 });
  c.gloam(31, 22, 2.2, { seed: 2, drips: 1, drip: 2 });
  // eye + brow
  c.at(...HD);
  if (H) { c.pts('Y', [8, 16], [9, 16], [10, 16], [9, 17], [10, 17]); squint(c, 8, 15, 3, 1); }
  else {
    c.pts('G', [7, 16], [8, 17], [9, 18], [10, 18], [11, 17], [11, 16]); c.pts('w', [8, 16]); c.pts('V', [9, 16], [10, 16], [9, 17]); c.pts('v', [10, 17]);
    c.pts('k', [7, 15], [8, 15], [9, 14], [10, 14], [11, 14]);
    if (A) c.pts('k', [6, 15], [9, 15]);
  }
  c.at();
  if (I) squash(c, 24);
  if (H) shear(c, 0.05, 30, 1);
  c.outline();
  // frosty breath (puffs in rhythm at idle, a snarl-cloud on the attack)
  if (I) { c.pts('X', [1, 17], [2, 16], [0, 15], [1, 14]); c.pts('W', [1, 15]); }
  else if (A) { c.pts('X', [0, 23], [1, 25], [0, 26], [2, 27]); c.pts('W', [1, 24]); streaks(c, [[37, 20, 2], [36, 27, 3]], 'X'); }
  else if (!H) { c.pts('X', [1, 16], [2, 15], [1, 14]); c.pts('W', [2, 14]); }
  c.pts('v', [22, 5], [26, 8], [30, 6]);
  if (H) { poof(c, 22, 2, true); star(c, 3, 12); }
  return sprite(c);
}

function nightheron(pose = 'base') {
  const A = pose === 'atk', H = pose === 'hurt', I = pose === 'idle';
  const c = mk(56, 56);
  const rnd = rng(1234);
  // standing leg + tucked leg
  c.puff(c.tube([[32, 38], [31, 46], [32, 53]], 1), ['Y', 'E', 'F'], 1);
  c.path('E', [[25, 54], [32, 53], [37, 54]]); c.path('F', [[28, 54], [31, 54]]);
  c.puff(c.tube([[36, 38], [39, 43], [35, 45]], 0.9), ['E', 'F', 'H'], 1);
  // trailing plumes (sway at idle, stream back on the strike)
  const pl = I ? 1 : A ? 3 : 0;
  c.puff(c.tube([[42, 34], [48 + pl, 42], [51 + pl, 49 - pl]], 2.2, 0.8), NIGHT, 2);
  c.puff(c.tube([[39, 36], [43 + pl, 43], [44 + pl, 50 - pl]], 1.8, 0.7), NIGHT, 2);
  // raised far wing arching behind, like a cloak of night (lifts higher to strike, flinches on a hit)
  c.at(0, A ? -2 : H ? 1 : 0);
  const far = c.poly([[30, 23], [33, 15], [39, 9], [46, 5], [53, 3], [54, 8], [52, 12], [53, 16], [50, 15], [50, 20], [47, 18], [46, 23], [43, 21], [41, 26], [37, 24], [34, 27]]);
  c.puff(far, ['v', 'I', 'L', 'L'], 3, -0.05);
  for (const [x, y] of [[53, 5], [52, 11], [51, 16], [48, 19], [45, 22]]) c.line(34, 22, x - 2, y, 'L');
  c.at();
  // body
  c.ball(35.5, 29, 12.5, 7.5, NIGHT, { ang: 0.42 });
  // neck S-curve: poised / spear-thrust forward / recoiled up and back
  const neckPts = A ? [[29, 27], [24, 25], [19, 22], [16, 19], [14, 17]] : H ? [[29, 27], [24, 24], [22, 20], [24, 15], [25, 11], [23, 8]] : [[29, 27], [24, 24], [21, 20], [22, 15], [23, 12], [20, 9]];
  const neck = c.tube(neckPts, 3, 1.9);
  c.puff(neck, NIGHT, 2);
  // folded wing cloak with scalloped edge
  const wing = c.poly([[27, 23], [38, 20], [47, 25], [53, 34], [54, 42], [51, 39], [49, 42], [46, 38], [43, 40], [41, 37], [37, 38], [33, 34], [28, 30]]);
  c.puff(wing, NIGHT, 3, -0.08);
  c.sep(wing, 'L', 'lower');
  // feather lines on wing
  c.line(35, 26, 44, 33, 'L'); c.line(38, 24, 48, 31, 'L'); c.line(33, 29, 40, 35, 'L');
  // head group
  const HD = A ? [-5, 6] : H ? [3, -1] : [0, 0];
  c.at(...HD);
  const head = c.ball(18.5, 9, 4, 3, NIGHT);
  // crest plumes (sway at idle, stream back on the strike)
  if (I) { c.path('v', [[21, 7], [25, 6], [30, 7], [33, 9]]); c.path('P', [[21, 8], [26, 8], [30, 9]]); c.pts('V', [33, 9], [30, 9]); }
  else if (A) { c.path('v', [[21, 7], [26, 6], [31, 6], [35, 5]]); c.path('P', [[21, 8], [27, 8], [32, 7]]); c.pts('V', [35, 5], [32, 7]); }
  else { c.path('v', [[21, 7], [25, 5], [30, 5], [33, 7]]); c.path('P', [[21, 8], [26, 7], [30, 8]]); c.pts('V', [33, 7], [30, 8]); }
  // bill: long, drooping (levelled into a spear on the strike, knocked upward on a hit)
  if (A) { c.fill(c.poly([[16, 8], [6, 11], [16, 11]]), 'X'); c.line(15, 10, 7, 11, 'Y'); c.line(16, 11, 8, 11, 'E'); c.pts('W', [14, 9], [13, 9]); }
  else if (H) { c.fill(c.poly([[16, 8], [5, 7], [16, 10]]), 'X'); c.line(15, 9, 6, 8, 'Y'); c.line(16, 10, 8, 8, 'E'); c.pts('W', [14, 8], [12, 8]); }
  else { c.fill(c.poly([[16, 8], [4, 14], [16, 11]]), 'X'); c.line(15, 10, 6, 14, 'Y'); c.line(16, 11, 7, 14, 'E'); c.pts('W', [14, 9], [13, 9]); }
  c.at();
  // stars (a few twinkle off and on at idle)
  const night = new Set(['H', 'I', 'L']);
  for (let y = 2; y < 54; y++) for (let x = 2; x < 54; x++) {
    if (!night.has(c.get(x, y))) continue;
    if (!c.solid(x - 1, y) || !c.solid(x + 1, y) || !c.solid(x, y - 1) || !c.solid(x, y + 1)) continue;
    const r = rnd();
    if (r < (I ? 0.03 : 0.045)) c.set(x, y, '*'); else if (r < 0.06) c.set(x, y, 'V');
  }
  for (const [x, y] of [[40, 29], [45, 34], [31, 25]]) c.sparkle(x, y, '*', 'P');
  // gloam heart glow on the chest (pulses)
  if (I) { c.pts('P', [25, 26], [27, 26], [25, 27], [27, 27], [26, 28], [26, 26]); c.pts('V', [26, 27]); }
  else if (A) { c.pts('V', [25, 26], [27, 26], [25, 27], [27, 27], [26, 28], [26, 26]); c.pts('w', [26, 27]); c.pts('P', [24, 27], [28, 27], [26, 29], [24, 26], [28, 26]); }
  else { c.pts('V', [25, 26], [27, 26], [25, 27], [27, 27], [26, 28]); c.pts('w', [26, 27]); c.pts('P', [24, 27], [28, 27], [26, 29]); }
  // sad eye + tear (narrowed to strike, squeezed shut on a hit)
  c.at(...HD);
  if (H) { c.pts('L', [16, 7], [17, 8], [18, 8], [16, 9]); c.pts('v', [17, 10], [17, 11]); c.pts('V', [18, 12]); }
  else {
    c.pts('v', [16, 8], [19, 8]); c.pts('w', [17, 8]); c.pts('V', [18, 8], [17, 9]); c.pts('v', [18, 9]); c.pts('L', [16, 7], [17, 7], [18, 7], [19, 7]);
    if (A) c.pts('L', [15, 7], [17, 8]);
    else { c.pts('v', [17, 10], [17, 11]); c.pts('V', [17, 12]); }
  }
  c.at();
  void head;
  if (I) squash(c, 42);
  c.outline();
  // ripples + drifting starlight
  c.path('Y', [[20, 55], [24, 55]]); c.path('Y', [[39, 55], [43, 55]]); c.pts('E', [18, 55], [45, 55]);
  if (I) { c.pts('*', [9, 27], [12, 39], [5, 33], [31, 3]); c.sparkle(41, 4, '*', 'v'); c.sparkle(8, 32, '*', 'v'); }
  else { c.pts('*', [8, 26], [12, 40], [4, 34], [30, 3]); c.sparkle(40, 3, '*', 'v'); c.sparkle(9, 31, '*', 'v'); }
  if (A) streaks(c, [[40, 12, 4], [38, 16, 3], [2, 22, 3]], 'Y');
  if (H) { poof(c, 36, 12, true); star(c, 8, 8); c.pts('*', [48, 1], [52, 22], [2, 20]); }
  return sprite(c);
}

registerSprites({
  ...framesOf('en_gourdling', gourdling),
  ...framesOf('en_sporecap', sporecap),
  ...framesOf('en_hollowbat', hollowbat),
  ...framesOf('en_leafling', leafling),
  ...framesOf('en_mothowl', mothowl),
  ...framesOf('boss_hollowjack', hollowjack),
  ...framesOf('en_snowhare', snowhare),
  ...framesOf('en_icewisp', icewisp),
  ...framesOf('en_frostcrab', frostcrab),
  ...framesOf('en_snowmite', snowmite),
  ...framesOf('en_gloamwolf', gloamwolf),
  ...framesOf('boss_nightheron', nightheron),
});
