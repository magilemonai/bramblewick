// Run-level operations and the event ctx (`ev`, also the `run` API passed to keepsake pickup()).
// Headless by default: every picker falls back to a seeded random choice, so the sims and tests use the
// same rules the UI does. The UI passes its own pickers/fight/notify.
import { CARDS, KEEPSAKES, PRESERVES } from './content.js';
import { runRng, uid } from './state.js';
import { cardChoices, randomKeepsake, randomPreserve, transformTarget } from './rewards.js';

export function addCardToDeck(run, id, u = false) {
  if (!CARDS[id]) return null;
  const entry = { id, u: !!u, uid: uid() };
  run.deck.push(entry);
  return entry;
}
export function gainPreserve(run, id) {
  const i = run.preserves.indexOf(null);
  if (i < 0 || !PRESERVES[id]) return false;
  run.preserves[i] = id;
  return true;
}
// Applies mods.maxHp and pickup(). `already` = the id is in run.keepsakes (e.g. the starter).
export function gainKeepsake(run, id, api = null, { already = false } = {}) {
  const d = KEEPSAKES[id];
  if (!d) return false;
  if (!already) {
    if (run.keepsakes.includes(id)) return false;
    run.keepsakes.push(id);
  }
  if (d.mods?.maxHp) { run.maxHp += d.mods.maxHp; run.hp = Math.max(1, Math.min(run.maxHp, run.hp + Math.max(0, d.mods.maxHp))); }
  try { d.pickup?.(api || makeRunApi(run)); } catch (err) { console.error('keepsake pickup ' + id, err); }
  return true;
}
export const upgradable = inst => !inst.u && CARDS[inst.id] && CARDS[inst.id].type !== 'gloom';

// opts: { meta, pickers: { chooseCard(title, insts, { skip }) -> inst|null, pickDeckCard(title, filter, preview) -> inst|null },
//         fight(group) -> 'victory'|'defeat' (async), notify(kind, data) }
export function makeRunApi(run, opts = {}) {
  const { meta = null, pickers = {}, fight = null, notify = () => {} } = opts;
  const rng = () => runRng(run)();
  const localFriendship = {};
  const fr = () => (meta ? (meta.friendship || (meta.friendship = {})) : localFriendship);
  const chooseCard = async (title, insts, o = { skip: true }) => {
    if (pickers.chooseCard) return pickers.chooseCard(title, insts, o);
    return insts.length ? insts[Math.floor(rng() * insts.length)] : null;
  };
  const pickDeckCard = async (title, filter = () => true, preview = null) => {
    if (pickers.pickDeckCard) return pickers.pickDeckCard(title, filter, preview);
    const cards = run.deck.filter(filter);
    return cards.length ? cards[Math.floor(rng() * cards.length)] : null;
  };
  const api = {
    run,
    get meta() { return meta; },
    gainCoin: n => { run.coin += n; notify('coin', { n }); },
    loseCoin: n => { run.coin = Math.max(0, run.coin - n); notify('coin', { n: -n }); },
    heal: n => { run.hp = Math.min(run.maxHp, run.hp + n); notify('heal', { n }); },
    damage: n => { run.hp = Math.max(1, run.hp - n); notify('damage', { n }); },
    gainMaxHp: n => { run.maxHp += n; run.hp = Math.max(1, Math.min(run.maxHp, run.hp + Math.max(0, n))); notify('maxHp', { n }); },
    addCard: (id, u = false) => { const e = addCardToDeck(run, id, u); if (e) notify('addCard', { inst: e }); return !!e; },
    removeCard: async (title = 'Remove a card from your deck') => {
      const inst = await pickDeckCard(title);
      if (!inst) return false;
      run.deck.splice(run.deck.indexOf(inst), 1);
      notify('removeCard', { inst });
      return true;
    },
    upgradeCard: async (title = 'Upgrade a card') => {
      const inst = await pickDeckCard(title, upgradable, i => ({ ...i, u: true }));
      if (!inst) return false;
      inst.u = true;
      notify('upgradeCard', { inst });
      return true;
    },
    transformCard: async (title = 'Transform a card') => {
      const inst = await pickDeckCard(title);
      if (!inst) return false;
      const nid = transformTarget(run, inst, { meta: meta || undefined });
      const i = run.deck.indexOf(inst);
      if (nid && i >= 0) run.deck[i] = { id: nid, u: false, uid: uid() };
      notify('transformCard', { from: inst, to: nid });
      return true;
    },
    cardReward: async rarity => {
      const pick = await chooseCard('Choose a card', cardChoices(run, 'fight', { rarity: rarity || null, meta: meta || undefined }));
      if (pick) api.addCard(pick.id, pick.u);
      return !!pick;
    },
    addKeepsake: id => {
      const k = id === 'random' || !id ? randomKeepsake(run, ['common', 'uncommon', 'rare'], [], { meta: meta || undefined }) : id;
      if (k && gainKeepsake(run, k, api)) { notify('keepsake', { id: k }); return k; }
      return null;
    },
    addPreserve: id => {
      const p = id === 'random' || !id ? randomPreserve(run, { meta: meta || undefined }) : id;
      const ok = !!p && gainPreserve(run, p);
      notify('preserve', { id: p, ok });
      return ok;
    },
    friendship: (v, n) => { const f = fr(); f[v] = Math.max(0, (f[v] || 0) + n); notify('friendship', { villager: v, n }); },
    getFriendship: v => fr()[v] || 0,
    fight: async groupOrId => {
      const group = Array.isArray(groupOrId) ? groupOrId : [groupOrId];
      if (!fight) throw new Error('ev.fight needs a fight handler');
      return fight(group);
    },
    rand: () => rng(),
  };
  return api;
}
