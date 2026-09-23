// Run state + persistent meta (friendship, records). All storage access is guarded.
import { makeRng, newSeed } from './rng.js';
import { generateMap } from './map.js';

export const SEASON_ORDER = ['spring', 'summer', 'fall', 'winter'];
const RUN_KEY = 'bramblewick.run.v1';
const META_KEY = 'bramblewick.meta.v1';

let uidCounter = 1;
export const uid = () => `c${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } }
function load(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function drop(k) { try { localStorage.removeItem(k); } catch { /* noop */ } }

export function newRun({ starterDeck, starterKeepsake }) {
  const seed = newSeed();
  const rng = makeRng(seed);
  const run = {
    seed, rngState: 0,
    seasonIdx: 0,
    hp: 72, maxHp: 72, coin: 99,
    deck: starterDeck.map(id => ({ id, u: false, uid: uid() })),
    keepsakes: [starterKeepsake],
    preserves: [null, null, null],
    map: generateMap(rng),
    pos: null,          // current node id (null = before first floor)
    visited: [],
    floorsCleared: 0,
    removeCost: 75,
    seenEvents: [],
    stats: { fights: 0, mended: 0, blooms: 0, cardsPlayed: 0, damage: 0, started: Date.now() },
  };
  run.rngState = rng.state();
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

export function loadMeta() {
  return Object.assign({ friendship: {}, runs: 0, wins: 0, bestSeason: -1, seenCards: [] }, load(META_KEY) || {});
}
export const saveMeta = meta => store(META_KEY, meta);
