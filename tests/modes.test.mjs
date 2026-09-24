// Run modifiers (every key must do something), daily seeds, and scoring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combat } from './helpers.mjs';
import { mergeMods, applyMods, yearMods, scoreRun, dailySeed, dailyModIds, MOD_DEFAULTS } from '../src/engine/modes.js';
import { YEARS, DAILY_MODS, CARDS } from '../src/engine/content.js';
import { newRun } from '../src/engine/state.js';
import { coinReward, restAmount, shopPrice, shopInventory, cardChoices } from '../src/engine/rewards.js';
import { hashString } from '../src/engine/rng.js';

test('mergeMods: *Mult multiplies, numbers sum, booleans OR, weatherWeights sum per weather', () => {
  const m = mergeMods([{ enemyHpMult: 1.5, enemyDmgAdd: 1, eliteExtraMove: false, weatherWeights: { fog: 2 } }, { enemyHpMult: 2, enemyDmgAdd: 2, eliteExtraMove: true, weatherWeights: { fog: 1, frost: 3 } }, null]);
  assert.equal(m.enemyHpMult, 3);
  assert.equal(m.enemyDmgAdd, 3);
  assert.equal(m.eliteExtraMove, true);
  assert.deepEqual(m.weatherWeights, { fog: 3, frost: 3 });
  assert.equal(m.coinMult, 1);
  assert.deepEqual(Object.keys(mergeMods([])).sort(), Object.keys(MOD_DEFAULTS).sort());
});

test('Harder Years are cumulative (Year n applies YEARS 1..n) and applyMods fills run.mods', () => {
  const added = [];
  if (!YEARS.length) { // modes.js not written yet: exercise the rule with stand-in years
    added.push({ n: 1, mods: { enemyDmgAdd: 1 } }, { n: 2, mods: { enemyDmgAdd: 1, coinMult: 0.9 } }, { n: 3, mods: { eliteExtraMove: true } });
    YEARS.push(...added);
  }
  try {
    assert.equal(yearMods(0).length, 0);
    assert.equal(yearMods(2).length, YEARS.filter((y, i) => (y.n ?? i + 1) <= 2).length);
    const run = newRun({ seed: 1, year: 3 });
    assert.deepEqual(run.mods, mergeMods(YEARS.filter((y, i) => (y.n ?? i + 1) <= 3).map(y => y.mods)));
    assert.equal(run.year, 3);
    const r0 = newRun({ seed: 1 });
    assert.deepEqual(applyMods(r0), mergeMods([]));
  } finally { if (added.length) YEARS.splice(YEARS.length - added.length, added.length); }
});

test('start modifiers: maxHpAdd, startHpLoss, startCoin, startGloom, startRareCard', () => {
  const base = newRun({ seed: 5 });
  const run = newRun({ seed: 5, customMods: { maxHpAdd: 10, startHpLoss: 5, startCoin: -20, startGloom: 2, startRareCard: true } });
  assert.equal(run.maxHp, base.maxHp + 10);
  assert.equal(run.hp, run.maxHp - 5);
  assert.equal(run.coin, base.coin - 20);
  assert.equal(run.deck.filter(e => e.id === 'gloom').length, CARDS.gloom ? 2 : 0);
  assert.equal(run.deck.length, base.deck.length + (CARDS.gloom ? 2 : 0) + 1);
  assert.equal(CARDS[run.deck[run.deck.length - 1].id].rarity, 'rare');
});

test('enemy/elite/boss HP multipliers stack onto critter HP', async () => {
  const mods = { enemyHpMult: 1.5, eliteHpMult: 2, bossHpMult: 0.5 };
  assert.equal((await combat({ enemies: ['t_dummy'], customMods: mods })).c.alive()[0].maxHp, 75);
  assert.equal((await combat({ enemies: ['t_elite'], customMods: mods, kind: 'elite' })).c.alive()[0].maxHp, 300);
  assert.equal((await combat({ enemies: ['t_boss'], customMods: mods, kind: 'boss' })).c.alive()[0].maxHp, 150);
});

test('eliteExtraMove: elites take a free move before your first turn', async () => {
  const { c } = await combat({ enemies: ['t_elite'], kind: 'elite', customMods: { eliteExtraMove: true }, script: { drawOrder: [], weather: ['drought'] } });
  assert.equal(c.player.hp, 68);
  assert.deepEqual(c.alive()[0].history, ['swipe']);
  assert.equal(c.alive()[0].moveKey, 'idle');
  const plain = await combat({ enemies: ['t_elite'], kind: 'elite', script: { drawOrder: [], weather: ['drought'] } });
  assert.equal(plain.c.player.hp, 72);
});

test('weatherWeights reshape the season weather table', async () => {
  const { c } = await combat({ customMods: { weatherWeights: { sun: -99, rain: -99, wind: -99, fog: -99, drought: 5 } } });
  for (let k = 0; k < 6; k++) { assert.equal(c.weather, 'drought'); await c.endPlayerTurn(); }
});

test('economy modifiers: coinMult, restHealMult, shopPriceMult, cardChoicesAdd', () => {
  const run = newRun({ seed: 9, customMods: { coinMult: 2, restHealMult: 0.5, shopPriceMult: 2, cardChoicesAdd: 2 } });
  for (let k = 0; k < 20; k++) { const n = coinReward(run, 'fight'); assert.ok(n >= 20 && n <= 40, `coin ${n}`); }
  assert.equal(restAmount(run), Math.round(run.maxHp * 0.3 * 0.5));
  assert.equal(shopPrice(run, 50), 100);
  assert.ok(shopInventory(run).cards.every(x => x.price >= 90));
  assert.equal(cardChoices(run, 'fight').length, 5);
  const plain = newRun({ seed: 9 });
  assert.equal(cardChoices(plain, 'fight').length, 3);
  assert.equal(shopPrice(plain, 50), 50);
});

test('daily: the same date gives the same seed, modifiers, map and rewards; another date differs', () => {
  const a = newRun({ daily: '2026-09-24' });
  const b = newRun({ daily: '2026-09-24' });
  const d = newRun({ daily: '2026-09-25' });
  assert.equal(a.seed, dailySeed('2026-09-24'));
  assert.equal(a.seed, b.seed);
  assert.notEqual(a.seed, d.seed);
  assert.deepEqual(a.dailyMods, b.dailyMods);
  assert.equal(a.dailyMods.length, Math.min(2, DAILY_MODS.length));
  assert.deepEqual(a.dailyMods, dailyModIds('2026-09-24'));
  assert.deepEqual(a.map, b.map);
  assert.deepEqual(cardChoices(a, 'fight').map(i => i.id), cardChoices(b, 'fight').map(i => i.id));
  assert.equal(a.year, 0);
  assert.equal(a.unlock, null, 'dailies ignore unlocks so pools match for everyone');
});

test('hashString is stable', () => {
  assert.equal(hashString('2026-09-24'), hashString('2026-09-24'));
  assert.notEqual(hashString('2026-09-24'), hashString('2026-09-23'));
  assert.equal(hashString(''), hashString(''));
  assert.ok(Number.isInteger(hashString('x')) && hashString('x') >= 0);
});

test('scoreRun = floors*10 + bosses*100 + hp + coin/5 - turns', () => {
  const run = newRun({ seed: 1 });
  Object.assign(run, { floorsCleared: 20, hp: 40, coin: 123 });
  run.stats.bosses = 2; run.stats.turns = 55;
  assert.equal(scoreRun(run), 200 + 200 + 40 + 24 - 55);
});
