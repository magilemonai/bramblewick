// Meta v2 storage + 1.0 import, unlock gating, reward pools, characters, the run API and 1.0 compatibility.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combat, play } from './helpers.mjs';
import { loadMeta, saveMeta, migrateMeta, defaultMeta, isUnlocked, friendshipTier, recordRunEnd, markSeen, META_KEY, META_V1_KEY } from '../src/engine/meta.js';
import { newRun, saveRun, RUN_KEY } from '../src/engine/state.js';
import { cardPool, rollRewards, pickEncounter, keepsakePool } from '../src/engine/rewards.js';
import { makeRunApi, gainKeepsake } from '../src/engine/runapi.js';
import { CARDS, KEEPSAKES, CHARACTERS, STARTER_DECK, ENCOUNTERS } from '../src/engine/content.js';

function fakeStorage(init = {}) {
  const data = { ...init };
  const writes = [];
  globalThis.localStorage = {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { writes.push(k); data[k] = String(v); },
    removeItem: k => { writes.push(k); delete data[k]; },
  };
  return { data, writes };
}

test('meta: first load imports 1.0 friendship once, read-only, into bramblewick2.meta', () => {
  const v1 = { friendship: { rue: 5, odile: 2 }, runs: 9, wins: 1 };
  const s = fakeStorage({ [META_V1_KEY]: JSON.stringify(v1) });
  const m = loadMeta();
  assert.deepEqual(m.friendship, { rue: 5, odile: 2 });
  assert.equal(m.runs, 0, 'only friendship carries over');
  assert.equal(m.imported1, true);
  assert.ok(s.writes.every(k => k.startsWith('bramblewick2.')), 'never writes a 1.0 key');
  assert.equal(s.data[META_V1_KEY], JSON.stringify(v1), '1.0 meta untouched');
  s.data[META_V1_KEY] = JSON.stringify({ friendship: { rue: 99 } });
  assert.equal(loadMeta().friendship.rue, 5, 'no second import');
  m.friendship.bram = 3; saveMeta(m);
  assert.equal(loadMeta().friendship.bram, 3);
  saveRun({ x: 1 });
  assert.ok(s.writes.includes(RUN_KEY) && RUN_KEY === 'bramblewick2.run' && META_KEY === 'bramblewick2.meta');
  delete globalThis.localStorage;
});

test('meta: loads without localStorage and migrates partial saves without dropping fields', () => {
  delete globalThis.localStorage;
  assert.deepEqual(loadMeta().seen, { cards: [], enemies: [], keepsakes: [] });
  const m = migrateMeta({ friendship: { juniper: 1 }, custom: 7, seen: { cards: ['a'] } });
  assert.equal(m.custom, 7);
  assert.deepEqual(m.seen, { cards: ['a'], enemies: [], keepsakes: [] });
  assert.deepEqual(m.yearsUnlocked, { farmer: 0, pell: 0 });
  assert.ok(markSeen(m, 'enemies', 'gloamslug'));
  assert.ok(!markSeen(m, 'enemies', 'gloamslug'));
});

test('friendship tiers: 0-1 = 0, 2-3 = 1, 4-6 = 2, 7+ = 3', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6, 7, 20].map(friendshipTier), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('isUnlocked: villager tier and boss unlocks; entries without unlock are always available', () => {
  const m = defaultMeta();
  assert.equal(isUnlocked({}, null), true);
  assert.equal(isUnlocked({ unlock: { villager: 'rue', tier: 2 } }, null), false);
  m.friendship.rue = 3;
  assert.equal(isUnlocked({ unlock: { villager: 'rue', tier: 2 } }, m), false);
  m.friendship.rue = 4;
  assert.equal(isUnlocked({ unlock: { villager: 'rue', tier: 2 } }, m), true);
  assert.equal(isUnlocked({ unlock: { boss: 'rootstag' } }, m), false);
  m.bossesMended.push('rootstag');
  assert.equal(isUnlocked({ unlock: { boss: 'rootstag' } }, m), true);
});

test('reward pools respect character pools and unlocks', () => {
  const run = newRun({ seed: 2 });
  let pool = cardPool(run, { rarity: 'rare' });
  assert.ok(pool.includes('t_farmer_only') && !pool.includes('t_pell_only'));
  assert.ok(!pool.includes('t_rue_locked') && !pool.includes('t_boss_locked'));
  run.character = 'pell';
  pool = cardPool(run, { rarity: 'rare' });
  assert.ok(!pool.includes('t_farmer_only') && pool.includes('t_pell_only'));
  const meta = defaultMeta(); meta.friendship.rue = 4; meta.bossesMended = ['rootstag'];
  const unlocked = newRun({ seed: 2, meta });
  pool = cardPool(unlocked, { rarity: 'rare' });
  assert.ok(pool.includes('t_rue_locked') && pool.includes('t_boss_locked'), 'run.unlock snapshot is used');
  assert.ok(!cardPool(unlocked, { rarity: 'rare', meta: null }).includes('t_rue_locked'), 'explicit meta overrides');
  KEEPSAKES.t_pell_ks = { name: 'T', rarity: 'common', pool: 'pell', desc: '' };
  assert.ok(!keepsakePool(newRun({ seed: 2 })).includes('t_pell_ks'));
  delete KEEPSAKES.t_pell_ks;
});

test('rollRewards: boss gives rare card choices and keepsake choices; elites give a keepsake', () => {
  const run = newRun({ seed: 4 });
  const boss = rollRewards(run, 'boss');
  assert.ok(boss.cards.every(i => CARDS[i.id].rarity === 'rare'));
  assert.ok(boss.coin >= 90 && boss.coin <= 110);
  assert.ok(boss.keepsakeChoices.length > 0 && new Set(boss.keepsakeChoices).size === boss.keepsakeChoices.length);
  const elite = rollRewards(run, 'elite');
  assert.ok(elite.keepsake === null || KEEPSAKES[elite.keepsake]);
  assert.equal(rollRewards(run, 'fight').keepsakeChoices.length, 0);
});

test('pickEncounter uses the easy list for the first two fights of a season', () => {
  const run = newRun({ seed: 6 });
  const easy = (ENCOUNTERS.spring?.easy || []).map(g => g.join('+'));
  if (!easy.length) return;
  for (let k = 0; k < 5; k++) assert.ok(easy.includes(pickEncounter(run, 'fight').join('+')));
  run.seasonFights = 2;
  const normal = (ENCOUNTERS.spring?.normal || []).map(g => g.join('+'));
  assert.ok(normal.includes(pickEncounter(run, 'fight').join('+')));
});

test('characters: newRun defaults to the farmer; unknown ids fall back to the farmer', () => {
  const a = newRun({ seed: 1 });
  assert.equal(a.character, 'farmer');
  const farmer = CHARACTERS.farmer;
  assert.deepEqual(a.deck.map(e => e.id), (farmer?.starterDeck?.length ? farmer.starterDeck : STARTER_DECK));
  assert.equal(a.maxHp, farmer?.hp || 72);
  assert.equal(newRun({ seed: 1, character: 'nobody' }).character, 'farmer');
  for (const id of Object.keys(CHARACTERS)) {
    const r = newRun({ seed: 1, character: id });
    assert.equal(r.character, id);
    assert.ok(r.deck.length > 0 && r.keepsakes.length === 1);
  }
});

test('recordRunEnd: bosses, next Year unlock on a win, daily best score', () => {
  const m = defaultMeta();
  const run = newRun({ seed: 1, year: 2 });
  run.bossesMended = ['rootstag', 'scorchmoth']; run.seasonIdx = 3;
  const ch = recordRunEnd(m, run, true);
  assert.deepEqual(ch.newBosses, ['rootstag', 'scorchmoth']);
  assert.equal(m.yearsUnlocked.farmer, 3);
  assert.equal(m.wins, 1); assert.equal(m.bestSeason, 3);
  const d = newRun({ daily: '2026-09-24' });
  recordRunEnd(m, d, false, 500);
  recordRunEnd(m, d, false, 300);
  assert.equal(m.daily['2026-09-24'], 500);
  assert.equal(m.yearsUnlocked.farmer, 3);
});

test('run API: headless pickers, keepsake maxHp mods, preserves, friendship', async () => {
  const run = newRun({ seed: 8 });
  const api = makeRunApi(run);
  const n = run.deck.length;
  assert.equal(await api.cardReward(), true);
  assert.equal(run.deck.length, n + 1);
  assert.equal(await api.upgradeCard(), true);
  assert.ok(run.deck.some(e => e.u));
  assert.equal(await api.removeCard(), true);
  assert.equal(run.deck.length, n);
  assert.equal(api.addPreserve('random'), true);
  api.friendship('rue', 2);
  assert.equal(api.getFriendship('rue'), 2);
  KEEPSAKES.t_big = { name: 'Big', rarity: 'special', desc: '', mods: { maxHp: 8 }, pickup(r) { r.gainCoin(1); } };
  const hp = run.maxHp, coin = run.coin;
  assert.equal(gainKeepsake(run, 't_big', api), true);
  assert.equal(run.maxHp, hp + 8);
  assert.equal(run.coin, coin + 1);
  assert.equal(gainKeepsake(run, 't_big', api), false, 'no duplicates');
  delete KEEPSAKES.t_big;
  await assert.rejects(api.fight(['t_dummy']), /fight handler/);
});

test('1.0 content still works unchanged: starter cards, a seed bloom and a starter keepsake', async (t) => {
  if (!CARDS.hoe_swing || !CARDS.mulch || !CARDS.turnip_seeds) return t.skip('1.0 starter cards not present');
  const { c } = await combat({ deck: ['hoe_swing', 'mulch', 'turnip_seeds', 'hoe_swing', 'mulch'], keepsakes: KEEPSAKES.nana_locket ? ['nana_locket'] : [], script: { drawOrder: ['hoe_swing', 'mulch', 'turnip_seeds'], weather: ['drought', 'rain'] } });
  const e = c.alive()[0];
  await play(c, 'hoe_swing', e);
  assert.equal(e.hp, 44);
  await play(c, 'mulch');
  assert.equal(c.player.status.bark, 5);
  await play(c, 'turnip_seeds');
  assert.ok(c.plots.filter(Boolean).length >= 1);
  const errs = []; const err = console.error; console.error = (...a) => errs.push(a.join(' '));
  await c.endPlayerTurn();
  console.error = err;
  assert.deepEqual(errs, []);
  assert.ok(e.hp < 44, 'turnip bloomed on the rain turn');
});
