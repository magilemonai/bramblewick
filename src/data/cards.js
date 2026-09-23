// Bramblewick: cards and powers.
// Archetypes: the Garden (seeds, growth, blooms), the Hedgerow (Bark, Sturdy, Thorns),
// Compost & Rot (Compost keyword, Wilt), the Workbench (Tools, Grit, multi-hit), the Almanac
// Reader (weather setting and weather payoffs). Every card leans on at least one of them and
// most of them touch the garden.
//
// Numbers in desc(u) match play(ctx) with ctx.u. Baseline: 1 stamina ~ 6 damage / 5 Bark.

import { PLANTS } from './plants.js';

const v = (u, a, b) => (u ? b : a);

export const SEED_CARD_IDS = [
  'turnip_seeds', 'sunflower_seeds', 'pumpkin_seeds', 'blueberry_seeds', 'chili_seeds',
  'mint_seeds', 'thornvine_seeds', 'frostlily_seeds', 'moonmelon_seeds', 'glowcap_seeds',
];

const randomSeedId = ctx => SEED_CARD_IDS[Math.floor(ctx.rand() * SEED_CARD_IDS.length)];
const plantCount = ctx => (ctx.plants || []).filter(Boolean).length;
const hasKeyword = (cardId, kw) => ((CARDS[cardId] || {}).keywords || []).includes(kw);
const cardType = cardId => (CARDS[cardId] || {}).type;
// Index of the plot a plant object sits in (for hooks that receive the plant).
const plotIndexOf = (ctx, plant) => {
  const plots = ctx.plants || [];
  let i = plots.indexOf(plant);
  if (i < 0) i = plots.findIndex(p => p && p.id === plant.id && p.growth === 0);
  return i;
};

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
  // ------------------------------------------------------------------ starter
  hoe_swing: {
    name: 'Hoe Swing', type: 'tool', rarity: 'starter', cost: 1, target: 'enemy', art: 'icon_hoe',
    flavor: 'Nana said swing from the hips.',
    desc: u => `Deal ${v(u, 6, 9)} damage.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 6, 9)); },
  },
  mulch: {
    name: 'Mulch', type: 'tend', rarity: 'starter', cost: 1, target: 'none', art: 'icon_leaf',
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
    name: 'Pitchfork', type: 'tool', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_hoe',
    flavor: 'Two points of view.',
    desc: u => `Deal ${v(u, 4, 5)} damage twice.`,
    async play(ctx) { const d = v(ctx.u, 4, 5); await ctx.attack(d); await ctx.attack(d); },
  },
  pickaxe: {
    name: 'Pickaxe', type: 'tool', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_pickaxe', keywords: ['compost'],
    flavor: 'One good swing in it.',
    desc: u => `Deal ${v(u, 9, 12)} damage. Compost.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 9, 12)); },
  },
  axe_chop: {
    name: 'Axe Chop', type: 'tool', rarity: 'common', cost: 2, target: 'enemy', art: 'icon_axe',
    flavor: 'Firewood does not argue back. Critters do, briefly.',
    desc: u => `Deal ${v(u, 12, 16)} damage. Apply 1 Dazed.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 12, 16)); ctx.apply(ctx.target, 'dazed', 1); },
  },
  slingshot: {
    name: 'Slingshot', type: 'tool', rarity: 'common', cost: 0, target: 'enemy', art: 'icon_slingshot',
    flavor: "Juniper's. She wants it back eventually.",
    desc: u => `Deal ${v(u, 3, 5)} damage.`,
    async play(ctx) { await ctx.attack(v(ctx.u, 3, 5)); },
  },
  pocket_of_pebbles: {
    name: 'Pocket of Pebbles', type: 'tend', rarity: 'common', cost: 0, target: 'none', art: 'icon_stone',
    flavor: 'River-smooth. Perfect for throwing, terrible for laundry.',
    desc: u => `Add 3 ${u ? 'upgraded ' : ''}Pebbles to your hand.`,
    play(ctx) { for (let i = 0; i < 3; i++) ctx.addCard('pebble', 'hand', ctx.u); },
  },
  kite: {
    name: 'Kite', type: 'tool', rarity: 'common', cost: 1, target: 'enemy', art: 'icon_kite', season: 'spring',
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
    name: 'Stone Fence', type: 'tend', rarity: 'common', cost: 2, target: 'none', art: 'icon_fence',
    flavor: 'Every stone in it was once in the way.',
    desc: u => `Gain ${v(u, 12, 16)} Bark. Gain 1 Sturdy.`,
    play(ctx) { ctx.apply('self', 'sturdy', 1); ctx.bark(v(ctx.u, 12, 16)); },
  },
  scarecrow_stance: {
    name: 'Scarecrow Stance', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_scarecrow',
    flavor: 'Arms out. Stare at nothing. The crows hate it.',
    desc: u => `Gain 4 Bark, plus ${v(u, 3, 4)} for each plant in your garden.`,
    play(ctx) { ctx.bark(4 + v(ctx.u, 3, 4) * plantCount(ctx)); },
  },
  bramble_coat: {
    name: 'Bramble Coat', type: 'tend', rarity: 'common', cost: 1, target: 'none', art: 'icon_quilt',
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
    async play(ctx) { for (let i = 2; i >= 0; i--) if (ctx.plants[i]) await ctx.harvest(i); },
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

  // ------------------------------------------------------------------ uncommon: hedgerow
  hedgerow: {
    name: 'Hedgerow', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_fence',
    flavor: 'Takes years to grow and one afternoon to appreciate.',
    desc: u => `Gain ${v(u, 2, 3)} Sturdy.`,
    play(ctx) { ctx.apply('self', 'sturdy', v(ctx.u, 2, 3)); },
  },
  hedge_trimmer: {
    name: 'Hedge Trimmer', type: 'tool', rarity: 'uncommon', cost: 1, costUp: 0, target: 'enemy', art: 'icon_axe',
    flavor: 'Bark on, bark off.',
    desc: () => 'Deal damage equal to your Bark.',
    async play(ctx) { await ctx.attack(ctx.player.status.bark || 0); },
  },
  patchwork_quilt: {
    name: 'Patchwork Quilt', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_quilt',
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
    name: 'Whetstone', type: 'tend', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_stone',
    flavor: 'Bram says a dull tool is a rude tool.',
    desc: u => `Gain ${v(u, 2, 3)} Grit.`,
    play(ctx) { ctx.apply('self', 'grit', v(ctx.u, 2, 3)); },
  },
  scythe_sweep: {
    name: 'Scythe Sweep', type: 'tool', rarity: 'uncommon', cost: 2, target: 'none', art: 'icon_scythe',
    flavor: 'Wide, low, and unkind to ankles.',
    desc: u => `Deal ${v(u, 8, 11)} damage to all critters and apply 1 Soggy to each.`,
    async play(ctx) { await ctx.attackAll(v(ctx.u, 8, 11)); ctx.apply('all', 'soggy', 1); },
  },
  tool_belt: {
    name: 'Tool Belt', type: 'charm', rarity: 'uncommon', cost: 1, target: 'none', art: 'icon_straw_hat',
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

  // ------------------------------------------------------------------ rare
  pumpkin_patch: {
    name: 'Pumpkin Patch', type: 'seed', rarity: 'rare', cost: 2, target: 'none', art: 'icon_seed_pouch', season: 'fall',
    flavor: 'Go big. Then go bigger. Then wait.',
    desc: u => `Plant a Pumpkin in every empty plot.${u ? ' Then grow all plants 1.' : ''}`,
    play(ctx) { for (let i = 0; i < 3 && ctx.freePlots() > 0; i++) ctx.plant('pumpkin'); if (ctx.u) ctx.grow(1, 'all'); },
  },
  wrens_song: {
    name: "Wren's Song", type: 'tend', rarity: 'rare', cost: 2, costUp: 1, target: 'none', art: 'icon_flute',
    flavor: 'Half the words are missing. The garden knows them anyway.',
    desc: () => 'Harvest all your plants, then plant them again.',
    canPlay(ctx) { return plantCount(ctx) > 0; },
    async play(ctx) {
      const ids = ctx.plants.filter(Boolean).map(p => p.id);
      for (let i = 2; i >= 0; i--) if (ctx.plants[i]) await ctx.harvest(i);
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
    name: 'Bramble Heart', type: 'charm', rarity: 'rare', cost: 2, target: 'none', art: 'icon_heart',
    flavor: 'Grow a thick skin and the thorns come free.',
    desc: u => `Whenever you gain Bark, deal ${v(u, 4, 6)} damage to a random critter.`,
    play(ctx) { ctx.addPower('bramble_heart', v(ctx.u, 4, 6)); },
  },
  hedge_maze: {
    name: 'Hedge Maze', type: 'tend', rarity: 'rare', cost: 2, target: 'none', art: 'icon_fence',
    flavor: 'They will find their way out eventually. Eventually.',
    desc: u => `Gain ${v(u, 20, 26)} Bark. Apply 2 Dazed to all critters.`,
    play(ctx) { ctx.bark(v(ctx.u, 20, 26)); ctx.apply('all', 'dazed', 2); },
  },
  workbench: {
    name: 'The Workbench', type: 'charm', rarity: 'rare', cost: 3, costUp: 2, target: 'none', art: 'icon_log',
    flavor: "Bram's, on loan. Every tool you touch comes off it sharper.",
    desc: () => 'At the start of your turn, gain 2 Grit.',
    play(ctx) { ctx.addPower('workbench', 2); },
  },
  hammer_and_tongs: {
    name: 'Hammer and Tongs', type: 'tool', rarity: 'rare', cost: 2, target: 'enemy', art: 'icon_pickaxe',
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
  // --- player charms
  bumblebee: {
    name: 'Bumblebee', icon: 'icon_bee',
    desc: n => `Whenever a plant blooms, deal ${n} damage to a random critter.`,
    hooks: { async bloom(ctx, n) { await ctx.attackRandom(n); } },
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
    hooks: { bloom(ctx, n) { ctx.gainStamina(n); ctx.draw(n); } },
  },
  seed_tin: {
    name: "Nana's Seed Tin", icon: 'icon_book',
    desc: n => `At the start of your turn, add a random Seed card to your hand${n >= 2 ? ' and grow all plants 1' : ''}.`,
    hooks: { turnStart(ctx, n) { ctx.addCard(randomSeedId(ctx), 'hand'); if (n >= 2) ctx.grow(1, 'all'); } },
  },
  grandmothers_recipe: {
    name: "Grandmother's Recipe", icon: 'icon_pie',
    desc: n => `Whenever a plant blooms, heal ${n}.`,
    hooks: { bloom(ctx, n) { ctx.heal(n); } },
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

  // --- enemy passives (ctx.self = the critter)
  pollen_greed: {
    name: 'Pollen Greed', icon: 'st_power',
    desc: n => `Whenever a plant blooms, gains ${n} Grit.`,
    hooks: { bloom(ctx, n) { ctx.apply(ctx.self, 'grit', n); } },
  },
  sporing: {
    name: 'Sporing', icon: 'st_power',
    desc: n => `At the end of your turn, adds ${n} Mildew to your draw pile.`,
    hooks: { turnEnd(ctx, n) { for (let i = 0; i < n; i++) ctx.addCard('mildew', 'draw'); } },
  },
  seed_envy: {
    name: 'Seed Envy', icon: 'st_power',
    desc: n => `Whenever you plant a seed, gains ${n} Grit.`,
    hooks: { planted(ctx, n) { ctx.apply(ctx.self, 'grit', n); } },
  },
  frostbound: {
    name: 'Frostbound', icon: 'st_power',
    desc: n => `At the start of your turn, if it is Frosty, gains ${n} Bark.`,
    hooks: { turnStart(ctx, n) { if (ctx.weather === 'frost') ctx.apply(ctx.self, 'bark', n); } },
  },
  long_shadow: {
    name: 'Long Shadow', icon: 'st_power',
    desc: n => `Whenever a plant blooms, adds ${n} Gloom to your discard pile.`,
    hooks: { bloom(ctx, n) { for (let i = 0; i < n; i++) ctx.addCard('gloom', 'discard'); } },
  },
};

export { plotIndexOf };
