// Run modifiers (Harder Years + Daily Almanac), daily seeds, and scoring. Content defines the modifier
// sets in src/data/modes.js (YEARS, DAILY_MODS); the engine merges and applies them.
import { YEARS, DAILY_MODS } from './content.js';
import { hashString, makeRng } from './rng.js';

export const MOD_DEFAULTS = Object.freeze({
  enemyHpMult: 1, eliteHpMult: 1, bossHpMult: 1, enemyDmgAdd: 0,
  startHpLoss: 0, maxHpAdd: 0, coinMult: 1, restHealMult: 1, shopPriceMult: 1,
  cardChoicesAdd: 0, startGloom: 0, weatherWeights: {}, eliteExtraMove: false,
  startRareCard: false, startCoin: 0,
});

// Merge rules: *Mult keys multiply, booleans OR, weatherWeights sum per weather, other numbers sum.
export function mergeMods(list) {
  const out = { ...MOD_DEFAULTS, weatherWeights: {} };
  for (const mods of list) {
    if (!mods) continue;
    for (const [k, v] of Object.entries(mods)) {
      if (k === 'weatherWeights') {
        for (const [w, n] of Object.entries(v || {})) out.weatherWeights[w] = (out.weatherWeights[w] || 0) + (+n || 0);
      } else if (typeof v === 'boolean') out[k] = !!out[k] || v;
      else if (typeof v === 'number') out[k] = k.endsWith('Mult') ? (out[k] ?? 1) * v : (out[k] || 0) + v;
    }
  }
  return out;
}

// Harder Years are cumulative: Year 3 applies the mods of YEARS entries n = 1, 2 and 3.
export function yearMods(year) {
  return YEARS.filter((y, i) => (y.n ?? i + 1) <= (year || 0)).map(y => y.mods);
}
export function dailyModDefs(ids = []) { return ids.map(id => DAILY_MODS.find(d => d.id === id)).filter(Boolean); }

// run.customMods (optional object) is merged last: tests, the tutorial, or a custom mode can use it.
export function applyMods(run) {
  run.mods = mergeMods([...yearMods(run.year), ...dailyModDefs(run.dailyMods).map(d => d.mods), run.customMods]);
  return run.mods;
}
export const runMods = run => run.mods || applyMods(run);

// ---------- daily ----------
export function todayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const dailySeed = key => hashString(key);
// Two distinct DAILY_MODS picked by the date (a separate stream from the run seed).
export function dailyModIds(key, count = 2) {
  const rng = makeRng(hashString('mods:' + key));
  const ids = DAILY_MODS.map(d => d.id);
  rng.shuffle(ids);
  return ids.slice(0, Math.min(count, ids.length));
}

// ---------- score ----------
// floors*10 + bosses*100 + hp + coin/5 - turns (floors = nodes entered across the whole year).
export function scoreRun(run) {
  const floors = run.floorsCleared || 0;
  const bosses = run.stats?.bosses ?? (run.bossesMended || []).length;
  const turns = run.stats?.turns || 0;
  return Math.max(0, Math.round(floors * 10 + bosses * 100 + Math.max(0, run.hp || 0) + Math.floor((run.coin || 0) / 5) - turns));
}
