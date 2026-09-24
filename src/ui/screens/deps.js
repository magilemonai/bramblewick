// Shared dependencies for the meta screens: the engine namespace (with 1.0 fallbacks for 2.0 APIs that
// may not exist yet), optional 2.0 content modules, and small pure helpers. Other seats' 2.0 files are
// loaded defensively so a missing or mid-edit module never blocks the title screen.
import * as State from '../../engine/state.js';
import * as CombatMod from '../../engine/combat.js';
import * as MapMod from '../../engine/map.js';
import * as Modes from '../../engine/modes.js';
import * as Rewards from '../../engine/rewards.js';
import * as RunApi from '../../engine/runapi.js';
import * as Content from '../../engine/content.js';
import { CARDS, STARTER_DECK } from '../../data/cards.js';
import { KEEPSAKES, STARTER_KEEPSAKE } from '../../data/keepsakes.js';
import { ENEMIES } from '../../data/enemies.js';
import * as Story from '../../data/story.js';
import { hasSprite } from '../../pixel.js';
import { img } from '../dom.js';

export const SEASON_ORDER = State.SEASON_ORDER;

// Engine: every export from the engine modules, merged into one namespace. Namespace imports keep a
// missing named export from breaking module linking; callers check `typeof E.x === 'function'`.
export const E = { ...MapMod, ...Modes, ...Rewards, ...RunApi, ...CombatMod, ...State };

// Optional 2.0 content. Filled by loadDeps().
export const D = {
  CHARACTERS: null,       // data/characters.js
  CHARACTER_STORY: null,  // data/characters.js or data/story.js
  YEARS: [],              // data/modes.js
  DAILY_MODS: [],         // data/modes.js
  TUTORIAL: null,         // data/tutorial.js
  FIRST_TIPS: null,       // data/tutorial.js
  missing: [],            // module paths that failed to load (reported in the console once)
};

const tryImport = async p => {
  try { return await import(p); } catch (err) { D.missing.push(p); console.warn('[meta] optional module unavailable:', p, err.message); return null; }
};

export async function loadDeps() {
  const [chars, modes, tut] = await Promise.all([
    tryImport('../../data/characters.js'),
    tryImport('../../data/modes.js'),
    tryImport('../../data/tutorial.js'),
  ]);
  D.CHARACTERS = chars?.CHARACTERS || null;
  D.CHARACTER_STORY = chars?.CHARACTER_STORY || Story.CHARACTER_STORY || null;
  D.YEARS = modes?.YEARS || [];
  D.DAILY_MODS = modes?.DAILY_MODS || [];
  D.TUTORIAL = tut?.TUTORIAL || null;
  D.FIRST_TIPS = tut?.FIRST_TIPS || null;
}

// ---------- characters ----------
const FALLBACK_CHARACTERS = {
  farmer: { name: 'The Farmer', sprite: 'farmer', portrait: 'portrait_farmer', hp: 72, color: '#6fae4a',
    starterDeck: STARTER_DECK, starterKeepsake: STARTER_KEEPSAKE, unlock: null,
    blurb: "Nana Wren's grandkid. Plants seeds, swings a hoe, hopes for rain." },
  pell: { name: 'Pell', sprite: 'pc_pell', portrait: 'vil_pell', hp: 66, color: '#f2b53a',
    starterDeck: STARTER_DECK, starterKeepsake: STARTER_KEEPSAKE, unlock: { boss: 'rootstag' },
    blurb: 'The beekeeper. Soft-spoken, knows the old songs, never alone.' },
};
// Only characters the engine can actually start a run with (engine/content.js falls back to farmer-only).
export const characters = () => D.CHARACTERS || Content.CHARACTERS || FALLBACK_CHARACTERS;
export const charDef = id => {
  const c = characters()[id] || characters().farmer || Object.values(characters())[0];
  const f = FALLBACK_CHARACTERS[id] || {};
  return { ...f, ...c, blurb: c.blurb || f.blurb || '' };
};
export const charOf = run => (run && characters()[run.character] ? run.character : 'farmer');

// ---------- meta ----------
export function normalizeMeta(m) {
  m = m || {};
  m.friendship ||= {};
  m.runs ||= 0;
  m.wins ||= 0;
  if (m.bestSeason == null) m.bestSeason = -1;
  m.yearsUnlocked = { farmer: 0, pell: 0, ...(m.yearsUnlocked || {}) };
  m.bossesMended ||= [];
  m.seen = { cards: [], enemies: [], keepsakes: [], ...(m.seen || {}) };
  for (const k of ['cards', 'enemies', 'keepsakes']) if (!Array.isArray(m.seen[k])) m.seen[k] = [];
  // 1.0 kept seenCards at the top level; fold it in once.
  if (Array.isArray(m.seenCards) && m.seenCards.length) { m.seen.cards = [...new Set([...m.seen.cards, ...m.seenCards])]; }
  m.tipsSeen ||= [];
  m.daily ||= {};
  return m;
}
export function markSeen(meta, kind, ids) {
  const list = meta.seen[kind];
  let added = false;
  for (const id of [].concat(ids)) if (id && !list.includes(id)) { list.push(id); added = true; }
  return added;
}

// Friendship tiers (contract): 0-1 = 0, 2-3 = 1, 4-6 = 2, 7+ = 3.
export const tierOf = f => (f >= 7 ? 3 : f >= 4 ? 2 : f >= 2 ? 1 : 0);

export function isUnlocked(entry, meta) {
  if (!entry) return false;
  if (typeof E.isUnlocked === 'function') { try { return !!E.isUnlocked(entry, meta); } catch (err) { console.warn('isUnlocked', err); } }
  const u = entry.unlock;
  if (!u) return true;
  if (u.boss) return (meta.bossesMended || []).includes(u.boss);
  if (u.villager) return tierOf(meta.friendship?.[u.villager] || 0) >= (u.tier || 0);
  return true;
}
export function unlockHint(entry) {
  const u = entry?.unlock;
  if (!u) return '';
  if (u.boss) return `Mend ${ENEMIES[u.boss]?.name || u.boss} to unlock.`;
  if (u.villager) return `Befriend ${Story.VILLAGERS[u.villager]?.name || u.villager} (${u.tier} heart tier${u.tier === 1 ? '' : 's'}) to unlock.`;
  return 'Locked.';
}

// What is unlocked right now, for before/after celebration diffs.
export function unlockState(meta) {
  const chars = Object.entries(characters()).filter(([, c]) => isUnlocked(c, meta)).map(([id]) => id);
  const cards = Object.entries(CARDS).filter(([, d]) => d.unlock && isUnlocked(d, meta)).map(([id]) => id);
  const keeps = Object.entries(KEEPSAKES).filter(([, d]) => d.unlock && isUnlocked(d, meta)).map(([id]) => id);
  return { chars, cards, keeps, years: { ...meta.yearsUnlocked } };
}

// ---------- modes ----------
export const MAX_YEAR = 10;
export const yearDef = n => D.YEARS.find(y => y.n === n) || null;
export const yearLabel = n => (n ? `Year ${n}${yearDef(n)?.name ? ': ' + yearDef(n).name : ''}` : 'First Year');

export function todayStr(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function hashStr(s) { let x = 2166136261; for (const ch of s) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x >>> 0; }

// The two daily modifiers for a date. Prefer whatever the engine attached to the run; this is the
// preview fallback (same hash rule as the contract: seed = hash of YYYY-MM-DD).
export function dailyModsFor(run, date) {
  const ids = run?.dailyMods || run?.daily?.mods || run?.mods?.daily;
  if (Array.isArray(ids) && ids.length) return ids.map(x => (typeof x === 'string' ? D.DAILY_MODS.find(m => m.id === x) : x)).filter(Boolean);
  if (typeof E.dailyModIds === 'function') { try { return E.dailyModIds(date).map(id => D.DAILY_MODS.find(m => m.id === id)).filter(Boolean); } catch { /* */ } }
  const pool = [...D.DAILY_MODS];
  if (!pool.length) return [];
  let s = hashStr(date);
  const out = [];
  while (out.length < 2 && pool.length) { s = Math.imul(s ^ (s >>> 13), 1274126177) >>> 0; out.push(pool.splice(s % pool.length, 1)[0]); }
  return out;
}

// ---------- score ----------
export function scoreRun(run) {
  if (typeof E.scoreRun === 'function') { try { const s = E.scoreRun(run); if (Number.isFinite(s)) return Math.round(s); } catch (err) { console.warn('scoreRun', err); } }
  // Contract fallback: floors*10 + bosses*100 + hp + coin/5 - turns.
  const floors = (run.stats?.floors ?? run.floorsCleared) || 0;
  const bosses = run.stats?.bosses ?? (run.bossesMended?.length ?? run.seasonIdx + (run.won ? 1 : 0));
  const turns = run.stats?.turns || 0;
  return Math.max(0, Math.round(floors * 10 + bosses * 100 + Math.max(0, run.hp) + (run.coin || 0) / 5 - turns));
}

// ---------- small helpers ----------
export const fmt = n => Number(n || 0).toLocaleString('en-US');
export const seasonTitle = s => Story.SEASONS[s]?.title || (s ? s[0].toUpperCase() + s.slice(1) : '');
export const seasonName = s => (s ? s[0].toUpperCase() + s.slice(1) : '');
export function withTimeout(p, ms) { return Promise.race([Promise.resolve(p).catch(() => {}), new Promise(r => setTimeout(r, ms))]); }
export function shareText(run, score, won) {
  const who = charDef(charOf(run)).name.replace(/^The /, 'the ');
  const reach = won ? 'mended the whole year' : `reached ${seasonName(SEASON_ORDER[run.seasonIdx])}`;
  const head = run.daily ? `Bramblewick Daily ${typeof run.daily === 'string' ? run.daily : run.dailyDate || todayStr()}` : `Bramblewick${run.year ? ` · Year ${run.year}` : ''}`;
  return `${head} · ${fmt(score)} pts · ${reach} with ${who}`;
}
export async function share(text) {
  try {
    if (navigator.share) { await navigator.share({ text }); return 'shared'; }
  } catch (err) { if (err?.name === 'AbortError') return 'cancelled'; }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { /* */ }
  // Last resort: a selectable textarea copy.
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    return 'copied';
  } catch { return 'failed'; }
}

// Sprite <img> for the first id that exists (new 2.0 art may not be registered yet), else null.
export function spr(ids, scale = 2, cls = '') {
  for (const id of [].concat(ids)) if (id && hasSprite(id)) return img(id, scale, cls);
  return null;
}
