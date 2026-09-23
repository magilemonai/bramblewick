// Pixel sprite registry + renderer.
// Sprites are authored as rows of characters mapped through a per-sprite palette.
// Registration is DOM-free so tools/sprite-sheet.mjs can render sheets in Node.

export const PAL = {
  ink: '#2a1d1a', inkSoft: '#4a3228',
  cream: '#fff4d6', parchment: '#f3e2b3', parchDark: '#d9bf85',
  wood: '#8a5a3b', woodDark: '#5e3b26', woodLight: '#b98356',
  leaf: '#6fae4a', leafDark: '#3f7a3a', leafLight: '#a8d66a', moss: '#56733a',
  sky: '#9fd8e8', skyDeep: '#5aa6c9', water: '#4a8fc4',
  sun: '#ffd35c', gold: '#f2b53a', orange: '#e8873a', rust: '#b8522e',
  red: '#d6453d', berry: '#a8325c', pink: '#f29bb0', rose: '#e0667f',
  lilac: '#b69ae0', purple: '#7a5aa8', plum: '#4d3566',
  gloom: '#5b5470', gloomDark: '#3a3448', gloomGlow: '#9e8fd1',
  snow: '#f4f8ff', ice: '#bfe3f2', frost: '#8fb9d9',
  stone: '#8e8a86', stoneDark: '#5c5855',
  skin: '#f2c29b', skinShade: '#d69a74', blush: '#e8837a',
  white: '#ffffff',
};

const registry = new Map();
const pixelCache = new Map(); // id -> {w,h,data:Uint8ClampedArray}
const canvasCache = new Map();
const urlCache = new Map();

export function registerSprites(defs) {
  for (const [id, def] of Object.entries(defs)) registry.set(id, def);
}
export function hasSprite(id) { return registry.has(id); }
export function spriteIds() { return [...registry.keys()]; }

function hexToRgba(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), a];
}

// Resolve a sprite definition to raw RGBA pixels at 1x. Pure (no DOM).
export function spritePixels(id) {
  if (pixelCache.has(id)) return pixelCache.get(id);
  const def = registry.get(id);
  if (!def) return null;
  let out;
  if (def.from) {
    // Palette-swap variant: { from: 'baseId', swap: { '#old': '#new' } }
    const base = spritePixels(def.from);
    if (!base) return null;
    const data = new Uint8ClampedArray(base.data);
    const swaps = Object.entries(def.swap || {}).map(([a, b]) => [hexToRgba(a), hexToRgba(b)]);
    for (let i = 0; i < data.length; i += 4) {
      for (const [a, b] of swaps) {
        if (data[i] === a[0] && data[i + 1] === a[1] && data[i + 2] === a[2] && data[i + 3] > 0) {
          data[i] = b[0]; data[i + 1] = b[1]; data[i + 2] = b[2]; break;
        }
      }
    }
    out = { w: base.w, h: base.h, data };
  } else {
    const rows = def.rows;
    const h = rows.length;
    const w = def.w || Math.max(...rows.map(r => r.length));
    const data = new Uint8ClampedArray(w * h * 4);
    const pal = {};
    for (const [k, v] of Object.entries(def.palette || {})) pal[k] = hexToRgba(v);
    rows.forEach((row, y) => {
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === undefined || ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (!c) continue;
        const i = (y * w + x) * 4;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c[3];
      }
    });
    if (def.outline) {
      const oc = hexToRgba(def.outline === true ? PAL.ink : def.outline);
      const src = new Uint8ClampedArray(data);
      const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
          const i = (y * w + x) * 4;
          data[i] = oc[0]; data[i + 1] = oc[1]; data[i + 2] = oc[2]; data[i + 3] = 255;
        }
      }
    }
    out = { w, h, data };
  }
  pixelCache.set(id, out);
  return out;
}

function missing(scale) {
  const c = document.createElement('canvas');
  c.width = c.height = 16 * scale;
  const g = c.getContext('2d');
  g.fillStyle = '#ff00ff'; g.fillRect(0, 0, c.width, c.height);
  return c;
}

// Returns a (cached) canvas at integer scale. opts.flip mirrors horizontally.
export function getSprite(id, scale = 1, opts = {}) {
  const key = `${id}|${scale}|${opts.flip ? 1 : 0}`;
  if (canvasCache.has(key)) return canvasCache.get(key);
  const def = registry.get(id);
  let c;
  if (!def) {
    console.warn('[pixel] missing sprite', id);
    c = missing(scale);
  } else if (def.draw) {
    c = document.createElement('canvas');
    c.width = def.w * scale; c.height = def.h * scale;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.scale(scale, scale);
    def.draw(g, PAL);
  } else {
    const px = spritePixels(id);
    const base = document.createElement('canvas');
    base.width = px.w; base.height = px.h;
    base.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.data), px.w, px.h), 0, 0);
    c = document.createElement('canvas');
    c.width = px.w * scale; c.height = px.h * scale;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    if (opts.flip) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(base, 0, 0, c.width, c.height);
  }
  canvasCache.set(key, c);
  return c;
}

export function spriteSize(id) {
  const def = registry.get(id);
  if (!def) return { w: 16, h: 16 };
  if (def.draw) return { w: def.w, h: def.h };
  const px = spritePixels(id);
  return { w: px.w, h: px.h };
}

export function spriteURL(id, scale = 1, opts = {}) {
  const key = `${id}|${scale}|${opts.flip ? 1 : 0}`;
  if (!urlCache.has(key)) urlCache.set(key, getSprite(id, scale, opts).toDataURL());
  return urlCache.get(key);
}

// <img> that stays crisp at any CSS size.
export function spriteImg(id, scale = 4, className = '', opts = {}) {
  const img = new Image();
  img.src = spriteURL(id, scale, opts);
  img.className = 'px ' + className;
  img.alt = '';
  img.draggable = false;
  const s = spriteSize(id);
  img.dataset.w = s.w; img.dataset.h = s.h;
  return img;
}
