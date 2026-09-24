import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combat, play, inHand, log, resetLog, makeUi } from './helpers.mjs';
import { Combat } from '../src/engine/combat.js';

const S = (drawOrder, weather = Array(20).fill('drought')) => ({ drawOrder, weather });

test('ctx.choose asks the UI and runs after earlier un-awaited actions', async () => {
  resetLog();
  let asked = null;
  const ui = makeUi({ choose: async (prompt, options) => { asked = { prompt, n: options.length }; return 2; } });
  const { c } = await combat({ ui, deck: ['t_choose', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_choose']) });
  await play(c, 't_choose');
  assert.deepEqual(asked, { prompt: 'Pick', n: 3 });
  assert.deepEqual(log.find(l => l[0] === 'chose'), ['chose', 2, 1]);
});

test('ctx.choose falls back to a seeded random index when the UI has no choose (or answers nonsense)', async () => {
  for (const ui of [makeUi(), makeUi({ choose: async () => 9 }), makeUi({ choose: async () => { throw new Error('closed'); } })]) {
    resetLog();
    const { c } = await combat({ ui, deck: ['t_choose', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_choose']) });
    const err = console.error; console.error = () => {};
    await play(c, 't_choose');
    console.error = err;
    const i = log.find(l => l[0] === 'chose')[1];
    assert.ok(i >= 0 && i < 3);
  }
});

test('ctx.pickCards passes cards/n/min to the UI, dedupes and filters its answer, and sees queued draws', async () => {
  resetLog();
  let req = null;
  const ui = makeUi({ pickCards: async r => { req = r; return [r.cards[0], r.cards[0], { id: 'fake' }]; } });
  const { c } = await combat({ ui, deck: ['t_pick', 't_hit', 't_block', 't_free', 't_free', 't_counter'], script: S(['t_pick', 't_hit', 't_block', 't_free', 't_free', 't_counter']) });
  await play(c, 't_pick');
  assert.equal(req.n, 2); assert.equal(req.min, 1); assert.equal(req.prompt, 'Pick');
  assert.equal(req.cards.length, 5, 'the queued draw(1) landed before the picker opened');
  const picked = log.find(l => l[0] === 'picked');
  assert.deepEqual(picked[1], ['t_hit']);
});

test('ctx.pickCards random fallback picks n; min is enforced when the UI returns too few', async () => {
  resetLog();
  const { c } = await combat({ deck: ['t_pick', 't_hit', 't_block', 't_free', 't_free', 't_counter'], script: S(['t_pick', 't_hit', 't_block', 't_free', 't_free', 't_counter']) });
  await play(c, 't_pick');
  assert.equal(log.find(l => l[0] === 'picked')[1].length, 2);
  resetLog();
  const ui = makeUi({ pickCards: async () => [] });
  const r2 = await combat({ ui, deck: ['t_pick', 't_hit', 't_block', 't_free', 't_free', 't_counter'], script: S(['t_pick', 't_hit', 't_block', 't_free', 't_free', 't_counter']) });
  await play(r2.c, 't_pick');
  assert.equal(log.find(l => l[0] === 'picked')[1].length, 1);
  const ctx = r2.c.makeCtx();
  assert.deepEqual(await ctx.pickCards({ from: 'discard', n: 3, filter: i => i.id === 'nope' }), []);
});

test('exhaust (ctx.exhaust and the Compost keyword) moves cards to the exhaust pile and fires cardExhausted', async () => {
  resetLog();
  const { c } = await combat({ deck: ['t_pick', 't_compost', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_pick', 't_compost', 't_hit', 't_hit', 't_hit', 't_hit']) });
  c.player.powers.t_listener = 1;
  await play(c, 't_compost');
  assert.ok(c.exhaustPile.some(i => i.id === 't_compost'));
  await play(c, 't_pick');
  assert.equal(c.exhaustPile.length, 3);
  assert.equal(log.filter(l => l[0] === 'cardExhausted').length, 3);
  assert.ok(c.discardPile.some(i => i.id === 't_pick'));
});

test('moveCard drawTop puts a card on top of the draw pile; discard moves to discard', async () => {
  const ui = makeUi({ pickCards: async r => [r.cards.find(i => i.id === 't_block')] });
  const { c } = await combat({ ui, deck: ['t_movetop', 't_block', 't_hit', 't_hit', 't_hit', 't_free', 't_free'], script: S(['t_movetop', 't_block', 't_hit', 't_hit', 't_hit', 't_free', 't_free']) });
  const block = inHand(c, 't_block');
  await play(c, 't_movetop');
  assert.ok(c.hand.includes(block), 'drawn straight back');
  const ctx = c.makeCtx();
  await ctx.discard(block);
  assert.ok(c.discardPile.includes(block) && !c.hand.includes(block));
  await ctx.moveCard(block, 'hand');
  assert.ok(c.hand.includes(block));
});

test('ctx.upgrade upgrades for this combat only; the run deck is untouched', async () => {
  const ui = makeUi();
  const { c, run } = await combat({ ui, deck: ['t_upgrade', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_upgrade']) });
  await play(c, 't_upgrade');
  assert.ok(c.hand.every(i => i.u));
  assert.ok(run.deck.every(e => !e.u));
  assert.equal(ui.calls.filter(([t]) => t === 'upgrade').length, 4);
});

test('card.data is per-instance scratch for this combat; card.perm persists on the deck entry by uid', async () => {
  resetLog();
  const { c, run } = await combat({ deck: ['t_perm', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_perm']) });
  await play(c, 't_perm');
  const inst = c.discardPile.find(i => i.id === 't_perm');
  await c.moveCard(inst, 'hand');
  await play(c, 't_perm');
  assert.deepEqual(log.filter(l => l[0] === 'perm').map(l => [l[1], l[2]]), [[2, 1], [4, 2]]);
  const entry = run.deck.find(e => e.id === 't_perm');
  assert.equal(entry.perm.n, 4);
  // next fight: perm carries over, data resets
  resetLog();
  const c2 = new Combat(run, ['t_dummy'], { script: S(['t_perm']) });
  await c2.begin();
  await play(c2, 't_perm');
  assert.deepEqual(log.find(l => l[0] === 'perm'), ['perm', 6, 1]);
  assert.equal(JSON.parse(JSON.stringify(run)).deck.find(e => e.id === 't_perm').perm.n, 6, 'survives a save');
});

test('cardsPlayedThisTurn counts the cards played before the current one', async () => {
  resetLog();
  const { c } = await combat({ deck: ['t_free', 't_free', 't_counter', 't_counter', 't_hit'], script: S(['t_counter', 't_free', 't_free', 't_counter', 't_hit']) });
  await play(c, 't_counter');
  await play(c, 't_free');
  await play(c, 't_free');
  await play(c, 't_counter');
  assert.deepEqual(log.filter(l => l[0] === 'counted').map(l => l[1]), [0, 3]);
});

test('bees sting at end of turn: 1 each to random critters, ignoring Bark, Grit and Soggy; bees never fade', async () => {
  resetLog();
  const ui = makeUi();
  const { c } = await combat({ ui, deck: ['t_bees', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_bees']) });
  c.player.powers.t_listener = 1;
  await play(c, 't_bees');
  const e = c.alive()[0];
  e.status.bark = 10; e.status.soggy = 3; c.player.status.grit = 5;
  await c.endPlayerTurn();
  assert.equal(e.hp, 46);
  assert.equal(c.player.status.bees, 4);
  assert.equal(log.filter(l => l[0] === 'stung').length, 4);
  assert.equal(ui.calls.filter(([t, d]) => t === 'sting' && d.amount === 1).length, 4);
  await c.endPlayerTurn();
  assert.equal(e.hp, 42);
});

test('ctx.sting(n) stings right now with the same rule', async () => {
  const { c } = await combat({ deck: ['t_sting', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_sting']), enemies: ['t_dummy', 't_dummy'] });
  c.alive().forEach(e => { e.status.bark = 20; });
  await play(c, 't_sting');
  assert.equal(c.alive().reduce((a, e) => a + (50 - e.hp), 0), 3);
});

test('stings can mend the last critter and end the fight', async () => {
  const { c } = await combat({ deck: ['t_bees', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_bees']) });
  await play(c, 't_bees');
  c.alive()[0].hp = 2;
  await c.endPlayerTurn();
  assert.equal(await c.done, 'victory');
});

test('script.drawOrder forces the opening hand order; ids missing from the deck become temp cards', async () => {
  const { c } = await combat({ deck: ['t_hit', 't_hit', 't_block', 't_block', 't_free', 't_free', 't_free'], script: S(['t_block', 't_free', 't_hit', 't_seed', 't_block']) });
  assert.deepEqual(c.hand.map(i => i.id), ['t_block', 't_free', 't_hit', 't_seed', 't_block']);
  assert.equal(c.hand[3].temp, true);
});

test('the tutorial script (src/data/tutorial.js) drives the opening hand and weather', async (t) => {
  const { TUTORIAL } = await import('../src/engine/content.js');
  if (!TUTORIAL) return t.skip('tutorial.js not present');
  const { newRun } = await import('../src/engine/state.js');
  const run = newRun({ seed: 1 });
  const c = new Combat(run, TUTORIAL.enemies, { script: { drawOrder: TUTORIAL.drawOrder, weather: TUTORIAL.weather } });
  await c.begin();
  assert.deepEqual(c.hand.map(i => i.id), TUTORIAL.drawOrder.slice(0, c.hand.length));
  const seen = [c.weather];
  for (let k = 1; k < TUTORIAL.weather.length && !c.over; k++) { await c.endPlayerTurn(); seen.push(c.weather); }
  assert.deepEqual(seen, TUTORIAL.weather.slice(0, seen.length));
});
