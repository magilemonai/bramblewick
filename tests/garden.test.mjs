import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combat, play, log, resetLog, makeUi } from './helpers.mjs';
import { weedDef } from '../src/engine/content.js';

const script = (drawOrder, weather) => ({ drawOrder, weather });

test('seeds plant leftmost; seed cards are unplayable when every plot is full', async () => {
  const { c } = await combat({ deck: ['t_seed', 't_seed', 't_seed', 't_seed', 't_hit'], script: script(['t_seed', 't_seed', 't_seed', 't_seed', 't_hit'], ['drought']) });
  for (let k = 0; k < 3; k++) await play(c, 't_seed');
  assert.deepEqual(c.plots.map(p => p && p.id), ['t_bean', 't_bean', 't_bean']);
  const last = c.hand.find(i => i.id === 't_seed');
  assert.equal(c.canPlay(last), false);
  assert.equal(c.whyNot(last), 'Your plots are full.');
});

test('weather grows plants; a grown plant blooms, fires its effect and leaves the plot', async () => {
  resetLog();
  const { c, run } = await combat({ deck: ['t_seed', 't_hit', 't_hit', 't_hit', 't_hit'], script: script(['t_seed'], ['drought', 'rain']) });
  await play(c, 't_seed');
  assert.equal(c.plots[0].growth, 0);
  await c.endPlayerTurn();
  assert.equal(c.weather, 'rain');
  assert.equal(c.plots[0], null);
  assert.equal(c.alive()[0].hp, 45);
  assert.equal(run.stats.blooms, 1);
  assert.deepEqual(log.filter(l => l[0] === 'bloom'), [['bloom', 't_bean']]);
});

test('perennials reset to 0 growth and stay after blooming', async () => {
  const { c } = await combat({ deck: ['t_perseed', 't_hit', 't_hit', 't_hit', 't_hit'], script: script(['t_perseed'], ['drought', 'sun', 'sun']) });
  await play(c, 't_perseed');
  c.player.hp = 60;
  await c.endPlayerTurn();
  assert.equal(c.plots[0].id, 't_berry');
  assert.equal(c.plots[0].growth, 0);
  await c.endPlayerTurn();
  assert.equal(c.player.hp, 62);
});

test('harvest forces the oldest plant to bloom now', async () => {
  resetLog();
  const { c } = await combat({ deck: ['t_seed', 't_perseed', 't_hit', 't_hit', 't_hit'], script: script(['t_seed', 't_perseed'], ['drought']) });
  await play(c, 't_seed');
  await play(c, 't_perseed');
  await c.harvest('oldest');
  assert.equal(c.plots[0], null);
  assert.equal(c.plots[1].id, 't_berry');
  assert.deepEqual(log.filter(l => l[0] === 'bloom'), [['bloom', 't_bean']]);
});

test('trample destroys the most-grown plant and fires the trampled hook', async () => {
  resetLog();
  const { c } = await combat({ enemies: ['t_trampler'], deck: ['t_seed', 't_perseed', 't_hit', 't_hit', 't_hit'], script: script(['t_seed', 't_perseed'], ['drought', 'drought']) });
  c.player.powers.t_listener = 1;
  await play(c, 't_seed');
  await play(c, 't_perseed');
  c.plots[0].growth = 1;
  await c.endPlayerTurn();
  assert.equal(c.plots[0], null);
  assert.equal(c.plots[1]?.id, 't_berry', 'the less-grown plant is spared');
  assert.ok(log.some(l => l[0] === 'trampled' && l[1] === 't_bean'));
});

test('guard blocks one trample per point; the plant survives until guard runs out', async () => {
  resetLog();
  const ui = makeUi();
  const { c } = await combat({ ui, enemies: ['t_trampler'], deck: ['t_seed', 't_hit', 't_hit', 't_hit', 't_hit'], script: script(['t_seed'], ['drought', 'drought', 'drought']) });
  c.player.powers.t_listener = 1;
  await play(c, 't_seed');
  const ctx = c.makeCtx();
  assert.equal(await ctx.guard('all', 1), 1);
  assert.equal(c.plots[0].guard, 1);
  await c.endPlayerTurn();
  assert.equal(c.plots[0]?.id, 't_bean', 'guarded plant survives');
  assert.equal(c.plots[0].guard, 0);
  assert.ok(ui.calls.some(([t, d]) => t === 'guardBlock' && d.idx === 0));
  assert.ok(ui.calls.some(([t, d]) => t === 'guard' && d.idx === 0 && d.n === 1));
  assert.ok(!log.some(l => l[0] === 'trampled'), 'no trampled hook on a blocked trample');
  await c.endPlayerTurn();
  assert.equal(c.plots[0], null);
});

test('critters plant gloamweeds right-most first; weedPlanted fires for powers and keepsakes', async () => {
  resetLog();
  const ui = makeUi();
  const { c } = await combat({ ui, enemies: ['t_weeder'], keepsakes: ['t_weedwatch'], script: script([], Array(9).fill('drought')) });
  c.player.powers.t_listener = 1;
  await c.endPlayerTurn();
  assert.equal(c.plots[2]?.id, 'gloamweed');
  assert.equal(c.plots[2].weed, true);
  await c.endPlayerTurn();
  assert.equal(c.plots[1]?.id, 'gloamweed');
  assert.equal(c.freePlots(), 1);
  assert.equal(log.filter(l => l[0] === 'weedPlanted').length, 2);
  assert.equal(log.filter(l => l[0] === 'ks.weedPlanted').length, 2);
  assert.ok(ui.calls.some(([t, d]) => t === 'weed' && d.idx === 2));
});

test('weeds grow with the weather and bloom against the player, without counting as your bloom', async () => {
  resetLog();
  const { c, run } = await combat({ script: script([], Array(9).fill('drought')) });
  c.player.powers.t_listener = 1;
  await c.plantWeed(1);
  const w = c.plots[2];
  w.growth = w.growTime - 1;
  const hp = c.player.hp;
  await c.grow(1, 'all', true);
  assert.equal(run.stats.blooms, 0);
  assert.ok(!log.some(l => l[0] === 'bloomHook'), 'player bloom hooks ignore weeds');
  assert.ok(c.player.hp <= hp);
  if (!weedDef().perennial) assert.equal(c.plots[2], null);
});

test('player grow/harvest and critter trample/nibble never touch weeds', async () => {
  resetLog();
  const { c } = await combat({ script: script([], ['drought']) });
  await c.plantWeed(1);
  await c.grow(5, 'all');
  await c.harvest('oldest');
  await c.grow(3, 2);
  assert.equal(c.plots[2].growth, 0);
  await c.trample(1);
  await c.nibble(1);
  assert.equal(c.plots[2]?.id, 'gloamweed');
  assert.equal(await c.guard('all', 1), 0);
});

test('uproot removes plants without blooming; "weeds" clears every gloamweed', async () => {
  resetLog();
  const ui = makeUi();
  const { c } = await combat({ ui, deck: ['t_seed', 't_hit', 't_hit', 't_hit', 't_hit'], script: script(['t_seed'], ['drought']) });
  await play(c, 't_seed');
  await c.plantWeed(2);
  assert.deepEqual(c.plots.map(p => p && p.id), ['t_bean', 'gloamweed', 'gloamweed']);
  const ctx = c.makeCtx();
  assert.equal(await ctx.uproot('weeds'), 2);
  assert.deepEqual(c.plots.map(p => p && p.id), ['t_bean', null, null]);
  assert.equal(await ctx.uproot('oldest'), 1);
  assert.equal(c.plots[0], null);
  assert.ok(!log.some(l => l[0] === 'bloom'));
  assert.equal(ui.calls.filter(([t]) => t === 'uproot').length, 3);
});

test('addPlot adds a 4th plot (max 4) and seeds can fill it', async () => {
  const { c } = await combat({ deck: ['t_seed', 't_seed', 't_seed', 't_seed', 't_hit'], script: script(['t_seed', 't_seed', 't_seed', 't_seed'], ['drought']) });
  const ctx = c.makeCtx();
  assert.equal(await ctx.addPlot(), true);
  assert.equal(await ctx.addPlot(), false);
  assert.equal(c.plots.length, 4);
  for (let k = 0; k < 4; k++) await play(c, 't_seed');
  assert.equal(c.plots.filter(Boolean).length, 4);
});

test('setWeather with lock skips the next weather roll, then rolling resumes', async () => {
  const ui = makeUi();
  const { c } = await combat({ ui, deck: ['t_lock', 't_hit', 't_hit', 't_hit', 't_hit'], script: script(['t_lock'], ['sun', 'rain', 'wind']) });
  await play(c, 't_lock');
  assert.equal(c.weather, 'frost');
  assert.equal(c.weatherLock, true);
  assert.ok(ui.calls.some(([t, d]) => t === 'weatherLock' && d.weather === 'frost'));
  await c.endPlayerTurn();
  assert.equal(c.weather, 'frost', 'turn 2 keeps the locked weather');
  assert.equal(c.weatherLock, false);
  await c.endPlayerTurn();
  assert.equal(c.weather, 'wind', 'turn 3 rolls again');
});

test('weatherChanged fires only when the weather actually changes', async () => {
  resetLog();
  const { c } = await combat({ script: script([], ['sun', 'sun', 'rain']) });
  c.player.powers.t_listener = 1;
  await c.endPlayerTurn();
  await c.endPlayerTurn();
  await c.setWeather('rain');
  await c.setWeather('fog');
  assert.deepEqual(log.filter(l => l[0] === 'weatherChanged').map(l => l[1]), ['rain', 'fog']);
});
