import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combat, order } from './helpers.mjs';

const dry = { script: order([]) }; // drought every turn: no growth, no wind

test('attack hits for base damage', async () => {
  const { c } = await combat(dry);
  const e = c.alive()[0];
  await c.hit(c.player, e, 6);
  assert.equal(e.hp, 44);
});

test('grit adds damage per hit', async () => {
  const { c } = await combat(dry);
  const e = c.alive()[0];
  c.player.status.grit = 3;
  await c.hit(c.player, e, 6);
  await c.hit(c.player, e, 6);
  assert.equal(e.hp, 50 - 18);
});

test('dazed deals 25% less (floored)', async () => {
  const { c } = await combat(dry);
  c.player.status.dazed = 1;
  assert.equal(c.calcAttack(c.player, c.alive()[0], 6), 4);
  assert.equal(c.calcAttack(c.player, c.alive()[0], 10), 7);
});

test('soggy takes 50% more (floored)', async () => {
  const { c } = await combat(dry);
  const e = c.alive()[0];
  e.status.soggy = 2;
  assert.equal(c.calcAttack(c.player, e, 7), 10);
});

test('wind adds 2 to attacks on both sides, then dazed and soggy scale the total', async () => {
  const { c } = await combat(dry);
  const e = c.alive()[0];
  c.weather = 'wind';
  assert.equal(c.calcAttack(c.player, e, 6), 8);
  assert.equal(c.calcAttack(e, c.player, 10), 12);
  c.player.status.grit = 2; c.player.status.dazed = 1; e.status.soggy = 1;
  assert.equal(c.calcAttack(c.player, e, 6), Math.floor(Math.floor((6 + 2 + 2) * 0.75) * 1.5));
});

test('bark absorbs damage first; the rest comes off HP', async () => {
  const { c } = await combat(dry);
  const e = c.alive()[0];
  c.player.status.bark = 4;
  const lost = await c.hit(e, c.player, 10);
  assert.equal(lost, 6);
  assert.equal(c.player.hp, 66);
  assert.equal(c.player.status.bark, 0);
});

test('sturdy and frost add to every bark gain', async () => {
  const { c } = await combat(dry);
  c.player.status.sturdy = 2;
  await c.gainBark(c.player, 5);
  assert.equal(c.player.status.bark, 7);
  c.weather = 'frost';
  await c.gainBark(c.player, 5);
  assert.equal(c.player.status.bark, 7 + 10);
});

test('thorns hurt the attacker per hit', async () => {
  const { c } = await combat(dry);
  const e = c.alive()[0];
  e.status.thorns = 3;
  await c.hit(c.player, e, 6);
  await c.hit(c.player, e, 6);
  assert.equal(c.player.hp, 72 - 6);
});

test('wilt ticks at the start of the owner turn, then drops by 1', async () => {
  const { c } = await combat(dry);
  const e = c.alive()[0];
  c.player.status.wilt = 3;
  e.status.wilt = 2;
  await c.endPlayerTurn();
  assert.equal(e.hp, 48);
  assert.equal(e.status.wilt, 1);
  assert.equal(c.player.hp, 69);
  assert.equal(c.player.status.wilt, 2);
});

test('bark clears at the start of the player turn; dazed and soggy decay each turn', async () => {
  const { c } = await combat(dry);
  c.player.status.bark = 9; c.player.status.dazed = 2; c.player.status.soggy = 1;
  await c.endPlayerTurn();
  assert.equal(c.player.status.bark, 0);
  assert.equal(c.player.status.dazed, 1);
  assert.equal(c.player.status.soggy, undefined);
});

test('enemy intents show modified damage (enemyDmgAdd, grit)', async () => {
  const { c } = await combat({ ...dry, enemies: ['t_hitter'], customMods: { enemyDmgAdd: 3 } });
  const e = c.alive()[0];
  assert.equal(c.intentOf(e).dmg, 13);
  e.status.grit = 1;
  assert.equal(c.intentOf(e).dmg, 14);
  assert.equal(c.calcAttack(c.player, e, 6), 6, 'enemyDmgAdd never boosts the player');
  await c.endPlayerTurn();
  assert.equal(c.player.hp, 72 - 14);
});

test('mending the last critter ends the fight in victory and writes HP back to the run', async () => {
  const { c, run } = await combat(dry);
  c.player.hp = 60;
  await c.hit(c.player, c.alive()[0], 999);
  assert.equal(c.over, true);
  assert.equal(await c.done, 'victory');
  assert.equal(run.hp, 60);
  assert.equal(run.stats.mended, 1);
});

test('player at 0 HP loses the fight', async () => {
  const { c } = await combat({ ...dry, enemies: ['t_hitter'], hp: 5 });
  await c.endPlayerTurn();
  assert.equal(await c.done, 'defeat');
});
