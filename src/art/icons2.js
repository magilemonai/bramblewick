// Icons 2 (2.0): Pell's hive kit, new card art, keepsakes, UI, statuses, intents, the plot
// scarecrow overlay and the PWA app icon. Same look as icons.js: 16x16 icons are painted on a
// 14x14 area inside a 1px margin so the ink outline fits; shade ramps run dark -> light, lit from
// the upper-left. Painted with a small brush kit (shaded ellipses, tubes, polygons) plus
// hand-placed pixels. Side-effect module: only calls registerSprites. No DOM.
import { registerSprites, PAL } from '../pixel.js';

// ---------------------------------------------------------------- brush kit
const LIGHT = (() => { const v = [-0.55, -0.68, 0.48]; const m = Math.hypot(...v); return v.map(n => n / m); })();
const TH = { 2: [0.3], 3: [0.22, 0.74], 4: [0.16, 0.58, 0.86], 5: [0.05, 0.3, 0.62, 0.86] };
const pick = (d, n, t = TH[n]) => { let i = 0; while (i < t.length && d > t[i]) i++; return i; };
const lit = (nx, ny) => { const r = nx * nx + ny * ny; const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r))); return LIGHT[0] * nx + LIGHT[1] * ny + LIGHT[2] * nz; };

// Canvas of w x h with a `m`-pixel margin; drawing coordinates start inside the margin.
function canvas(w = 14, h = 14, m = 1) {
  const W = w + 2 * m, H = h + 2 * m;
  const g = Array.from({ length: H }, () => Array(W).fill(null));
  const c = { g, W, H, clip: null, noOut: new Set(), tx: m, ty: m };
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  c.get = (x, y) => { x = Math.round(x) + c.tx; y = Math.round(y) + c.ty; return inb(x, y) ? g[y][x] : null; };
  c.put = (x, y, col) => { x = Math.round(x) + c.tx; y = Math.round(y) + c.ty; if (inb(x, y)) g[y][x] = col; };
  c.set = (x, y, col) => {
    x = Math.round(x) + c.tx; y = Math.round(y) + c.ty;
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
  c.onto = (fn, cols) => { const prev = c.clip; c.clip = cols ? (cur => cols.includes(cur)) : (cur => cur !== null); fn(); c.clip = prev; };
  // Literal rows through a char->colour map ('.' = skip).
  c.stamp = (x0, y0, rows, map) => rows.forEach((r, j) => [...r].forEach((ch, i) => { if (map[ch]) c.set(x0 + i, y0 + j, map[ch]); }));
  c.outline = (col = PAL.ink) => {
    const src = g.map(r => r.slice());
    const solid = (x, y) => inb(x, y) && src[y][x] !== null && !c.noOut.has(src[y][x]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
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
// Build an icon: fn paints into a fresh 14x14 (+1px margin) canvas; post paints after the outline.
const mk = (fn, { w = 14, h = 14, post } = {}) => { const c = canvas(w, h); fn(c); c.outline(); if (post) post(c); return c.bake(); };

// ---------------------------------------------------------------- ramps (dark -> light)
const INK = PAL.ink, INK2 = PAL.inkSoft, WHITE = '#ffffff';
const WOOD = [PAL.woodDark, PAL.wood, PAL.woodLight, '#dcae78'];
const METAL = [PAL.stoneDark, PAL.stone, '#c3beb6', '#f1ede4'];
const STEEL = ['#4d4a52', '#77737c', '#a9a6ae', '#dedce4'];
const GOLD = ['#c47f1f', PAL.gold, PAL.sun, '#fff1a8'];
const BRASS = ['#8a5a1c', '#c48a2a', '#e8b84a', '#fbe08a'];
const HONEY = ['#a8621a', '#e0901e', PAL.gold, PAL.sun];
const RED = ['#962c33', PAL.red, '#f07b63', '#ffc0a8'];
const GREEN = ['#2d5a33', PAL.leafDark, PAL.leaf, PAL.leafLight];
const BLUE = ['#2e5c8c', PAL.water, PAL.skyDeep, PAL.sky];
const ICE = ['#5a86b0', PAL.frost, PAL.ice, PAL.snow];
const CREAM = ['#b0925a', PAL.parchDark, PAL.parchment, PAL.cream];
const PURPLE = [PAL.plum, PAL.purple, PAL.lilac, '#e4d8ff'];
const GLOAM = ['#2f2a3d', PAL.gloomDark, PAL.gloom, '#7a7194'];
const PINK = [PAL.berry, PAL.rose, PAL.pink, '#fcd6de'];
const ORANGE = [PAL.rust, PAL.orange, '#f6b26b', '#ffd8a8'];
const NUT = ['#3e1e12', '#6a3420', '#9a5230', '#c87e4e'];
const STRAW = ['#a8742a', '#d9a441', '#f0c865', '#fbe39a'];
const BURLAP = ['#8a6a3e', '#b8925a', '#d8b47a', '#f0d4a0'];
const WAX = ['#c8963a', '#e8c060', '#f6dc8a', '#fff2c0'];
const CLAY = ['#7a3a22', '#b0583a', '#d27a52', '#eaa27a'];
const MESH = ['#6e6e7a', '#9a9aa6', '#c8c8d2', '#eeeef4'];
const GLOW = { mid: PAL.gloomGlow, core: '#d8ccff', hot: '#f6f0ff' };

// Little bee, 4x3 incl. wing: (x,y) is the top-left of the body; hd = heading.
function bee(c, x, y, hd = 1) {
  c.set(x, y, PAL.sun); c.set(x + 1, y, INK); c.set(x + 2, y, PAL.sun);
  c.set(x, y + 1, PAL.gold); c.set(x + 1, y + 1, INK); c.set(x + 2, y + 1, PAL.gold);
  c.set(hd > 0 ? x + 3 : x - 1, y, INK); c.set(hd > 0 ? x + 3 : x - 1, y + 1, INK);
  c.set(x + 1, y - 1, '#e8f8ff'); c.set(hd > 0 ? x : x + 2, y - 1, WHITE);
}
// Hexagon cell (flat-top) of radius ~2 at (x,y) top-left: 4x4 footprint.
function hex(c, x, y, fill, rim) {
  c.stamp(x, y, ['.rr.', 'rffr', 'rffr', '.rr.'], { r: rim, f: fill });
}

const defs = {};
const add = (id, fn, opts) => { defs[id] = mk(fn, opts); };

// =============================================================================== CARD ART
add('icon_hive', c => {
  // painted box hive: roof, two boxes, entrance, stand
  c.shPoly([[0, 3], [14, 3], [13, 0], [1, 0]], [GREEN[0], GREEN[1], GREEN[2]]);
  c.hline(1, 12, 0, GREEN[3]);
  for (const [y, h] of [[4, 4], [8, 4]]) {
    c.rect(1, y, 12, h, HONEY[2]); c.hline(1, 12, y, HONEY[3]); c.hline(1, 12, y + h - 1, HONEY[0]);
    c.vline(12, y, y + h - 1, HONEY[1]); c.vline(1, y, y + h - 1, HONEY[3]);
    c.hline(5, 8, y + 1, HONEY[0]); c.hline(5, 8, y + 2, HONEY[1]); // handhold
  }
  c.hline(3, 10, 12, WOOD[1]); c.hline(4, 9, 12, INK2); // entrance
  c.vline(2, 12, 13, WOOD[0]); c.vline(11, 12, 13, WOOD[0]);
  bee(c, 10, 9, -1);
});
add('icon_smoker', c => {
  c.shPoly([[1, 6], [4, 5], [5, 12], [2, 12]], ['#6e4630', '#8e6040', '#b07e56']); // bellows
  c.hline(2, 4, 8, '#4a2e1e'); c.hline(2, 4, 10, '#4a2e1e');
  c.tube([[8, 6], [8, 12]], 2.5, STEEL);
  c.hline(6, 10, 8, BRASS[1]); c.hline(6, 10, 9, BRASS[0]); c.set(6, 8, BRASS[3]);
  c.sh(8, 5.2, 2.6, 1.4, STEEL);
  c.shPoly([[7, 5], [9, 4.5], [11, 1.5], [10, 1]], STEEL);
  c.set(8, 11, PAL.orange); c.set(9, 11, PAL.rust);
  c.sh(12, 1.5, 1.4, 1.2, ['#c9c6d0', '#e6e4ec', '#f8f8fc']);
});
add('icon_veil', c => {
  // hat from the front with the mesh veil hanging down
  c.shPoly([[2, 6], [12, 6], [13, 13], [1, 13]], MESH);
  c.each(1, 6, 13, 13, (x, y) => { const v = c.get(x, y); if (MESH.includes(v) && (x % 2 === 0 || y % 2 === 1)) c.put(x, y, MESH[(MESH.indexOf(v) + 3) % 4 === 3 ? 1 : 0]); });
  c.hline(1, 13, 13, CREAM[1]); c.set(7, 13, RED[1]); // drawstring
  c.sh(7, 5, 7, 1.7, STRAW, [0.05, 0.5, 0.9]);
  c.sh(7, 2.8, 3.8, 2.8, STRAW);
  c.onto(() => c.hline(3, 11, 3, HONEY[1]), STRAW);
});
add('icon_honey_dipper', c => {
  c.tube([[13, 0.5], [7, 6.5]], 0.9, WOOD);
  c.sh(4.5, 8.8, 3.2, 3.6, WOOD);
  c.onto(() => { for (const y of [6, 8, 10]) c.line(1, y + 1, 7, y - 1, WOOD[0]); c.sh(4, 10.5, 3, 2.2, [HONEY[1], HONEY[2], HONEY[3]]); }, WOOD);
  c.vline(4, 12, 13, HONEY[2]); c.set(4, 13, HONEY[1]); c.set(3, 13, HONEY[2]); c.set(5, 12, HONEY[3]);
});
add('icon_pollen', c => {
  const P = [ORANGE[1], GOLD[1], GOLD[2], GOLD[3]];
  c.sh(4.8, 8.8, 3.6, 3.6, P); c.sh(9.6, 6, 3.2, 3.2, P); c.sh(9.5, 11.2, 2.4, 2.4, P);
  c.onto(() => { for (const [x, y] of [[3, 8], [5, 10], [6, 7], [9, 5], [11, 7], [8, 12], [10, 11], [2, 10], [10, 4]]) c.set(x, y, ORANGE[0]); }, P);
  c.px([[1, 2], [2, 1], [2, 3], [3, 2]], GOLD[3]); c.set(2, 2, WHITE);
  c.noOut.add(GOLD[3]); c.noOut.add(WHITE);
});
add('icon_wax', c => {
  // a bar of beeswax: pale top, darker front with honeycomb pressed in
  c.shPoly([[1, 4], [4, 1], [14, 1], [11, 4]], [WAX[2], WAX[3], WAX[3]]);
  c.shPoly([[11, 4], [14, 1], [14, 10], [11, 13]], [WAX[0], WAX[0], WAX[1]]);
  c.rect(1, 4, 10, 9, WAX[2]); c.vline(1, 4, 12, WAX[3]); c.hline(1, 10, 12, WAX[1]);
  for (const [x, y] of [[2, 5], [6, 5], [4, 8]]) c.stamp(x, y, ['.rr.', 'r..r', 'r..r', '.rr.'], { r: WAX[0] });
  c.px([[5, 2], [7, 2], [9, 2]], WHITE);
  c.vline(9, 13, 13, WAX[1]);
});
add('icon_queen', c => {
  const W = ['#b8dce8', '#e8f8ff', WHITE];
  c.sh(7, 3.2, 2.8, 2.2, W); c.sh(10.5, 3.8, 2.2, 1.8, W); // wings
  c.tube([[5, 8], [12, 12]], 2.5, HONEY, 1.4); // long abdomen
  c.onto(() => { for (const x of [7, 9.5, 11.5]) c.line(x, 6, x - 2, 13, INK2); }, HONEY);
  c.sh(4.3, 7.4, 2.2, 2.2, [INK2, '#5a4038', '#7a5a48']); // thorax
  c.sh(2.4, 7.8, 1.8, 1.8, [INK, INK2, '#5a4038']); // head
  c.set(1, 7, GOLD[3]);
  c.stamp(0, 3, ['y.y.y', 'yyyyy'], { y: GOLD[2] }); c.set(2, 3, PAL.red);
});
add('icon_flower_crown', c => {
  // ring of leaves and blossoms, seen at a slant
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; c.sh(7 + Math.cos(a) * 5.4, 8 + Math.sin(a) * 3.4, 1.4, 1.2, GREEN); }
  const F = [[PINK, 2, 6.5], [[GOLD[0], GOLD[1], GOLD[2], GOLD[3]], 7, 4.3], [PINK, 12, 6.5], [[CREAM[1], CREAM[2], CREAM[3], WHITE], 3.2, 10.8], [PURPLE, 7, 11.8], [[CREAM[1], CREAM[2], CREAM[3], WHITE], 10.8, 10.8]];
  for (const [R, x, y] of F) { c.sh(x, y, 1.9, 1.7, R); c.set(Math.round(x - 0.5), Math.round(y - 0.5), GOLD[2]); }
  c.set(6, 4, GOLD[0]);
});
add('icon_lute', c => {
  c.tube([[7, 7], [12.5, 1.5]], 1, WOOD);
  c.shPoly([[11, 0], [14, 1], [13, 3], [12, 2]], [WOOD[0], WOOD[1]]);
  c.px([[12, 0], [14, 2]], GOLD[2]);
  c.sh(5, 9, 4.6, 4.4, [NUT[1], NUT[2], NUT[3], '#e8a870']);
  c.sh(5.5, 8.5, 1.4, 1.4, [INK, INK2]);
  c.hline(2, 5, 12, NUT[0]); // bridge
  c.line(4, 12, 12, 2, CREAM[3]); c.line(5, 12, 13, 2, CREAM[2]);
  c.set(5, 8, GOLD[2]);
});
add('icon_jam_jar', c => {
  c.shPoly([[2, 4], [12, 4], [12.5, 13], [1.5, 13]], ['#8a1e30', '#b8283c', PAL.red, '#f07b63']); // jam
  c.onto(() => { c.vline(3, 5, 11, '#ffc0a8'); c.vline(4, 5, 7, WHITE); }, ['#8a1e30', '#b8283c', PAL.red, '#f07b63']);
  c.rect(4, 8, 6, 4, CREAM[3]); c.hline(4, 9, 11, CREAM[1]); c.set(6, 9, PAL.red); c.set(7, 9, PAL.red); c.set(6, 10, '#8a1e30'); c.set(7, 8, GREEN[2]); // label
  // gingham cloth cap tied with twine
  c.shPoly([[0, 2], [14, 2], [13, 5], [1, 5]], RED);
  c.each(0, 1, 14, 5, (x, y) => { if (RED.includes(c.get(x, y)) && (x + (y & 1)) % 3 === 0) c.put(x, y, WHITE); });
  c.shPoly([[3, 0], [11, 0], [12, 2], [2, 2]], RED);
  c.hline(1, 13, 4, STRAW[0]); c.set(12, 5, STRAW[1]); c.set(13, 6, STRAW[1]);
});
add('icon_trowel', c => {
  c.shPoly([[0, 13], [1, 7], [5, 4], [9, 8], [6, 12]], STEEL);
  c.line(1, 12, 6, 7, STEEL[1]);
  c.px([[1, 12], [2, 12], [1, 11]], NUT[1]); // soil on the tip
  c.tube([[7, 6], [8.5, 4.5]], 0.8, STEEL);
  c.tube([[9, 4], [13, 0.5]], 1.4, [GREEN[0], GREEN[1], GREEN[2], GREEN[3]]);
  c.set(12, 1, GREEN[3]);
});
add('icon_hand_fork', c => {
  c.tube([[9, 4.5], [13, 0.5]], 1.4, WOOD);
  c.set(12, 1, WOOD[3]);
  c.shPoly([[5, 5], [8, 3], [10, 5.5], [8, 8]], STEEL);
  for (const [a, b] of [[[5, 5], [0.5, 9]], [[6.5, 6.5], [2.5, 12]], [[8, 8], [5.5, 13.5]]]) c.tube([a, b], 0.7, STEEL);
});
add('icon_seed_tray', c => {
  c.shPoly([[0, 7], [14, 7], [13, 13], [1, 13]], CLAY);
  c.hline(0, 13, 7, CLAY[3]);
  for (const x of [1, 5, 9]) { c.rect(x + 0.5, 8, 3, 2, NUT[0]); c.hline(x + 0.5, x + 2.5, 8, NUT[1]); }
  c.hline(1, 12, 11, CLAY[1]);
  // sprouts
  for (const x of [2, 6, 10]) { c.vline(x + 0.5, 5, 7, GREEN[1]); c.px([[x - 0.5, 4], [x + 1.5, 4]], GREEN[2]); c.set(x - 0.5, 3, GREEN[3]); c.set(x + 1.5, 5, GREEN[1]); }
});
add('icon_greenhouse', c => {
  const G = ['#6ea8b8', '#9fd0dc', '#c8eaf0', '#eefafc'];
  c.shPoly([[0, 6], [7, 0], [14, 6], [14, 14], [0, 14]], G);
  c.onto(() => { c.sh(4, 12, 2.4, 2, GREEN); c.sh(10, 12.5, 2.4, 1.6, GREEN); c.set(4, 10, PAL.red); c.set(10, 11, PAL.sun); }, G);
  const F = WHITE;
  c.path([[0, 6], [7, 0], [13, 6]], F); c.vline(0, 6, 13, F); c.vline(13, 6, 13, F); c.hline(0, 13, 13, F);
  c.vline(7, 1, 13, F); c.hline(1, 12, 8, F); c.vline(3.5, 3, 13, F); c.vline(10.5, 3, 13, F);
  c.px([[2, 7], [5, 3], [9, 5]], G[3]);
});
add('icon_rain_gauge', c => {
  c.tube([[7, 11], [7, 13.5]], 0.8, WOOD); // stake
  c.shPoly([[4, 1], [10, 1], [9, 3], [9, 11], [5, 11], [5, 3]], ['#9fbcc8', '#d4ecf2', '#f0fafc', WHITE]);
  c.rect(6, 7, 3, 4, BLUE[1]); c.hline(6, 8, 7, BLUE[3]);
  for (const y of [4, 6, 8, 10]) c.set(8, y, RED[1]);
  c.px([[1, 3], [1, 4], [12, 6], [12, 7], [2, 9]], BLUE[3]);
  c.noOut.add(BLUE[3]);
});
add('icon_umbrella', c => {
  c.sh(7, 6, 7, 5.5, RED);
  c.each(0, 0, 14, 6, (x, y) => { const v = c.get(x, y); if (RED.includes(v) && [3, 4, 9, 10].includes(x)) c.put(x, y, [GOLD[0], GOLD[1], GOLD[2], GOLD[3]][RED.indexOf(v)]); });
  c.each(0, 6, 14, 12, (x, y) => { c.put(x, y, null); });
  c.stamp(0, 6, ['rr.rrr.rrr.rr'], { r: RED[0] }); c.px([[4, 6], [10, 6]], GOLD[0]);
  c.vline(7, 0, 0, INK2);
  c.vline(7, 6, 12, WOOD[0]); c.px([[6, 13], [5, 13], [4, 12]], WOOD[1]);
});
add('icon_boots', c => {
  const B = ['#24401e', '#3f6a2a', '#5e8f3a', '#8cc452'];
  for (const ox of [0, 6]) {
    c.shPoly([[ox + 1, 1], [ox + 5, 1], [ox + 5, 10], [ox + 8, 11], [ox + 8, 13], [ox + 1, 13]], B);
    c.hline(ox + 1, ox + 5, 1, B[3]); c.hline(ox + 1, ox + 8, 13, INK2);
    c.hline(ox + 1, ox + 5, 3, B[0]);
  }
});
add('icon_bucket', c => {
  c.path([[1, 5], [2, 1], [7, 0], [12, 1], [13, 5]], STEEL[1]);
  c.shPoly([[1, 5], [13, 5], [12, 13], [2, 13]], STEEL);
  c.sh(7, 5, 6, 1.4, BLUE); c.hline(3, 6, 5, BLUE[3]);
  c.hline(2, 12, 8, STEEL[0]); c.hline(2, 12, 11, STEEL[0]);
});
add('icon_hay', c => {
  c.shPoly([[0, 5], [3, 2], [14, 2], [11, 5]], [STRAW[1], STRAW[2], STRAW[3]]);
  c.shPoly([[11, 5], [14, 2], [14, 10], [11, 13]], [STRAW[0], STRAW[0], STRAW[1]]);
  c.rect(0, 5, 11, 8, STRAW[2]); c.vline(0, 5, 12, STRAW[3]); c.hline(0, 10, 12, STRAW[0]);
  for (const x of [2, 5, 8]) c.vline(x, 6, 11, STRAW[1]);
  for (const x of [1, 6, 9]) c.set(x, 8, STRAW[3]);
  c.vline(3, 5, 12, RED[0]); c.vline(7, 5, 12, RED[0]); c.line(4, 4, 7, 1, RED[0]); c.line(8, 4, 11, 1, RED[0]);
  c.px([[4, 0], [10, 0], [13, 4], [1, 3]], STRAW[2]);
});
add('icon_mortar', c => {
  c.tube([[8, 6], [12.5, 0.5]], 1, WOOD); c.set(12, 1, WOOD[3]); // pestle
  c.px([[2, 5], [3, 4], [4, 5], [3, 3]], GREEN[2]); c.set(3, 5, GREEN[1]); // herb sprig
  c.sh(7, 6.5, 6.5, 1.6, [INK2, '#5a4a40']);
  c.shPoly([[0, 6], [14, 6], [12, 11], [9, 12], [5, 12], [2, 11]], METAL);
  c.hline(0, 13, 6, METAL[3]); c.sh(7, 6.5, 5, 1, [GREEN[0], GREEN[1]]);
  c.rect(4, 12, 6, 2, METAL[1]); c.hline(4, 9, 13, METAL[0]);
});
add('icon_letter', c => {
  c.rect(0, 3, 14, 9, CREAM[3]); c.hline(0, 13, 11, CREAM[1]); c.vline(13, 3, 11, CREAM[2]);
  c.path([[0, 3], [7, 8], [13, 3]], CREAM[1]); c.path([[0, 11], [5, 7]], CREAM[2]); c.path([[13, 11], [9, 7]], CREAM[2]);
  c.sh(7, 8, 2, 2, RED); c.px([[6, 8], [8, 8], [7, 9]], RED[0]);
});
add('icon_ribbon', c => {
  c.shPoly([[4, 8], [7, 9], [5, 14], [3, 12], [2, 14]], [BLUE[0], BLUE[1], BLUE[2]]);
  c.shPoly([[10, 8], [7, 9], [9, 14], [11, 12], [12, 14]], [BLUE[0], BLUE[1], BLUE[2]]);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; c.sh(7 + Math.cos(a) * 3.9, 5.5 + Math.sin(a) * 3.9, 1.5, 1.5, BLUE); }
  c.sh(7, 5.5, 3, 3, GOLD); c.px([[6, 5], [7, 4], [8, 5], [7, 6]], GOLD[0]); c.set(7, 5, GOLD[3]);
});
add('icon_owl', c => {
  const F = NUT;
  c.sh(7, 8, 6.2, 5.8, [F[0], F[1], F[2], F[3]]);
  c.shPoly([[1, 1], [4, 4], [2, 5]], F); c.shPoly([[13, 1], [10, 4], [12, 5]], F);
  c.sh(4.6, 7, 2.6, 2.6, CREAM); c.sh(9.4, 7, 2.6, 2.6, CREAM);
  for (const x of [4, 9]) { c.rect(x, 6, 2, 2, GOLD[1]); c.set(x + 1, 7, INK); c.set(x, 6, WHITE); }
  c.px([[7, 8], [6, 9], [7, 10]], GOLD[0]); c.set(7, 9, GOLD[1]);
  c.onto(() => { for (const [x, y] of [[4, 11], [7, 12], [10, 11], [5, 13], [9, 13]]) c.set(x, y, CREAM[2]); }, F);
});
add('icon_frog', c => {
  const G = ['#2d5a33', '#4f8f3a', '#7cc050', '#b4e27a'];
  c.sh(7, 9.5, 6, 4, G);
  c.sh(3.8, 5, 2.4, 2.3, G); c.sh(10.2, 5, 2.4, 2.3, G);
  for (const x of [3, 9]) { c.rect(x, 4, 2, 2, INK); c.set(x, 4, WHITE); }
  c.onto(() => c.sh(7, 11.5, 3.6, 2, ['#c8d890', '#e8f0b8']), G);
  c.hline(4, 10, 8, G[0]); c.set(3, 7, G[0]); c.set(11, 7, G[0]);
  c.px([[2, 9], [12, 9]], PAL.pink);
  c.sh(2, 13, 2, 1, G); c.sh(12, 13, 2, 1, G);
});
add('icon_fox', c => {
  const O = ORANGE;
  c.shPoly([[0, 0], [5, 3], [2, 7]], O); c.shPoly([[14, 0], [9, 3], [12, 7]], O);
  c.px([[1, 1], [2, 2], [2, 3]], INK2); c.px([[12, 1], [11, 2], [11, 3]], INK2);
  c.shPoly([[1, 5], [4, 2], [10, 2], [13, 5], [12, 9], [7, 13.5], [2, 9]], O);
  c.shPoly([[1, 7], [5, 9], [7, 13.5], [3, 11]], [CREAM[2], CREAM[3], WHITE]);
  c.shPoly([[13, 7], [9, 9], [7, 13.5], [11, 11]], [CREAM[1], CREAM[2], CREAM[3]]);
  for (const x of [4, 9]) { c.rect(x, 6, 2, 2, INK); c.set(x, 6, WHITE); }
  c.px([[6, 12], [7, 12]], INK); c.set(6, 11, INK2);
});
add('icon_quill', c => {
  const F = [CREAM[1], CREAM[2], CREAM[3], WHITE];
  c.shPoly([[13, 0], [10, 1], [5, 6], [4, 9], [7, 8], [12, 3]], F);
  c.line(12, 1, 4, 10, CREAM[0]);
  c.px([[9, 3], [11, 4], [7, 5], [8, 7]], CREAM[1]);
  c.line(3, 10, 1, 12, INK2); c.set(1, 13, INK); // nib
  c.sh(4, 12.8, 1.6, 1, [INK, '#3b4a6b']); // ink drop
});
add('icon_root', c => {
  const R = [WOOD[0], WOOD[1], WOOD[2], WOOD[3]];
  c.tube([[7, 0], [7, 4], [5, 8], [3, 13]], 1.8, R, 0.6);
  c.tube([[7, 4], [10, 8], [12, 13]], 1.3, R, 0.5);
  c.tube([[6, 6], [1, 8]], 0.8, R, 0.4); c.tube([[9, 7], [13, 6]], 0.7, R, 0.4);
  c.tube([[5, 9], [7, 13]], 0.6, R, 0.4);
  c.px([[5, 0], [6, 1], [9, 0]], GREEN[2]); c.set(8, 1, GREEN[3]);
});
add('icon_thorn', c => {
  // one big wicked rose thorn on a bramble stem
  const V = ['#3a462c', '#5d6e40', '#8a9a58', '#b4c078'];
  c.tube([[0, 13], [7, 10], [14, 8]], 1.6, V);
  c.shPoly([[3, 11], [9, 9.5], [2, 0]], ['#8a5a3a', '#c89a6a', '#efe0b8', '#fff6e0']);
  c.shPoly([[10, 9], [13, 8], [13, 4]], ['#8a5a3a', '#c89a6a', '#efe0b8']);
  c.line(3, 9, 2, 2, '#fff6e0'); c.set(6, 12, V[3]);
});
add('icon_chestnut', c => {
  c.sh(7, 8, 6.4, 5.8, NUT);
  c.shPoly([[1, 9], [13, 9], [12, 12], [8, 14], [5, 14], [2, 12]], ['#b09070', '#d0b490', '#e8d4b4']);
  c.onto(() => c.sh(7, 11.5, 5.5, 2.2, ['#b09070', '#d0b490', '#e8d4b4']), NUT);
  c.px([[7, 1], [7, 2], [6, 2]], NUT[3]); c.set(7, 0, '#e8d4b4');
  c.px([[4, 4], [3, 5], [5, 3]], '#f0c090');
});
add('icon_pinecone', c => {
  const S = NUT;
  c.sh(7, 7.5, 5, 6.4, [S[0], S[1]]);
  for (let r = 0; r < 5; r++) for (let k = 0; k < 3 + (r % 2); k++) {
    const y = 2.5 + r * 2.4, x = 7 + (k - (2 + (r % 2)) / 2) * 3.2 + 0.5;
    const hw = r === 0 || r === 4 ? 1.4 : 1.8;
    c.onto(() => c.sh(x, y, hw, 1.3, [S[1], S[2], S[3]]), [S[0], S[1]]);
  }
  c.px([[7, 0], [6, 0]], GREEN[1]); c.set(8, 0, GREEN[2]);
});
add('icon_icicle', c => {
  c.shPoly([[0, 0], [14, 0], [14, 3], [0, 3]], [ICE[2], ICE[3], ICE[3], WHITE]);
  c.hline(0, 13, 3, ICE[1]);
  for (const [x, l, w] of [[2, 12, 1.6], [6, 9, 1.4], [9.5, 13, 1.8], [12.5, 6, 1]]) c.shPoly([[x - w, 3], [x + w, 3], [x, 3 + l]], ICE);
  c.px([[2, 5], [6, 5], [9, 5]], WHITE);
});
add('icon_ember', c => {
  c.sh(7, 11, 5.8, 3, ['#4a1a14', '#8a2a1a', PAL.rust, PAL.orange]);
  c.onto(() => { c.px([[5, 11], [6, 12], [9, 10], [10, 11]], PAL.sun); c.px([[4, 12], [8, 12], [11, 12]], '#e8873a'); }, ['#4a1a14', '#8a2a1a', PAL.rust, PAL.orange]);
  c.shPoly([[4, 9], [5, 4], [7, 6], [8, 0], [11, 5], [10, 9]], [PAL.red, PAL.orange, PAL.sun, '#fff1a8']);
  c.shPoly([[6, 9], [7, 6], [8, 4], [9, 7], [9, 9]], [PAL.sun, '#fff1a8']);
  c.px([[2, 3], [12, 2], [13, 6]], PAL.sun); c.noOut.add(PAL.sun);
});
add('icon_swarm', c => {
  for (const [x, y, h] of [[1, 2, 1], [8, 1, 1], [4, 7, -1], [10, 8, 1], [2, 11, 1]]) bee(c, x, y, h);
  c.noOut.add('#e8f8ff');
}, { post: c => { c.px([[7, 5], [6, 4], [13, 5], [8, 12], [7, 11]], '#b8a67a'); } });
add('icon_comb', c => {
  for (const [x, y] of [[0, 1], [4, 1], [8, 1], [2, 4], [6, 4], [10, 4], [0, 7], [4, 7], [8, 7], [2, 10], [6, 10]]) hex(c, x, y, (x + y) % 3 ? HONEY[2] : HONEY[3], HONEY[0]);
  c.px([[1, 2], [5, 2], [3, 5], [7, 5], [11, 5], [5, 8]], GOLD[3]);
  c.vline(12, 9, 12, HONEY[2]); c.set(12, 13, HONEY[1]); c.set(11, 9, HONEY[2]);
});

// =============================================================================== KEEPSAKES
add('ks_queen_cell', c => {
  // a knobbly, peanut-shaped queen cell hanging off a scrap of comb, gleaming with royal jelly
  hex(c, 0, 0, HONEY[2], HONEY[0]); hex(c, 3, 2, HONEY[3], HONEY[0]); hex(c, 0, 4, HONEY[2], HONEY[0]);
  c.sh(7.2, 6.8, 2.8, 2.6, WAX); c.sh(9.4, 10.2, 3.4, 3.4, WAX);
  c.onto(() => { for (const [x, y] of [[6, 6], [8, 7], [8, 9], [10, 9], [9, 11], [11, 11], [7, 10], [10, 13]]) c.set(x, y, WAX[0]); c.px([[6, 5], [7, 8], [8, 11]], WAX[3]); }, WAX);
  c.px([[13, 8], [12, 7]], GOLD[3]); c.set(12, 8, WHITE); c.noOut.add(GOLD[3]); c.noOut.add(WHITE);
});
add('ks_smoker', c => {
  // the fancy brass smoker: copper bellows with a heart, curl of smoke
  const COP = ['#7a3a1e', '#b0582c', '#d87a44', '#f0a870'];
  c.shPoly([[0, 6], [4, 5], [5, 13], [1, 13]], COP);
  c.px([[2, 8], [3, 8], [2, 9], [3, 9], [2.5, 10]], PAL.red); c.set(2, 8, RED[3]);
  c.tube([[8.5, 6.5], [8.5, 12]], 2.6, BRASS);
  c.hline(6, 11, 8, BRASS[0]); c.hline(6, 11, 11, BRASS[0]); c.set(6, 9, BRASS[3]); c.set(6, 10, BRASS[3]);
  c.sh(8.5, 5.4, 2.7, 1.5, BRASS);
  c.shPoly([[7.5, 5], [9.5, 4.5], [11.5, 1.5], [10.5, 1]], BRASS);
  c.px([[12, 0], [13, 1], [13, 2], [12, 3]], '#e6e4ec'); c.noOut.add('#e6e4ec');
});
add('ks_bee_brooch', c => {
  c.sh(4.5, 4, 3, 2.4, ['#9ac4d8', '#cfeaf4', '#f0fbff']); c.sh(9.5, 4, 3, 2.4, ['#9ac4d8', '#cfeaf4', '#f0fbff']); // gem wings
  c.set(3, 3, WHITE); c.set(8, 3, WHITE);
  c.sh(7, 9, 2.8, 4, ['#8a4a10', '#c47f1f', PAL.gold, '#ffe08a']); // amber body
  c.onto(() => { c.hline(4, 10, 8, GOLD[0]); c.hline(4, 10, 11, GOLD[0]); }, ['#8a4a10', '#c47f1f', PAL.gold, '#ffe08a']);
  c.sh(7, 4.5, 1.8, 1.6, GOLD); c.set(7, 3, PAL.red);
  c.px([[6, 2], [5, 1], [8, 2], [9, 1]], GOLD[1]);
  c.px([[7, 13], [7, 12]], GOLD[0]);
});
add('ks_honey_pot', c => {
  c.sh(7, 9, 6.2, 4.8, CLAY);
  c.rect(3, 3, 8, 2, CLAY[1]); c.hline(3, 10, 3, CLAY[3]);
  c.onto(() => { c.hline(1, 13, 8, CREAM[3]); c.hline(1, 13, 9, CREAM[2]); }, CLAY);
  c.shPoly([[3, 4], [11, 4], [10, 6], [9, 5], [8, 7], [6, 5], [5, 6], [4, 5]], HONEY); // honey spilling over the rim
  c.set(8, 8, HONEY[2]); c.set(8, 9, HONEY[1]);
  c.tube([[9, 3], [12, 0]], 0.8, WOOD); c.sh(12.6, 0.6, 1.1, 1, WOOD);
  c.px([[4, 10], [5, 11]], CLAY[3]);
});
add('ks_veil_hat', c => {
  c.sh(7, 9, 7, 2.6, STRAW, [0.05, 0.5, 0.9]);
  c.sh(7, 6, 4, 3.6, STRAW);
  c.onto(() => { c.hline(3, 11, 7, HONEY[0]); c.hline(3, 11, 8, HONEY[1]); }, STRAW);
  // rolled-up veil on the brim
  c.tube([[1, 10.5], [5, 11.5], [9, 11.5], [13, 10.5]], 1.2, MESH);
  c.px([[3, 11], [6, 12], [9, 12], [12, 11]], MESH[0]);
  bee(c, 9, 2, 1);
});
add('ks_wax_seal', c => {
  c.shPoly([[4, 8], [6.5, 9], [5, 14], [3.5, 12.5], [2, 14]], [GOLD[0], GOLD[1], GOLD[2]]);
  c.shPoly([[10, 8], [7.5, 9], [9, 14], [10.5, 12.5], [12, 14]], [GOLD[0], GOLD[1], GOLD[2]]);
  const WX = ['#6a1822', '#962c33', PAL.red, '#f07b63'];
  c.sh(7, 5.6, 5.8, 5.4, WX);
  c.px([[1, 2], [12, 1], [13, 6], [1, 8]], WX[1]);
  c.onto(() => c.sh(7, 5.6, 3.8, 3.6, [WX[1], WX[1], WX[2]]), WX);
  // embossed bee
  c.stamp(5, 3, ['w.w', 'dsd', 'sds', 'dsd', '.d.'], { w: WX[3], d: WX[0], s: WX[3] });
});
add('ks_hive_key', c => {
  // hexagon bow with a cut-out, long shaft, bit
  c.stamp(0, 0, ['.bbbb.', 'bBBBBb', 'bB..Bb', 'bB..Bb', 'bBBBBb', '.bbbb.'], { b: BRASS[1], B: BRASS[2] });
  c.px([[1, 1], [2, 0]], BRASS[3]);
  c.tube([[5, 5], [12, 12]], 1, BRASS);
  c.stamp(8, 11, ['.bb', 'bb.', '.b.'], { b: BRASS[1] });
  c.stamp(10, 9, ['.b', 'b.'], { b: BRASS[1] });
});
add('ks_brass_bell', c => {
  c.tube([[7, 0.5], [7, 3]], 1.1, WOOD);
  c.shPoly([[4, 4], [10, 4], [11, 9], [13, 11], [1, 11], [3, 9]], BRASS);
  c.hline(1, 12, 11, BRASS[0]); c.hline(3, 10, 9, BRASS[3]);
  c.px([[4, 5], [4, 6], [4, 7]], BRASS[3]);
  c.sh(7, 12.5, 1.4, 1.2, STEEL);
  c.px([[0, 6], [13, 6], [12, 4]], GOLD[3]); c.noOut.add(GOLD[3]);
});
add('ks_garden_gnome', c => {
  c.shPoly([[3, 6], [7, 0], [11, 6]], RED); c.set(7, 0, RED[3]);
  c.sh(7, 7, 2.8, 2, CREAM.map((_, i) => ['#c98567', '#f2c29b', '#fcdcbf', '#fcdcbf'][i]));
  c.sh(7, 8.5, 1.1, 1, ['#c86a5a', '#e8837a']); // nose
  c.px([[5, 7], [9, 7]], INK);
  c.shPoly([[3, 9], [11, 9], [9, 12], [7, 13], [5, 12]], ['#c8c4bc', '#e8e6e0', WHITE, WHITE]); // beard
  c.shPoly([[2, 10], [4, 9], [4, 13], [2, 13]], BLUE); c.shPoly([[10, 9], [12, 10], [12, 13], [10, 13]], BLUE);
  c.hline(2, 12, 13, WOOD[0]);
});
add('ks_spade_pin', c => {
  // enamel pin: a little garden spade on a gold backing
  c.sh(7, 7, 6.5, 6.5, GOLD);
  c.sh(7, 7, 5.4, 5.4, [GREEN[0], GREEN[1], GREEN[1], GREEN[2]]);
  c.shPoly([[4, 7], [10, 7], [10, 11], [7, 13], [4, 11]], METAL);
  c.tube([[7, 2], [7, 7]], 0.8, WOOD); c.hline(5, 9, 2, WOOD[1]);
  c.set(5, 8, METAL[3]); c.px([[3, 3], [4, 2]], GREEN[3]);
});

// =============================================================================== UI
add('ui_star', c => {
  const pts = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 2.8 : 7; pts.push([7 + Math.cos(a) * r, 7.6 + Math.sin(a) * r]); }
  c.shPoly(pts, GOLD);
  c.px([[5, 6], [6, 5]], WHITE); c.set(7, 3, GOLD[3]);
});
add('ui_calendar', c => {
  c.rect(0, 2, 14, 12, CREAM[3]); c.hline(0, 13, 13, CREAM[1]); c.vline(13, 2, 13, CREAM[2]);
  c.rect(0, 2, 14, 3, RED[1]); c.hline(0, 13, 2, RED[2]); c.hline(0, 13, 4, RED[0]);
  c.vline(3, 0, 3, STEEL[2]); c.vline(10, 0, 3, STEEL[2]);
  for (let y = 6; y <= 11; y += 2.5) for (let x = 2; x <= 11; x += 3) c.rect(x, y, 2, 1, CREAM[1]);
  c.px([[7, 8], [8, 7], [9, 8], [8, 9]], GREEN[2]); c.set(8, 8, GREEN[3]); // today, a little leaf
});
add('ui_book', c => {
  // open book
  c.shPoly([[0, 3], [7, 4], [14, 3], [14, 13], [7, 14], [0, 13]], [WOOD[0], WOOD[1], WOOD[1], WOOD[2]]);
  c.shPoly([[1, 2], [7, 3], [7, 12], [1, 11]], [CREAM[2], CREAM[3], CREAM[3], WHITE]);
  c.shPoly([[7, 3], [13, 2], [13, 11], [7, 12]], [CREAM[1], CREAM[2], CREAM[3]]);
  c.vline(7, 3, 12, CREAM[0]);
  for (const y of [5, 7, 9]) { c.line(2, y, 5, y + 0.5, CREAM[0]); c.line(9, y + 0.5, 12, y, CREAM[0]); }
  c.vline(10, 11, 14, RED[1]);
});
add('ui_lock', c => {
  c.tube([[3.5, 7], [3.5, 3.5], [7, 1], [10.5, 3.5], [10.5, 7]], 1.1, STEEL);
  c.shPoly([[1, 6], [13, 6], [13, 14], [1, 14]], GOLD);
  c.hline(1, 13, 6, GOLD[3]);
  c.sh(7, 9, 1.2, 1.2, [INK, INK2]); c.vline(7, 10, 12, INK);
});
add('ui_trophy', c => {
  c.tube([[3, 3], [0.8, 4], [1.5, 7], [4, 7.5]], 0.8, GOLD); c.tube([[11, 3], [13.2, 4], [12.5, 7], [10, 7.5]], 0.8, GOLD);
  c.shPoly([[2, 1], [12, 1], [11, 6], [9, 8], [5, 8], [3, 6]], GOLD);
  c.hline(2, 11, 1, GOLD[3]);
  c.rect(6, 8, 2, 3, GOLD[1]);
  c.shPoly([[3, 11], [11, 11], [12, 14], [2, 14]], WOOD); c.hline(5, 8, 12, GOLD[2]);
  c.px([[4, 2], [4, 3], [5, 4]], WHITE);
});
add('ui_speed', c => {
  for (const ox of [0, 6]) c.shPoly([[ox + 1, 2], [ox + 8, 7], [ox + 1, 12]], [GREEN[0], GREEN[1], GREEN[2], GREEN[3]]);
  c.px([[2, 4], [8, 4]], GREEN[3]);
});
add('ui_text', c => {
  // "Aa": a big A and a small a, cream letters with an ink outline
  const L = CREAM;
  c.stamp(0, 1, [
    '..aa...',
    '..aa...',
    '.abba..',
    '.a..a..',
    'ab..ba.',
    'aaaaba.',
    'ab..ba.',
    'ab..ba.',
    'bb..bb.',
  ], { a: L[3], b: L[1] });
  c.stamp(8, 4, [
    '.aaa.',
    '....b',
    '.aaab',
    'a..ab',
    '.bbbb',
  ], { a: L[3], b: L[1] });
});

// =============================================================================== STATUS
add('st_bees', c => {
  for (const [x, y, h] of [[1, 3, 1], [8, 2, -1], [4, 9, 1]]) {
    c.sh(x + 2, y + 2, 2.4, 1.9, HONEY);
    c.vline(x + 2, y + 0.5, y + 3.5, INK); c.vline(x + (h > 0 ? 3.5 : 0.5), y + 1, y + 3, INK);
    c.sh(x + 1.5, y - 0.4, 1.3, 1, ['#b8dce8', '#e8f8ff', WHITE]);
  }
});
add('st_guard', c => {
  // a tiny scarecrow on its post: the plot is guarded
  c.vline(7, 8, 13, WOOD[0]); c.vline(6, 8, 13, WOOD[1]);
  c.tube([[1, 8], [13, 8]], 0.8, WOOD);
  for (const [x, s] of [[0, -1], [13, 1]]) c.px([[x, 7], [x, 9], [x + s, 8]], STRAW[2]);
  c.shPoly([[4, 8], [10, 8], [10, 12], [4, 12]], RED); c.px([[5, 9], [8, 10]], RED[3]);
  c.sh(7, 4.5, 3, 2.8, BURLAP);
  c.px([[6, 4], [8, 4]], INK); c.px([[5, 6], [6, 6.5], [8, 6.5], [9, 6]], INK2);
  c.sh(7, 2, 4.8, 1.2, STRAW); c.sh(7, 1, 2.6, 1.4, STRAW);
});

// =============================================================================== INTENTS
add('intent_weed', c => {
  // a gloamweed shoving up out of the soil, thorny and glowing
  c.sh(7, 13.5, 6, 2, [NUT[0], NUT[1], NUT[2]]);
  c.tube([[7, 13], [6, 8], [8, 4], [7, 1]], 1.2, GLOAM, 0.6);
  c.tube([[6.5, 9], [2, 6]], 0.9, GLOAM, 0.4); c.tube([[7.5, 7], [12, 4]], 0.9, GLOAM, 0.4);
  const T = '#e4d8ff';
  c.px([[5, 10], [9, 8], [4, 6], [10, 3], [8, 2]], T);
  c.sh(2, 5.5, 1.6, 1.6, [PAL.plum, PAL.purple, PAL.gloomGlow]); c.sh(12, 3.5, 1.6, 1.6, [PAL.plum, PAL.purple, PAL.gloomGlow]);
  c.set(2, 5, GLOW.hot); c.set(12, 3, GLOW.hot);
});
add('intent_steal', c => {
  // a coin being snatched by a grey gloam paw
  c.sh(5, 8.5, 4.6, 4.6, GOLD);
  c.sh(5, 8.5, 3, 3, [GOLD[0], GOLD[1]]);
  c.vline(5, 6, 11, GOLD[3]); c.set(4, 7, GOLD[3]);
  c.shPoly([[8, 3], [13, 0], [14, 5], [11, 7]], GLOAM);
  for (const [a, b] of [[[9, 4], [7, 6.5]], [[10.5, 5], [9, 8]], [[12, 6], [11, 9]]]) c.tube([a, b], 0.8, GLOAM);
  c.px([[7, 7], [9, 9], [11, 10]], '#e4d8ff');
  c.px([[0, 2], [1, 3], [2, 1]], GLOW.mid);
});

// =============================================================================== PLOT OVERLAY
// ov_scarecrow: 12x16, drawn over a plot; its post reaches the bottom row.
defs.ov_scarecrow = mk(c => {
  c.tube([[5, 8], [5, 13.8]], 0.8, WOOD);
  c.tube([[0.5, 7.5], [9.5, 7.5]], 0.7, WOOD);
  c.px([[0, 6], [0, 8], [9, 6], [9, 8]], STRAW[2]);
  c.shPoly([[2.5, 7], [7.5, 7], [8, 11], [2, 11]], [RED[0], RED[1], RED[2]]);
  c.px([[3, 8], [5, 9], [6, 8]], RED[3]); c.px([[4, 10], [6, 10]], STRAW[2]);
  c.sh(5, 4.2, 2.8, 2.6, BURLAP);
  c.px([[4, 4], [6, 4]], INK); c.px([[3, 5], [4, 6], [5, 6], [6, 6], [7, 5]], INK2);
  c.set(3, 5, PAL.blush); c.set(7, 5, PAL.blush);
  c.sh(5, 2, 4.6, 1, STRAW); c.sh(5, 1, 2.4, 1.3, STRAW);
  c.onto(() => c.hline(2, 8, 1, RED[1]), STRAW);
}, { w: 10, h: 14 });

// =============================================================================== APP ICON (PWA source, 32x32)
// Full-bleed warm tile (home screens mask the corners), turnip sprouting from an open almanac.
defs.app_icon = (() => {
  const c = canvas(28, 28, 2);
  // motif first (so it can be outlined on its own), then the tile behind it
  const TURN = ['#58306c', '#844a9a', '#b570c4', '#e7b0ee'];
  const COVER = ['#3a5226', '#56733a', '#6f9448', '#9cc26a'];
  const PAGES = ['#cdb07a', '#f3e2b3', '#fff4d6'];
  // almanac, open, seen from the front
  c.shPoly([[0, 20], [14, 22], [28, 20], [28, 27], [14, 28], [0, 27]], COVER);
  c.shPoly([[1, 18], [14, 20], [14, 26], [1, 25]], [PAGES[1], PAGES[2], PAGES[2]]);
  c.shPoly([[14, 20], [27, 18], [27, 25], [14, 26]], [PAGES[0], PAGES[1], PAGES[2]]);
  c.vline(14, 20, 26, PAGES[0]);
  for (const y of [21, 23]) { c.line(3, y, 11, y + 1, PAGES[0]); c.line(17, y + 1, 25, y, PAGES[0]); }
  c.vline(20, 25, 29, PAL.red); c.set(20, 29, '#a8302c');
  // leaves
  const LV = ['#2f5e2e', PAL.leafDark, PAL.leaf, PAL.leafLight];
  c.tube([[12, 10], [8, 5], [5, 0.8]], 2.3, LV, 1);
  c.tube([[14, 9], [15, 3], [17, -0.5]], 2.4, LV, 1.1);
  c.tube([[15.5, 10], [20, 5], [24, 2.5]], 2.2, LV, 1);
  c.line(12, 10, 6, 2, LV[0]); c.line(14, 9, 16, 1, LV[0]); c.line(16, 10, 22, 4, LV[0]);
  // turnip bulb
  c.sh(14, 15, 6.6, 5.6, ['#d8c8b8', '#efe6da', '#fbf3e4', WHITE]);
  c.each(6, 8, 22, 15, (x, y) => { const v = c.get(x, y); if (v && ['#d8c8b8', '#efe6da', '#fbf3e4', WHITE].includes(v) && y < 13.5) c.put(x, y, TURN[['#d8c8b8', '#efe6da', '#fbf3e4', WHITE].indexOf(v)]); });
  c.px([[10, 10], [11, 9]], TURN[3]);
  c.px([[14, 21], [14, 22], [15, 23]], '#d8c8b8');
  // little face on the turnip
  c.px([[11, 15], [16, 15]], INK); c.set(11, 14, INK); c.set(16, 14, INK);
  c.px([[10, 17], [17, 17]], '#e8837a');
  c.px([[13, 17], [14, 17]], '#8a3a30');
  // sparkles
  c.outline();
  const T = ['#f6a04a', '#ffbe5c', '#ffd98a', '#ffeebb'];
  const g = c.g;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (g[y][x] !== null) continue;
    const d = Math.hypot(x + 0.5 - 13, y + 0.5 - 11) / 22;
    g[y][x] = T[d < 0.35 ? 3 : d < 0.6 ? 2 : d < 0.85 ? 1 : 0];
  }
  for (const [x, y] of [[4, 6], [27, 12], [26, 3]]) { g[y][x] = WHITE; g[y - 1][x] = g[y + 1][x] = g[y][x - 1] = g[y][x + 1] = '#fff4d6'; }
  return c.bake();
})();

registerSprites(defs);
