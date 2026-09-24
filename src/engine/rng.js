// Small seeded RNG (mulberry32) with helpers.
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = () => next();
  rng.int = (a, b) => a + Math.floor(next() * (b - a + 1));
  rng.pick = arr => arr[Math.floor(next() * arr.length)];
  rng.shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  rng.weighted = table => { // { key: weight }
    const entries = Object.entries(table);
    let total = entries.reduce((a, [, w]) => a + w, 0);
    let r = next() * total;
    for (const [k, w] of entries) { if ((r -= w) < 0) return k; }
    return entries[entries.length - 1][0];
  };
  rng.state = () => s;
  rng.setState = v => { s = v >>> 0; };
  return rng;
}

export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

// Stable 32-bit string hash (FNV-1a with a final avalanche). Used for daily seeds.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
