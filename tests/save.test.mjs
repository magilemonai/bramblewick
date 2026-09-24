// serialize() / Combat.restore() / resume(): a restored fight must continue exactly like the original.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combat, makeUi } from './helpers.mjs';
import { Combat } from '../src/engine/combat.js';

const strip = snap => JSON.parse(JSON.stringify(snap, (k, v) => (k === 'uid' ? undefined : v)));

// Deterministic "player": play the first playable card at the first living critter, else end the turn.
async function drive(c, turns) {
  const stopAt = c.turn + turns;
  let guard = 0;
  while (!c.over && c.turn < stopAt && guard++ < 200) {
    const inst = c.hand.find(i => c.canPlay(i));
    if (inst) await c.playCard(inst, c.alive()[0]);
    else await c.endPlayerTurn();
  }
}

const DECK = ['t_hit', 't_hit', 't_block', 't_seed', 't_perseed', 't_bees', 't_perm', 't_compost', 't_free', 't_hit', 't_block', 't_counter'];

test('ui.checkpoint receives a JSON-safe snapshot at the start of every player turn', async () => {
  const snaps = [];
  const ui = makeUi({ checkpoint: s => snaps.push(s) });
  const { c } = await combat({ ui, deck: DECK, enemies: ['t_random', 't_random'], hp: 200 });
  await c.endPlayerTurn();
  await c.endPlayerTurn();
  assert.equal(snaps.length, 3);
  assert.deepEqual(snaps.map(s => s.turn), [1, 2, 3]);
  for (const s of snaps) assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.equal(snaps[2].phase, 'player');
  assert.ok(Array.isArray(snaps[2].piles.hand) && snaps[2].enemies.length === 2);
});

test('restore mid-fight, then continue: identical state to the original after the same actions', async () => {
  for (const seed of [3, 11, 42]) {
    let snap = null, runAtSnap = null;
    const ui = makeUi({ checkpoint: s => { if (s.turn === 3) { snap = s; runAtSnap = structuredClone(original.run); } } });
    const original = await combat({ ui, seed, deck: DECK, enemies: ['t_random', 't_random', 't_weeder'], hp: 300 });
    const c = original.c;
    await drive(c, 2);
    assert.ok(snap, 'reached turn 3');
    assert.equal(c.turn, 3);
    await drive(c, 3);
    const restored = Combat.restore(runAtSnap, snap, { ui: makeUi() });
    restored.resume();
    await drive(restored, 3);
    assert.deepEqual(strip(restored.serialize()), strip(c.serialize()), `seed ${seed}`);
    assert.equal(runAtSnap.coin, original.run.coin);
    assert.deepEqual(runAtSnap.deck.map(e => e.perm || null), original.run.deck.map(e => e.perm || null));
  }
});

test('restore keeps plots (guard, weeds, growth), statuses, powers, lock and enemy phase', async () => {
  const { c, run } = await combat({ deck: DECK, enemies: ['t_phaser'], script: { drawOrder: ['t_seed', 't_perseed'], weather: Array(10).fill('rain') }, hp: 200 });
  await c.playCard(c.hand.find(i => i.id === 't_seed'));
  await c.playCard(c.hand.find(i => i.id === 't_perseed'));
  await c.guard(0, 2);
  await c.plantWeed(1);
  await c.setWeather('frost', { lock: true });
  c.player.powers.t_listener = 1;
  c.player.status.bees = 3;
  c.alive()[0].phase = 2;
  const snap = c.serialize();
  const r = Combat.restore(structuredClone(run), snap);
  r.resume();
  assert.equal(r.phase, 'player');
  assert.deepEqual(r.plots.map(p => p && [p.id, p.growth, p.guard, p.weed]), c.plots.map(p => p && [p.id, p.growth, p.guard, p.weed]));
  assert.equal(typeof r.plots[0].def.bloom, 'function');
  assert.equal(r.weatherLock, true);
  assert.equal(r.player.status.bees, 3);
  assert.equal(r.player.powers.t_listener, 1);
  assert.equal(r.alive()[0].phase, 2);
  assert.equal(typeof r.alive()[0].def.next, 'function');
  await r.endPlayerTurn();
  assert.equal(r.weather, 'frost', 'lock survives the restore');
});

test('resume() returns the fight result promise', async () => {
  const { c, run } = await combat({ enemies: ['t_dummy'] });
  const r = Combat.restore(structuredClone(run), c.serialize());
  const done = r.resume();
  await r.hit(r.player, r.alive()[0], 999);
  assert.equal(await done, 'victory');
});
