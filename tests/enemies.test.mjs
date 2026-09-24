import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combat, makeUi } from './helpers.mjs';

const dry = { weather: Array(20).fill('drought'), drawOrder: [] };

test('e.stealCoin takes coin (never below 0) and floats a steal fx', async () => {
  const ui = makeUi();
  const { c, run } = await combat({ ui, enemies: ['t_thief'], script: dry });
  run.coin = 99;
  await c.endPlayerTurn();
  assert.equal(run.coin, 69);
  run.coin = 10;
  await c.endPlayerTurn();
  assert.equal(run.coin, 0);
  assert.deepEqual(ui.calls.filter(([t]) => t === 'steal').map(([, d]) => d.n), [30, 10]);
  assert.equal(c.alive()[0].stolen, 40);
});

test('e.phase sets self.phase (critters start at 1) and fires a bossPhase fx', async () => {
  const ui = makeUi();
  const { c } = await combat({ ui, enemies: ['t_phaser'], script: dry, kind: 'boss' });
  assert.equal(c.alive()[0].phase, 1);
  await c.endPlayerTurn();
  assert.equal(c.alive()[0].phase, 2);
  const fx = ui.calls.find(([t]) => t === 'bossPhase');
  assert.equal(fx[1].n, 2);
  assert.equal(fx[1].text, 'Phase two');
});

test('boss victory records the boss in run.bossesMended and stats.bosses', async () => {
  const { c, run } = await combat({ enemies: ['t_boss'], script: dry, kind: 'boss' });
  await c.hit(c.player, c.alive()[0], 999);
  assert.equal(await c.done, 'victory');
  assert.deepEqual(run.bossesMended, ['t_boss']);
  assert.equal(run.stats.bosses, 1);
});

test('summons respect the 5-critter cap', async () => {
  const { c } = await combat({ enemies: ['t_dummy', 't_dummy', 't_dummy', 't_dummy'], script: dry });
  const e = c.enemyCtx(c.alive()[0]);
  assert.ok(await e.summon('t_dummy'));
  assert.equal(await e.summon('t_dummy'), null);
  assert.equal(c.alive().length, 5);
});

test('an enemy move that throws is logged and the fight goes on', async () => {
  const { ENEMIES } = await import('../src/engine/content.js');
  ENEMIES.t_broken = { name: 'Broken', tier: 'normal', hp: 20, moves: { oops: { intent: 'attack', dmg: 1, run: () => { throw new Error('bad move'); } } }, next: () => 'oops' };
  const errs = []; const err = console.error; console.error = (...a) => errs.push(a.join(' '));
  const { c } = await combat({ enemies: ['t_broken'], script: dry });
  await c.endPlayerTurn();
  console.error = err;
  assert.equal(c.phase, 'player');
  assert.equal(c.turn, 2);
  assert.ok(errs.some(e => e.includes('t_broken')));
});
