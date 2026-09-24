// Persistent meta (bramblewick2.meta): friendship, records, unlocks, compendium, daily scores.
// 1.0 friendship ('bramblewick.meta.v1') is imported once, read-only. We never write a 1.0 key.
import { store, load } from './storage.js';

export const META_KEY = 'bramblewick2.meta';
export const META_V1_KEY = 'bramblewick.meta.v1';
export const MAX_YEAR = 10;

export function defaultMeta() {
  return {
    v: 2, friendship: {}, runs: 0, wins: 0, bestSeason: -1,
    yearsUnlocked: { farmer: 0, pell: 0 }, bossesMended: [],
    seen: { cards: [], enemies: [], keepsakes: [] }, tipsSeen: [], daily: {},
    imported1: false,
  };
}

// Fill any missing fields (older 2.0 saves, hand-edited storage) without dropping unknown ones.
export function migrateMeta(m) {
  const d = defaultMeta();
  if (!m || typeof m !== 'object') return d;
  const out = { ...d, ...m };
  out.friendship = { ...(m.friendship || {}) };
  out.yearsUnlocked = { ...d.yearsUnlocked, ...(m.yearsUnlocked || {}) };
  out.bossesMended = Array.isArray(m.bossesMended) ? [...m.bossesMended] : [];
  out.seen = { ...d.seen, ...(m.seen || {}) };
  for (const k of ['cards', 'enemies', 'keepsakes']) if (!Array.isArray(out.seen[k])) out.seen[k] = [];
  out.tipsSeen = Array.isArray(m.tipsSeen) ? [...m.tipsSeen] : [];
  out.daily = { ...(m.daily || {}) };
  out.v = 2;
  return out;
}

// One-time import of 1.0 friendship. Only friendship carries over (per PLAN-2.0).
export function importV1(meta, v1) {
  if (meta.imported1) return meta;
  meta.imported1 = true;
  if (v1 && v1.friendship && typeof v1.friendship === 'object') {
    for (const [k, n] of Object.entries(v1.friendship)) {
      if (typeof n === 'number' && n > 0) meta.friendship[k] = Math.max(meta.friendship[k] || 0, n);
    }
  }
  return meta;
}

export function loadMeta() {
  const saved = load(META_KEY);
  if (saved) return migrateMeta(saved);
  const meta = importV1(defaultMeta(), load(META_V1_KEY));
  saveMeta(meta);
  return meta;
}
export const saveMeta = meta => store(META_KEY, meta);

export function friendshipTier(n = 0) { return n >= 7 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0; }

// entry: any card / keepsake / character def (or anything with an optional `unlock`).
// unlock: { villager, tier } | { boss }. No meta = only always-available entries.
export function isUnlocked(entry, meta) {
  const u = entry && entry.unlock;
  if (!u) return true;
  if (!meta) return false;
  if (u.villager) return friendshipTier((meta.friendship || {})[u.villager] || 0) >= (u.tier ?? 1);
  if (u.boss) return (meta.bossesMended || []).includes(u.boss);
  return true;
}

export function markSeen(meta, kind, id) {
  if (!meta.seen) meta.seen = { cards: [], enemies: [], keepsakes: [] };
  const list = meta.seen[kind] || (meta.seen[kind] = []);
  if (id && !list.includes(id)) { list.push(id); return true; }
  return false;
}

export function recordRunStart(meta) { meta.runs = (meta.runs || 0) + 1; return meta; }

// Call once when a run ends (won = the winter boss was mended). Returns what changed, for UI toasts.
export function recordRunEnd(meta, run, won, score = null) {
  const changes = { newBosses: [], yearUnlocked: null, dailyBest: false };
  meta.bestSeason = Math.max(meta.bestSeason ?? -1, run.seasonIdx ?? 0);
  if (won) meta.wins = (meta.wins || 0) + 1;
  for (const b of run.bossesMended || []) {
    if (!meta.bossesMended.includes(b)) { meta.bossesMended.push(b); changes.newBosses.push(b); }
  }
  const ch = run.character || 'farmer';
  if (won && !run.daily) {
    const cur = meta.yearsUnlocked[ch] || 0;
    const next = Math.min(MAX_YEAR, Math.max(cur, (run.year || 0) + 1));
    if (next > cur) { meta.yearsUnlocked[ch] = next; changes.yearUnlocked = next; }
  }
  if (run.daily && score != null) {
    if (meta.daily[run.daily] == null || score > meta.daily[run.daily]) { meta.daily[run.daily] = score; changes.dailyBest = true; }
  }
  return changes;
}
