// Run state + persistence. 2.0 storage keys only (bramblewick2.*); 1.0's keys are never written.
import { makeRng, newSeed } from './rng.js';
import { generateMap } from './map.js';
import { store, load, drop } from './storage.js';
import { characterDef, CARDS, CHARACTERS } from './content.js';
import { applyMods, todayKey, dailySeed, dailyModIds } from './modes.js';
import { cardPool } from './rewards.js';

export { loadMeta, saveMeta, isUnlocked, friendshipTier, recordRunStart, recordRunEnd, markSeen, defaultMeta } from './meta.js';

export const SEASON_ORDER = ['spring', 'summer', 'fall', 'winter'];
export const RUN_KEY = 'bramblewick2.run';
export const SETTINGS_KEY = 'bramblewick2.settings';

let uidCounter = 1;
export const uid = () => `c${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

// newRun({ character, year, daily, meta })  (1.0 form newRun({ starterDeck, starterKeepsake }) still works)
//   character: CHARACTERS id (default 'farmer'); year: Harder Year 0-10; daily: 'YYYY-MM-DD' | true (today) | null
//   meta: current meta, snapshotted into run.unlock for reward-pool gating. customMods: extra modifier object.
// Keepsake pickup effects (mods.maxHp, pickup()) are NOT applied here; the caller runs them for the starter
// keepsake exactly as for any other gained keepsake (see runapi.gainKeepsake).
export function newRun(opts = {}) {
  const { character = 'farmer', meta = null } = opts;
  const daily = opts.daily === true ? todayKey() : opts.daily || null;
  const year = daily ? 0 : Math.max(0, Math.min(10, opts.year || 0));
  const seed = opts.seed != null ? opts.seed >>> 0 : daily ? dailySeed(daily) : newSeed();
  const ch = characterDef(character);
  const starterDeck = opts.starterDeck || ch.starterDeck;
  const starterKeepsake = opts.starterKeepsake || ch.starterKeepsake;
  const rng = makeRng(seed);
  const run = {
    v: 2, seed, rngState: 0,
    character: CHARACTERS[character] ? character : 'farmer', year, daily, dailyMods: daily ? dailyModIds(daily) : [],
    seasonIdx: 0,
    hp: ch.hp || 72, maxHp: ch.hp || 72, coin: 99,
    deck: starterDeck.map(id => ({ id, u: false, uid: uid() })),
    keepsakes: starterKeepsake ? [starterKeepsake] : [],
    preserves: [null, null, null],
    map: generateMap(rng),
    pos: null,
    visited: [],
    floorsCleared: 0,
    seasonFights: 0,
    removeCost: 75,
    seenEvents: [],
    bossesMended: [],
    // Daily runs ignore unlocks so everyone draws from the same pools on the same seed.
    unlock: meta && !daily ? { friendship: { ...(meta.friendship || {}) }, bossesMended: [...(meta.bossesMended || [])] } : null,
    stats: { fights: 0, mended: 0, blooms: 0, cardsPlayed: 0, damage: 0, turns: 0, bosses: 0, started: Date.now() },
  };
  run.rngState = rng.state();
  if (opts.customMods) run.customMods = opts.customMods;
  applyStartMods(run);
  return run;
}

// One-time start effects of run.mods (called by newRun).
export function applyStartMods(run) {
  const m = applyMods(run);
  run.maxHp = Math.max(1, run.maxHp + (m.maxHpAdd || 0));
  run.hp = Math.max(1, Math.min(run.maxHp, run.maxHp - (m.startHpLoss || 0)));
  run.coin = Math.max(0, run.coin + (m.startCoin || 0));
  for (let k = 0; k < (m.startGloom || 0); k++) if (CARDS.gloom) run.deck.push({ id: 'gloom', u: false, uid: uid() });
  if (m.startRareCard) {
    const pool = cardPool(run, { rarity: 'rare' });
    if (pool.length) run.deck.push({ id: runRng(run).pick(pool), u: false, uid: uid() });
  }
  return run;
}

export function runRng(run) {
  const r = makeRng(run.seed);
  r.setState(run.rngState || run.seed);
  const wrapped = (...a) => { const v = r(...a); run.rngState = r.state(); return v; };
  for (const k of ['int', 'pick', 'shuffle', 'weighted']) wrapped[k] = (...a) => { const v = r[k](...a); run.rngState = r.state(); return v; };
  return wrapped;
}

export function nextSeasonMap(run) {
  const rng = runRng(run);
  run.map = generateMap(rng);
  run.pos = null;
  run.visited = [];
}

export const season = run => SEASON_ORDER[run.seasonIdx];

export const saveRun = run => store(RUN_KEY, run);
export const loadRun = () => load(RUN_KEY);
export const clearRun = () => drop(RUN_KEY);
export const loadSettings = () => load(SETTINGS_KEY) || {};
export const saveSettings = s => store(SETTINGS_KEY, s);
