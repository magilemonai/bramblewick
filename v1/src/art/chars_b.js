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
    w, h, g,
    set(x, y, ch) { x = Math.floor(x); y = Math.floor(y); if (inb(x, y) && ch) g[y][x] = ch; },
    get(x, y) { return inb(x, y) ? g[y][x] : '.'; },
    solid(x, y) { return c.get(x, y) !== '.'; },
    clear(x, y) { if (inb(x, y)) g[y][x] = '.'; },
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
function gourdling() {
  const c = mk(32, 32);
  c.ball(11, 29.3, 3.3, 1.7, ['i', 'j', 'J']);
  c.ball(21, 29.3, 3.3, 1.7, ['i', 'j', 'J']);
  c.ball(21.5, 20.5, 7.5, 8, PUMP, { bias: -0.05 });
  c.ball(8.5, 20.5, 5.5, 7.5, PUMP);
  const mid = c.ball(14.5, 20, 7.5, 8.7, PUMP, { bias: 0.05 });
  c.sep(mid, 'd');
  // little arms
  c.ball(4, 23, 1.8, 1.5, ['c', 'd']);
  // stem + leaf + tendril
  c.puff(c.poly([[14, 12], [14, 9], [15, 7], [17, 7], [17, 9], [17, 12]]), ['h', 'i', 'j'], 2);
  c.pts('J', [15, 7], [16, 7]);
  c.ball(20.5, 9.5, 3.4, 1.8, LEAF, { ang: -0.45 });
  c.line(18, 11, 22, 8, 'n');
  c.pts('n', [13, 10], [12, 9], [11, 9], [10, 8], [10, 7], [11, 6]);
  // gloam
  c.gloam(24, 16, 3.6, { seed: 3, drips: 2, drip: 3 });
  c.gloam(6.5, 25, 2, { seed: 9, drips: 1, drip: 2 });
  // face (turned left)
  c.eye(9, 19); c.eye(15, 19);
  c.pts('k', [8, 17], [9, 17], [10, 18], [15, 18], [16, 17], [17, 17]);
  c.pts('e', [10, 23], [11, 22], [12, 22], [13, 22], [14, 22], [15, 23]);
  c.pts('x', [12, 23]);
  c.outline();
  return sprite(c);
}

function sporecap() {
  const c = mk(32, 32);
  // stem body + arms
  c.ball(7.5, 24.5, 2.2, 1.7, ['y', 'z', 'Z']);
  c.ball(25, 25, 2.2, 1.7, ['y', 'z', 'Z']);
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
  c.gloam(27, 13.5, 2, { seed: 5, drips: 1, drip: 3 });
  // face
  c.eye(11, 20, 2, 'Z'); c.eye(16, 20, 2, 'Z');
  c.pts('k', [10, 18], [11, 18], [12, 19], [16, 19], [17, 18], [18, 18]);
  c.pts('Z', [12, 25], [13, 24], [14, 24], [15, 24], [16, 25]);
  c.pts('o', [9, 22], [19, 22]);
  c.outline();
  // floating spores (no outline)
  c.pts('v', [3, 4], [28, 2], [2, 19], [30, 20], [26, 1]);
  c.pts('V', [4, 3], [29, 19]);
  return sprite(c);
}

function hollowbat() {
  const c = mk(32, 32);
  const wingL = [[13, 12], [8, 6], [2, 4], [1, 9], [2, 16], [4, 13], [6, 17], [8, 14], [10, 18], [12, 15], [14, 18]];
  const wingR = wingL.map(([x, y]) => [31 - x, y]);
  const WING = ['P', 'Q', 'R', 'S'];
  c.puff(c.poly(wingL), WING, 2);
  c.puff(c.poly(wingR), WING, 2);
  // wing bones
  c.path('S', [[13, 12], [7, 7], [2, 5]]); c.line(8, 8, 4, 13, 'S'); c.line(11, 11, 8, 14, 'S'); c.line(12, 13, 12, 15, 'S');
  c.path('S', [[18, 12], [24, 7], [29, 5]]); c.line(23, 8, 27, 13, 'S'); c.line(20, 11, 23, 14, 'S'); c.line(19, 13, 19, 15, 'S');
  // tatter holes
  c.clear(27, 12); c.clear(28, 12); c.clear(28, 13);
  // ears
  c.puff(c.poly([[10, 12], [10, 3], [15, 10]]), WOOD, 2);
  c.puff(c.poly([[17, 10], [21, 3], [21, 12]]), WOOD, 2);
  c.pts('8', [11, 7], [11, 8], [12, 9], [20, 7], [20, 8], [19, 9]);
  // body
  const body = c.ball(15.5, 16, 6, 6.8, WOOD);
  c.ball(14.5, 18.5, 3.2, 3.2, ['y', 'z', 'Z'], { clip: (x, y) => body.has(y * 32 + x) && y > 16 });
  // feet
  c.pts('J', [13, 23], [13, 24], [17, 23], [17, 24]);
  c.gloam(25, 9, 3, { seed: 44, drips: 2, drip: 3 });
  c.gloam(17.5, 11, 2.2, { seed: 12, drips: 0 });
  // face
  c.eye(11, 14); c.eye(15, 14);
  c.pts('k', [10, 12], [11, 12], [12, 13], [15, 13], [16, 12], [17, 12]);
  c.pts('J', [12, 18], [13, 17], [14, 17], [15, 18]);
  c.pts('w', [13, 18]);
  c.outline();
  return sprite(c);
}

function leafling() {
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
  // maple leaf on top
  const maple = c.hand([
    '..#..',
    '#.#.#',
    '#####',
    '.###.',
    '#####',
    '..#..',
  ], 16, 9);
  c.puff(maple, RED, 2);
  c.pts('D', [18, 11], [18, 12], [18, 13]);
  c.pts('j', [18, 15], [18, 16]);
  // twig arms
  c.path('i', [[5, 24], [3, 22], [2, 19]]); c.pts('h', [1, 21], [2, 21], [3, 19]);
  c.path('i', [[27, 23], [29, 20], [30, 18]]); c.pts('h', [30, 21], [29, 21]);
  c.gloam(24, 22, 2.8, { seed: 31, drips: 2, drip: 3 });
  c.gloam(9, 27, 1.6, { seed: 4, drips: 1, drip: 2 });
  // peeking eyes in a shadowy gap between leaves
  c.fill(c.ell(12.5, 22, 5.2, 1.9), 'S');
  c.pts('V', [9, 21], [10, 21], [10, 22], [11, 22], [14, 22], [15, 22], [15, 21], [16, 21]);
  c.pts('w', [9, 21], [16, 21]);
  c.pts('v', [9, 22], [16, 22]);
  // drifting leaf
  c.ball(26.5, 6, 2.2, 1.3, PUMP, { ang: 0.6 });
  c.outline();
  return sprite(c);
}

function mothowl() {
  const c = mk(40, 40);
  // wings (plum edge, warm fill, eyespots)
  for (const s of [1, -1]) {
    const X = x => (s === 1 ? x : 39 - x);
    c.ball(X(9), 14, 8, 9, PLUM);
    c.ball(X(9.5), 14.5, 6.3, 7.2, MUST);
    c.ball(X(10), 27, 6, 6.3, PLUM);
    c.ball(X(10.5), 27, 4.4, 4.8, PUMP);
    c.ball(X(8), 13, 2.8, 2.8, ['R', 'R']);
    c.ball(X(8), 13, 1.8, 1.8, ['x', 'y']);
    c.set(X(8) - (s === 1 ? 0 : 1), 13, 'R');
    c.line(X(15), 18, X(5), 9, 'r'); c.line(X(15), 20, X(4), 19, 'r'); c.line(X(15), 22, X(8), 30, 'c');
  }
  // body
  const body = c.ball(19.5, 26.5, 8.5, 10, WOOD);
  c.sep(body, 'J');
  c.ball(18.5, 28.5, 5.5, 7, CREAM, { clip: (x, y) => body.has(y * 40 + x) });
  for (const [x, y] of [[16, 26], [20, 26], [18, 29], [22, 29], [16, 32], [20, 32]]) c.pts('Z', [x - 1, y], [x, y + 1], [x + 1, y]);
  // talons
  c.pts('q', [15, 36], [16, 36], [17, 36], [21, 36], [22, 36], [23, 36]);
  c.pts('r', [15, 37], [17, 37], [21, 37], [23, 37]);
  // head
  const head = c.ball(19.5, 13.5, 9, 7.5, WOOD);
  c.sep(head, 'J', 'lower');
  c.ball(15, 14, 4.2, 4.2, CREAM);
  c.ball(23.5, 14, 4.2, 4.2, CREAM);
  // antennae (feathery)
  c.path('r', [[16, 7], [14, 4], [12, 2], [10, 2]]); c.pts('q', [15, 4], [13, 2], [13, 5], [11, 3], [12, 1]);
  c.path('r', [[23, 7], [25, 4], [27, 2], [29, 2]]); c.pts('q', [24, 4], [26, 2], [26, 5], [28, 3], [27, 1]);
  c.gloam(26.5, 28, 3.4, { seed: 8, drips: 2, drip: 3 });
  c.gloam(30, 27, 2.4, { seed: 18, drips: 1, drip: 2 });
  c.gloam(23, 8.5, 2, { seed: 2, drips: 0 });
  // big glowing eyes + grumpy brow
  c.eye(13, 13, 3, 'G'); c.eye(22, 13, 3, 'G');
  c.pts('k', [11, 11], [12, 11], [13, 11], [14, 11], [15, 12], [16, 12], [21, 12], [22, 12], [23, 11], [24, 11], [25, 11], [26, 11]);
  c.pts('q', [18, 15], [19, 15]); c.pts('r', [18, 16], [19, 16]); c.pts('U', [18, 17]);
  c.outline();
  c.pts('v', [2, 30], [36, 34], [37, 4]);
  return sprite(c);
}

function hollowjack() {
  const c = mk(56, 56);
  // pole + crossbar
  c.puff(c.poly([[26, 22], [30, 22], [30, 53], [26, 53]]), WOOD, 2);
  c.puff(c.poly([[4, 21], [52, 21], [52, 24], [4, 24]]), WOOD, 1);
  // ground tuft
  c.ball(28, 54, 7, 1.6, ['t', 'u', 'U']);
  for (const [x0, x1] of [[24, 21], [25, 23], [31, 33], [32, 35], [28, 28]]) c.line(x0, 53, x1, 49, 't');
  // hem straw
  const hemStraw = [[19, 44, 17, 50], [21, 45, 20, 51], [24, 46, 23, 52], [27, 46, 27, 51], [31, 46, 32, 52], [34, 45, 35, 50], [37, 44, 39, 50], [22, 45, 22, 49], [33, 45, 33, 49]];
  hemStraw.forEach(([a, b, x, y], i) => c.line(a, b, x, y, i % 3 === 0 ? 's' : i % 3 === 1 ? 't' : 'u'));
  // cuff straw (both sides)
  for (const s of [1, -1]) {
    const X = x => (s === 1 ? x : 56 - x);
    const ends = [[2, 18], [1, 22], [2, 26], [2, 30], [4, 33], [5, 17], [6, 34]];
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
  c.gloam(22, 42, 2.4, { seed: 55, drips: 2, drip: 3 });
  // crow on right arm
  c.puff(c.poly([[49, 18], [53, 21], [52, 22], [48, 21]]), ['7', '5', '6'], 1);
  c.ball(46.5, 18, 3.5, 3, ['7', '5', '6']);
  c.ball(43.5, 15, 2.4, 2.2, ['7', '5', '6']);
  c.pts('q', [40, 15], [41, 15]); c.pts('r', [41, 16]);
  c.pts('V', [43, 14]);
  c.pts('q', [45, 21], [47, 21]);
  // pumpkin lantern head
  c.ball(34, 12.5, 7, 8, PUMP, { bias: -0.05 });
  c.ball(21, 12.5, 6, 7.5, PUMP);
  const head = c.ball(27, 12, 8, 8.8, PUMP, { bias: 0.05 });
  c.sep(head, 'd');
  // carved face glow
  const holes = [];
  const add = (x, y) => holes.push([x, y]);
  [[19, 9], [19, 10], [20, 10], [19, 11], [20, 11], [21, 11], [20, 12], [21, 12], [22, 12]].forEach(([x, y]) => add(x, y));
  [[31, 9], [30, 10], [31, 10], [29, 11], [30, 11], [31, 11], [28, 12], [29, 12], [30, 12]].forEach(([x, y]) => add(x, y));
  [[25, 13], [24, 14], [25, 14], [26, 14]].forEach(([x, y]) => add(x, y));
  for (const x of [18, 19, 20, 30, 31, 32]) add(x, 16);
  for (let x = 19; x <= 31; x++) if (x !== 22 && x !== 28) add(x, 17);
  for (let x = 20; x <= 30; x++) if (x !== 25) add(x, 18);
  for (let x = 22; x <= 28; x++) add(x, 19);
  const hs = new Set(holes.map(([x, y]) => y * 56 + x));
  for (const [x, y] of holes) {
    const top = !hs.has((y - 1) * 56 + x);
    c.set(x, y, top ? 'v' : 'V');
    if (!hs.has((y + 1) * 56 + x)) c.set(x, y + 1, 'a');
  }
  c.pts('w', [20, 11], [21, 12], [30, 11], [29, 12], [25, 14], [24, 18], [25, 18]);
  // hat
  c.puff(c.poly([[21, 5], [22, 1], [28, 0], [33, 1], [35, 5]]), WOOD, 2);
  c.line(22, 4, 35, 4, 'c'); c.line(22, 5, 35, 5, 'd');
  c.ball(28, 6, 14, 2.2, ['i', 'j', 'J'], { ang: -0.1 });
  c.pts('b', [30, 2], [31, 2]); c.pts('k', [29, 2], [32, 2]);
  // crow feather in hat band
  c.path('6', [[35, 4], [37, 2], [39, 1]]); c.path('5', [[35, 5], [38, 2], [40, 2]]); c.pts('7', [36, 3], [38, 1]);
  c.outline();
  // loose feathers + gloam motes
  c.path('6', [[6, 9], [8, 11], [9, 13]]); c.pts('5', [7, 9], [8, 10], [9, 12]); c.pts('7', [10, 14]);
  c.path('6', [[48, 37], [50, 38], [52, 40]]); c.pts('5', [49, 37], [51, 38]);
  c.pts('v', [14, 5], [42, 7], [12, 16], [44, 46], [10, 42]);
  c.pts('V', [13, 6], [43, 8]);
  return sprite(c);
}

// ================================================================ WINTER
function snowhare() {
  const c = mk(32, 32);
  // far ear
  c.ball(16.5, 7, 1.8, 5.5, ['X', 'Y', 'E'], { ang: 0.5 });
  // body
  c.ball(28, 20, 2.4, 2.4, SNOW);
  c.ball(20, 23, 9, 7, SNOW);
  const foot = c.ball(19, 29.3, 5.5, 1.7, SNOW, { bias: -0.1 });
  c.sep(foot, 'Y', 'lower');
  c.ball(12.5, 23, 4.5, 5.5, SNOW, { bias: 0.05 });
  c.ball(10, 29.2, 2.6, 1.6, SNOW);
  // head
  const head = c.ball(10.5, 16, 5.8, 5.2, SNOW, { bias: 0.05 });
  c.sep(head, 'X', 'lower');
  c.ball(9, 19, 3, 2, ['w', 'W']);
  // near ear with pink inner
  c.ball(13, 6.5, 2.2, 5.8, SNOW, { ang: 0.32 });
  c.ball(12.8, 7, 0.9, 4, ['8', 'o'], { ang: 0.32 });
  c.gloam(22.5, 18.5, 3.3, { seed: 4, drips: 2, drip: 3 });
  c.gloam(15, 1.8, 1.8, { seed: 6, drips: 0 });
  // face
  c.eye(7, 15, 2, 'G');
  c.pts('k', [6, 14], [7, 13], [8, 13], [9, 13], [10, 12]);
  c.pts('8', [5, 17]);
  c.pts('Y', [6, 19], [7, 19]);
  c.pts('X', [7, 18]);
  c.outline();
  return sprite(c);
}

function icewisp() {
  const c = mk(32, 32);
  const body = c.union(
    c.ell(15, 21, 8, 7.5),
    c.tube([[15, 18], [15, 12], [17, 7], [20, 4], [23, 3]], 6.5, 0.6),
    c.tube([[20, 18], [23, 14], [24, 10]], 2.6, 0.5),
    c.tube([[10, 18], [8, 15], [8, 13]], 2.2, 0.5),
  );
  c.puff(body, ICE, 5, 0.05);
  // inner flame
  const core = c.union(c.ell(14.5, 21.5, 4.8, 4.5), c.tube([[15, 19], [15, 13], [17, 9], [20, 6]], 3.4, 0.5));
  c.puff(core, ['w', 'W', 'X'], 3);
  c.gloam(22, 3.5, 2.5, { seed: 13, drips: 0, speck: 0.2 });
  // shards
  c.fill(c.poly([[26, 14], [28, 12], [29, 15], [27, 17]]), 'X'); c.pts('W', [27, 13], [27, 14]); c.pts('Y', [28, 15]);
  c.fill(c.poly([[3, 24], [5, 22], [6, 25], [4, 26]]), 'X'); c.pts('W', [4, 23]);
  // face
  c.eye(10, 20, 2, 'F'); c.eye(16, 20, 2, 'F');
  c.pts('F', [9, 18], [10, 18], [11, 19], [16, 19], [17, 18], [18, 18]);
  c.pts('F', [12, 24], [13, 23], [14, 23], [15, 24]);
  c.outline('H');
  c.sparkle(4, 8, 'w', 'X'); c.sparkle(28, 25, 'w', 'X'); c.pts('X', [27, 4], [7, 2], [2, 16]);
  return { palette: P, rows: c.rows() };
}

function frostcrab() {
  const c = mk(32, 32);
  const LEG = ['E', 'F', 'H'];
  for (const pts of [[[9, 22], [5, 24], [3, 28], [3, 30]], [[11, 23], [8, 27], [7, 30]], [[21, 23], [24, 27], [25, 30]], [[23, 22], [27, 24], [29, 28], [29, 30]]])
    c.puff(c.tube(pts, 1), LEG, 1);
  c.ball(16, 22, 8.5, 3.2, ['F', 'H', 'I']);
  // shell: wide, low dome
  const shell = c.ball(16, 20, 12, 7.5, ICE, { clip: (x, y) => y <= 21 });
  for (let x = 5; x <= 27; x++) if (shell.has(21 * 32 + x)) c.set(x, 21, 'F');
  c.gloam(23, 16.5, 3, { seed: 27, drips: 2, drip: 3 });
  // frost crystals on the shell shoulders
  for (const [x, y] of [[8, 15], [25, 16]]) { c.pts('W', [x, y], [x, y - 1], [x, y - 2]); c.pts('X', [x + 1, y], [x + 1, y - 1], [x - 1, y]); }
  // arms + raised pincers
  const PINCER = [
    '.##..#.',
    '####.##',
    '####.##',
    '#######',
    '#######',
    '.#####.',
    '..###..',
  ];
  c.puff(c.tube([[7, 19], [4, 17], [4, 14]], 1.3), ['X', 'Y', 'E'], 1);
  c.puff(c.hand(PINCER, 1, 6), ['W', 'X', 'Y', 'E'], 2);
  c.puff(c.tube([[25, 19], [28, 17], [28, 14]], 1.2), ['X', 'Y', 'E'], 1);
  c.puff(c.hand(PINCER.slice(1), 25, 8, true), ['W', 'X', 'Y', 'E'], 2);
  // eye stalks
  c.line(13, 13, 13, 10, 'E'); c.line(18, 13, 18, 10, 'E');
  c.eye(12, 8, 2, 'H'); c.eye(17, 8, 2, 'H');
  c.pts('k', [11, 7], [12, 7], [13, 8], [17, 8], [18, 7], [19, 7]);
  c.set(13, 8, 'k'); c.set(17, 8, 'k');
  c.set(13, 9, 'V'); c.set(17, 9, 'V');
  // grumpy mouth + cheeks on the shell front
  c.pts('F', [13, 19], [14, 18], [15, 18], [16, 18], [17, 19]);
  c.pts('o', [10, 17], [20, 17]);
  c.outline();
  c.sparkle(27, 4, 'w', 'X'); c.pts('X', [22, 3]);
  return sprite(c);
}

function snowmite() {
  const c = mk(32, 32);
  for (const pts of [[[10, 23], [7, 26], [6, 29]], [[13, 25], [11, 28], [11, 30]], [[20, 25], [22, 28], [22, 30]], [[23, 23], [26, 26], [27, 29]]])
    c.path('F', pts);
  c.pts('E', [6, 29], [11, 30], [22, 30], [27, 29]);
  c.path('F', [[11, 14], [9, 10], [7, 8]]); c.path('F', [[14, 13], [14, 9], [16, 7]]);
  const body = c.ball(16, 20, 9, 7.5, SNOW);
  // fluff bumps along the rim
  const rnd = rng(5);
  for (let a = 0; a < Math.PI * 2; a += 0.33) {
    if (rnd() < 0.35) continue;
    const x = Math.round(16 + Math.cos(a) * 9.3 - 0.5), y = Math.round(20 + Math.sin(a) * 7.8 - 0.5);
    if (!c.solid(x, y)) c.set(x, y, Math.sin(a) > 0.3 || Math.cos(a) > 0.4 ? 'X' : 'W');
  }
  void body;
  c.gloam(20, 15, 2.3, { seed: 3, drips: 0 });
  c.gloam(23.5, 21.5, 1.7, { seed: 8, drips: 1, drip: 2 });
  c.gloam(12, 25, 1.3, { seed: 1, drips: 0 });
  // mandibles
  c.pts('Y', [6, 21], [5, 22], [6, 24]); c.pts('E', [5, 23], [6, 25]);
  c.eye(9, 18, 2, 'G'); c.eye(13, 18, 2, 'G');
  c.pts('k', [8, 16], [9, 16], [10, 17], [13, 17], [14, 16], [15, 16]);
  c.pts('Y', [10, 22], [11, 21], [12, 22]);
  c.outline();
  c.pts('V', [6, 7], [16, 6]); c.pts('v', [6, 8], [17, 6]);
  c.sparkle(26, 9, 'w', 'X');
  return sprite(c);
}

function gloamwolf() {
  const c = mk(40, 40);
  const DLEG = ['F', 'H', 'I'];
  // far legs
  c.puff(c.tube([[18, 28], [18, 33], [17, 36]], 1.4), DLEG, 1);
  c.puff(c.tube([[32, 28], [33, 32], [33, 36]], 1.4), DLEG, 1);
  // tail
  c.puff(c.tube([[33, 22], [36, 18], [37, 13], [36, 9], [34, 7]], 3, 1.8), NAVY, 2);
  c.pts('X', [34, 6], [35, 6], [33, 7], [34, 7]); c.pts('W', [34, 6]);
  c.pts('F', [37, 14], [36, 16], [37, 11]);
  // body
  c.ball(25, 24, 11, 7, NAVY);
  // near legs
  for (const pts of [[[14, 27], [13, 32], [13, 36]], [[21, 28], [21, 32], [22, 36]], [[29, 27], [28, 31], [30, 36]]]) {
    const m = c.puff(c.tube(pts, 1.6), ['E', 'F', 'H'], 1); c.sep(m, 'H', 'lower');
  }
  for (const x of [12, 21, 29]) c.pts('X', [x, 37], [x + 1, 37], [x + 2, 37]);
  // chest fluff
  c.puff(c.ell(15.5, 25, 4, 5), ['W', 'X', 'Y'], 2);
  // ears
  c.puff(c.poly([[15, 13], [18, 6], [19, 14]]), ['E', 'F', 'H'], 1);
  // head
  const head = c.ball(12, 17.5, 6.5, 5.5, ['X', 'Y', 'E', 'F']);
  c.sep(head, 'F', 'lower');
  c.puff(c.poly([[9, 13], [11, 5], [15, 12]]), ['Y', 'E', 'F'], 1);
  c.pts('G', [11, 8], [11, 9], [12, 10]);
  // snout + jaw
  c.ball(6.5, 20, 4.3, 2.6, ['W', 'X', 'Y']);
  c.pts('L', [2, 19], [3, 19], [2, 20]);
  c.line(4, 22, 9, 22, 'I'); c.pts('w', [5, 23]);
  c.ball(8, 23.2, 2.5, 1, ['X', 'Y']);
  // gloam mane
  for (const t of [[[16, 13], [19, 8], [21, 14]], [[19, 14], [23, 10], [25, 17]], [[23, 16], [27, 13], [28, 19]]]) c.fill(c.poly(t), 'G');
  c.gloam(19.5, 17, 5, { seed: 40, drips: 3, drip: 4, speck: 0.03 });
  c.gloam(31, 22, 2.2, { seed: 2, drips: 1, drip: 2 });
  // eye + brow
  c.pts('G', [7, 16], [8, 17], [9, 18], [10, 18], [11, 17], [11, 16]); c.pts('w', [8, 16]); c.pts('V', [9, 16], [10, 16], [9, 17]); c.pts('v', [10, 17]);
  c.pts('k', [7, 15], [8, 15], [9, 14], [10, 14], [11, 14]);
  c.outline();
  // frosty breath
  c.pts('X', [1, 16], [2, 15], [1, 14]); c.pts('W', [2, 14]);
  c.pts('v', [22, 5], [26, 8], [30, 6]);
  return sprite(c);
}

function nightheron() {
  const c = mk(56, 56);
  const rnd = rng(1234);
  // standing leg + tucked leg
  c.puff(c.tube([[32, 38], [31, 46], [32, 53]], 1), ['Y', 'E', 'F'], 1);
  c.path('E', [[25, 54], [32, 53], [37, 54]]); c.path('F', [[28, 54], [31, 54]]);
  c.puff(c.tube([[36, 38], [39, 43], [35, 45]], 0.9), ['E', 'F', 'H'], 1);
  // trailing plumes
  c.puff(c.tube([[42, 34], [48, 42], [51, 49]], 2.2, 0.8), NIGHT, 2);
  c.puff(c.tube([[39, 36], [43, 43], [44, 50]], 1.8, 0.7), NIGHT, 2);
  // raised far wing arching behind, like a cloak of night
  const far = c.poly([[30, 23], [33, 15], [39, 9], [46, 5], [53, 3], [54, 8], [52, 12], [53, 16], [50, 15], [50, 20], [47, 18], [46, 23], [43, 21], [41, 26], [37, 24], [34, 27]]);
  c.puff(far, ['v', 'I', 'L', 'L'], 3, -0.05);
  for (const [x, y] of [[53, 5], [52, 11], [51, 16], [48, 19], [45, 22]]) c.line(34, 22, x - 2, y, 'L');
  // body
  c.ball(35.5, 29, 12.5, 7.5, NIGHT, { ang: 0.42 });
  // neck S-curve
  const neck = c.tube([[29, 27], [24, 24], [21, 20], [22, 15], [23, 12], [20, 9]], 3, 1.9);
  c.puff(neck, NIGHT, 2);
  // folded wing cloak with scalloped edge
  const wing = c.poly([[27, 23], [38, 20], [47, 25], [53, 34], [54, 42], [51, 39], [49, 42], [46, 38], [43, 40], [41, 37], [37, 38], [33, 34], [28, 30]]);
  c.puff(wing, NIGHT, 3, -0.08);
  c.sep(wing, 'L', 'lower');
  // feather lines on wing
  c.line(35, 26, 44, 33, 'L'); c.line(38, 24, 48, 31, 'L'); c.line(33, 29, 40, 35, 'L');
  // head
  const head = c.ball(18.5, 9, 4, 3, NIGHT);
  // crest plumes
  c.path('v', [[21, 7], [25, 5], [30, 5], [33, 7]]); c.path('P', [[21, 8], [26, 7], [30, 8]]); c.pts('V', [33, 7], [30, 8]);
  // bill: long, drooping
  c.fill(c.poly([[16, 8], [4, 14], [16, 11]]), 'X');
  c.line(15, 10, 6, 14, 'Y'); c.line(16, 11, 7, 14, 'E');
  c.pts('W', [14, 9], [13, 9]);
  // stars
  const night = new Set(['H', 'I', 'L']);
  for (let y = 2; y < 54; y++) for (let x = 2; x < 54; x++) {
    if (!night.has(c.get(x, y))) continue;
    if (!c.solid(x - 1, y) || !c.solid(x + 1, y) || !c.solid(x, y - 1) || !c.solid(x, y + 1)) continue;
    const r = rnd();
    if (r < 0.045) c.set(x, y, '*'); else if (r < 0.06) c.set(x, y, 'V');
  }
  for (const [x, y] of [[40, 29], [45, 34], [31, 25]]) c.sparkle(x, y, '*', 'P');
  // gloam heart glow on the chest
  c.pts('V', [25, 26], [27, 26], [25, 27], [27, 27], [26, 28]); c.pts('w', [26, 27]); c.pts('P', [24, 27], [28, 27], [26, 29]);
  // sad eye + tear
  c.pts('v', [16, 8], [19, 8]); c.pts('w', [17, 8]); c.pts('V', [18, 8], [17, 9]); c.pts('v', [18, 9]); c.pts('L', [16, 7], [17, 7], [18, 7], [19, 7]);
  c.pts('v', [17, 10], [17, 11]); c.pts('V', [17, 12]);
  void head;
  c.outline();
  // ripples + drifting starlight
  c.path('Y', [[20, 55], [24, 55]]); c.path('Y', [[39, 55], [43, 55]]); c.pts('E', [18, 55], [45, 55]);
  c.pts('*', [8, 26], [12, 40], [4, 34], [30, 3]);
  c.sparkle(40, 3, '*', 'v'); c.sparkle(9, 31, '*', 'v');
  return sprite(c);
}

registerSprites({
  en_gourdling: gourdling(),
  en_sporecap: sporecap(),
  en_hollowbat: hollowbat(),
  en_leafling: leafling(),
  en_mothowl: mothowl(),
  boss_hollowjack: hollowjack(),
  en_snowhare: snowhare(),
  en_icewisp: icewisp(),
  en_frostcrab: frostcrab(),
  en_snowmite: snowmite(),
  en_gloamwolf: gloamwolf(),
  boss_nightheron: nightheron(),
});
