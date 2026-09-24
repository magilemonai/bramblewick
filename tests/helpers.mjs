// Test fixtures: deterministic test-only cards, plants, enemies and keepsakes injected into the content
// tables (in this process only), plus a combat builder. Ids start with `t_` so they never clash.
import { CARDS, POWERS, PLANTS, ENEMIES, KEEPSAKES } from '../src/engine/content.js';
import { Combat } from '../src/engine/combat.js';
import { newRun } from '../src/engine/state.js';

export const log = []; // hook calls recorded by fixtures
export const resetLog = () => { log.length = 0; };

Object.assign(CARDS, {
  t_hit: { name: 'T Hit', type: 'tool', rarity: 'special', cost: 1, target: 'enemy', desc: () => 'Deal 6 damage.', async play(ctx) { await ctx.attack(6); } },
  t_block: { name: 'T Block', type: 'tend', rarity: 'special', cost: 1, target: 'none', desc: () => 'Gain 5 Bark.', play(ctx) { ctx.bark(5); } },
  t_free: { name: 'T Free', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '', play() {} },
  t_seed: { name: 'T Seed', type: 'seed', rarity: 'special', cost: 0, target: 'none', desc: () => '', play(ctx) { ctx.plant('t_bean'); } },
  t_perseed: { name: 'T Perennial', type: 'seed', rarity: 'special', cost: 0, target: 'none', desc: () => '', play(ctx) { ctx.plant('t_berry'); } },
  t_compost: { name: 'T Compost', type: 'tend', rarity: 'special', cost: 0, target: 'none', keywords: ['compost'], desc: () => '', play() {} },
  t_counter: { name: 'T Counter', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '', play(ctx) { log.push(['counted', ctx.cardsPlayedThisTurn]); } },
  t_perm: { name: 'T Perm', type: 'tool', rarity: 'special', cost: 0, target: 'enemy', desc: () => '',
    async play(ctx) { ctx.card.perm.n = (ctx.card.perm.n || 0) + 2; ctx.card.data.plays = (ctx.card.data.plays || 0) + 1; log.push(['perm', ctx.card.perm.n, ctx.card.data.plays]); } },
  t_choose: { name: 'T Choose', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '',
    async play(ctx) { ctx.bark(1); const i = await ctx.choose('Pick', [{ label: 'a' }, { label: 'b' }, { label: 'c' }]); log.push(['chose', i, ctx.player.status.bark || 0]); } },
  t_pick: { name: 'T Pick', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '',
    async play(ctx) { ctx.draw(1); const got = await ctx.pickCards({ from: 'hand', n: 2, min: 1, prompt: 'Pick' }); log.push(['picked', got.map(g => g.id), ctx.hand.length]); for (const g of got) ctx.exhaust(g); } },
  t_movetop: { name: 'T Move', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '',
    async play(ctx) { const [x] = await ctx.pickCards({ from: 'hand', n: 1, min: 1 }); if (x) { ctx.moveCard(x, 'drawTop'); ctx.draw(1); } } },
  t_upgrade: { name: 'T Upgrade', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '',
    async play(ctx) { for (const x of ctx.hand) ctx.upgrade(x); } },
  t_harvestchoose: { name: 'T Harvest', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '',
    play(ctx) { ctx.harvest('oldest'); ctx.bark(2); } },
  t_nested: { name: 'T Nested', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '',
    async play(ctx) { ctx.attack(1); ctx.draw(1).then(() => ctx.bark(3).then(() => ctx.grow(1))); } },
  t_sting: { name: 'T Sting', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '', play(ctx) { ctx.sting(3); } },
  t_bees: { name: 'T Bees', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '', play(ctx) { ctx.apply('self', 'bees', 4); } },
  t_lock: { name: 'T Lock', type: 'tend', rarity: 'special', cost: 0, target: 'none', desc: () => '', play(ctx) { ctx.setWeather('frost', { lock: true }); } },
  t_farmer_only: { name: 'T Farmer', type: 'tool', rarity: 'rare', cost: 1, target: 'enemy', pool: 'farmer', desc: () => '', play() {} },
  t_pell_only: { name: 'T Pell', type: 'tool', rarity: 'rare', cost: 1, target: 'enemy', pool: 'pell', desc: () => '', play() {} },
  t_rue_locked: { name: 'T Rue', type: 'tool', rarity: 'rare', cost: 1, target: 'enemy', unlock: { villager: 'rue', tier: 2 }, desc: () => '', play() {} },
  t_boss_locked: { name: 'T Boss', type: 'tool', rarity: 'rare', cost: 1, target: 'enemy', unlock: { boss: 'rootstag' }, desc: () => '', play() {} },
});

Object.assign(PLANTS, {
  t_bean: { name: 'T Bean', growTime: 2, perennial: false, desc: () => '', async bloom(ctx) { log.push(['bloom', 't_bean']); await ctx.attackRandom(5); } },
  t_berry: { name: 'T Berry', growTime: 1, perennial: true, desc: () => '', bloom(ctx) { log.push(['bloom', 't_berry']); ctx.heal(1); } },
  t_chooser: { name: 'T Chooser', growTime: 1, perennial: false, desc: () => '',
    async bloom(ctx) { const i = await ctx.choose('Bloom pick', [{ label: 'x' }, { label: 'y' }]); log.push(['bloomChose', i]); ctx.draw(1); } },
});

Object.assign(POWERS, {
  t_listener: { name: 'T Listener', desc: () => '', hooks: {
    trampled(ctx, n, plot) { log.push(['trampled', plot.id]); },
    weatherChanged(ctx, n, w) { log.push(['weatherChanged', w]); },
    cardExhausted(ctx, n, inst) { log.push(['cardExhausted', inst.id]); },
    stung(ctx, n, enemy) { log.push(['stung', enemy.id]); },
    weedPlanted(ctx, n, plot) { log.push(['weedPlanted', plot.id]); },
    async bloom(ctx) { log.push(['bloomHook']); await ctx.choose('hook pick', [{ label: 'p' }]); ctx.bark(1); },
  } },
});

const idle = { intent: 'buff', label: 'Idle', run: () => {} };
Object.assign(ENEMIES, {
  t_dummy: { name: 'Dummy', tier: 'normal', hp: 50, moves: { idle }, next: () => 'idle' },
  t_elite: { name: 'Elite Dummy', tier: 'elite', hp: 100, moves: { idle, swipe: { intent: 'attack', dmg: 4, run: e => e.attack(4) } }, next: e => (e.history.length ? 'idle' : 'swipe') },
  t_boss: { name: 'Boss Dummy', tier: 'boss', hp: 200, moves: { idle }, next: () => 'idle' },
  t_hitter: { name: 'Hitter', tier: 'normal', hp: 50, moves: { hit: { intent: 'attack', dmg: 10, run: e => e.attack(10) } }, next: () => 'hit' },
  t_trampler: { name: 'Trampler', tier: 'normal', hp: 50, moves: { stomp: { intent: 'trample', run: e => e.trample(1) } }, next: () => 'stomp' },
  t_weeder: { name: 'Weeder', tier: 'normal', hp: 50, moves: { weed: { intent: 'weed', run: e => e.plantWeed(1) } }, next: () => 'weed' },
  t_thief: { name: 'Thief', tier: 'normal', hp: 50, moves: { steal: { intent: 'steal', run: e => e.stealCoin(30) } }, next: () => 'steal' },
  t_phaser: { name: 'Phaser', tier: 'boss', hp: 80, moves: { shift: { intent: 'buff', run: e => { e.phase(2, 'Phase two'); } } }, next: () => 'shift' },
  // un-awaited calls must serialize: bark lands before thorns are read by the recorder
  t_sloppy: { name: 'Sloppy', tier: 'normal', hp: 50, moves: { mix: { intent: 'block', run: e => { e.bark(7); e.apply('self', 'thorns', 2); e.say('hi'); } } }, next: () => 'mix' },
  t_random: { name: 'Randy', tier: 'normal', hp: [30, 40], moves: {
    a: { intent: 'attack', dmg: 5, run: e => e.attack(5) },
    b: { intent: 'block', run: e => e.bark(6) },
    c: { intent: 'debuff', run: e => { e.apply('player', 'soggy', 1); e.nibble(1); } },
  }, next: e => ['a', 'b', 'c'][Math.floor(e.rand() * 3)] },
});

Object.assign(KEEPSAKES, {
  t_weedwatch: { name: 'T Weedwatch', rarity: 'special', desc: '', hooks: { weedPlanted(ctx, plot) { log.push(['ks.weedPlanted', plot.id]); } } },
});

// Records every fx call; optional choose/pickCards/checkpoint handlers.
export function makeUi(extra = {}) {
  const fx = [];
  return { fx: async (type, data) => { fx.push([type, data]); }, sync() {}, calls: fx, ...extra };
}

// Build a run + combat with a fixed deck and no keepsakes. Returns { run, c, ui }.
export async function combat({ deck = ['t_hit', 't_hit', 't_hit', 't_block', 't_block'], enemies = ['t_dummy'], seed = 7, kind = 'fight', ui = makeUi(), script = null, customMods = null, keepsakes = [], begin = true, hp = 72 } = {}) {
  const run = newRun({ seed, starterDeck: deck, customMods });
  run.keepsakes = [...keepsakes];
  run.hp = run.maxHp = hp;
  const c = new Combat(run, enemies, { ui, kind, script });
  if (begin) await c.begin();
  return { run, c, ui };
}

export const inHand = (c, id) => c.hand.find(i => i.id === id);
export async function play(c, id, target) {
  const inst = inHand(c, id);
  if (!inst) throw new Error(`card ${id} not in hand: ${c.hand.map(i => i.id).join(',')}`);
  return c.playCard(inst, target || c.alive()[0]);
}
// Resolves with the promise, or rejects after ms (catches deadlocks).
export function within(p, ms = 1000, label = 'operation') {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`${label} did not finish within ${ms}ms (deadlock?)`)), ms); })]).finally(() => clearTimeout(t));
}
// Force the whole deck to be drawn in a known order (script.drawOrder).
export const order = ids => ({ drawOrder: ids, weather: Array(40).fill('drought') });
