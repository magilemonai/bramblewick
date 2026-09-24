// Characters C (2.0): playable Pell, the farmer's select portrait, and the eight new 2.0 critters.
// Same procedural brush kit as chars_a.js (shaded ellipses, tubes, polygons + hand-placed detail),
// extended with a translation stack so each pose (base, ~1 idle, ~atk, ~hurt) re-uses one drawing.
// Enemies face left; Pell faces right. DOM-free: only calls registerSprites.
import { registerSprites, PAL } from '../pixel.js';

// ---------------------------------------------------------------- brush kit
const LIGHT = (() => { const v = [-0.55, -0.68, 0.48]; const m = Math.hypot(...v); return v.map(n => n / m); })();
const TH = { 2: [0.3], 3: [0.22, 0.74], 4: [0.16, 0.58, 0.86], 5: [0.05, 0.3, 0.62, 0.86] };
const pick = (d, n, t = TH[n]) => { let i = 0; while (i < t.length && d > t[i]) i++; return i; };
const lit = (nx, ny) => { const r = nx * nx + ny * ny; const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, r))); return LIGHT[0] * nx + LIGHT[1] * ny + LIGHT[2] * nz; };

function canvas(w, h) {
  const g = Array.from({ length: h }, () => Array(w).fill(null));
  const c = { w, h, g, clip: null, noOut: new Set(), tx: 0, ty: 0 };
  const inb = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  c.get = (x, y) => { x = Math.round(x) + c.tx; y = Math.round(y) + c.ty; return inb(x, y) ? g[y][x] : null; };
  c.put = (x, y, col) => { x = Math.round(x) + c.tx; y = Math.round(y) + c.ty; if (inb(x, y)) g[y][x] = col; };
  c.set = (x, y, col) => {
    x = Math.round(x) + c.tx; y = Math.round(y) + c.ty;
    if (!inb(x, y) || col === undefined) return;
    if (c.clip && !c.clip(g[y][x], x, y)) return;
    g[y][x] = col;
  };
  // Draw fn with everything shifted by (dx, dy).
  c.at = (dx, dy, fn) => { c.tx += dx; c.ty += dy; fn(); c.tx -= dx; c.ty -= dy; };
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
  c.rsh = (cx, cy, rx, ry, ang, ramp, t) => {
    const co = Math.cos(ang), si = Math.sin(ang), R = Math.max(rx, ry);
    c.each(cx - R - 1, cy - R - 1, cx + R, cy + R, (x, y) => {
      const px = x + 0.5 - cx, py = y + 0.5 - cy, u = (px * co + py * si) / rx, v = (-px * si + py * co) / ry;
      if (u * u + v * v <= 1) c.set(x, y, ramp[pick(lit(u * co - v * si, u * si + v * co), ramp.length, t)]);
    });
  };
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
  c.behind = fn => { const prev = c.clip; c.clip = cur => cur === null; fn(); c.clip = prev; };
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

// ---------------------------------------------------------------- shared ramps + gloam kit
const INK = PAL.ink, INK2 = PAL.inkSoft, WHITE = '#ffffff';
const GLOAM = ['#2f2a3d', '#3a3448', '#5b5470', '#7a7194'];
const GLOW = { rim: '#8a7cc4', mid: PAL.gloomGlow, core: '#d8ccff', hot: '#f6f0ff' };
const SKIN = { fair: ['#c98567', '#f2c29b', '#fcdcbf'] };
const BLUSH = '#e8837a';
const METAL = ['#4d4a52', '#77737c', '#a9a6ae', '#dedce4'];
const WOOD = [PAL.woodDark, PAL.wood, PAL.woodLight, '#d9a877'];
const LEAF = ['#2f5e2e', PAL.leafDark, PAL.leaf, PAL.leafLight];
const STRAW = ['#a8742a', '#d9a441', '#f0c865', '#fbe39a'];
const SPARK = ['#fff4d6', '#ffffff', '#ffe9a8'];

function gEye(c, x, y, w = 2, h = 2, brow = -1) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.set(x + i, y + j, GLOW.mid);
  if (w >= 3 && h >= 3) { for (let j = 1; j < h; j++) for (let i = 1; i < w; i++) c.set(x + i - (i === w - 1 ? 1 : 0), y + j, GLOW.core); c.hline(x, x + w - 1, y + h - 1, GLOW.mid); }
  c.set(x, y, GLOW.hot);
  if (brow) {
    if (brow < 0) { c.line(x - 1, y, x + w, y - 1 - (w > 2 ? 1 : 0), INK); c.set(x, y + 0, INK); c.set(x, y + 1, GLOW.hot); }
    else { c.line(x + w, y, x - 1, y - 1 - (w > 2 ? 1 : 0), INK); c.set(x + w - 1, y, INK); c.set(x + w - 2 < x ? x : x + w - 2, y + 1, GLOW.hot); }
  }
}
// Hurt eye: squeezed shut ('>' pointing at the nose, which is to the left), with a lilac glint.
function sqEye(c, x, y, w = 3) {
  c.set(x + w - 1, y, INK); c.set(x + w - 2, y, INK);
  c.set(x, y + 1, INK); c.set(x + 1, y + 1, INK);
  c.set(x + w - 1, y + 2, INK); c.set(x + w - 2, y + 2, INK);
  c.set(x + w, y + 1, GLOW.mid);
}
const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hx(a), B = hx(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function patch(c, cx, cy, rx, ry, specks = true) {
  c.each(cx - rx - 1, cy - ry - 1, cx + rx, cy + ry, (x, y) => {
    const cur = c.get(x, y); if (!cur || cur === INK || cur.length !== 7) return;
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, r = dx * dx + dy * dy;
    if (r > 1) return;
    const target = lit(dx, dy) < 0.35 ? GLOAM[1] : GLOAM[2];
    c.put(x, y, mix(cur, target, r > 0.6 ? 0.5 : 0.8));
  });
  if (specks && rx > 1.5) { c.set(Math.round(cx - rx * 0.35), Math.round(cy - ry * 0.2), GLOW.mid); c.set(Math.round(cx + rx * 0.3), Math.round(cy + ry * 0.1), GLOAM[3]); }
}
function drip(c, x, y, len) {
  for (let i = 0; i < len; i++) c.set(x, y + i, i < len - 1 ? GLOAM[2] : GLOAM[1]);
  c.set(x, y + len, GLOAM[2]); c.set(x + 1, y + len - 1 > y ? y + len - 1 : y, GLOAM[1]);
}
// Hit spark (hurt frames), drawn without an outline.
function ouch(c, x, y) {
  c.set(x, y, SPARK[1]); c.px([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]], SPARK[0]);
  c.px([[x - 2, y], [x + 2, y], [x, y - 2], [x, y + 2]], SPARK[2]);
  for (const s of SPARK) c.noOut.add(s);
}
// Tiny bee: 3x2 body with a stripe and a wing; hd = heading (-1 left, 1 right).
function bee(c, x, y, hd = 1) {
  const B = [PAL.gold, PAL.sun];
  c.set(x, y, B[1]); c.set(x + 1, y, INK); c.set(x + 2, y, B[1]);
  c.set(x, y + 1, B[0]); c.set(x + 1, y + 1, INK); c.set(x + 2, y + 1, B[0]);
  c.set(hd > 0 ? x + 3 : x - 1, y, INK);
  c.set(x + 1, y - 1, '#e8f8ff'); c.set(hd > 0 ? x : x + 2, y - 1, '#e8f8ff');
}
const bake = c => c.bake();

// Pose descriptor. dx/dy: default body offset. Each sprite may override.
const POSES = [['', 'base'], ['~1', 'idle'], ['~atk', 'atk'], ['~hurt', 'hurt']];
function frames(id, fn) {
  const out = {};
  for (const [suf, k] of POSES) out[id + suf] = fn({ k, idle: k === 'idle', atk: k === 'atk', hurt: k === 'hurt' });
  return out;
}

// ---------------------------------------------------------------- pc_pell (faces right)
function pc_pell(f) {
  const c = canvas(32, 32);
  const SK = SKIN.fair, HAIR = ['#141418', '#24242c', '#383844'];
  const SUIT = ['#b8b09a', '#e4dcc4', '#f6f0de', WHITE];
  const HAT = ['#b89a5a', '#d9c08a', '#f0dcae', '#fff4d6'];
  const GLOVE = ['#8a5a1c', '#c48a3a', '#e0ae5c'];
  const BOOT = ['#3e2718', '#5e3b26', '#7e5436'];
  const HONEY = ['#a8742a', PAL.gold, PAL.sun];
  const MESH = ['#8e8e9a', '#b4b4be', '#d6d6de'];
  const SMOKE = ['#c9c6d0', '#e6e4ec', '#f8f8fc'];
  for (const s of SMOKE) c.noOut.add(s);
  const bx = f.hurt ? -2 : f.atk ? 1 : 0, by = f.idle ? 1 : 0;
  // legs + boots stay planted
  c.rect(11, 25, 10, 4, SUIT[1]);
  c.vline(15, 26, 28, SUIT[0]); c.hline(11, 14, 28, SUIT[0]); c.hline(16, 20, 28, SUIT[0]);
  c.sh(12.5, 29.6, 2.8, 1.5, BOOT); c.sh(18.8, 29.6, 3.2, 1.5, BOOT);
  c.at(bx, by, () => {
    // veil hanging down the back from the tipped-back hat
    const hr = f.hurt ? 1 : 0;
    c.shPoly([[5, 11], [12, 10], [13, 20], [11, 23], [6, 22], [4.5, 16]], MESH);
    c.each(3, 9, 13, 23, (x, y) => { const v = c.get(x, y); if (MESH.includes(v) && (x % 3 === 0 || y % 3 === 0)) c.put(x, y, mix(v, '#4a4a58', 0.4)); });
    // hat brim, tipped back like a halo behind the head
    c.rsh(12.5, 8.6 + hr, 9.6, 2.4, -0.38, HAT, [0.05, 0.5, 0.9]);
    c.onto(() => { c.line(4, 13 + hr, 20, 7 + hr, HAT[0]); }, HAT);
    // back arm
    c.tube([[10, 20], [9, 24]], 1.4, SUIT); c.sh(9.5, 25, 1.7, 1.4, GLOVE);
    // suit torso
    c.shPoly([[10, 19], [22, 19], [22, 26], [10, 26]], SUIT);
    c.vline(16, 21, 26, SUIT[0]);
    c.rect(18, 23, 3, 2, SUIT[0]); c.hline(18, 20, 23, SUIT[1]); // chest pocket
    c.set(19, 22, HONEY[1]); // pocket bee-pin
    // honey bandana
    c.hline(12, 20, 18, HONEY[1]); c.hline(11, 21, 19, HONEY[1]); c.hline(13, 19, 18, HONEY[2]);
    c.set(12, 19, HONEY[0]); c.set(21, 19, HONEY[0]);
    c.sh(15.5, 20.6, 1.6, 1.4, HONEY);
    // black bob (back of head)
    c.sh(13, 13.6, 4.2, 4.8, HAIR);
    // face
    c.sh(17.2, 14.2, 6, 5.3, SK, [-0.55, 0.93]);
    c.sh(12.6, 17.2, 1.8, 1.6, HAIR); // bob tip over the ear
    // fringe
    c.hline(13, 21, 10, HAIR[1]); c.hline(13, 19, 11, HAIR[1]); c.set(20, 11, HAIR[0]); c.set(13, 12, HAIR[1]); c.set(14, 12, HAIR[0]);
    c.set(16, 10, HAIR[2]); c.set(17, 10, HAIR[2]);
    // eyes: soft, or squeezed when hurt
    if (f.hurt) {
      c.px([[16, 13], [17, 14], [16, 15]], INK); c.px([[21, 13], [20, 14], [21, 15]], INK);
    } else {
      for (const ex of [16, 20]) { c.rect(ex, 13, 2, 2, INK); c.set(ex, 13, WHITE); }
    }
    c.hline(15, 16, 16, BLUSH); c.hline(21, 22, 16, BLUSH);
    if (f.hurt) { c.hline(18, 19, 17, '#8a3a30'); c.set(18, 16, '#8a3a30'); }
    else if (f.atk) { c.px([[18, 16], [19, 16]], '#8a3a30'); c.px([[18, 17], [19, 17]], '#6a2a24'); }
    else { c.px([[18, 17], [19, 17]], '#8a3a30'); c.set(17, 16, '#8a3a30'); c.set(20, 16, '#8a3a30'); }
    c.set(23, 14, SK[0]);
    // hat crown sitting on the back of the head
    c.sh(10.8 - hr, 5.6 + hr, 4.4, 3.4, HAT);
    c.onto(() => { c.hline(5, 16, 7 + hr, HONEY[0]); c.hline(5, 16, 8 + hr, HONEY[1]); }, HAT);
    for (const [x, y] of [[9, 3 + hr], [12, 4 + hr], [8, 5 + hr]]) c.set(x - hr, y, HAT[1]);
  });
  // front arm + smoker (the smoker is Pell's "weapon": thrust forward on attack)
  const sx = bx + (f.atk ? 2 : 0), sy = by + (f.atk ? -2 : 0);
  c.at(sx, sy, () => {
    c.tube([[21, 20], [23, 22]], 1.4, SUIT);
    // bellows (wood + leather) on the near side of the can
    c.shPoly([[22, 20.5], [24, 20], [24.5, 25.5], [22.5, 25]], ['#6e4630', '#8e6040', '#b07e56']);
    c.set(23, 22, '#4a2e1e'); c.set(23, 24, '#4a2e1e');
    c.sh(22.6, 22.6, 1.7, 1.6, GLOVE);
    // tin smoker can, brass band, domed lid + spout
    c.tube([[27, 19.5], [27, 25.5]], 1.9, METAL);
    c.hline(25, 28, 21, '#a8742a'); c.hline(25, 28, 22, PAL.gold); c.set(25, 22, PAL.sun);
    c.sh(27, 18.8, 2, 1.3, METAL);
    c.shPoly([[26, 18.5], [27.6, 18], [29.4, 15], [28.4, 14.4]], METAL);
    c.set(26, 24, '#e8873a'); c.set(27, 24, '#b8522e'); // ember glow through the vent
  });
  // smoke puffs
  const puffs = f.atk ? [[30, 9, 1.8], [28, 5.5, 2.2], [30.2, 2.2, 1.6], [25.5, 3, 1.4]]
    : f.idle ? [[29.5, 9.5, 1.4], [28.6, 6.8, 1.2]] : [[30, 11.5, 1.4], [29.6, 8.6, 1.2], [30.3, 6, 0.9]];
  for (const [x, y, r] of puffs) c.at(sx - bx, sy - by, () => c.sh(x + bx, y + by, r, r * 0.9, SMOKE));
  // bees
  const bees = f.atk ? [[25, 8, 1], [21, 2, 1], [28, 14, 1]] : f.hurt ? [[3, 3, -1], [22, 3, 1]] : f.idle ? [[1, 18, 1], [22, 2, -1]] : [[2, 17, 1], [21, 3, 1]];
  for (const [x, y, hd] of bees) bee(c, x, y, hd);
  c.outline();
  if (f.hurt) ouch(c, 29, 12);
  return bake(c);
}

// ---------------------------------------------------------------- portrait_farmer (head + shoulders)
function portrait_farmer() {
  const c = canvas(32, 32);
  const SK = SKIN.fair, HAIR = ['#5e3b26', '#8a5a3b', '#b07a4c'];
  const SHIRT = ['#c8ac72', '#e8d4a0', '#f6ead0', '#fff8e8'];
  const DENIM = ['#2c4870', '#3f6699', '#5b88bd', '#86ade0'];
  const RED = ['#8f2a2a', '#d6453d', '#f07a5e'];
  c.sh(16, 31, 14, 8.5, SHIRT);
  // overall bib + straps
  c.shPoly([[10, 26], [22, 26], [23, 32], [9, 32]], DENIM);
  c.tube([[8.5, 24], [10.5, 30]], 1.2, DENIM); c.tube([[23.5, 24], [21.5, 30]], 1.2, DENIM);
  c.set(10, 27, PAL.gold); c.set(22, 27, PAL.gold); c.set(10, 26, PAL.sun);
  c.hline(14, 18, 29, DENIM[3]); c.hline(14, 18, 30, DENIM[2]); c.set(13, 29, DENIM[0]); c.set(19, 29, DENIM[0]);
  c.rect(13, 20, 6, 3, SK[0]);
  // neckerchief
  c.shPoly([[9, 22], [23, 22], [20, 25], [16, 28], [12, 25]], RED);
  c.hline(10, 22, 22, RED[2]);
  c.px([[13, 24], [18, 24], [16, 26]], '#fff4d6');
  // hair behind (chin-length, soft)
  c.sh(16, 14, 8, 7.8, HAIR);
  // head
  c.sh(9.3, 15.6, 1.4, 1.8, SK); c.sh(22.7, 15.6, 1.4, 1.8, SK);
  c.sh(16, 15, 6.6, 6.8, SK, [-0.15, 0.9]);
  // fringe under the brim
  c.shPoly([[9, 10], [23, 10], [23, 13], [20, 12], [18, 13], [15, 12], [12, 13], [9, 14]], HAIR);
  c.set(11, 12, HAIR[2]); c.set(16, 11, HAIR[2]);
  // straw hat
  c.sh(16, 6.2, 6.8, 4.4, STRAW);
  c.onto(() => { c.hline(8, 24, 7, RED[1]); c.hline(8, 24, 8, RED[0]); }, STRAW);
  c.sh(16, 9.6, 13, 2.3, STRAW, [0.05, 0.5, 0.9]);
  c.hline(4, 28, 10, STRAW[0]);
  for (const [x, y] of [[13, 3], [18, 4], [11, 5], [20, 5], [6, 9], [12, 9], [21, 9], [26, 9], [17, 10]]) c.set(x, y, STRAW[0]);
  c.px([[21, 6], [22, 5]], PAL.leaf); c.set(22, 4, PAL.leafLight); c.set(21, 5, PAL.leafDark); // sprig
  // face
  c.hline(11, 13, 13, HAIR[0]); c.hline(18, 20, 13, HAIR[0]);
  for (const ex of [12, 18]) { c.rect(ex, 15, 2, 2, INK); c.set(ex, 15, WHITE); }
  c.hline(10, 11, 18, BLUSH); c.hline(20, 21, 18, BLUSH);
  c.set(16, 17, SK[0]);
  c.px([[14, 19], [18, 19]], '#b85a50'); c.hline(15, 17, 20, '#b85a50');
  c.set(12, 18, '#d69a74'); c.set(19, 18, '#d69a74'); // freckles
  c.outline();
  return bake(c);
}

// ---------------------------------------------------------------- spring: en_mudpup
function en_mudpup(f) {
  const c = canvas(32, 32);
  const MUD = ['#3a261a', '#5a3c28', '#7c5636', '#9c744a'];
  const MUZ = ['#7c5636', '#b08a5e', '#d4b080'];
  const dx = f.atk ? -2 : f.hurt ? 2 : 0, dy = f.idle ? 1 : 0;
  // tail
  const tip = f.idle ? [29, 13] : f.hurt ? [30, 20] : f.atk ? [29, 16] : [27.5, 12.5];
  c.at(dx, dy, () => c.tube([[24, 19], tip], 1.4, MUD, 0.9));
  // legs
  const legs = f.atk ? [[[12, 24], [8, 28.5]], [[15, 24], [13, 28.5]], [[22, 24], [23, 28.5]], [[25, 23], [27, 28.5]]]
    : f.hurt ? [[[14, 24], [13, 28.5]], [[17, 24], [17, 28.5]], [[23, 24], [24, 28.5]], [[26, 23], [26.5, 28.5]]]
      : [[[12, 24], [12, 28.5]], [[15, 24], [15.5, 28.5]], [[22, 24], [22, 28.5]], [[25, 23], [26, 28.5]]];
  for (const [a, b] of legs) { c.tube([a, b], 1.6, MUD); c.sh(b[0] - 0.3, 29.2, 1.8, 1, MUZ); }
  c.at(dx, dy, () => {
    c.sh(19, 20.3, 8, 5.3, MUD);
    c.onto(() => { c.sh(13.5, 21.5, 2.6, 3, MUZ); c.sh(19, 24.5, 5, 1.2, [MUD[0], MUD[1]]); }, MUD);
    // mud splats on the coat
    for (const [x, y] of [[17, 17], [22, 21], [15, 19]]) c.onto(() => c.sh(x, y, 1.3, 1, [MUD[0], MUD[1]]), MUD);
    patch(c, 22.5, 17.5, 3.2, 2.3); drip(c, 20, 24, 2); drip(c, 24, 23, 3);
    const hy = f.atk ? 1 : 0;
    c.at(0, hy, () => {
      // big round puppy head, short muzzle
      c.sh(10.5, 14.5, 6.4, 5.8, MUD);
      c.sh(5.4, 17.3, 3, 2.4, MUZ);
      c.sh(3, 16.2, 1.5, 1.2, [INK, '#4a3a40', '#8a7a86']);
      if (f.atk) {
        c.rect(3, 18, 5, 2, '#5a2030'); c.set(3, 18, WHITE); c.set(6, 18, WHITE); c.set(4, 19, '#e0667f');
      } else if (f.hurt) {
        c.px([[3, 19], [4, 18], [5, 19], [6, 18], [7, 19]], INK);
      } else c.px([[3, 19], [4, 18], [5, 18], [6, 18], [7, 19]], INK);
      if (f.hurt) sqEye(c, 7, 12, 3); else gEye(c, 8, 12, 2, 2);
      c.set(9, 16, BLUSH); c.set(10, 16, BLUSH);
      // floppy ear hanging over the back of the head (flips back when hurt)
      const EAR = ['#24160e', MUD[0], MUD[1]];
      if (f.hurt) c.tube([[14, 10], [17, 9], [19.5, 10.5]], 1.5, EAR, 1);
      else c.tube([[14, 9.5], [16.5, 12], [16.8, 16]], 1.5, EAR, 1.1);
      // mud blob + grass stuck on the head
      c.onto(() => c.sh(10.5, 10.5, 2, 1.3, [MUD[0], MUD[1]]), MUD);
      c.px([[10, 8], [11, 7], [12, 8]], PAL.leaf); c.set(11, 6, PAL.leafLight);
    });
  });
  c.outline();
  if (f.hurt) ouch(c, 3, 9);
  return bake(c);
}

// ---------------------------------------------------------------- spring elite: en_rookmother (40)
function en_rookmother(f) {
  const c = canvas(40, 40);
  const F = ['#1c1e30', '#2c3148', '#434d6c', '#6a7a9e'];
  const BEAK = ['#8a5a1c', PAL.gold, PAL.sun, '#ffe9a8'];
  const SHAWL = ['#4a1e3a', '#7a2e5a', '#a8487a', '#d07aa0'];
  const CREAM = '#f3e2b3';
  const dx = f.atk ? -2 : f.hurt ? 2 : 0, dy = f.idle ? 1 : 0;
  // legs + feet
  c.vline(19, 32, 37, BEAK[0]); c.vline(25, 32, 37, BEAK[0]);
  c.hline(16, 20, 37, BEAK[0]); c.hline(22, 26, 37, BEAK[0]); c.set(16, 36, BEAK[1]); c.set(22, 36, BEAK[1]);
  c.at(dx, dy, () => {
    // tail fan
    c.shPoly([[27, 22], [38, 26], [38, 31], [34, 33], [27, 29]], F);
    c.line(29, 25, 37, 28, F[0]); c.line(29, 28, 36, 31, F[0]);
    // body
    c.sh(22, 24.5, 9.6, 8.6, F);
    c.onto(() => c.sh(17.5, 27.5, 4.5, 5, [F[2], F[3]]), F); // pale breast
    for (const y of [26, 29]) c.onto(() => c.line(15, y, 19, y + 1, F[2]), [F[3]]);
    if (f.hurt) for (const [x, y] of [[31, 17], [33, 20], [14, 31]]) c.px([[x, y], [x + 1, y - 1]], F[2]);
    // knitted shawl draped over the shoulders, point at the back
    c.shPoly([[12, 19], [18, 16], [27, 16], [32, 19], [34, 25], [29, 24], [23, 25], [17, 23], [12, 23]], SHAWL);
    c.onto(() => {
      for (let x = 12; x < 35; x += 2) c.set(x, 21 + ((x >> 1) & 1), CREAM);
      for (let x = 13; x < 34; x += 4) c.set(x, 18, SHAWL[3]);
    }, SHAWL);
    for (const [x, y] of [[13, 24], [16, 24], [19, 24], [22, 26], [25, 25], [28, 25], [31, 25], [33, 26]]) c.vline(x, y, y + 1 + (x % 3 ? 0 : 1), SHAWL[1]);
    // gloam
    patch(c, 34, 28, 2.6, 2.2); patch(c, 25, 29, 2.6, 2); patch(c, 28, 20, 2, 1.5, false);
    drip(c, 33, 31, 2); drip(c, 21, 32, 2); drip(c, 26, 31, 3);
    // head
    const hx0 = f.atk ? -2 : 0, hy0 = f.atk ? 2 : 0;
    c.at(hx0, hy0, () => {
      c.sh(13.5, 12.5, 7, 6.4, F);
      c.onto(() => c.sh(11, 10, 3, 2.2, [F[2], F[3]]), F);
      // feather bun + hat pin
      c.sh(16.5, 5.5, 2.8, 2.2, F); c.set(15, 4, F[3]);
      c.line(19, 6, 22, 3, BEAK[1]); c.set(22, 2, PAL.red); c.set(23, 3, PAL.red); c.set(22, 3, '#ff8a7a');
      if (f.atk) {
        c.shPoly([[1, 11], [8, 9], [9, 13.5]], BEAK);
        c.shPoly([[3, 17], [8, 14.5], [9, 17.5]], BEAK);
        c.poly([[3, 14], [8, 13], [8, 15], [4, 16]], '#6a2030');
      } else {
        c.shPoly([[2, 14], [8, 10], [9, 17]], BEAK); c.line(3, 14, 8, 14, BEAK[0]);
      }
      // granny spectacles around the glowing eye
      if (f.hurt) sqEye(c, 9, 10, 3); else gEye(c, 9, 10, 3, 3);
      const s2 = f.hurt ? 1 : 0;
      c.px([[8, 9 + s2], [9, 8 + s2], [10, 8 + s2], [11, 8 + s2], [12, 9 + s2], [13, 10 + s2], [13, 11 + s2], [13, 12 + s2], [12, 13 + s2], [9, 13 + s2], [10, 13 + s2], [11, 13 + s2], [8, 12 + s2]], BEAK[1]);
      c.set(9, 8 + s2, BEAK[3]);
      c.line(14, 10 + s2, 18, 11 + s2, BEAK[0]);
      c.set(10, 16, BLUSH); c.set(11, 16, BLUSH);
    });
    // brooch pinning the shawl
    c.sh(13, 20.5, 1.6, 1.6, ['#a8742a', PAL.gold, PAL.sun]); c.set(13, 21, GLOW.mid);
  });
  c.outline();
  if (f.hurt) ouch(c, 4, 7);
  return bake(c);
}

// ---------------------------------------------------------------- summer: en_cicada
function en_cicada(f) {
  const c = canvas(32, 32);
  const CIC = ['#23321c', '#3c5528', '#5e7e36', '#8cae52'];
  const BELLY = ['#6a5a2a', '#a08a44', '#cdb868'];
  const WING = ['#86aab0', '#b8d6da', '#e2f2f2'];
  const VEIN = '#4e6a5e';
  const dx = f.atk ? -2 : f.hurt ? 2 : 0, dy = f.idle ? 1 : 0;
  // legs (thin)
  const L = CIC[0];
  c.path([[10, 21], [8, 25], [7, 29]], L); c.path([[14, 22], [13, 26], [14, 29]], L); c.path([[19, 22], [21, 26], [22, 29]], L);
  c.set(6, 29, L); c.set(15, 29, L); c.set(23, 29, L);
  c.at(dx, dy, () => {
    // abdomen + thorax
    c.sh(18.5, 20, 8.5, 4.6, CIC);
    c.onto(() => { c.sh(17, 23.5, 7, 2, BELLY); for (const x of [18, 21, 24, 27]) c.vline(x, 17, 25, CIC[0]); }, [...CIC, ...BELLY]);
    // head
    c.sh(8, 18, 4.6, 4.2, CIC);
    c.onto(() => c.sh(5.5, 20.5, 2.4, 1.6, BELLY), CIC);
    c.hline(7, 9, 15, CIC[3]);
    // wings folded like a tent (lifted on idle frame, raised on attack)
    const WG = f.atk ? [[11, 14], [26, 4], [30, 6], [29, 9], [14, 18]]
      : f.idle ? [[10, 13], [28, 12], [31, 15], [27, 20], [12, 19]]
        : [[10, 13], [29, 14], [31, 18], [27, 22], [12, 19]];
    c.shPoly(WG, WING);
    if (f.atk) { c.line(13, 15, 28, 6, VEIN); c.line(18, 14, 21, 9, VEIN); c.line(22, 12, 26, 7, VEIN); c.shPoly([[12, 16], [28, 10], [30, 13], [15, 19]], WING); c.line(15, 17, 28, 12, VEIN); }
    else {
      const o = f.idle ? -1 : 0;
      c.line(12, 15, 29, 16 + o, VEIN); c.line(13, 18, 27, 20 + o, VEIN); c.line(18, 15, 19, 19, VEIN); c.line(24, 16 + o, 25, 20 + o, VEIN);
      c.px([[14, 14], [20, 14 + o], [26, 15 + o]], WHITE);
    }
    patch(c, 24, 17, 2.4, 1.8); patch(c, 14, 22, 2, 1.5, false); drip(c, 16, 24, 2);
    // big bulging eye
    c.sh(6.5, 16.5, 2.6, 2.4, [GLOAM[0], GLOAM[1], GLOAM[2]]);
    if (f.hurt) sqEye(c, 5, 15, 3); else gEye(c, 5, 15, 3, 3);
    // tiny grumpy mouth
    if (f.atk) { c.px([[4, 20], [5, 21], [4, 22]], INK); c.set(5, 20, '#6a2030'); } else c.px([[4, 21], [5, 21], [6, 22]], INK);
  });
  // shrill buzz rings on attack
  if (f.atk) { c.px([[3, 8], [2, 9], [2, 10], [3, 11]], GLOW.core); c.px([[1, 6], [0, 8], [0, 9], [0, 10], [0, 11], [1, 13]], GLOW.mid); c.noOut.add(GLOW.core); }
  c.outline();
  if (f.hurt) ouch(c, 3, 11);
  return bake(c);
}

// ---------------------------------------------------------------- summer elite: en_hornetknight (40)
function en_hornetknight(f) {
  const c = canvas(40, 40);
  const YEL = ['#8a5a10', '#d09020', '#f2c040', '#ffe08a'];
  const BLK = ['#17131a', '#2a2330', '#443a4c', '#5e5468'];
  const WING = ['#9ab4c4', '#cfe2ec', '#f2fbff'];
  const THORN = ['#3e4e24', '#5e7634', '#86a04c', '#b4c878'];
  const PLUME = ['#8f2a2a', PAL.red, '#f07a5e'];
  const dx = f.atk ? -2 : f.hurt ? 2 : 0, dy = f.idle ? 1 : 0;
  // legs
  const Lg = BLK[1];
  for (const pts of [[[17, 28], [15, 33], [14, 37]], [[21, 29], [22, 33], [21, 37]], [[26, 29], [29, 33], [30, 37]]]) c.tube(pts.map(([x, y], i) => [x + (i ? 0 : dx), y]), 0.7, BLK);
  c.hline(12, 14, 37, Lg); c.hline(20, 22, 37, Lg); c.hline(30, 32, 37, Lg);
  c.at(dx, dy, () => {
    // wings (behind), flutter on idle
    const wo = f.idle ? 2 : 0;
    c.shPoly([[19, 16], [26, 2 + wo], [33, 2 + wo], [25, 17]], WING);
    c.shPoly([[21, 17], [35, 9 + wo], [38, 12 + wo], [27, 19]], WING);
    c.line(21, 15, 29, 3 + wo, '#7c98aa'); c.line(23, 17, 36, 11 + wo, '#7c98aa');
    // abdomen with stripes + stinger
    c.shPoly([[34, 29], [38.5, 33.5], [33, 32]], BLK);
    c.sh(29.5, 25.5, 7.4, 6.4, YEL);
    c.onto(() => { for (const s of [27, 31.5, 36]) { c.line(s, 18, s - 2.5, 33, BLK[1]); c.line(s + 1, 18, s - 1.5, 33, BLK[1]); } }, YEL);
    patch(c, 31, 22, 2.6, 2); drip(c, 30, 31, 3); drip(c, 25, 30, 2);
    // armored thorax
    c.sh(20, 22.5, 6, 5.8, BLK);
    c.sh(18.6, 21.6, 5, 4.8, METAL);
    c.px([[16, 19], [20, 18], [22, 23]], METAL[3]);
    c.hline(14, 23, 25, METAL[0]); c.set(18, 23, PAL.gold);
    // head + helmet
    c.sh(12, 15, 6, 5.6, YEL);
    c.sh(12.5, 11.5, 6.4, 4.4, METAL);
    c.hline(6, 19, 13, METAL[0]); c.hline(6, 18, 12, METAL[2]); c.set(6, 12, METAL[1]);
    c.px([[10, 8], [11, 8]], METAL[3]);
    c.tube([[15, 8], [18, 4], [22, 3], [24, 5]], 1.6, PLUME, 0.8);
    c.line(8, 9, 5, 4, BLK[1]); c.set(4, 3, BLK[2]);
    if (f.hurt) sqEye(c, 7, 14, 3); else gEye(c, 7, 14, 3, 3);
    c.px([[6, 20], [7, 20], [8, 21]], BLK[0]); c.px([[10, 20], [10, 21]], BLK[0]);
    c.set(10, 18, BLUSH); c.set(11, 18, BLUSH);
  });
  // thorn lance, held level in front (thrust on attack)
  const lx = dx + (f.atk ? -1 : 0), ly = dy;
  c.at(lx, ly, () => {
    c.tube([[34, 28], [6, 23]], 1.2, THORN, 0.8);
    for (const x of [10, 15, 20, 29]) { const y = Math.round(28 - (34 - x) * 5 / 28) - 1; c.set(x, y - 1, '#efe0b8'); c.set(x - 1, y - 2, '#efe0b8'); }
    c.shPoly([[1.5, 22], [7, 21], [7, 25]], ['#8a7a58', '#cfc098', '#f3ead0']);
    c.shPoly([[24, 22], [27, 24], [26, 30], [23, 28]], LEAF); // leaf vamplate
    c.line(24, 23, 25, 29, LEAF[0]);
    c.tube([[19, 24], [22, 26]], 1.4, BLK);
    c.sh(22, 26, 1.6, 1.6, BLK);
  });
  c.outline();
  if (f.hurt) ouch(c, 3, 9);
  return bake(c);
}

// ---------------------------------------------------------------- fall: en_strawling
function en_strawling(f) {
  const c = canvas(32, 32);
  const BURLAP = ['#7a5a32', '#a8844e', '#cfae74', '#ecd4a0'];
  const HAT = ['#2e1e14', '#4a3222', '#6a4a32'];
  const SHIRT = ['#3a5226', '#56733a', '#6f9448'];
  const PATCH = ['#4d3566', '#7a5aa8', '#9e82c8'];
  const dx = f.atk ? -2 : f.hurt ? 2 : 0, dy = f.idle ? 1 : 0;
  // stick legs + straw feet
  c.tube([[14, 24], [13, 29]], 0.8, WOOD); c.tube([[18, 24], [19, 29]], 0.8, WOOD);
  for (const x of [13, 19]) c.px([[x - 1, 29], [x, 29], [x + 1, 29], [x - 2, 28]], STRAW[1]);
  c.at(dx, dy, () => {
    // arms: crossbar (flail up on attack)
    const arms = f.atk ? [[[16, 19], [6, 12]], [[16, 19], [26, 12]]] : f.hurt ? [[[16, 19], [7, 22]], [[16, 19], [26, 16]]] : [[[16, 19], [6, 18]], [[16, 19], [26, 18]]];
    for (const [a, b] of arms) {
      c.tube([a, b], 0.9, WOOD);
      const [x, y] = b, s = b[0] < 16 ? -1 : 1;
      for (const [ax, ay] of [[3, -2], [3, 0], [3, 2], [2, 3], [2, -3]]) c.line(x, y, x + s * ax, y + ay, STRAW[(ax + ay + 4) % 3 + 1]);
    }
    // shirt
    c.shPoly([[11, 17], [21, 17], [22, 25], [10, 25]], SHIRT);
    c.rect(17, 20, 3, 3, PATCH[1]); c.set(17, 20, PATCH[2]); c.px([[16, 20], [16, 22], [20, 21]], INK2);
    for (let x = 10; x <= 22; x += 2) c.vline(x, 25, 26 + (x % 4 ? 1 : 0), STRAW[x % 3 + 1]);
    patch(c, 13, 22, 2.2, 1.8); drip(c, 12, 25, 2);
    // sack head
    c.sh(16, 12.3, 6.2, 5.6, BURLAP);
    c.onto(() => { for (const [x, y] of [[12, 9], [15, 8], [19, 10], [13, 14], [20, 14], [17, 16]]) c.set(x, y, BURLAP[0]); }, BURLAP);
    c.px([[20, 7], [21, 8], [21, 9], [22, 10]], BURLAP[0]); // seam
    // straw hair poking out
    for (const [x, y, x2, y2] of [[10, 10, 7, 10], [10, 12, 7, 13], [22, 10, 25, 10], [22, 12, 25, 13]]) c.line(x, y, x2, y2, STRAW[2]);
    // twine at neck
    c.hline(12, 20, 17, STRAW[0]);
    // floppy hat with a bent tip (flops the other way when hurt)
    c.sh(16, 7.5, 8.2, 1.7, HAT);
    c.shPoly(f.hurt ? [[12, 7], [20, 7], [19, 3], [21, 1], [23, 2], [17, 1], [14, 3]] : [[12, 7], [20, 7], [18, 3], [14, 1], [11, 1], [15, 3.5]], HAT);
    c.rect(17, 5, 2, 2, PATCH[1]);
    c.hline(9, 23, 8, HAT[0]);
    // face: glowing button eyes, stitched grump
    if (f.hurt) { sqEye(c, 11, 10, 3); sqEye(c, 16, 10, 3); }
    else { gEye(c, 11, 10, 2, 2); gEye(c, 16, 10, 2, 2); }
    if (f.atk) { c.rect(12, 14, 5, 2, '#3a2418'); c.px([[12, 14], [14, 14], [16, 14]], STRAW[3]); }
    else c.px([[11, 15], [12, 14], [13, 15], [14, 14], [15, 15], [16, 14], [17, 15]], INK);
    c.set(10, 13, BLUSH); c.set(19, 13, BLUSH);
  });
  // straw bits flying on hurt/attack
  if (f.hurt) c.px([[6, 6], [27, 9], [26, 22]], STRAW[2]);
  if (f.atk) c.px([[2, 8], [29, 7], [8, 5]], STRAW[2]);
  c.outline();
  if (f.hurt) ouch(c, 4, 13);
  return bake(c);
}

// ---------------------------------------------------------------- fall elite: en_rustboar (40)
function en_rustboar(f) {
  const c = canvas(40, 40);
  const HIDE = ['#2e1c18', '#4a2e24', '#6a4434', '#8a5c48'];
  const RUST = ['#6a2a14', '#a0441e', '#d0662a', '#f09048'];
  const SNOUT = ['#8a4a44', '#c07a6e', '#e0a494'];
  const PLOW = ['#4a3e3a', '#7a6e68', '#aaa29c', '#dcd6d0'];
  const DUST = ['#c8a67c', '#e0c8a0'];
  for (const d of DUST) c.noOut.add(d);
  const dx = f.atk ? -3 : f.hurt ? 2 : 0, dy = f.idle ? 1 : 0;
  // legs + hooves
  const legs = f.atk ? [[11, 31, 7], [16, 32, 12.5], [28, 32, 29.5], [33, 31, 34.5]] : [[11, 31, 11], [16, 32, 16], [28, 32, 28], [33, 31, 33.5]];
  for (const [x, y, x2] of legs) { c.tube([[x + dx, y + dy], [x2, 35.5]], 2, HIDE); c.sh(x2, 36.6, 2, 1, [INK2, '#5a4a44', '#7a6a64']); }
  if (f.atk) { c.sh(37.5, 36.5, 1.6, 1.3, DUST); c.sh(38, 34, 1, 1, DUST); }
  c.at(dx, dy, () => {
    // curly tail
    c.px([[37, 23], [38, 22], [38, 21], [37, 20], [36, 21]], HIDE[2]);
    c.sh(24, 24.5, 13, 8.5, HIDE);
    // rusty bristle mane
    for (let x = 13; x <= 34; x += 2.3) {
      const top = 24.5 - 8.5 * Math.sqrt(Math.max(0, 1 - ((x - 24) / 13) ** 2));
      c.tube([[x, top + 3], [x + 1.6, top - 3 - ((x * 3) % 2)]], 1.4, RUST, 0.4);
    }
    c.onto(() => c.sh(24, 30, 10, 2.5, [HIDE[0], HIDE[1]]), HIDE);
    patch(c, 28, 24, 4, 3); patch(c, 33, 28, 2.2, 2, false); patch(c, 19, 21, 2, 1.6, false);
    drip(c, 30, 31, 3); drip(c, 21, 32, 2);
    const hd = f.atk ? 1 : 0;
    c.at(0, hd, () => {
      // head (a shade lighter than the body so the face reads)
      const FACE = ['#4a2e24', '#6a4434', '#8a5c48', '#a87a62'];
      c.sh(12, 25.5, 7.6, 6.8, FACE);
      c.shPoly([[12, 16], [17, 19], [13, 21]], FACE); c.set(14, 19, SNOUT[1]); c.set(14, 20, SNOUT[0]);
      c.tube([[10, 19.5], [13, 18.5]], 0.8, RUST, 0.4);
      // snout disc
      c.sh(5.4, 28, 2.6, 3.4, SNOUT);
      c.set(4, 27, INK); c.set(4, 29, INK);
      if (f.hurt) sqEye(c, 8, 22, 3); else gEye(c, 8, 22, 3, 2);
      c.px([[8, 32], [9, 31], [10, 31], [11, 32]], INK);
      c.set(12, 29, BLUSH); c.set(13, 29, BLUSH);
      // plow-share tusks: curved iron blades sweeping up past the snout
      const TUSK = ['#7a706a', '#b4aca6', '#dcd8d2', '#fbf8f2'];
      c.tube([[12.5, 31.5], [11, 27.5], [11.5, 24]], 1.3, [TUSK[0], TUSK[1], TUSK[2]], 0.6);
      c.tube([[10, 33], [6, 33], [3, 30.5], [2.2, 26.5], [3, 22.5]], 1.9, TUSK, 0.7);
      c.px([[5, 34], [3, 29]], RUST[1]); c.set(4, 33, RUST[2]); c.set(2, 28, RUST[0]);
    });
  });
  c.outline();
  if (f.hurt) ouch(c, 5, 16);
  return bake(c);
}

// ---------------------------------------------------------------- winter: en_frostmoth
function en_frostmoth(f) {
  const c = canvas(32, 32);
  const WF = ['#5a7ea8', '#8fb9d9', '#bfe3f2', '#f4f8ff'];
  const FUZZ = ['#b8c8dc', '#e0e8f4', '#ffffff'];
  const SPOT = [PAL.purple, PAL.lilac, '#d8ccff'];
  const dx = f.atk ? -2 : f.hurt ? 2 : 0, dy = f.idle ? 1 : 0;
  const wy = f.idle ? 2 : f.atk ? -2 : 0;
  const M = (pts, s) => pts.map(([x, y]) => [s < 0 ? x : 32 - x, y]);
  c.at(dx, dy, () => {
    for (const s of [-1, 1]) {
      c.shPoly(M([[15, 15], [5, 4 + wy], [2, 7 + wy], [2.5, 12 + wy / 2], [5, 17], [14, 18]], s), WF);
      c.shPoly(M([[15, 17], [7, 18], [5, 22], [7, 26 - (wy < 0 ? 1 : 0)], [11, 26], [15, 21]], s), WF);
      const X = x => (s < 0 ? x : 31 - x);
      c.line(X(14), 15, X(5), 7 + wy, WF[1]); c.line(X(13), 17, X(4), 13 + wy / 2, WF[1]); c.line(X(14), 19, X(8), 24, WF[1]);
      c.sh(s < 0 ? 7 : 25, 10 + wy / 2, 1.8, 1.8, SPOT);
      c.sh(s < 0 ? 9 : 23, 22.5, 1.2, 1.2, SPOT);
      for (const [x, y] of [[4, 6 + wy], [3, 10 + wy], [5, 16], [7, 25]]) c.set(X(x), y, WF[3]);
    }
    patch(c, 23, 21, 2, 1.8); patch(c, 26, 7, 1.6, 1.4, false);
    // fuzzy body
    c.sh(16, 19, 2.8, 6.2, FUZZ);
    c.onto(() => { for (const y of [19, 22]) c.hline(14, 18, y, FUZZ[0]); }, FUZZ);
    drip(c, 16, 25, 2);
    // head turned left + feathery antennae
    c.sh(14, 11.5, 3.8, 3.3, ['#4e6a92', '#7a96bc', '#a8bedc']);
    c.path([[12, 8], [10, 5], [7, 3]], WF[0]); c.path([[15, 8], [15, 5], [13, 2]], WF[0]);
    c.px([[9, 3], [8, 5], [11, 6], [14, 3], [16, 3], [14, 6]], WF[1]);
    if (f.hurt) { sqEye(c, 10, 10, 2); sqEye(c, 14, 10, 2); }
    else { gEye(c, 11, 10, 2, 2); gEye(c, 15, 10, 2, 2); }
    if (f.atk) { c.rect(12, 13, 3, 1, '#6a2030'); } else c.px([[12, 13], [13, 13], [14, 14]], INK);
    c.set(10, 13, BLUSH); c.set(16, 13, BLUSH);
  });
  // ice sparkles
  const sp = f.atk ? [[1, 12], [2, 15], [0, 18], [3, 20], [1, 23]] : [[3, 28], [28, 27], [29, 2]];
  for (const [x, y] of sp) c.set(x + (f.atk ? 0 : 0), y, WF[3]);
  c.noOut.add(WF[3]);
  c.outline();
  if (f.hurt) ouch(c, 5, 5);
  return bake(c);
}

// ---------------------------------------------------------------- winter elite: en_snowbear (40)
function en_snowbear(f) {
  const c = canvas(40, 40);
  const FUR = ['#7e8eae', '#aebed6', '#dae4f2', '#f8fbff'];
  const MUZ = ['#b8a898', '#e0d4c4', '#f6eee2'];
  const dx = f.atk ? -2 : f.hurt ? 2 : 0, dy = f.idle ? 1 : 0;
  // legs + paws
  const legs = [[30, 31, 30], [35, 30, 35.5], [18, 31, 18]];
  for (const [x, y, x2] of legs) { c.tube([[x + dx, y], [x2, 35.5]], 2.6, FUR); c.sh(x2, 36.4, 2.8, 1.3, FUR); }
  if (f.atk) {
    c.tube([[11 + dx, 30], [6, 35.5]], 2.6, FUR); c.sh(5.5, 36.4, 2.8, 1.3, FUR); c.px([[3, 37], [5, 37], [7, 37]], FUR[0]);
  } else { c.tube([[11 + dx, 31], [11, 35.5]], 2.6, FUR); c.sh(11, 36.4, 2.8, 1.3, FUR); c.px([[9, 37], [11, 37], [13, 37]], FUR[0]); }
  c.at(dx, dy, () => {
    c.sh(24, 25.5, 14, 9.2, FUR);
    // shaggy fringes
    for (let x = 13; x <= 36; x += 2) { c.set(x, 35 - (x % 4 ? 0 : 1), FUR[1]); }
    c.onto(() => { for (let x = 14; x < 37; x += 3) c.line(x, 28, x + 1, 32, FUR[1]); }, FUR);
    // gloam mantle over the shoulders
    c.shPoly([[13, 17], [22, 14], [31, 15], [37, 20], [37.5, 27], [33, 30], [29, 26], [24, 29], [19, 25], [14, 24]], GLOAM);
    c.onto(() => { c.line(20, 16, 34, 18, GLOAM[3]); c.line(22, 20, 33, 25, GLOAM[0]); }, GLOAM);
    c.px([[25, 19], [31, 22], [21, 23]], GLOW.mid); c.set(34, 20, GLOW.core);
    drip(c, 33, 30, 3); drip(c, 24, 29, 3); drip(c, 19, 25, 2); drip(c, 37, 27, 2);
    // head
    c.sh(6.5, 14.5, 2.2, 2.2, FUR); c.sh(13.5, 13.5, 2.2, 2.2, FUR);
    c.set(6, 14, '#e0a494'); c.set(13, 13, '#e0a494');
    c.sh(10, 20.5, 7, 6.2, FUR);
    c.sh(4.8, 23.3, 3.2, 2.5, MUZ);
    c.sh(2.6, 22.2, 1.5, 1.2, [INK, '#4a3a40', '#8a7a86']);
    if (f.atk) { c.rect(3, 25, 4, 2, '#5a2030'); c.set(3, 25, WHITE); c.set(6, 25, WHITE); }
    else c.px([[3, 26], [4, 25], [5, 25], [6, 26]], INK);
    if (f.hurt) sqEye(c, 7, 18, 3); else gEye(c, 7, 18, 3, 2);
    c.set(9, 23, BLUSH); c.set(10, 23, BLUSH);
    // mantle clasp
    c.sh(15, 22, 1.5, 1.5, [GLOW.rim, GLOW.mid, GLOW.core]);
  });
  c.outline();
  if (f.atk) { c.px([[1, 21], [0, 23], [1, 24]], '#e8f4ff'); c.noOut.add('#e8f4ff'); }
  if (f.hurt) ouch(c, 4, 13);
  return bake(c);
}

registerSprites({
  ...frames('pc_pell', pc_pell),
  portrait_farmer: portrait_farmer(),
  ...frames('en_mudpup', en_mudpup),
  ...frames('en_rookmother', en_rookmother),
  ...frames('en_cicada', en_cicada),
  ...frames('en_hornetknight', en_hornetknight),
  ...frames('en_strawling', en_strawling),
  ...frames('en_rustboar', en_rustboar),
  ...frames('en_frostmoth', en_frostmoth),
  ...frames('en_snowbear', en_snowbear),
});
