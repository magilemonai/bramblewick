// Bramblewick: cards and powers.
// Archetypes: the Garden (seeds, growth, blooms), the Hedgerow (Bark, Sturdy, Thorns),
// Compost & Rot (Compost keyword, Wilt), the Workbench (Tools, Grit, multi-hit), the Almanac
// Reader (weather setting and weather payoffs). 2.0 adds the Scarecrow (Guard on plots, weeding)
// for the Farmer and the Hive (Bees, Honey, smoke) for Pell. Every card leans on at least one of
// them and most of them touch the garden.
//
// Numbers in desc(u) match play(ctx) with ctx.u. Baseline: 1 stamina ~ 6 damage / 5 Bark.
// pool: 'farmer' | 'pell' (absent = shared). unlock: { villager, tier } | { boss } (absent = always).
// No 1.0 card carries an unlock; those are all on 2.0 cards.
//
// Pell's resources:
//   Bees   engine status `bees` on the player. Never decays. Each Bee stings a random critter for 1
//          at the end of the player's turn, straight through Bark. ctx.sting(n) stings now.
//   Honey  a content power (`honey`) used as a counter. Blooms make it (Queen Cell, Flower Crown),
//          cards spend it. spendHoney() below is the only thing that ever removes it.

import { PLANTS } from './plants.js';

const v = (u, a, b) => (u ? b : a);

export const SEED_CARD_IDS = [
  'turnip_seeds', 'sunflower_seeds', 'pumpkin_seeds', 'blueberry_seeds', 'chili_seeds',
  'mint_seeds', 'thornvine_seeds', 'frostlily_seeds', 'moonmelon_seeds', 'glowcap_seeds',
];

const randomSeedId = ctx => SEED_CARD_IDS[Math.floor(ctx.rand() * SEED_CARD_IDS.length)];
const isWeed = p => !!p && (p.id === 'gloamweed' || (p.def && p.def.hostile));
const plantCount = ctx => (ctx.plants || []).filter(p => p && !isWeed(p)).length;
const weedCount = ctx => (ctx.plants || []).filter(isWeed).length;
const hasKeyword = (cardId, kw) => ((CARDS[cardId] || {}).keywords || []).includes(kw);
const cardType = cardId => (CARDS[cardId] || {}).type;
// Index of the plot a plant object sits in (for hooks that receive the plant).
const plotIndexOf = (ctx, plant) => {
  const plots = ctx.plants || [];
  let i = plots.indexOf(plant);
  if (i < 0) i = plots.findIndex(p => p && p.id === plant.id && p.growth === 0);
  return i;
};
// Harvest every real plant, right to left (so the leftmost plot frees up last, for replanting).
async function harvestAll(ctx) {
  const plots = ctx.plants || [];
  for (let i = plots.length - 1; i >= 0; i--) if (plots[i] && !isWeed(plots[i])) await ctx.harvest(i);
}

// ---- Pell helpers (exported for keepsakes)
export const bees = ctx => (ctx.player.status || {}).bees || 0;
export const addBees = (ctx, n) => (n > 0 ? ctx.apply('self', 'bees', n) : Promise.resolve());
export const honey = ctx => (ctx.player.powers || {}).honey || 0;
export const addHoney = (ctx, n) => (n > 0 ? ctx.addPower('honey', n) : Promise.resolve());
export async function spendHoney(ctx, n) {
  const have = honey(ctx);
  if (n <= 0 || have < n) return false;
  await ctx.addPower('honey', -n);
  return true;
}

function seedCard(plantId, extra = {}) {
  const p = PLANTS[plantId];
  return {
    name: `${p.name} Seeds`, type: 'seed', rarity: 'common', cost: 1, target: 'none', art: 'icon_seed_pouch',
    desc: u => `Plant a ${p.name}. ${p.desc(u)}`,
    play(ctx) { ctx.plant(plantId); },
    ...extra,
  };
}

export const CARDS = {
  // ------------------------------------------------------------------ starter (Farmer)
  hoe_swing: {
    name: 'Hoe Swing', type: 'tool', rarity: 'starter', cost: 1, target: 'enemy', art: 'icon_hoe', pool: 'farmer',
    flavor: 'Nana said swing from the hips.',
    desc: u => `Deal ${v(u, 6, 9)} damage.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 6, 9)); },
  },
  mulch: {
    name: 'Mulch', type: 'tend', rarity: 'starter', cost: 1, target: 'none', art: 'icon_leaf', pool: 'farmer',
    flavor: 'A blanket for the soil. Also, apparently, for you.',
    desc: u => `Gain ${v(u, 5, 8)} Bark.`,
    play(ctx) { ctx.bark(v(ctx.u, 5, 8)); },
  },
  turnip_seeds: seedCard('turnip', {
    rarity: 'starter', flavor: 'Reliable. Round. A little bit angry.',
  }),

  // ------------------------------------------------------------------ common: garden
  watering_can: {
    name: 'Watering Can', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_watering_can',
    flavor: 'Tin, dented, sings a little when it pours.',
    desc: u => `Grow all plants ${v(u, 1, 2)}.`,
    play(ctx) { ctx.grow(v(ctx.u, 1, 2), 'all'); },
  },
  sickle: {
    name: 'Sickle', type: 'tool', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_sickle',
    flavor: 'Ripe enough.',
    desc: u => `Deal ${v(u, 5, 8)} damage. Harvest your oldest plant.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 5, 8)); if (plantCount(ctx)) await ctx.harvest('oldest'); },
  },
  sunflower_seeds: seedCard('sunflower', { art: 'icon_flower', season: 'summer', flavor: 'Turns to face whoever is working hardest.' }),
  blueberry_seeds: seedCard('blueberry', { flavor: 'Comes back every year whether you deserve it or not.' }),
  mint_seeds: seedCard('mint', { cost: 0, art: 'icon_leaf', flavor: 'You will never get rid of it. This is a feature.' }),
  pumpkin_seeds: seedCard('pumpkin', { season: 'fall', flavor: 'Patience, then a very large surprise.' }),
  chili_seeds: seedCard('chili', { season: 'summer', flavor: 'Bram grows these. Bram cries a lot.' }),
  thornvine_seeds: seedCard('thornvine', { flavor: 'A hedge with a grudge.' }),

  // ------------------------------------------------------------------ common: workbench
  rake: {
    name: 'Rake', type: 'tool', rarity: 'common', cost: 1, target: 'none', art: 'icon_rake',
    flavor: 'Step on it once and you learn.',
    desc: u => `Deal ${v(u, 6, 8)} damage to all critters.`,
    async play(ctx) { await ctx.attackAll(v(ctx.u, 6, 8)); },
  },
  pitchfork: {
    name: 'Pitchfork', type: 'tool', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_hoe', pool: 'farmer',
    flavor: 'Two points of view.',
    desc: u => `Deal ${v(u, 4, 5)} damage twice.`,
    async play(ctx) { const d = v(ctx.u, 4, 5); await ctx.attack(d); await ctx.attack(d); },
  },
  pickaxe: {
    name: 'Pickaxe', type: 'tool', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_pickaxe', keywords: ['compost'], pool: 'farmer',
    flavor: 'One good swing in it.',
    desc: u => `Deal ${v(u, 9, 12)} damage. Compost.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 9, 12)); },
  },
  axe_chop: {
    name: 'Axe Chop', type: 'tool', rarity: 'common', cost: 2, target: 'enemy', art: 'icon_axe', pool: 'farmer',
    flavor: 'Firewood does not argue back. Critters do, briefly.',
    desc: u => `Deal ${v(u, 12, 16)} damage. Apply 1 Dazed.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 12, 16)); ctx.apply(ctx.target, 'dazed', 1); },
  },
  slingshot: {
    name: 'Slingshot', type: 'tool', rarity: 'common', cost: 0, target: 'enemy', art: 'icon_slingshot', pool: 'farmer',
    flavor: "Juniper's. She wants it back eventually.",
    desc: u => `Deal ${v(u, 3, 5)} damage.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 3, 5)); },
  },
  pocket_of_pebbles: {
    name: 'Pocket of Pebbles', type: 'tend', rarity: 'common', cost: 0, target: 'none', art: 'icon_stone', pool: 'farmer',
    flavor: 'River-smooth. Perfect for throwing, terrible for laundry.',
    desc: u => `Add 3 ${u ? 'upgraded ' : ''}Pebbles to your hand.`,
    play(ctx) { for (let i = 0; i < 3; i++) ctx.addCard('pebble', 'hand', ctx.u); },
  },
  kite: {
    name: 'Kite', type: 'tool', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_kite', season: 'spring', pool: 'farmer',
    flavor: 'A paper wren on a long string.',
    desc: u => `Deal ${v(u, 4, 6)} damage twice. If it's Windy, three times.`,
    async play(ctx) {
      const d = v(ctx.u, 4, 6); const hits = ctx.weather === 'wind' ? 3 : 2;
      for (let i = 0; i < hits; i++) await ctx.attack(d);
    },
  },

  // ------------------------------------------------------------------ common: hedgerow
  hay_bale_wall: {
    name: 'Hay Bale Wall', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_log', keywords: ['fleeting'],
    flavor: 'Excellent cover. Blows away by supper.',
    desc: u => `Gain ${v(u, 9, 12)} Bark. Fleeting.`,
    play(ctx) { ctx.bark(v(ctx.u, 9, 12)); },
  },
  stone_fence: {
    name: 'Stone Fence', type: 'tend', rarity: 'common', cost: 2, target: 'none', art: 'icon_fence', pool: 'farmer',
    flavor: 'Every stone in it was once in the way.',
    desc: u => `Gain ${v(u, 12, 16)} Bark. Gain 1 Sturdy.`,
    play(ctx) { ctx.apply('self', 'sturdy', 1); ctx.bark(v(ctx.u, 12, 16)); },
  },
  scarecrow_stance: {
    name: 'Scarecrow Stance', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_scarecrow', pool: 'farmer',
    flavor: 'Arms out. Stare at nothing. The crows hate it.',
    desc: u => `Gain 4 Bark, plus ${v(u, 3, 4)} for each plant in your garden.`,
    play(ctx) { ctx.bark(4 + v(ctx.u, 3, 4) * plantCount(ctx)); },
  },
  bramble_coat: {
    name: 'Bramble Coat', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_quilt', pool: 'farmer',
    flavor: 'Itchy. Worth it.',
    desc: u => `Gain ${v(u, 4, 6)} Bark and ${v(u, 2, 3)} Thorns.`,
    play(ctx) { ctx.bark(v(ctx.u, 4, 6)); ctx.apply('self', 'thorns', v(ctx.u, 2, 3)); },
  },

  // ------------------------------------------------------------------ common: compost & rot
  rot: {
    name: 'Rot', type: 'tend', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_mushroom',
    flavor: 'Everything returns to the soil. Some things faster.',
    desc: u => `Apply ${v(u, 4, 6)} Wilt.`,
    play(ctx) { ctx.apply(ctx.target, 'wilt', v(ctx.u, 4, 6)); },
  },
  rotten_pumpkin: {
    name: 'Rotten Pumpkin', type: 'tool', rarity: 'common', cost: 1, target: 'none', art: 'icon_compost', keywords: ['compost'],
    flavor: 'Last year\'s. Ripe in the wrong direction.',
    desc: u => `Deal ${v(u, 6, 8)} damage to all critters and apply 2 Wilt to each. Compost.`,
    async play(ctx) { await ctx.attackAll(v(ctx.u, 6, 8)); ctx.apply('all', 'wilt', 2); },
  },
  spread_compost: {
    name: 'Spread Compost', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_compost', keywords: ['compost'],
    flavor: 'Smells like the future.',
    desc: u => `Grow all plants 1. Draw ${v(u, 1, 2)} card${u ? 's' : ''}. Compost.`,
    play(ctx) { ctx.grow(1, 'all'); ctx.draw(v(ctx.u, 1, 2)); },
  },

  // ------------------------------------------------------------------ common: cozy / almanac
  cup_of_tea: {
    name: 'Cup of Tea', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_teacup',
    flavor: 'Sit down for a moment. The critters can wait.',
    desc: u => `Draw ${v(u, 2, 3)} cards.`,
    play(ctx) { ctx.draw(v(ctx.u, 2, 3)); },
  },
  sunbreak: {
    name: 'Sunbreak', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_sun', season: 'summer',
    flavor: 'The clouds step aside like they were asked nicely.',
    desc: u => `Weather becomes Sun. Gain 1 Stamina. Draw ${v(u, 1, 2)} card${u ? 's' : ''}.`,
    play(ctx) { ctx.setWeather('sun'); ctx.gainStamina(1); ctx.draw(v(ctx.u, 1, 2)); },
  },
  whistle_up_wind: {
    name: 'Whistle Up a Wind', type: 'tool', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_flute', season: 'fall',
    flavor: 'Two notes. The hedges lean. Everyone hits harder, including them.',
    desc: u => `Deal ${v(u, 6, 9)} damage. Weather becomes Wind.`,
    async play(ctx) { ctx.setWeather('wind'); await ctx.attack(v(ctx.u, 6, 9)); },
  },

  // ------------------------------------------------------------------ common: scarecrow + weeding (2.0)
  scarecrow: {
    name: 'Scarecrow', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_scarecrow',
    flavor: "Nana's coat, Bram's broom handle, Juniper's second-best hat. The crows are not fooled. The crows leave anyway.",
    desc: u => `Guard every plant in your garden. A trample knocks the Guard down instead of the plant.${u ? ' Gain 4 Bark.' : ''}`,
    play(ctx) { ctx.guard('all', 1); if (ctx.u) ctx.bark(4); },
  },
  trellis: {
    name: 'Trellis', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_fence',
    flavor: 'Something to lean on. Everyone needs one.',
    desc: u => `Grow your oldest plant ${v(u, 2, 3)} and Guard it.`,
    canPlay(ctx) { return plantCount(ctx) > 0; },
    play(ctx) { ctx.guard('oldest', 1); ctx.grow(v(ctx.u, 2, 3), 'oldest'); },
  },
  weeding_hook: {
    name: 'Weeding Hook', type: 'tool', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_root',
    flavor: 'Get under it. Get all of it. Otherwise it is only a haircut.',
    desc: u => `Deal ${v(u, 6, 9)} damage. Uproot every Gloamweed in your garden.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 6, 9)); ctx.uproot('weeds'); },
  },
  pull_weeds: {
    name: 'Pull Weeds', type: 'tend', rarity: 'common', cost: 0, target: 'none', art: 'icon_thorn', unlock: { villager: 'juniper', tier: 1 },
    flavor: "Juniper charges a coin a weed. She has never once been paid and has never once stopped.",
    desc: u => `Uproot every Gloamweed in your garden. Draw ${v(u, 1, 2)} card${u ? 's' : ''}, plus 1 for each weed pulled.`,
    play(ctx) { const k = weedCount(ctx); ctx.uproot('weeds'); ctx.draw(v(ctx.u, 1, 2) + k); },
  },
  sort_the_harvest: {
    name: 'Sort the Harvest', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_basket',
    flavor: 'Good pile, bad pile, pile for Rue. Only the bad pile goes on the heap.',
    desc: u => `Compost up to 2 cards from your hand. Draw 1 card for each, plus ${v(u, 1, 2)}.`,
    async play(ctx) {
      const picked = await ctx.pickCards({ from: 'hand', n: 2, min: 0, prompt: 'Compost up to 2' });
      for (const inst of picked) ctx.exhaust(inst);
      ctx.draw(picked.length + v(ctx.u, 1, 2));
    },
  },
  seed_saver: {
    name: 'Seed Saver', type: 'tend', rarity: 'common', cost: 1, costUp: 0, target: 'none', art: 'icon_letter', unlock: { villager: 'odile', tier: 1 },
    flavor: 'An envelope with a year on it and nothing else. Odile says that is a filing system.',
    desc: () => 'Put a card from your discard pile on top of your draw pile. Draw 1 card.',
    canPlay(ctx) { return ctx.discardPile.length > 0; },
    async play(ctx) {
      const picked = await ctx.pickCards({ from: 'discard', n: 1, min: 1, prompt: 'Save one' });
      for (const inst of picked) ctx.moveCard(inst, 'drawTop');
      ctx.draw(1);
    },
  },
  sharpen: {
    name: 'Sharpen', type: 'tend', rarity: 'common', cost: 0, target: 'none', art: 'icon_stone', pool: 'farmer', unlock: { villager: 'bram', tier: 1 },
    flavor: 'Bram: "Ten strokes, same angle, and stop talking to it."',
    desc: u => `Upgrade ${v(u, 'a Tool', 'up to 2 Tools')} in your hand for this fight.`,
    canPlay(ctx) { return ctx.hand.some(c => c !== ctx.card && cardType(c.id) === 'tool' && !c.u); },
    async play(ctx) {
      const picked = await ctx.pickCards({ from: 'hand', n: v(ctx.u, 1, 2), min: 0, filter: c => cardType(c.id) === 'tool' && !c.u, prompt: 'Sharpen' });
      for (const inst of picked) ctx.upgrade(inst);
    },
  },

  // ------------------------------------------------------------------ uncommon: garden
  rain_dance: {
    name: 'Rain Dance', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_raincloud', season: 'spring',
    flavor: 'Mostly stomping. The sky respects effort.',
    desc: u => `Grow all plants ${v(u, 2, 3)}. Weather becomes Rain.`,
    play(ctx) { ctx.grow(v(ctx.u, 2, 3), 'all'); ctx.setWeather('rain'); },
  },
  frostlily_seeds: seedCard('frostlily', { rarity: 'uncommon', art: 'icon_snowflake', season: 'winter', flavor: 'Blooms when nothing else will.' }),
  moonmelon_seeds: seedCard('moonmelon', { rarity: 'uncommon', art: 'icon_moon', season: 'fall', flavor: 'Ripens at night. Do not ask what it is looking at.' }),
  glowcap_seeds: seedCard('glowcap', { rarity: 'uncommon', art: 'icon_mushroom', season: 'fall', flavor: 'Pale, patient, and mildly poisonous. Like a librarian.' }),
  seed_pouch: {
    name: 'Seed Pouch', type: 'tend', rarity: 'uncommon', cost: 1, costUp: 0, target: 'none', art: 'icon_seed_pouch',
    flavor: 'Nana labeled nothing. Every pocket is a surprise.',
    desc: () => 'Add 2 random Seed cards to your hand.',
    play(ctx) { ctx.addCard(randomSeedId(ctx), 'hand'); ctx.addCard(randomSeedId(ctx), 'hand'); },
  },
  sprouted_seeds: {
    name: 'Sprouted Seeds', type: 'seed', rarity: 'uncommon', cost: 0, target: 'none', art: 'icon_seed_pouch', keywords: ['early', 'compost'],
    flavor: 'Started on the windowsill. Impatient little things.',
    desc: u => `Early. Plant a Turnip with ${v(u, 1, 2)} growth already. Compost.`,
    play(ctx) {
      const idx = (ctx.plants || []).findIndex(p => !p);
      if (ctx.plant('turnip') !== false && idx >= 0) ctx.grow(v(ctx.u, 1, 2), idx);
    },
  },
  cloche: {
    name: 'Glass Cloche', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_lantern', season: 'winter',
    flavor: 'A tiny greenhouse for one very spoiled plant.',
    desc: u => `Grow your oldest plant ${v(u, 3, 5)}.`,
    play(ctx) { ctx.grow(v(ctx.u, 3, 5), 'oldest'); },
  },
  harvest_basket: {
    name: 'Harvest Basket', type: 'tend', rarity: 'uncommon', cost: 1, costUp: 0, target: 'none', art: 'icon_basket', keywords: ['keep'],
    flavor: 'Hold it until the moment is right. Then hold it a second longer.',
    desc: () => 'Harvest all your plants. Keep.',
    canPlay(ctx) { return plantCount(ctx) > 0; },
    async play(ctx) { await harvestAll(ctx); },
  },
  pruning_shears: {
    name: 'Pruning Shears', type: 'tool', rarity: 'uncommon', cost: 1, target: 'enemy', art: 'icon_sickle',
    flavor: 'Cut back, grow back.',
    desc: u => `Deal ${v(u, 7, 10)} damage. If that mends the critter, grow all plants 2.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 7, 10)); if (ctx.target && ctx.target.hp <= 0) ctx.grow(2, 'all'); },
  },
  bumblebee: {
    name: 'Bumblebee', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_bee',
    flavor: 'Too round to fly. Flies anyway. Bites, technically.',
    desc: u => `Whenever a plant blooms, deal ${v(u, 5, 8)} damage to a random critter.`,
    play(ctx) { ctx.addPower('bumblebee', v(ctx.u, 5, 8)); },
  },
  bell_on_the_gate: {
    name: 'Bell on the Gate', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_bell',
    flavor: 'Rings when someone goes home. The garden likes the sound.',
    desc: u => `Whenever a critter is mended, grow all plants ${v(u, 2, 3)}.`,
    play(ctx) { ctx.addPower('bell_on_the_gate', v(ctx.u, 2, 3)); },
  },
  crop_rotation: {
    name: 'Crop Rotation', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_trowel', unlock: { villager: 'mossy', tier: 1 },
    flavor: 'Mossy: "Same thing in the same dirt every year and the dirt stops listening."',
    desc: u => `Choose a plant to harvest now. Plant a Turnip in its place${u ? ' with 1 growth already' : ''}.`,
    canPlay(ctx) { return plantCount(ctx) > 0; },
    async play(ctx) {
      const plots = ctx.plants || [];
      const idxs = plots.map((p, i) => (p && !isWeed(p) ? i : -1)).filter(i => i >= 0);
      if (!idxs.length) return;
      const pick = idxs.length === 1 ? 0 : await ctx.choose('Harvest which?', idxs.map(i => ({ label: PLANTS[plots[i].id]?.name || plots[i].id, desc: `${plots[i].growth}/${plots[i].growTime} grown`, icon: `${PLANTS[plots[i].id]?.sprite || 'plant_turnip'}_3` })));
      const i = idxs[Math.max(0, Math.min(idxs.length - 1, pick))];
      await ctx.harvest(i);
      const free = plots.findIndex(p => !p);
      if (await ctx.plant('turnip') !== false && ctx.u && free >= 0) ctx.grow(1, free);
    },
  },
  feed_the_heap: {
    name: 'Feed the Heap', type: 'tend', rarity: 'uncommon', cost: 0, target: 'none', art: 'icon_compost', unlock: { villager: 'rue', tier: 2 },
    flavor: 'Rue keeps a bucket by the door for peelings, ends, and cards that have let her down.',
    desc: u => `Compost a card from your hand. If you do, grow all plants ${v(u, 2, 3)}.`,
    canPlay(ctx) { return ctx.hand.some(c => c !== ctx.card); },
    async play(ctx) {
      const picked = await ctx.pickCards({ from: 'hand', n: 1, min: 1, prompt: 'Feed the heap' });
      if (!picked.length) return;
      for (const inst of picked) ctx.exhaust(inst);
      ctx.grow(v(ctx.u, 2, 3), 'all');
    },
  },
  raised_bed: {
    name: 'Raised Bed', type: 'tend', rarity: 'uncommon', cost: 1, costUp: 0, target: 'none', art: 'icon_seed_tray', keywords: ['compost'], unlock: { boss: 'rootstag' },
    flavor: 'Four planks and a wheelbarrow of the good dirt. The stag pretended not to notice.',
    desc: () => 'Add a 4th plot to your garden for this fight. Compost.',
    play(ctx) { ctx.addPlot(); },
  },

  // ------------------------------------------------------------------ uncommon: hedgerow
  hedgerow: {
    name: 'Hedgerow', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_fence', pool: 'farmer',
    flavor: 'Takes years to grow and one afternoon to appreciate.',
    desc: u => `Gain ${v(u, 2, 3)} Sturdy.`,
    play(ctx) { ctx.apply('self', 'sturdy', v(ctx.u, 2, 3)); },
  },
  hedge_trimmer: {
    name: 'Hedge Trimmer', type: 'tool', rarity: 'uncommon', cost: 1, costUp: 0, target: 'enemy', art: 'icon_axe', pool: 'farmer',
    flavor: 'Bark on, bark off.',
    desc: () => 'Deal damage equal to your Bark.',
    async play(ctx) { await ctx.attack(ctx.player.status.bark || 0); },
  },
  patchwork_quilt: {
    name: 'Patchwork Quilt', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_quilt', pool: 'farmer',
    flavor: 'Every square is a shirt somebody outgrew.',
    desc: u => `At the end of your turn, gain ${v(u, 3, 5)} Bark.`,
    play(ctx) { ctx.addPower('patchwork_quilt', v(ctx.u, 3, 5)); },
  },
  hoarfrost_breath: {
    name: 'Hoarfrost Breath', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_snowflake', season: 'winter',
    flavor: 'Breathe out slowly. Watch it settle on everything.',
    desc: u => `Weather becomes Frost. Gain ${v(u, 7, 10)} Bark.`,
    play(ctx) { ctx.setWeather('frost'); ctx.bark(v(ctx.u, 7, 10)); },
  },
  deep_frost: {
    name: 'Deep Frost', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_icicle', season: 'winter', pool: 'farmer', unlock: { villager: 'mossy', tier: 2 },
    flavor: 'The kind that gets into the ground and stays. Mossy says it keeps the dead things asleep.',
    desc: u => `Weather becomes Frost and stays Frost next turn. Gain ${v(u, 6, 9)} Bark.`,
    play(ctx) { ctx.setWeather('frost', { lock: true }); ctx.bark(v(ctx.u, 6, 9)); },
  },

  // ------------------------------------------------------------------ uncommon: compost & rot
  second_breakfast: {
    name: 'Second Breakfast', type: 'tend', rarity: 'uncommon', cost: 0, target: 'none', art: 'icon_bread', keywords: ['compost'],
    flavor: 'The first one was a rehearsal.',
    desc: u => `Draw ${v(u, 2, 3)} cards. Gain 1 Stamina. Compost.`,
    play(ctx) { ctx.draw(v(ctx.u, 2, 3)); ctx.gainStamina(1); },
  },
  nettle_soup: {
    name: 'Nettle Soup', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_teacup',
    flavor: "Rue's recipe. Stings going down, stings going out.",
    desc: u => `Apply ${v(u, 3, 5)} Wilt to all critters.`,
    play(ctx) { ctx.apply('all', 'wilt', v(ctx.u, 3, 5)); },
  },
  black_rot: {
    name: 'Black Rot', type: 'tend', rarity: 'uncommon', cost: 1, costUp: 0, target: 'enemy', art: 'icon_mushroom',
    flavor: 'It spreads.',
    desc: () => "Double a critter's Wilt.",
    canPlay(ctx) { return ctx.enemies.some(en => (en.status.wilt || 0) > 0); },
    play(ctx) { const w = ctx.target.status.wilt || 0; if (w > 0) ctx.apply(ctx.target, 'wilt', w); },
  },
  compost_heap: {
    name: 'Compost Heap', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_compost',
    flavor: 'Nothing is wasted. Everything is late.',
    desc: u => `Whenever you play a Compost card, grow all plants ${v(u, 1, 2)}.`,
    play(ctx) { ctx.addPower('compost_heap', v(ctx.u, 1, 2)); },
  },
  mushroom_log: {
    name: 'Mushroom Log', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_log',
    flavor: 'Damp, dark, and quietly productive.',
    desc: u => `At the start of your turn, apply ${v(u, 2, 3)} Wilt to all critters.`,
    play(ctx) { ctx.addPower('mushroom_log', v(ctx.u, 2, 3)); },
  },

  // ------------------------------------------------------------------ uncommon: workbench
  whetstone: {
    name: 'Whetstone', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_stone', pool: 'farmer',
    flavor: 'Bram says a dull tool is a rude tool.',
    desc: u => `Gain ${v(u, 2, 3)} Grit.`,
    play(ctx) { ctx.apply('self', 'grit', v(ctx.u, 2, 3)); },
  },
  scythe_sweep: {
    name: 'Scythe Sweep', type: 'tool', rarity: 'uncommon', cost: 2, target: 'none', art: 'icon_scythe', pool: 'farmer',
    flavor: 'Wide, low, and unkind to ankles.',
    desc: u => `Deal ${v(u, 8, 11)} damage to all critters and apply 1 Soggy to each.`,
    async play(ctx) { await ctx.attackAll(v(ctx.u, 8, 11)); ctx.apply('all', 'soggy', 1); },
  },
  tool_belt: {
    name: 'Tool Belt', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_straw_hat', pool: 'farmer',
    flavor: 'Loops for everything. Nothing ever in the right loop.',
    desc: u => `Whenever you play a Tool, gain ${v(u, 1, 2)} Bark.`,
    play(ctx) { ctx.addPower('tool_belt', v(ctx.u, 1, 2)); },
  },

  // ------------------------------------------------------------------ uncommon: almanac reader
  fog_lantern: {
    name: 'Fog Lantern', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_lantern', season: 'fall',
    flavor: 'You can\'t see them. They can\'t see you either.',
    desc: u => `Apply ${v(u, 2, 3)} Dazed to all critters. Weather becomes Fog.`,
    play(ctx) { ctx.apply('all', 'dazed', v(ctx.u, 2, 3)); ctx.setWeather('fog'); },
  },
  weathervane: {
    name: 'Weathervane', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_wind',
    flavor: 'A tin rooster that is right more often than the Almanac. Do not tell the Almanac.',
    desc: u => `Each turn, a weather favor. Sun: draw ${v(u, 1, 2)}. Rain: grow ${v(u, 1, 2)}. Wind: ${v(u, 6, 9)} dmg. Frost: ${v(u, 6, 9)} Bark. Fog: Daze all ${v(u, 1, 2)}. Drought: +${v(u, 1, 2)} Stamina.`,
    play(ctx) { ctx.addPower('weathervane', v(ctx.u, 1, 2)); },
  },
  read_the_almanac: {
    name: 'Read the Almanac', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_book',
    flavor: '"Page forty. No, forty-one. No, the one with the jam on it."',
    desc: u => `Choose the weather. Sun: draw ${v(u, 2, 3)} cards. Rain: grow all plants ${v(u, 2, 3)}. Wind: deal ${v(u, 7, 10)} damage to all critters.`,
    async play(ctx) {
      const pick = await ctx.choose('What does the page say?', [
        { label: 'Sun', desc: `Draw ${v(ctx.u, 2, 3)}`, icon: 'w_sun' },
        { label: 'Rain', desc: `Grow all ${v(ctx.u, 2, 3)}`, icon: 'w_rain' },
        { label: 'Wind', desc: `${v(ctx.u, 7, 10)} to all critters`, icon: 'w_wind' },
      ]);
      if (pick === 1) { ctx.setWeather('rain'); ctx.grow(v(ctx.u, 2, 3), 'all'); }
      else if (pick === 2) { ctx.setWeather('wind'); await ctx.attackAll(v(ctx.u, 7, 10)); }
      else { ctx.setWeather('sun'); ctx.draw(v(ctx.u, 2, 3)); }
    },
  },
  barometer: {
    name: 'Barometer', type: 'tend', rarity: 'uncommon', cost: 1, costUp: 0, target: 'none', art: 'icon_rain_gauge', unlock: { villager: 'odile', tier: 2 },
    flavor: "Off the barge. Odile taps it twice before she trusts it, and then trusts it completely.",
    desc: () => "Lock the weather: tomorrow is the same as today. Draw 1 card.",
    play(ctx) { ctx.setWeather(ctx.weather, { lock: true }); ctx.draw(1); },
  },
  seed_the_clouds: {
    name: 'Seed the Clouds', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_raincloud', unlock: { boss: 'scorchmoth' },
    flavor: 'Something the moth taught you by doing the opposite.',
    desc: u => `Weather becomes Rain and stays Rain next turn. Grow all plants ${v(u, 1, 2)}.`,
    play(ctx) { ctx.setWeather('rain', { lock: true }); ctx.grow(v(ctx.u, 1, 2), 'all'); },
  },

  // ------------------------------------------------------------------ rare
  pumpkin_patch: {
    name: 'Pumpkin Patch', type: 'seed', rarity: 'rare', cost: 2, target: 'none', art: 'icon_seed_pouch', season: 'fall',
    flavor: 'Go big. Then go bigger. Then wait.',
    desc: u => `Plant a Pumpkin in every empty plot.${u ? ' Then grow all plants 1.' : ''}`,
    play(ctx) { for (let i = 0; i < 4 && ctx.freePlots() > 0; i++) ctx.plant('pumpkin'); if (ctx.u) ctx.grow(1, 'all'); },
  },
  wrens_song: {
    name: "Wren's Song", type: 'tend', rarity: 'rare', cost: 2, costUp: 1, target: 'none', art: 'icon_flute',
    flavor: 'Half the words are missing. The garden knows them anyway.',
    desc: () => 'Harvest all your plants, then plant them again.',
    canPlay(ctx) { return plantCount(ctx) > 0; },
    async play(ctx) {
      const ids = ctx.plants.filter(p => p && !isWeed(p)).map(p => p.id);
      await harvestAll(ctx);
      for (const id of ids) if (ctx.freePlots() > 0) ctx.plant(id);
    },
  },
  greenhouse: {
    name: 'Greenhouse', type: 'charm', rarity: 'rare', cost: 2, costUp: 1, target: 'none', art: 'icon_sun',
    flavor: 'Glass, warmth, and a smug disregard for the forecast.',
    desc: () => 'At the start of your turn, grow all plants 1, whatever the weather.',
    play(ctx) { ctx.addPower('greenhouse', 1); },
  },
  honeycomb: {
    name: 'Honeycomb', type: 'charm', rarity: 'rare', cost: 2, costUp: 1, target: 'none', art: 'icon_honey',
    flavor: "Pell's bees pay rent in the best possible currency.",
    desc: () => 'Whenever a plant blooms, gain 1 Stamina and draw 1 card.',
    play(ctx) { ctx.addPower('honeycomb', 1); },
  },
  seed_tin: {
    name: "Nana's Seed Tin", type: 'charm', rarity: 'rare', cost: 1, target: 'none', art: 'icon_book',
    flavor: 'An old biscuit tin. Never once contained biscuits.',
    desc: u => `At the start of your turn, add a random Seed card to your hand${u ? ' and grow all plants 1' : ''}.`,
    play(ctx) { ctx.addPower('seed_tin', v(ctx.u, 1, 2)); },
  },
  grandmothers_recipe: {
    name: "Grandmother's Recipe", type: 'charm', rarity: 'rare', cost: 1, target: 'none', art: 'icon_pie',
    flavor: 'Step one: grow it. Step two: there is no step two. Eat.',
    desc: u => `Whenever a plant blooms, heal ${v(u, 3, 5)}.`,
    play(ctx) { ctx.addPower('grandmothers_recipe', v(ctx.u, 3, 5)); },
  },
  almanac_margin_note: {
    name: 'Almanac Margin Note', type: 'tend', rarity: 'rare', cost: 1, costUp: 0, target: 'none', art: 'icon_scroll', keywords: ['keep'],
    flavor: "In Nana's hand: 'rain for the beds, wind for the beasts.'",
    desc: () => 'Keep. Weather becomes Rain if you have plants, otherwise Wind. Draw 1 card.',
    play(ctx) { ctx.setWeather(plantCount(ctx) ? 'rain' : 'wind'); ctx.draw(1); },
  },
  thunderclap: {
    name: 'Thunderclap', type: 'tool', rarity: 'rare', cost: 2, target: 'none', art: 'icon_raincloud', season: 'summer',
    flavor: 'Count the seconds. Zero.',
    desc: u => `Deal ${v(u, 14, 18)} damage to all critters. Weather becomes Rain.`,
    async play(ctx) { await ctx.attackAll(v(ctx.u, 14, 18)); ctx.setWeather('rain'); },
  },
  bramble_heart: {
    name: 'Bramble Heart', type: 'charm', rarity: 'rare', cost: 2, target: 'none', art: 'icon_heart', pool: 'farmer',
    flavor: 'Grow a thick skin and the thorns come free.',
    desc: u => `Whenever you gain Bark, deal ${v(u, 4, 6)} damage to a random critter.`,
    play(ctx) { ctx.addPower('bramble_heart', v(ctx.u, 4, 6)); },
  },
  hedge_maze: {
    name: 'Hedge Maze', type: 'tend', rarity: 'rare', cost: 2, target: 'none', art: 'icon_fence', pool: 'farmer',
    flavor: 'They will find their way out eventually. Eventually.',
    desc: u => `Gain ${v(u, 20, 26)} Bark. Apply 2 Dazed to all critters.`,
    play(ctx) { ctx.bark(v(ctx.u, 20, 26)); ctx.apply('all', 'dazed', 2); },
  },
  workbench: {
    name: 'The Workbench', type: 'charm', rarity: 'rare', cost: 3, costUp: 2, target: 'none', art: 'icon_log', pool: 'farmer',
    flavor: "Bram's, on loan. Every tool you touch comes off it sharper.",
    desc: () => 'At the start of your turn, gain 2 Grit.',
    play(ctx) { ctx.addPower('workbench', 2); },
  },
  hammer_and_tongs: {
    name: 'Hammer and Tongs', type: 'tool', rarity: 'rare', cost: 2, target: 'enemy', art: 'icon_pickaxe', pool: 'farmer',
    flavor: 'Hit it while it\'s hot. Then again while it\'s warm.',
    desc: u => `Deal ${v(u, 10, 14)} damage. Gain ${v(u, 2, 3)} Grit.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 10, 14)); ctx.apply('self', 'grit', v(ctx.u, 2, 3)); },
  },
  harvest_moon: {
    name: 'Harvest Moon', type: 'tool', rarity: 'rare', cost: 2, costUp: 1, target: 'none', art: 'icon_moon', season: 'fall',
    flavor: 'Everything rotten comes due at once.',
    desc: u => `Deal damage to each critter equal to ${v(u, 'twice', 'three times')} its Wilt.`,
    async play(ctx) {
      const m = v(ctx.u, 2, 3);
      for (const en of [...ctx.enemies]) { const w = en.status.wilt || 0; if (w > 0 && en.hp > 0) await ctx.attack(w * m, en); }
    },
  },
  bonfire_night: {
    name: 'Bonfire Night', type: 'tool', rarity: 'rare', cost: 2, target: 'none', art: 'icon_lantern',
    flavor: 'Everyone brings something they are done with.',
    desc: u => `Compost your hand. Deal ${v(u, 6, 8)} damage to all critters for each card composted.`,
    async play(ctx) {
      const k = ctx.hand.filter(c => c.id !== 'bonfire_night').length;
      if (k > 0) ctx.exhaustRandom(k);
      for (let i = 0; i < k; i++) await ctx.attackAll(v(ctx.u, 6, 8));
    },
  },
  heirloom_hoe: {
    name: 'Heirloom Hoe', type: 'tool', rarity: 'rare', cost: 1, target: 'enemy', art: 'icon_hoe', pool: 'farmer', unlock: { villager: 'bram', tier: 2 },
    flavor: "Nana's, then yours. Bram re-hung the head and would not say what he did to the blade.",
    desc: u => `Deal ${v(u, 6, 9)} damage. Every time you swing it, it hits ${v(u, 2, 3)} harder, for the rest of the year.`,
    async play(ctx) {
      const perm = ctx.card.perm || (ctx.card.perm = {});
      const bonus = perm.bonus || 0;
      await ctx.attack(v(ctx.u, 6, 9) + bonus);
      perm.bonus = bonus + v(ctx.u, 2, 3);
    },
  },
  old_scarecrow: {
    name: 'The Old Scarecrow', type: 'charm', rarity: 'rare', cost: 1, target: 'none', art: 'icon_scarecrow', unlock: { boss: 'hollowjack' },
    flavor: 'Hollowjack lent you his hat. It does most of the work.',
    desc: u => `Whenever you plant a seed, that plot gains ${v(u, 1, 2)} Guard.`,
    play(ctx) { ctx.addPower('old_scarecrow', v(ctx.u, 1, 2)); },
  },

  // ================================================================== PELL: the Hive
  // ------------------------------------------------------------------ starter (Pell)
  hive_tool: {
    name: 'Hive Tool', type: 'tool', rarity: 'starter', cost: 1, target: 'enemy', art: 'icon_hand_fork', pool: 'pell',
    flavor: 'Pries the frames apart. Pries most things apart, given a moment.',
    desc: u => `Deal ${v(u, 5, 8)} damage. Gain 1 Bee.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 5, 8)); addBees(ctx, 1); },
  },
  bee_veil: {
    name: 'Bee Veil', type: 'tend', rarity: 'starter', cost: 1, target: 'none', art: 'icon_veil', pool: 'pell',
    flavor: 'Keeps the bees out. Keeps most things out. Lets the light in, which is the point.',
    desc: u => `Gain ${v(u, 5, 8)} Bark.`,
    play(ctx) { ctx.bark(v(ctx.u, 5, 8)); },
  },
  smoker: {
    name: 'Smoker', type: 'tend', rarity: 'starter', cost: 1, target: 'enemy', art: 'icon_smoker', pool: 'pell',
    flavor: 'Dry grass, a bellows, patience. The hive thinks the woods are on fire and gets very calm about it.',
    desc: u => `Gain ${v(u, 2, 3)} Bees. Apply 1 Dazed to a critter.`,
    play(ctx) { addBees(ctx, v(ctx.u, 2, 3)); ctx.apply(ctx.target, 'dazed', 1); },
  },

  // ------------------------------------------------------------------ common (Pell)
  stray_bee: {
    name: 'Stray Bee', type: 'tend', rarity: 'common', cost: 0, target: 'none', art: 'icon_bee', pool: 'pell',
    flavor: 'Found it on the windowsill, looking lost. It was not lost. It was waiting.',
    desc: u => `Gain ${v(u, 1, 2)} Bee${u ? 's' : ''}.`,
    play(ctx) { addBees(ctx, v(ctx.u, 1, 2)); },
  },
  call_the_swarm: {
    name: 'Call the Swarm', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_swarm', pool: 'pell',
    flavor: 'Three notes, low. They come out of the hedge like the hedge had been holding its breath.',
    desc: u => `Gain ${v(u, 3, 4)} Bees.`,
    play(ctx) { addBees(ctx, v(ctx.u, 3, 4)); },
  },
  rouse_the_hive: {
    name: 'Rouse the Hive', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_bee', pool: 'pell',
    flavor: 'One kick to the box. Do not do this without the veil.',
    desc: u => `Your Bees sting now, once each.${u ? ' Gain 1 Bee.' : ''}`,
    async play(ctx) { const n = bees(ctx); if (n > 0) await ctx.sting(n); if (ctx.u) addBees(ctx, 1); },
  },
  beeline: {
    name: 'Beeline', type: 'tool', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_swarm', pool: 'pell',
    flavor: 'Straight there, no detours, mild regret on arrival.',
    desc: u => `Deal ${v(u, 4, 6)} damage. Sting ${v(u, 2, 3)} times.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 4, 6)); await ctx.sting(v(ctx.u, 2, 3)); },
  },
  waggle_dance: {
    name: 'Waggle Dance', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_ribbon', pool: 'pell', unlock: { villager: 'pell', tier: 1 },
    flavor: 'It means "the clover is that way." It also means "look at me go."',
    desc: u => `Draw ${v(u, 2, 3)} cards. Gain 1 Bee.`,
    play(ctx) { ctx.draw(v(ctx.u, 2, 3)); addBees(ctx, 1); },
  },
  pollen_puff: {
    name: 'Pollen Puff', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_pollen', pool: 'pell',
    flavor: 'Yellow to the elbows. Worth it.',
    desc: u => `Grow all plants ${v(u, 1, 2)}. Gain 2 Bees.`,
    play(ctx) { ctx.grow(v(ctx.u, 1, 2), 'all'); addBees(ctx, 2); },
  },
  brood_frame: {
    name: 'Brood Frame', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_hive', pool: 'pell',
    flavor: 'Lift it gently. Everybody in there is somebody\'s.',
    desc: u => `Gain ${v(u, 2, 3)} Bees, plus 1 for each plant in your garden.`,
    play(ctx) { addBees(ctx, v(ctx.u, 2, 3) + plantCount(ctx)); },
  },
  harvest_honey: {
    name: 'Harvest Honey', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_honey_dipper', pool: 'pell',
    flavor: 'Warm the knife. Take the cap off slow. Leave them enough for the winter.',
    desc: u => `Gain ${v(u, 2, 3)} Honey. Draw 1 card.`,
    play(ctx) { addHoney(ctx, v(ctx.u, 2, 3)); ctx.draw(1); },
  },
  honey_cake: {
    name: 'Honey Cake', type: 'tend', rarity: 'common', cost: 0, target: 'none', art: 'icon_pie', pool: 'pell', unlock: { villager: 'rue', tier: 1 },
    flavor: "Rue's. Dense enough to stop a door. Fixes almost anything.",
    desc: u => `Spend 2 Honey: heal ${v(u, 6, 9)} and draw 1 card.`,
    canPlay(ctx) { return honey(ctx) >= 2; },
    async play(ctx) { if (await spendHoney(ctx, 2)) { ctx.heal(v(ctx.u, 6, 9)); ctx.draw(1); } },
  },
  beeswax_wrap: {
    name: 'Beeswax Wrap', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_wax', pool: 'pell',
    flavor: 'Warm it in your hands and it will hold any shape you ask, including yours.',
    desc: u => `Gain ${v(u, 6, 8)} Bark. Spend all your Honey: ${v(u, 3, 4)} more Bark for each.`,
    async play(ctx) { const h = honey(ctx); if (h > 0) await spendHoney(ctx, h); ctx.bark(v(ctx.u, 6, 8) + v(ctx.u, 3, 4) * h); },
  },
  honey_drizzle: {
    name: 'Honey Drizzle', type: 'tend', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_honey', pool: 'pell',
    flavor: 'Sweet, slow, and everything that touches it stays touched.',
    desc: u => `Apply ${v(u, 3, 4)} Wilt. If you have Honey, spend 1 to apply ${v(u, 3, 4)} more.`,
    async play(ctx) { const n = v(ctx.u, 3, 4); ctx.apply(ctx.target, 'wilt', n); if (await spendHoney(ctx, 1)) ctx.apply(ctx.target, 'wilt', n); },
  },
  hum_the_old_song: {
    name: 'Hum the Old Song', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_lute', pool: 'pell',
    flavor: 'The verse about the heron. The bees know it better than you do and settle in to listen.',
    desc: u => `Gain Bark equal to ${v(u, 3, 5)} plus your Bees.`,
    play(ctx) { ctx.bark(v(ctx.u, 3, 5) + bees(ctx)); },
  },
  smoke_out: {
    name: 'Smoke Them Out', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_smoker', pool: 'pell',
    flavor: 'Everyone gets a face full. Everyone gets very reasonable.',
    desc: u => `Apply ${v(u, 1, 2)} Dazed to all critters. Gain 2 Bees.`,
    play(ctx) { ctx.apply('all', 'dazed', v(ctx.u, 1, 2)); addBees(ctx, 2); },
  },

  // ------------------------------------------------------------------ uncommon (Pell)
  royal_jelly: {
    name: 'Royal Jelly', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_queen', pool: 'pell',
    flavor: 'What the queen eats. What everybody else would very much like to eat.',
    desc: u => `Spend 2 Honey: gain ${v(u, 4, 5)} Bees.`,
    canPlay(ctx) { return honey(ctx) >= 2; },
    async play(ctx) { if (await spendHoney(ctx, 2)) addBees(ctx, v(ctx.u, 4, 5)); },
  },
  mead: {
    name: 'Mead', type: 'tend', rarity: 'uncommon', cost: 0, target: 'none', art: 'icon_jam_jar', pool: 'pell', unlock: { villager: 'odile', tier: 2 },
    flavor: "Odile's barrel. Nine months in the dark and it comes out singing.",
    desc: u => `Spend ${v(u, 3, 2)} Honey: gain 2 Stamina.`,
    canPlay(ctx) { return honey(ctx) >= v(ctx.u, 3, 2); },
    async play(ctx) { if (await spendHoney(ctx, v(ctx.u, 3, 2))) ctx.gainStamina(2); },
  },
  bee_bread: {
    name: 'Bee Bread', type: 'tend', rarity: 'uncommon', cost: 0, target: 'none', art: 'icon_bread', keywords: ['compost'], pool: 'pell', unlock: { villager: 'rue', tier: 2 },
    flavor: 'Pollen packed in honey, aged in the comb. Rue says it is cheating. Rue asks for the recipe.',
    desc: u => `Spend 1 Honey: gain 1 Stamina and draw ${v(u, 2, 3)} cards. Compost.`,
    canPlay(ctx) { return honey(ctx) >= 1; },
    async play(ctx) { if (await spendHoney(ctx, 1)) { ctx.gainStamina(1); ctx.draw(v(ctx.u, 2, 3)); } },
  },
  honey_poultice: {
    name: 'Honey Poultice', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_honey', pool: 'pell',
    flavor: 'On a cut, on a burn, on a bad week. Bandage, wait, do not pick at it.',
    desc: u => `Spend up to 3 Honey: heal ${v(u, 4, 5)} for each.`,
    canPlay(ctx) { return honey(ctx) >= 1; },
    async play(ctx) { const n = Math.min(3, honey(ctx)); if (n > 0 && await spendHoney(ctx, n)) ctx.heal(v(ctx.u, 4, 5) * n); },
  },
  angry_hive: {
    name: 'Angry Hive', type: 'tool', rarity: 'uncommon', cost: 2, costUp: 1, target: 'none', art: 'icon_swarm', pool: 'pell',
    flavor: 'You dropped the frame. They noticed.',
    desc: () => 'Sting twice for each Bee you have.',
    canPlay(ctx) { return bees(ctx) > 0; },
    async play(ctx) { const n = bees(ctx); if (n > 0) await ctx.sting(n * 2); },
  },
  thick_smoke: {
    name: 'Thick Smoke', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_smoker', pool: 'pell',
    flavor: 'Green wood. Nobody can see, nobody can think, and the bees go where they like.',
    desc: u => `Apply 2 Dazed to all critters. Sting ${v(u, 3, 5)} times.`,
    async play(ctx) { ctx.apply('all', 'dazed', 2); await ctx.sting(v(ctx.u, 3, 5)); },
  },
  split_the_hive: {
    name: 'Split the Hive', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_hive', pool: 'pell',
    flavor: 'Two boxes from one. The hard part is deciding who goes where. The bees have opinions.',
    desc: u => `Choose one. Swarm: gain ${v(u, 3, 4)} Bees. Store: gain ${v(u, 3, 4)} Honey. Sting: your Bees sting now${u ? ', plus 2 more' : ''}.`,
    async play(ctx) {
      const pick = await ctx.choose('Split the hive', [
        { label: 'Swarm', desc: `Gain ${v(ctx.u, 3, 4)} Bees`, icon: 'icon_swarm' },
        { label: 'Store', desc: `Gain ${v(ctx.u, 3, 4)} Honey`, icon: 'icon_honey' },
        { label: 'Sting', desc: `Sting ${bees(ctx) + (ctx.u ? 2 : 0)} times`, icon: 'icon_bee' },
      ]);
      if (pick === 1) addHoney(ctx, v(ctx.u, 3, 4));
      else if (pick === 2) { const n = bees(ctx) + (ctx.u ? 2 : 0); if (n > 0) await ctx.sting(n); }
      else addBees(ctx, v(ctx.u, 3, 4));
    },
  },
  sentry_bees: {
    name: 'Sentry Bees', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_veil', pool: 'pell', unlock: { villager: 'juniper', tier: 1 },
    flavor: 'Juniper knighted six of them. They take it seriously.',
    desc: u => `Guard every plant in your garden. Gain ${v(u, 1, 2)} Bee${u ? 's' : ''} for each.`,
    canPlay(ctx) { return plantCount(ctx) > 0; },
    play(ctx) { const k = plantCount(ctx); ctx.guard('all', 1); addBees(ctx, v(ctx.u, 1, 2) * k); },
  },
  catch_the_swarm: {
    name: 'Catch the Swarm', type: 'tend', rarity: 'uncommon', cost: 2, costUp: 1, target: 'none', art: 'icon_swarm', pool: 'pell',
    flavor: 'A sheet, a box, a ladder, and no fear at all. The last part is the trick.',
    desc: () => 'Gain 5 Bees.',
    play(ctx) { addBees(ctx, 5); },
  },
  foraging_flight: {
    name: 'Foraging Flight', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_pollen', pool: 'pell',
    flavor: 'Out at dawn, back at dusk, heavy. You could set a clock by them if you had a clock.',
    desc: u => `Gain 1 Honey for every 2 Bees you have${u ? ', plus 1' : ''}. Draw 1 card.`,
    play(ctx) { addHoney(ctx, Math.ceil(bees(ctx) / 2) + (ctx.u ? 1 : 0)); ctx.draw(1); },
  },
  living_veil: {
    name: 'Living Veil', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_veil', pool: 'pell',
    flavor: 'They settle on your shoulders like a shawl. Do not sneeze.',
    desc: u => `At the end of your turn, gain ${v(u, 2, 4)} Bark, plus 1 for each Bee.`,
    play(ctx) { ctx.addPower('living_veil', v(ctx.u, 2, 4)); },
  },
  drone_song: {
    name: 'Drone Song', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_lute', pool: 'pell',
    flavor: 'One low note, held. The hive fills in the harmony and, eventually, the hive.',
    desc: u => `At the start of your turn, gain ${v(u, 1, 2)} Bee${u ? 's' : ''}.`,
    play(ctx) { ctx.addPower('drone_song', v(ctx.u, 1, 2)); },
  },
  flower_crown: {
    name: 'Flower Crown', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_flower_crown', pool: 'pell', unlock: { villager: 'pell', tier: 2 },
    flavor: 'Clover and dandelion. The bees think you are a meadow. Let them.',
    desc: u => `Whenever a plant blooms, gain ${v(u, 2, 3)} Honey.`,
    play(ctx) { ctx.addPower('flower_crown', v(ctx.u, 2, 3)); },
  },

  // ------------------------------------------------------------------ rare (Pell)
  the_queen: {
    name: 'The Queen', type: 'charm', rarity: 'rare', cost: 2, costUp: 1, target: 'none', art: 'icon_queen', pool: 'pell', unlock: { boss: 'nightheron' },
    flavor: 'Nobody sees her. Everybody knows exactly where she is.',
    desc: () => 'At the end of your turn, your Bees sting a second time.',
    play(ctx) { ctx.addPower('the_queen', 1); },
  },
  golden_comb: {
    name: 'Golden Comb', type: 'tend', rarity: 'rare', cost: 1, target: 'none', art: 'icon_comb', keywords: ['keep'], pool: 'pell',
    flavor: 'Hold it up to the light. Then hold it a while longer, because it is worth a great deal.',
    desc: u => `Keep. Spend all your Honey: deal ${v(u, 4, 5)} damage to all critters for each.`,
    canPlay(ctx) { return honey(ctx) >= 1; },
    async play(ctx) { const h = honey(ctx); if (h > 0 && await spendHoney(ctx, h)) for (let i = 0; i < h; i++) await ctx.attackAll(v(ctx.u, 4, 5)); },
  },
  split_and_double: {
    name: 'Split and Double', type: 'tend', rarity: 'rare', cost: 2, costUp: 1, target: 'none', art: 'icon_swarm', pool: 'pell',
    flavor: 'One good year and a beekeeper has twice the trouble. This is the good year.',
    desc: () => 'Double your Bees, up to 10 more.',
    canPlay(ctx) { return bees(ctx) > 0; },
    play(ctx) { addBees(ctx, Math.min(10, bees(ctx))); },
  },
  the_old_song: {
    name: 'The Old Song', type: 'tend', rarity: 'rare', cost: 1, target: 'none', art: 'icon_lute', keywords: ['keep'], pool: 'pell', unlock: { villager: 'pell', tier: 3 },
    flavor: 'The whole thing, all the verses, the one about the heron included. It gets louder the longer you sing.',
    desc: u => `Keep. Sting ${v(u, 3, 4)} times, plus ${v(u, 3, 4)} for every time you have sung it this fight.`,
    async play(ctx) {
      const data = ctx.card.data || (ctx.card.data = {});
      const sung = data.sung || 0;
      await ctx.sting(v(ctx.u, 3, 4) * (sung + 1));
      data.sung = sung + 1;
    },
  },

  // ------------------------------------------------------------------ special: gloom junk
  gloom: {
    name: 'Gloom', type: 'gloom', rarity: 'special', cost: 0, target: 'none', art: 'icon_gloom', keywords: ['unplayable'],
    flavor: 'A grey smudge where a card should be.',
    desc: () => 'Unplayable.',
  },
  thistle: {
    name: 'Thistle', type: 'gloom', rarity: 'special', cost: 0, target: 'none', art: 'icon_gloom', keywords: ['unplayable'],
    flavor: 'Prickly, and it knows it.',
    desc: () => 'Unplayable. If it is in your hand at the end of your turn, lose 1 Heart.',
    onEndTurnInHand(ctx) { ctx.loseHp(1); },
  },
  burr: {
    name: 'Burr', type: 'gloom', rarity: 'special', cost: 0, target: 'none', art: 'icon_acorn', keywords: ['unplayable', 'fleeting'],
    flavor: 'Sticks to your sleeve for exactly one turn.',
    desc: () => 'Unplayable. Fleeting.',
  },
  mildew: {
    name: 'Mildew', type: 'gloom', rarity: 'special', cost: 0, target: 'none', art: 'icon_gloom', keywords: ['unplayable'],
    flavor: 'It got into the deck. It gets into everything.',
    desc: () => 'Unplayable. When drawn, discard a random card.',
    onDraw(ctx) { ctx.discardRandom(1); },
  },

  // ------------------------------------------------------------------ special: tokens
  pebble: {
    name: 'Pebble', type: 'tool', rarity: 'special', cost: 0, target: 'enemy', art: 'icon_stone', keywords: ['compost'],
    desc: u => `Deal ${v(u, 3, 4)} damage. Compost.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 3, 4)); },
  },
  honey_drop: {
    name: 'Honey Drop', type: 'tend', rarity: 'special', cost: 0, target: 'none', art: 'icon_honey', keywords: ['compost'],
    desc: u => `Heal ${v(u, 3, 4)}. Compost.`,
    play(ctx) { ctx.heal(v(ctx.u, 3, 4)); },
  },
};

export const STARTER_DECK = [
  'hoe_swing', 'hoe_swing', 'hoe_swing', 'hoe_swing', 'hoe_swing',
  'mulch', 'mulch', 'mulch', 'mulch',
  'turnip_seeds',
];

// ------------------------------------------------------------------ powers
// Player charms and enemy passives. Hooks receive (ctx, n, ...args); for enemy passives
// ctx.self is the enemy that owns the power.
export const POWERS = {
  // --- resources shown as powers
  honey: {
    name: 'Honey', icon: 'icon_honey',
    desc: n => `${n} Honey stored. Blooms make it; Pell's cards spend it. It keeps.`,
    hooks: {},
  },

  // --- player charms
  bumblebee: {
    name: 'Bumblebee', icon: 'icon_bee',
    desc: n => `Whenever a plant blooms, deal ${n} damage to a random critter.`,
    hooks: { async bloom(ctx, n, plant) { if (isWeed(plant)) return; await ctx.attackRandom(n); } },
  },
  bell_on_the_gate: {
    name: 'Bell on the Gate', icon: 'icon_bell',
    desc: n => `Whenever a critter is mended, grow all plants ${n}.`,
    hooks: { enemyMended(ctx, n) { ctx.grow(n, 'all'); } },
  },
  patchwork_quilt: {
    name: 'Patchwork Quilt', icon: 'icon_quilt',
    desc: n => `At the end of your turn, gain ${n} Bark.`,
    hooks: { turnEnd(ctx, n) { ctx.bark(n); } },
  },
  compost_heap: {
    name: 'Compost Heap', icon: 'icon_compost',
    desc: n => `Whenever you play a Compost card, grow all plants ${n}.`,
    hooks: { cardPlayed(ctx, n, card) { if (card && hasKeyword(card.id, 'compost')) ctx.grow(n, 'all'); } },
  },
  mushroom_log: {
    name: 'Mushroom Log', icon: 'icon_mushroom',
    desc: n => `At the start of your turn, apply ${n} Wilt to all critters.`,
    hooks: { turnStart(ctx, n) { ctx.apply('all', 'wilt', n); } },
  },
  tool_belt: {
    name: 'Tool Belt', icon: 'icon_straw_hat',
    desc: n => `Whenever you play a Tool, gain ${n} Bark.`,
    hooks: { cardPlayed(ctx, n, card) { if (card && cardType(card.id) === 'tool') ctx.bark(n); } },
  },
  weathervane: {
    name: 'Weathervane', icon: 'icon_wind',
    desc: n => `At the start of your turn: Sun draw ${n}, Rain grow ${n}, Wind ${n * 3 + 3} damage, Frost ${n * 3 + 3} Bark, Fog daze ${n}, Drought +${n} Stamina.`,
    hooks: {
      async turnStart(ctx, n) {
        switch (ctx.weather) {
          case 'sun': ctx.draw(n); break;
          case 'rain': ctx.grow(n, 'all'); break;
          case 'wind': await ctx.attackRandom(n * 3 + 3); break;
          case 'frost': ctx.bark(n * 3 + 3); break;
          case 'fog': ctx.apply('all', 'dazed', n); break;
          case 'drought': ctx.gainStamina(n); break;
          default: break;
        }
      },
    },
  },
  greenhouse: {
    name: 'Greenhouse', icon: 'icon_sun',
    desc: n => `At the start of your turn, grow all plants ${n}.`,
    hooks: { turnStart(ctx, n) { ctx.grow(n, 'all'); } },
  },
  honeycomb: {
    name: 'Honeycomb', icon: 'icon_honey',
    desc: n => `Whenever a plant blooms, gain ${n} Stamina and draw ${n} card${n > 1 ? 's' : ''}.`,
    hooks: { bloom(ctx, n, plant) { if (isWeed(plant)) return; ctx.gainStamina(n); ctx.draw(n); } },
  },
  seed_tin: {
    name: "Nana's Seed Tin", icon: 'icon_book',
    desc: n => `At the start of your turn, add a random Seed card to your hand${n >= 2 ? ' and grow all plants 1' : ''}.`,
    hooks: { turnStart(ctx, n) { ctx.addCard(randomSeedId(ctx), 'hand'); if (n >= 2) ctx.grow(1, 'all'); } },
  },
  grandmothers_recipe: {
    name: "Grandmother's Recipe", icon: 'icon_pie',
    desc: n => `Whenever a plant blooms, heal ${n}.`,
    hooks: { bloom(ctx, n, plant) { if (isWeed(plant)) return; ctx.heal(n); } },
  },
  bramble_heart: {
    name: 'Bramble Heart', icon: 'icon_heart',
    desc: n => `Whenever you gain Bark, deal ${n} damage to a random critter.`,
    hooks: { async barkGained(ctx, n, amount) { if (amount > 0) await ctx.attackRandom(n); } },
  },
  workbench: {
    name: 'The Workbench', icon: 'icon_log',
    desc: n => `At the start of your turn, gain ${n} Grit.`,
    hooks: { turnStart(ctx, n) { ctx.apply('self', 'grit', n); } },
  },
  old_scarecrow: {
    name: 'The Old Scarecrow', icon: 'icon_scarecrow',
    desc: n => `Whenever you plant a seed, that plot gains ${n} Guard.`,
    hooks: { planted(ctx, n, plant) { if (isWeed(plant)) return; const i = plotIndexOf(ctx, plant); ctx.guard(i >= 0 ? i : 'all', n); } },
  },
  living_veil: {
    name: 'Living Veil', icon: 'icon_veil',
    desc: n => `At the end of your turn, gain ${n} Bark, plus 1 for each Bee.`,
    hooks: { turnEnd(ctx, n) { ctx.bark(n + bees(ctx)); } },
  },
  drone_song: {
    name: 'Drone Song', icon: 'icon_lute',
    desc: n => `At the start of your turn, gain ${n} Bee${n > 1 ? 's' : ''}.`,
    hooks: { turnStart(ctx, n) { addBees(ctx, n); } },
  },
  flower_crown: {
    name: 'Flower Crown', icon: 'icon_flower_crown',
    desc: n => `Whenever a plant blooms, gain ${n} Honey.`,
    hooks: { bloom(ctx, n, plant) { if (isWeed(plant)) return; addHoney(ctx, n); } },
  },
  the_queen: {
    name: 'The Queen', icon: 'icon_queen',
    desc: () => 'At the end of your turn, your Bees sting a second time.',
    hooks: { async turnEnd(ctx) { const n = bees(ctx); if (n > 0) await ctx.sting(n); } },
  },

  // --- enemy passives (ctx.self = the critter)
  pollen_greed: {
    name: 'Pollen Greed', icon: 'st_power',
    desc: n => `Whenever a plant blooms, gains ${n} Grit.`,
    hooks: { bloom(ctx, n, plant) { if (isWeed(plant)) return; ctx.apply(ctx.self, 'grit', n); } },
  },
  sporing: {
    name: 'Sporing', icon: 'st_power',
    desc: n => `At the end of your turn, adds ${n} Mildew to your draw pile.`,
    hooks: { turnEnd(ctx, n) { for (let i = 0; i < n; i++) ctx.addCard('mildew', 'draw'); } },
  },
  frostbound: {
    name: 'Frostbound', icon: 'st_power',
    desc: n => `At the start of your turn, if it is Frosty, gains ${n} Bark.`,
    hooks: { turnStart(ctx, n) { if (ctx.weather === 'frost') ctx.apply(ctx.self, 'bark', n); } },
  },
  long_shadow: {
    name: 'Long Shadow', icon: 'st_power',
    desc: n => `Whenever a plant blooms, adds ${n} Gloom to your discard pile.`,
    hooks: { bloom(ctx, n, plant) { if (isWeed(plant)) return; for (let i = 0; i < n; i++) ctx.addCard('gloom', 'discard'); } },
  },
  weed_tender: {
    name: 'Weed Tender', icon: 'st_power',
    desc: n => `At the end of your turn, gains ${n} Grit for each Gloamweed in your garden.`,
    hooks: { turnEnd(ctx, n) { const k = weedCount(ctx); if (k > 0) ctx.apply(ctx.self, 'grit', n * k); } },
  },
  honey_thief: {
    name: 'Honey Thief', icon: 'st_power',
    desc: n => `Whenever a plant blooms, steals ${n} coin.`,
    hooks: { bloom(ctx, n, plant) { if (isWeed(plant)) return; const take = Math.min(n, (ctx.run && ctx.run.coin) || 0); if (take > 0) ctx.coin(-take); } },
  },
  sun_drunk: {
    name: 'Sun-drunk', icon: 'st_power',
    desc: n => `At the start of your turn, if it is a Drought, gains ${n} Grit.`,
    hooks: { turnStart(ctx, n) { if (ctx.weather === 'drought') ctx.apply(ctx.self, 'grit', n); } },
  },
  mothers_grief: {
    name: "Mother's Grief", icon: 'st_power',
    desc: n => `Whenever a critter is mended, gains ${n} Grit and ${n * 6} Bark.`,
    hooks: { enemyMended(ctx, n) { ctx.apply(ctx.self, 'grit', n); ctx.apply(ctx.self, 'bark', n * 6); } },
  },
};

export { plotIndexOf, isWeed, plantCount, weedCount };
