// Garden plants for Bramblewick: plant_<id>_<0..3>, 16x16, base on the bottom row.
// 0 = seed mound, 1 = sprout, 2 = growing (species readable), 3 = ripe / in bloom.
// Composed with a tiny DOM-free raster toolkit, then hand-detailed.
import { registerSprites, PAL } from '../pixel.js';

const P = {
  k: PAL.ink,
  // soil
  e: '#c48f5e', d: PAL.wood, D: PAL.woodDark, E: '#3b2519',
  // leaves
  l: PAL.leafLight, m: PAL.leaf, n: PAL.leafDark, N: '#2c5530',
  // sunflower petals + disk
  F: '#ffe98a', f: PAL.sun, o: PAL.gold, O: '#c9822a', b: '#8a5a3b', B: '#5e3b26', c: '#b98356',
  // pumpkin
  a: '#ffc56e', p: '#f29a3f', q: '#d06e2d', r: '#a2462a',
  // turnip
  w: PAL.white, x: '#fbf3e4', y: '#e6d8c8', z: '#bfae9e', 1: '#e7b0ee', 2: '#b570c4', 3: '#844a9a', 4: '#58306c',
  // blueberry
  5: '#b4cdff', 6: '#6f8fe0', 7: '#4a5aa8', 8: '#2e3470',
  // chili
  A: '#ff9676', R: '#e0443a', C: '#b02c30', 9: '#781f2c',
  // mint
  j: '#c6f2b8', J: '#86d58f', K: '#4fa36c', L: '#2e6e52',
  // thornvine
  v: '#8a9a58', V: '#5d6e40', T: '#3a462c', s: '#efe0b8', Q: '#d2aaff', S: '#9a6cd8', U: '#6b449e', u: '#ffe07a',
  // frost lily
  I: '#f2faff', i: '#c4e6f5', G: '#8fb9d9', t: '#a8e0cf', g: '#5fa89a', h: '#3d7a74',
  // moonmelon
  Y: '#fbfbe6', H: '#dcefc6', X: '#a9cfa6', Z: '#6f9f8e', M: '#fff3a8',
  // glowcap
  '$': '#effff8', '%': '#a6f2dc', '&': '#5ecab8', '@': '#3a8490', '!': '#d8c8ff', '?': PAL.lilac,
};

const LIGHT = (() => { const v = [-0.5, -0.6, 0.62], l = Math.hypot(...v); return v.map(a => a / l); })();
const TH = { 1: [], 2: [0.35], 3: [0.72, 0.25], 4: [0.88, 0.6, 0.15] };
const level = (l, n) => { const t = TH[n]; for (let i = 0; i < t.length; i++) if (l > t[i]) return i; return n - 1; };

function mk() {
  const W = 16, Hh = 16;
  const g = Array.from({ length: Hh }, () => Array(W).fill('.'));
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh;
  const c = {
    set(x, y, ch) { x = Math.floor(x); y = Math.floor(y); if (inb(x, y) && ch) g[y][x] = ch; },
    get(x, y) { return inb(x, y) ? g[y][x] : '.'; },
    solid(x, y) { return c.get(x, y) !== '.'; },
    pts(ch, ...ps) { for (const [x, y] of ps) c.set(x, y, ch); },
    line(x0, y0, x1, y1, ch) {
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) { c.set(x0, y0, ch); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
    },
    path(ch, ps) { for (let i = 1; i < ps.length; i++) c.line(ps[i - 1][0], ps[i - 1][1], ps[i][0], ps[i][1], ch); },
    ball(cx, cy, rx, ry, ramp, o = {}) {
      const ang = o.ang || 0, co = Math.cos(ang), si = Math.sin(ang), R = Math.max(rx, ry);
      const m = new Set();
      for (let y = Math.floor(cy - R - 1); y <= cy + R + 1; y++) for (let x = Math.floor(cx - R - 1); x <= cx + R + 1; x++) {
        if (!inb(x, y) || (o.clip && !o.clip(x, y))) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const u = (dx * co + dy * si) / rx, v = (-dx * si + dy * co) / ry, d = u * u + v * v;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d), sx = u * co - v * si, sy = u * si + v * co;
        c.set(x, y, ramp[level(sx * LIGHT[0] + sy * LIGHT[1] + nz * LIGHT[2] + (o.bias || 0), ramp.length)]);
        m.add(y * W + x);
      }
      return m;
    },
    // leaf: tapered rotated ellipse with a darker midrib
    leaf(cx, cy, len, ang, ramp = ['l', 'm', 'n'], wid = 0.45) {
      c.ball(cx, cy, len, Math.max(0.9, len * wid), ramp, { ang });
      const dx = Math.cos(ang), dy = Math.sin(ang);
      c.line(Math.round(cx - dx * (len - 1)), Math.round(cy - dy * (len - 1)), Math.round(cx + dx * (len - 1.5)), Math.round(cy + dy * (len - 1.5)), ramp[ramp.length - 1]);
    },
    // rows: literal art; '.' transparent; placed at x0,y0
    art(rows, x0 = 0, y0 = 0) { rows.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch !== '.') c.set(x0 + xx, y0 + yy, ch); })); },
    outline(ch = 'k') {
      const add = [];
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
        if (c.solid(x, y)) continue;
        if (c.solid(x - 1, y) || c.solid(x + 1, y) || c.solid(x, y - 1) || c.solid(x, y + 1)) add.push([x, y]);
      }
      for (const [x, y] of add) g[y][x] = ch;
    },
    sparkle(x, y, core = 'w', arm = 'I') { c.set(x, y, core); c.set(x - 1, y, arm); c.set(x + 1, y, arm); c.set(x, y - 1, arm); c.set(x, y + 1, arm); },
    rows() { return g.map(r => r.join('')); },
  };
  return c;
}
const done = c => { c.outline(); return { palette: P, rows: c.rows() }; };

const GREEN = ['l', 'm', 'n'];
const MINT = ['j', 'J', 'K', 'L'];
const VINE = ['v', 'V', 'T'];
const FROST = ['t', 'g', 'h'];
const PUMP = ['a', 'p', 'q', 'r'];
const TURN = ['1', '2', '3', '4'];
const BLUE = ['5', '6', '7', '8'];
const CHILI = ['A', 'R', 'C', '9'];
const MELON = ['Y', 'H', 'X', 'Z'];
const GLOW = ['$', '%', '&', '@'];

// ---------------------------------------------------------------- stage 0: seed mound
function mound(seed) {
  const c = mk();
  c.ball(8, 16.5, 5.5, 4.2, ['e', 'd', 'D'], { clip: (x, y) => y <= 15 });
  c.ball(7.6, 11.9, 1.7, 1.3, seed, { ang: -0.4 });
  c.pts('D', [7, 13], [8, 13], [9, 13]); c.pts('e', [5, 13], [10, 13]);
  c.pts('D', [11, 14], [4, 15]); c.pts('E', [10, 15], [12, 15]); c.pts('e', [6, 14]);
  return done(c);
}

// ---------------------------------------------------------------- stage 1: sprout
function sprout(ramp = GREEN) {
  const c = mk();
  const [A, B, C] = ramp;
  c.art([
    '..AA......AB.',
    '.ABBB....ABBC',
    '..BBCC..BBCC.',
    '....CCBBCC...',
    '......BC.....',
    '......BC.....',
    '......BC.....',
    '......BC.....',
  ].map(r => r.replace(/A/g, A).replace(/B/g, B).replace(/C/g, C)), 1, 8);
  return done(c);
}

// ================================================================ species
const S = {};

// ---- turnip
S.turnip2 = () => {
  const c = mk();
  c.path('m', [[7, 14], [6, 9], [4, 5]]); c.path('m', [[8, 14], [9, 8], [11, 4]]); c.line(8, 13, 8, 7, 'n');
  c.leaf(4.5, 6, 2.6, -1.9, GREEN, 0.55); c.leaf(11, 5, 2.8, -1.2, GREEN, 0.55); c.leaf(8, 5.5, 2.4, -1.55, GREEN, 0.5);
  c.ball(8, 16, 3.5, 2.6, TURN, { clip: (x, y) => y <= 15 });
  c.pts('1', [6, 14]);
  return done(c);
};
S.turnip3 = () => {
  const c = mk();
  c.path('n', [[7, 8], [5, 5], [3, 3]]); c.path('n', [[8, 8], [10, 4], [12, 2]]); c.line(8, 8, 8, 4, 'm');
  c.leaf(3.8, 3.5, 2.6, -2.1, GREEN, 0.55); c.leaf(11.5, 2.8, 2.7, -1.0, GREEN, 0.55); c.leaf(7.8, 2.8, 2.2, -1.6, GREEN, 0.55);
  // bulb: purple shoulders, cream belly, tapering root
  c.ball(7.5, 11, 5, 3.9, ['w', 'x', 'y', 'z']);
  c.ball(7.5, 9.5, 5, 2.8, TURN, { clip: (x, y) => y <= 10 });
  c.pts('2', [3, 11], [12, 10]); c.pts('3', [11, 11], [12, 11]);
  c.pts('y', [7, 15], [8, 14]); c.pts('z', [8, 15]);
  c.pts('n', [6, 7], [9, 7]);
  return done(c);
};

// ---- sunflower
S.sunflower2 = () => {
  const c = mk();
  c.line(7, 15, 7, 6, 'm'); c.line(8, 15, 8, 6, 'n');
  c.leaf(4.5, 11, 2.8, -0.35, GREEN); c.leaf(11, 9, 2.8, 0.35 + Math.PI, GREEN);
  c.ball(7.8, 4, 2.6, 2.4, GREEN);
  c.pts('f', [7, 2], [6, 3], [9, 2]); c.pts('F', [8, 2]);
  return done(c);
};
S.sunflower3 = () => {
  const c = mk();
  c.line(7, 15, 7, 9, 'm'); c.line(8, 15, 8, 9, 'n');
  c.leaf(4.2, 12.5, 2.8, -0.3, GREEN); c.leaf(11.5, 11.5, 2.8, 0.3 + Math.PI, GREEN);
  // petal ring
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, px = 7.5 + Math.cos(a) * 4.2, py = 5.5 + Math.sin(a) * 4.2;
    c.ball(px, py, 1.9, 1.3, ['F', 'f', 'o', 'O'], { ang: a, bias: 0.1 });
  }
  c.ball(7.5, 5.5, 3, 3, ['c', 'b', 'B', 'E']);
  c.pts('B', [6, 5], [8, 4], [8, 6], [7, 7]); c.pts('c', [6, 4]);
  return done(c);
};

// ---- pumpkin
const LOBED = [
  '.lm.m.',
  'lmmmmn',
  'lmnmmn',
  '.mmnn.',
  '..n...',
];
S.pumpkin2 = () => {
  const c = mk();
  c.path('n', [[2, 15], [5, 14], [7, 13]]);
  c.line(4, 14, 4, 10, 'n');
  c.art(LOBED, 1, 6);
  c.ball(9.5, 12.8, 3.3, 2.7, ['l', 'm', 'n', 'N'], { clip: (x, y) => y <= 15 });
  c.pts('a', [8, 11]); c.pts('q', [9, 12]); c.pts('n', [11, 12], [11, 13]);
  c.path('n', [[10, 10], [11, 8], [12, 7]]);
  c.pts('f', [13, 5], [12, 6], [14, 6]); c.pts('F', [13, 6]); c.pts('o', [13, 7]);
  return done(c);
};
S.pumpkin3 = () => {
  const c = mk();
  c.leaf(3.5, 6.5, 2.8, -0.6, GREEN, 0.6);
  c.ball(11.2, 11.8, 3.6, 3.8, PUMP, { bias: -0.05, clip: (x, y) => y <= 15 });
  c.ball(4.3, 11.8, 3.3, 3.6, PUMP, { clip: (x, y) => y <= 15 });
  c.ball(7.8, 11.5, 3.3, 4.2, PUMP, { bias: 0.08, clip: (x, y) => y <= 15 });
  for (const x of [5, 10]) for (let y = 9; y <= 14; y++) if (c.get(x, y) !== '.') c.set(x, y, 'q');
  c.pts('q', [5, 8], [10, 8]);
  c.pts('a', [6, 9], [7, 9], [6, 10]);
  c.line(8, 7, 8, 5, 'b'); c.pts('B', [9, 7], [9, 6]); c.pts('c', [8, 5]);
  c.path('n', [[9, 5], [11, 4], [12, 3], [11, 2]]);
  return done(c);
};

// ---- blueberry
S.blueberry2 = () => {
  const c = mk();
  c.line(7, 15, 7, 11, 'b'); c.line(8, 15, 9, 12, 'B');
  c.ball(8, 8.5, 5.2, 4, ['l', 'm', 'n', 'N']);
  c.leaf(4, 10, 2.2, 0.4, GREEN); c.leaf(12, 9.5, 2.2, -0.5 + Math.PI, GREEN);
  for (const [x, y] of [[5, 7], [9, 6], [11, 9], [7, 10]]) c.pts('n', [x, y]);
  c.pts('H', [6, 9]); c.pts('X', [7, 9]); c.pts('H', [10, 7]); c.pts('5', [11, 7]);
  return done(c);
};
S.blueberry3 = () => {
  const c = mk();
  c.line(6, 15, 7, 12, 'b'); c.line(9, 15, 8, 12, 'B');
  c.ball(8, 8.2, 6.4, 5.3, ['l', 'm', 'n', 'N']);
  c.leaf(2.8, 10, 2.2, 0.5, GREEN); c.leaf(13, 9.5, 2.2, -0.5 + Math.PI, GREEN);
  for (const [x, y] of [[4, 6], [8, 4], [12, 7], [7, 9]]) c.pts('n', [x, y]);
  const berry = (x, y) => { c.ball(x, y, 1.5, 1.5, BLUE); c.set(x - 1, y - 1, '5'); };
  for (const [x, y] of [[5, 7], [7.5, 5.5], [10.5, 5.5], [12.5, 9], [9.5, 8.5], [4.5, 10.5], [11, 12], [7.5, 11.5]]) berry(x, y);
  c.pts('w', [4, 6], [10, 5]);
  return done(c);
};

// ---- chili
S.chili2 = () => {
  const c = mk();
  c.line(8, 15, 8, 5, 'n'); c.line(7, 13, 5, 10, 'n'); c.line(8, 11, 11, 8, 'n');
  c.leaf(4, 8.5, 2.3, -1.0, GREEN); c.leaf(11.5, 6.5, 2.3, -2.1, GREEN); c.leaf(8, 3.5, 2, -1.6, GREEN);
  c.leaf(4.5, 12.5, 2, -0.2, GREEN); c.leaf(11.5, 12, 2, Math.PI + 0.2, GREEN);
  c.pts('m', [10, 9], [10, 10]); c.pts('l', [9, 11], [10, 11]); c.pts('n', [10, 12]);
  c.pts('x', [6, 6], [5, 5], [7, 5]); c.pts('u', [6, 5]);
  return done(c);
};
S.chili3 = () => {
  const c = mk();
  c.line(8, 15, 8, 4, 'n'); c.line(7, 12, 4, 8, 'n'); c.line(8, 10, 12, 7, 'n');
  c.leaf(3.5, 6.5, 2.4, -1.1, GREEN); c.leaf(12, 5.5, 2.4, -2.0, GREEN); c.leaf(8, 2.6, 2, -1.6, GREEN);
  c.leaf(4.2, 13.2, 2.1, -0.2, GREEN); c.leaf(12, 13, 2.1, Math.PI + 0.2, GREEN);
  const pepper = (x, y, len, tilt) => {
    c.ball(x, y + len / 2, 1.3, len / 2 + 0.3, CHILI, { ang: tilt });
    c.set(x, y - 0.5, 'm'); c.set(x - 0.5, y - 1.5, 'n');
  };
  pepper(5, 9, 4.2, 0.25); pepper(11, 8, 4.5, -0.2); pepper(8, 10.5, 3.2, 0.1);
  c.pts('A', [4, 10], [10, 9]);
  return done(c);
};

// ---- mint
S.mint2 = () => {
  const c = mk();
  c.line(7, 15, 6, 10, 'K'); c.line(9, 15, 10, 9, 'K'); c.line(8, 15, 8, 8, 'L');
  for (const [x, y, a] of [[4.5, 11, -0.6], [11.5, 10.5, Math.PI + 0.6], [5.5, 8, -1.1], [10.5, 7.5, -2.0], [8, 6, -1.57], [5, 13.5, -0.1], [11, 13.5, Math.PI + 0.1]])
    c.leaf(x, y, 2.1, a, MINT, 0.6);
  return done(c);
};
S.mint3 = () => {
  const c = mk();
  c.line(7, 15, 5, 8, 'K'); c.line(9, 15, 11, 7, 'K'); c.line(8, 15, 8, 5, 'L');
  const leaves = [[2.8, 12.5, -0.3], [13, 12.5, Math.PI + 0.3], [3.5, 9.2, -0.7], [12.5, 9, Math.PI + 0.7], [5, 5.8, -1.1], [11, 5.5, -2.0], [8, 3, -1.57],
    [6.5, 11, -0.9], [9.8, 10.5, -2.2], [8, 8, -1.57], [4.5, 14.2, 0], [11.5, 14.2, Math.PI]];
  for (const [x, y, a] of leaves) c.leaf(x, y, 2.3, a, MINT, 0.62);
  c.pts('j', [3, 8], [7, 2], [12, 4]);
  // pale lilac flower spikes
  c.pts('!', [5, 2], [5, 3], [11, 1], [11, 2]); c.pts('?', [5, 4], [11, 3]);
  return done(c);
};

// ---- thornvine
const thorns = (c, pts) => { for (const [x, y] of pts) c.set(x, y, 's'); };
S.thornvine2 = () => {
  const c = mk();
  c.path('V', [[7, 15], [6, 12], [8, 9], [10, 7], [9, 4], [7, 4]]);
  c.path('v', [[8, 15], [7, 12]]);
  c.path('T', [[6, 12], [4, 11], [3, 9], [4, 8]]);
  thorns(c, [[5, 13], [9, 10], [11, 6], [3, 10], [10, 4]]);
  c.leaf(10.5, 11.5, 1.8, Math.PI + 0.3, VINE);
  c.ball(6.5, 3.3, 1.5, 1.8, ['S', 'U', 'U'], { ang: 0.4 }); c.pts('V', [7, 5]); c.pts('Q', [6, 2]);
  return done(c);
};
S.thornvine3 = () => {
  const c = mk();
  c.path('V', [[7, 15], [6, 12], [9, 9], [11, 7], [11, 4]]);
  c.path('v', [[8, 15], [7, 12]]);
  c.path('T', [[6, 12], [3, 11], [2, 8], [3, 6], [5, 6], [5, 8], [4, 8]]);
  c.path('T', [[9, 9], [12, 11], [13, 13]]);
  thorns(c, [[5, 13], [8, 10], [12, 6], [1, 9], [4, 5], [13, 12], [11, 10]]);
  c.leaf(10.5, 13.5, 1.8, Math.PI + 0.3, VINE);
  c.leaf(3.5, 13.5, 1.6, 0.2, VINE);
  // big purple flower
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2 - Math.PI / 2;
    c.ball(10 + Math.cos(a) * 2.2, 3.8 + Math.sin(a) * 2.2, 1.8, 1.4, ['Q', 'S', 'U'], { ang: a });
  }
  c.pts('u', [10, 3], [9, 4]); c.pts('o', [10, 4]);
  return done(c);
};

// ---- frost lily
S.frostlily2 = () => {
  const c = mk();
  c.line(8, 15, 8, 6, 'g');
  c.leaf(5, 11, 3.4, -1.05, FROST, 0.3); c.leaf(11, 11.5, 3, -2.1, FROST, 0.3);
  c.ball(8.2, 4, 1.7, 2.6, ['I', 'i', 'G']);
  c.pts('t', [7, 6], [9, 6]);
  return done(c);
};
S.frostlily3 = () => {
  const c = mk();
  c.line(8, 15, 8, 8, 'g');
  c.leaf(4.6, 11.5, 3.6, -1.0, FROST, 0.3); c.leaf(11.4, 12, 3.2, -2.15, FROST, 0.3);
  // trumpet lily: flared petals
  c.art([
    '.I.......I.',
    'Iii.....iiG',
    '.IiI.I.iiG.',
    '..IiIiIiG..',
    '..IIiiiiG..',
    '...IiiiG...',
    '....iGG....',
  ], 3, 1);
  c.pts('w', [4, 2], [8, 4]); c.pts('u', [7, 3], [9, 3]); c.pts('M', [8, 2]);
  c.outline();
  c.sparkle(13, 7, 'w', 'i'); c.pts('I', [2, 7]);
  return { palette: P, rows: c.rows() };
};

// ---- moonmelon
S.moonmelon2 = () => {
  const c = mk();
  c.path('n', [[1, 15], [4, 14], [7, 13]]);
  c.line(4, 14, 4, 10, 'n');
  c.art(LOBED, 1, 6);
  c.ball(10, 12.8, 3.6, 2.8, MELON, { clip: (x, y) => y <= 15 });
  c.pts('M', [9, 11], [8, 12], [9, 13]);
  c.path('n', [[12, 10], [13, 8], [12, 7]]);
  return done(c);
};
S.moonmelon3 = () => {
  const c = mk();
  c.leaf(3.2, 5, 2.6, -0.8, GREEN, 0.6);
  c.path('n', [[6, 7], [8, 6], [9, 4], [8, 3]]);
  c.ball(8, 11, 6.6, 4.8, MELON, { clip: (x, y) => y <= 15 });
  // glowing crescent pattern
  c.art([
    '..MM....',
    '.MY.....',
    '.M....M.',
    '.MY.....',
    '..MM..M.',
  ], 4, 8);
  c.pts('H', [6, 9]);
  c.pts('Y', [4, 8]);
  c.line(7, 7, 7, 6, 'b'); c.pts('B', [8, 7]);
  c.outline();
  c.pts('M', [1, 10], [14, 4]); c.pts('Y', [13, 2]);
  return { palette: P, rows: c.rows() };
};

// ---- glowcap
const cap = (c, x, y, rx, ry, stemH, ramp = GLOW) => {
  c.line(Math.round(x), y, Math.round(x), y + stemH, 'y'); c.line(Math.round(x) + 1, y + 1, Math.round(x) + 1, y + stemH, 'z');
  c.ball(x + 0.5, y, rx, ry, ramp, { clip: (px, py) => py <= y });
  c.set(x - 1, y - 1, '$');
};
S.glowcap2 = () => {
  const c = mk();
  cap(c, 6, 11, 2.8, 2.6, 4, ['%', '&', '@']);
  cap(c, 10, 13, 2, 1.8, 2, ['%', '&', '@']);
  return done(c);
};
S.glowcap3 = () => {
  const c = mk();
  cap(c, 5, 7, 3.8, 3.6, 8);
  cap(c, 11, 10, 2.8, 2.6, 5, ['!', '?', 'S', 'U']);
  cap(c, 8, 13, 2, 1.8, 2);
  c.pts('&', [3, 5], [6, 4]); c.pts('@', [7, 6]);
  c.outline();
  c.pts('$', [1, 2], [13, 4], [14, 12]); c.pts('%', [9, 1], [2, 11]);
  return { palette: P, rows: c.rows() };
};

// ================================================================ register
const SEEDS = {
  turnip: ['x', 'z'], sunflower: ['x', 'B'], pumpkin: ['x', 'y'], blueberry: ['6', '8'], chili: ['f', 'O'],
  mint: ['J', 'L'], thornvine: ['S', 'U'], frostlily: ['i', 'G'], moonmelon: ['M', 'X'], glowcap: ['%', '@'],
};
const SPROUT = {
  turnip: [GREEN], sunflower: [GREEN], pumpkin: [GREEN], blueberry: [['m', 'n', 'N']], chili: [GREEN],
  mint: [MINT.slice(1, 4)], thornvine: [VINE], frostlily: [FROST], moonmelon: [['H', 'X', 'Z']],
};
function glowSprout() {
  const c = mk();
  cap(c, 6, 12, 1.6, 1.4, 3, ['%', '&', '@']);
  cap(c, 9, 13, 1.2, 1.1, 2, ['%', '&', '@']);
  return done(c);
}

const defs = {};
for (const id of Object.keys(SEEDS)) {
  defs[`plant_${id}_0`] = mound(SEEDS[id]);
  defs[`plant_${id}_1`] = id === 'glowcap' ? glowSprout() : sprout(...SPROUT[id]);
  defs[`plant_${id}_2`] = S[id + '2']();
  defs[`plant_${id}_3`] = S[id + '3']();
}
// ---- gloamweed (2.0): planted by critters into your plots. Hostile, thorny, a little sly.
// Extra palette keys on top of P: grey-violet ramp, lilac glow, pale thorn tips.
const GP = { ...P, 0: '#2f2a3d', W: '#3a3448', P: '#5b5470', '#': '#7a7194', '*': '#9e8fd1', '+': '#d8ccff', '=': '#f6f0ff', '^': '#e8dcc8', '~': '#a59dbc' };
const GWEED = ['~', '#', 'P'];
const gdone = c => { c.outline(); return { palette: GP, rows: c.rows() }; };
const gthorns = (c, pts) => { for (const [x, y] of pts) c.set(x, y, '^'); };
const gloamweed = [
  () => { // stage 0: a lumpy grey seed pod shoving up out of the soil, one glint
    const c = mk();
    c.ball(8, 16.5, 5.5, 4.2, ['e', 'd', 'D'], { clip: (x, y) => y <= 15 });
    c.ball(8, 11.6, 2, 1.6, ['~', '#', 'P'], { ang: 0.3 });
    c.pts('^', [7, 10]); c.pts('*', [9, 12]);
    c.pts('D', [5, 13], [11, 13], [6, 14]); c.pts('E', [10, 15], [4, 15]);
    return gdone(c);
  },
  () => { // stage 1: a crooked sprout with thorn tips
    const c = mk();
    c.path('#', [[8, 15], [8, 12], [7, 10], [8, 8]]);
    c.path('P', [[9, 15], [9, 12]]);
    c.leaf(5, 9.5, 2.4, Math.PI + 0.5, GWEED, 0.5); c.leaf(11, 8.5, 2.4, -0.5, GWEED, 0.5);
    gthorns(c, [[7, 12], [9, 11], [2, 8], [13, 6], [8, 7]]);
    c.pts('*', [8, 8]);
    return gdone(c);
  },
  () => { // stage 2: thorny stalks curling in, a closed bud with a glowing slit
    const c = mk();
    c.path('#', [[8, 15], [7, 12], [8, 9], [8, 6]]); c.path('P', [[9, 15], [8, 12]]);
    c.path('P', [[7, 12], [4, 11], [3, 8], [4, 7]]); c.path('P', [[8, 10], [12, 10], [13, 7]]);
    c.leaf(4, 13.5, 1.8, Math.PI - 0.2, GWEED); c.leaf(12, 13, 1.8, 0.2, GWEED);
    gthorns(c, [[6, 13], [9, 11], [2, 9], [5, 10], [11, 9], [14, 8], [3, 6], [13, 6]]);
    c.ball(8, 4.3, 2.4, 2.8, ['~', '#', 'P', 'W']);
    c.pts('*', [7, 4], [8, 4], [9, 4]); c.pts('+', [8, 4]);
    return gdone(c);
  },
  () => { // stage 3: full-grown gloamweed, a thorny pod with a sly half-lidded grin
    const c = mk();
    c.path('#', [[8, 15], [8, 11]]); c.path('P', [[7, 15], [7, 12]]);
    c.leaf(3.2, 12.5, 2.8, Math.PI - 0.35, GWEED); c.leaf(12.8, 12.5, 2.8, 0.35, GWEED);
    c.leaf(2.6, 7, 2.2, Math.PI + 0.7, GWEED); c.leaf(13.4, 6.5, 2.2, -0.7, GWEED);
    gthorns(c, [[1, 11], [14, 11], [1, 5], [14, 4], [5, 14], [10, 14], [0, 13], [15, 13]]);
    c.ball(8, 6.8, 4.6, 4.4, ['~', '#', 'P', 'W']);
    // crown of thorns on the pod
    c.pts('^', [5, 2], [8, 1], [11, 2]); c.pts('P', [5, 3], [8, 2], [11, 3]);
    // sly face: heavy lids, glowing slits, a smug one-sided smile
    c.pts('k', [4, 5], [5, 5], [6, 5], [7, 5], [9, 5], [10, 4], [11, 4], [12, 5]);
    c.pts('*', [5, 6], [6, 6], [10, 6], [11, 6], [10, 5], [11, 5]); c.pts('=', [6, 6], [11, 5]);
    c.pts('k', [5, 8], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9], [11, 8]); c.pts('^', [7, 10]); c.pts('0', [8, 10], [9, 10]);
    c.pts('#', [4, 4], [5, 4]);
    // gloam drip + spores
    c.pts('P', [4, 10]); c.pts('W', [4, 11]);
    c.outline();
    c.pts('*', [1, 1], [14, 0]); c.pts('+', [15, 9]);
    return { palette: GP, rows: c.rows() };
  },
];
gloamweed.forEach((fn, i) => { defs[`plant_gloamweed_${i}`] = fn(); });
registerSprites(defs);
