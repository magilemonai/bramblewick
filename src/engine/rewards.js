// Shared reward + economy rules: card choices, keepsakes, preserves, encounters, the market, the hearth.
// The UI and both sims use these so there is one implementation. Pools respect the run's character
// (`pool: 'farmer' | 'pell'`, absent = shared) and unlocks (isUnlocked against meta, else run.unlock).
import { CARDS, KEEPSAKES, PRESERVES, ENEMIES, ENCOUNTERS, EVENTS } from './content.js';
import { runRng, uid, season } from './state.js';
import { isUnlocked } from './meta.js';
import { runMods } from './modes.js';

export const REWARD_RARITIES = ['common', 'uncommon', 'rare'];

export function keepsakeMods(run) {
  const m = { maxHp: 0, restHeal: 0, shopDiscount: 0, extraCardChoice: 0, startStamina: 0, drawBonus: 0 };
  for (const k of run.keepsakes || []) {
    const mods = KEEPSAKES[k]?.mods;
    if (mods) for (const [a, v] of Object.entries(mods)) m[a] = (m[a] || 0) + v;
  }
  return m;
}

const metaFor = (run, opts) => (opts && opts.meta !== undefined ? opts.meta : run.unlock || null);
// Is a card/keepsake/preserve def available to this run (character pool + unlocks)?
export function inPool(def, run, opts = {}) {
  if (!def) return false;
  if (def.pool && def.pool !== (run.character || 'farmer')) return false;
  return isUnlocked(def, metaFor(run, opts));
}

export function cardPool(run, { rarity = null, filter = null, exclude = [], meta } = {}) {
  const o = { meta };
  return Object.entries(CARDS)
    .filter(([id, d]) => (rarity ? d.rarity === rarity : REWARD_RARITIES.includes(d.rarity)) && !exclude.includes(id)
      && inPool(d, run, meta === undefined ? {} : o) && (!filter || filter(d, id)))
    .map(([id]) => id);
}

export function rollRarity(rng, kind) {
  const r = rng();
  if (kind === 'boss') return 'rare';
  if (kind === 'elite') return r < 0.1 ? 'rare' : r < 0.5 ? 'uncommon' : 'common';
  return r < 0.04 ? 'rare' : r < 0.4 ? 'uncommon' : 'common';
}

// cardChoices(run, kind, { n = 3, rarity, filter, meta, extra = true })  -> [{ id, u:false, uid }]
// Also accepts the 1.0 positional form cardChoices(run, kind, n, rarity, filter).
// `extra` adds keepsake extraCardChoice + mods.cardChoicesAdd (reward screens); pass false for fixed-size lists.
export function cardChoices(run, kind = 'fight', opts = {}, rarityPos, filterPos) {
  if (typeof opts === 'number') opts = { n: opts, rarity: rarityPos, filter: filterPos };
  const { n = 3, rarity = null, filter = null, extra = true } = opts;
  const rng = runRng(run);
  const s = season(run);
  const total = Math.max(1, n + (extra ? keepsakeMods(run).extraCardChoice + (runMods(run).cardChoicesAdd || 0) : 0));
  const out = [];
  for (let k = 0; k < total; k++) {
    const rar = rarity || rollRarity(rng, kind);
    let pool = cardPool(run, { rarity: rar, filter: filter ? d => filter(d) : null, exclude: out, meta: opts.meta });
    if (!pool.length) pool = cardPool(run, { filter: filter ? d => filter(d) : null, exclude: out, meta: opts.meta });
    if (!pool.length) break;
    const weights = Object.fromEntries(pool.map(id => [id, !CARDS[id].season ? 2 : CARDS[id].season === s ? 4 : 1]));
    out.push(rng.weighted(weights));
  }
  return out.map(id => ({ id, u: false, uid: uid() }));
}

export function keepsakePool(run, rarities = ['common', 'uncommon', 'rare'], exclude = [], opts = {}) {
  const own = new Set([...(run.keepsakes || []), ...exclude]);
  return Object.entries(KEEPSAKES).filter(([id, d]) => rarities.includes(d.rarity) && !own.has(id) && inPool(d, run, opts)).map(([id]) => id);
}
export function randomKeepsake(run, rarities = ['common', 'uncommon', 'rare'], exclude = [], opts = {}) {
  const pool = keepsakePool(run, rarities, exclude, opts);
  return pool.length ? runRng(run).pick(pool) : null;
}
export function preservePool(run, opts = {}) {
  return Object.entries(PRESERVES).filter(([, d]) => inPool(d, run, opts)).map(([id]) => id);
}
export function randomPreserve(run, opts = {}) {
  const pool = preservePool(run, opts);
  return pool.length ? runRng(run).pick(pool) : null;
}

// Encounter for a map node. Normal fights use the season's `easy` list for the first 2 fights.
export function pickEncounter(run, kind = 'fight') {
  const s = season(run);
  const E = ENCOUNTERS[s] || {};
  let pool;
  if (kind === 'boss') pool = E.boss;
  else if (kind === 'elite') pool = E.elite;
  else pool = (run.seasonFights || 0) < 2 && E.easy?.length ? E.easy : E.normal?.length ? E.normal : E.easy;
  const valid = (pool || []).filter(g => Array.isArray(g) && g.length && g.every(id => ENEMIES[id]));
  if (!valid.length) {
    const tier = kind === 'fight' ? 'normal' : kind;
    const any = Object.keys(ENEMIES).filter(id => ENEMIES[id].season === s && ENEMIES[id].tier === tier);
    return [any[0] || Object.keys(ENEMIES)[0]];
  }
  return runRng(run).pick(valid);
}

export function coinReward(run, kind = 'fight') {
  const rng = runRng(run);
  const base = kind === 'boss' ? rng.int(90, 110) : kind === 'elite' ? rng.int(25, 35) : rng.int(10, 20);
  return Math.max(0, Math.round(base * (runMods(run).coinMult ?? 1)));
}

// Everything a won fight offers. The UI presents it; the sim takes it.
// -> { coin, cards: [inst], preserve: id|null, keepsake: id|null, keepsakeChoices: [id] }
export function rollRewards(run, kind = 'fight', opts = {}) {
  const rng = runRng(run);
  const out = { coin: coinReward(run, kind), cards: cardChoices(run, kind, { rarity: kind === 'boss' ? 'rare' : null, meta: opts.meta }), preserve: null, keepsake: null, keepsakeChoices: [] };
  if (kind !== 'boss' && rng() < (kind === 'elite' ? 0.6 : 0.4) && (run.preserves || []).includes(null)) out.preserve = randomPreserve(run, opts);
  if (kind === 'elite') out.keepsake = randomKeepsake(run, ['common', 'uncommon', 'rare'], [], opts);
  if (kind === 'boss' && run.seasonIdx < 3) {
    for (let k = 0; k < 3; k++) { const id = randomKeepsake(run, ['boss', 'rare'], out.keepsakeChoices, opts); if (id) out.keepsakeChoices.push(id); }
  }
  return out;
}

// ---------- market ----------
export function shopPrice(run, base) {
  const d = keepsakeMods(run).shopDiscount || 0;
  const disc = d > 1 ? d / 100 : d;
  return Math.max(1, Math.round(base * (1 - disc) * (runMods(run).shopPriceMult ?? 1)));
}
// -> { cards: [{ inst, price }], keepsakes: [{ id, price }], preserves: [{ id, price }], removePrice }
export function shopInventory(run, opts = {}) {
  const rng = runRng(run);
  const fixed = { extra: false, meta: opts.meta };
  const cards = [
    ...cardChoices(run, 'fight', { ...fixed, n: 2, rarity: 'common' }),
    ...cardChoices(run, 'fight', { ...fixed, n: 2, rarity: 'uncommon' }),
    ...cardChoices(run, 'fight', { ...fixed, n: 1, rarity: 'rare' }),
  ].map(inst => ({ inst, price: shopPrice(run, { common: rng.int(45, 55), uncommon: rng.int(70, 82), rare: rng.int(140, 160) }[CARDS[inst.id]?.rarity] || 60) }));
  const ks = [];
  for (let k = 0; k < 2; k++) { const id = randomKeepsake(run, ['common', 'uncommon', 'rare'], ks, opts); if (id) ks.push(id); }
  const keepsakes = ks.map(id => ({ id, price: shopPrice(run, { common: rng.int(140, 160), uncommon: rng.int(190, 220), rare: rng.int(250, 290) }[KEEPSAKES[id].rarity] || 180) }));
  const preserves = rng.shuffle(preservePool(run, opts)).slice(0, 3).map(id => ({ id, price: shopPrice(run, rng.int(48, 72)) }));
  return { cards, keepsakes, preserves, removePrice: shopPrice(run, run.removeCost || 75) };
}

// ---------- hearth ----------
export function restAmount(run) {
  return Math.max(0, Math.round(run.maxHp * 0.3 * (runMods(run).restHealMult ?? 1)) + (keepsakeMods(run).restHeal || 0));
}

// ---------- events ----------
export function pickEvent(run) {
  const s = season(run);
  const seen = new Set(run.seenEvents || []);
  const fits = e => (!e.seasons || e.seasons.includes(s)) && (!e.pool || e.pool === (run.character || 'farmer'));
  let pool = EVENTS.filter(e => !seen.has(e.id) && fits(e));
  if (!pool.length) pool = EVENTS.filter(fits);
  if (!pool.length) pool = EVENTS;
  if (!pool.length) return null;
  const ev = runRng(run).pick(pool);
  (run.seenEvents || (run.seenEvents = [])).push(ev.id);
  return ev;
}

// A same-rarity replacement card id for a transform (never the same card).
export function transformTarget(run, inst, opts = {}) {
  const d = CARDS[inst.id];
  const rar = REWARD_RARITIES.includes(d?.rarity) ? d.rarity : 'common';
  const [nc] = cardChoices(run, 'fight', { n: 1, rarity: rar, filter: x => x !== d, extra: false, meta: opts.meta });
  return nc ? nc.id : null;
}
