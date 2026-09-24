// The ctx action queue: un-awaited content calls run in order, and choose/pickCards/nested awaits never deadlock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combat, play, log, resetLog, makeUi, within } from './helpers.mjs';
import { CARDS } from '../src/engine/content.js';

const S = (drawOrder, weather = Array(20).fill('drought')) => ({ drawOrder, weather });

CARDS.t_order = { name: 'T Order', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '',
  play(ctx) { ctx.bark(1); ctx.apply('self', 'grit', 1); ctx.draw(1); ctx.log('done'); } };
CARDS.t_reenter = { name: 'T Reenter', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '',
  async play(ctx) { const i = await ctx.choose('re', [{ label: 'a', run: () => ctx.draw(1) }]); log.push(['reenter', i]); } };
CARDS.t_throw = { name: 'T Throw', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '',
  play(ctx) { ctx.attack(5, { alive: true, status: null }); ctx.bark(2); } };
CARDS.t_slowui = { name: 'T Slow', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '',
  async play(ctx) { ctx.attack(2); ctx.draw(1); const [x] = await ctx.pickCards({ n: 1, min: 1 }); const i = await ctx.choose('c', [{ label: 'a' }, { label: 'b' }]); if (x) ctx.exhaust(x); ctx.bark(i + 1); } };

test('un-awaited ctx calls resolve in the order they were made', async () => {
  const ui = makeUi();
  const { c } = await combat({ ui, deck: ['t_order', 't_hit', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_order']) });
  ui.calls.length = 0;
  await play(c, 't_order');
  const seq = ui.calls.map(([t]) => t).filter(t => ['bark', 'status', 'draw', 'log'].includes(t));
  assert.deepEqual(seq, ['bark', 'status', 'draw', 'log']);
});

test('awaiting choose and pickCards inside play, with a slow UI, does not deadlock', async () => {
  const slow = v => new Promise(r => setTimeout(() => r(v), 5));
  const ui = makeUi({ choose: () => slow(1), pickCards: r => slow([r.cards[0]]) });
  const { c } = await combat({ ui, deck: ['t_slowui', 't_hit', 't_hit', 't_hit', 't_hit', 't_block'], script: S(['t_slowui']) });
  await within(play(c, 't_slowui'), 1000, 'play');
  assert.equal(c.player.status.bark, 2);
  assert.equal(c.exhaustPile.length, 1);
  assert.equal(c.phase, 'player');
});

test('a queued harvest whose bloom and bloom hooks await choose does not deadlock', async () => {
  resetLog();
  const ui = makeUi({ choose: async () => 1 });
  const { c } = await combat({ ui, deck: ['t_harvestchoose', 't_hit', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_harvestchoose']) });
  c.player.powers.t_listener = 1;
  await c.plant('t_chooser');
  await within(play(c, 't_harvestchoose'), 1000, 'harvest play');
  assert.ok(log.some(l => l[0] === 'bloomChose' && l[1] === 1));
  assert.ok(log.some(l => l[0] === 'bloomHook'));
  assert.equal(c.player.status.bark, 3, 'hook bark 1 + card bark 2');
});

test('re-entrant calls on the same ctx during one of its own actions run immediately instead of deadlocking', async () => {
  resetLog();
  const ui = makeUi({ choose: async (p, options) => { await options[0].run(); return 0; } });
  const { c } = await combat({ ui, deck: ['t_reenter', 't_hit', 't_hit', 't_hit', 't_hit', 't_block'], script: S(['t_reenter']) });
  const before = c.hand.length;
  await within(play(c, 't_reenter'), 1000, 're-entrant play');
  assert.deepEqual(log.find(l => l[0] === 'reenter'), ['reenter', 0]);
  assert.equal(c.hand.length, before);
});

test('.then() chains off queued actions are drained before the card finishes', async () => {
  const { c } = await combat({ deck: ['t_nested', 't_hit', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_nested']) });
  await c.plant('t_bean');
  await play(c, 't_nested');
  assert.equal(c.player.status.bark, 3);
  assert.equal(c.plots[0].growth, 1);
});

test('an action that throws is logged and does not block the rest of the queue', async () => {
  const errs = [];
  const err = console.error; console.error = (...a) => errs.push(a.join(' '));
  const { c } = await combat({ deck: ['t_throw', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_throw']) });
  await within(play(c, 't_throw'), 1000, 'throwing play');
  console.error = err;
  assert.equal(c.player.status.bark, 2);
  assert.ok(errs.some(e => e.includes('ctx.attack')));
  assert.equal(c.phase, 'player');
});

test('a card that throws still resolves the play and returns control to the player', async () => {
  CARDS.t_boom = { name: 'Boom', type: 'tool', rarity: 'special', cost: 1, target: 'none', desc: () => '', play() { throw new Error('boom'); } };
  const err = console.error; console.error = () => {};
  const { c } = await combat({ deck: ['t_boom', 't_hit', 't_hit', 't_hit', 't_hit'], script: S(['t_boom']) });
  await within(play(c, 't_boom'), 1000, 'boom');
  console.error = err;
  assert.equal(c.phase, 'player');
  assert.ok(c.discardPile.some(i => i.id === 't_boom'));
});

test('enemy moves with un-awaited calls are serialized and drained before the next critter acts', async () => {
  const ui = makeUi();
  const { c } = await combat({ ui, enemies: ['t_sloppy', 't_hitter'], script: S([]) });
  ui.calls.length = 0;
  await c.endPlayerTurn();
  const sloppy = c.enemies[0];
  assert.equal(sloppy.status.thorns, 2);
  const seq = ui.calls.map(([t, d]) => (t === 'hit' ? 'hit' : t === 'say' ? 'say' : t === 'bark' && d.target === sloppy ? 'bark' : t === 'status' && d.id === 'thorns' ? 'thorns' : null)).filter(Boolean);
  assert.deepEqual(seq, ['bark', 'thorns', 'say', 'hit']);
});
