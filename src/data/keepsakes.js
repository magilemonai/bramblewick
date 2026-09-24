// Bramblewick: keepsakes (relics). Hooks use the card ctx API and receive (ctx, ...args).
// mods are applied by the engine: maxHp, restHeal, shopDiscount (percent), extraCardChoice,
// startStamina, drawBonus.
// 2.0: pool: 'farmer' | 'pell' (absent = shared); unlock: { villager, tier } | { boss } (absent = always).
// New hooks: trampled(plot), weatherChanged(w), cardExhausted(inst), stung(enemy), weedPlanted(plot).

import { CARDS, SEED_CARD_IDS, plotIndexOf, isWeed, addBees, addHoney } from './cards.js';
import { ENEMIES } from './enemies.js';

const randomSeedId = ctx => SEED_CARD_IDS[Math.floor(ctx.rand() * SEED_CARD_IDS.length)];
const livingEnemies = ctx => ctx.enemies.filter(en => en.hp > 0).length;
const isCompost = id => ((CARDS[id] || {}).keywords || []).includes('compost');

export const KEEPSAKES = {
  nana_locket: {
    name: "Nana's Locket", icon: 'ks_nana_locket', rarity: 'starter', pool: 'farmer',
    desc: 'At the start of each combat, a Turnip is already planted in your garden.',
    flavor: 'A tiny portrait inside: Nana, squinting at the sun. Smells faintly of turnip greens.',
    hooks: { combatStart(ctx) { ctx.plant('turnip'); } },
  },
  trowel: {
    name: "Nana's Trowel", icon: 'ks_trowel', rarity: 'common',
    desc: 'Whenever you plant a seed, it starts with 1 growth.',
    flavor: 'The handle is worn to the shape of a hand that was not yours. It fits anyway.',
    hooks: { planted(ctx, plant) { if (isWeed(plant)) return; const i = plotIndexOf(ctx, plant); ctx.grow(1, i >= 0 ? i : 'random'); } },
  },
  pocketwatch: {
    name: 'Stopped Pocketwatch', icon: 'ks_pocketwatch', rarity: 'uncommon',
    desc: 'On the first turn of each combat, gain 1 Stamina.',
    flavor: 'Stopped at a quarter past. Nobody knows which quarter past. It runs for exactly one tick a day.',
    hooks: { turnStart(ctx) { if (ctx.turn === 1) ctx.gainStamina(1); } },
  },
  horseshoe: {
    name: 'Lucky Horseshoe', icon: 'ks_horseshoe', rarity: 'common',
    desc: 'Gain 8 max Heart.',
    flavor: 'Hung points-up over the door so the luck does not run out. It ran out anyway. Still a good horseshoe.',
    mods: { maxHp: 8 },
  },
  warm_scarf: {
    name: 'Warm Scarf', icon: 'ks_scarf', rarity: 'common',
    desc: 'Start each combat with 1 Sturdy.',
    flavor: 'Knitted by Rue. Slightly too long. She says it is for growing into.',
    hooks: { combatStart(ctx) { ctx.apply('self', 'sturdy', 1); } },
  },
  copper_kettle: {
    name: 'Copper Kettle', icon: 'ks_kettle', rarity: 'uncommon',
    desc: 'Resting at the Hearth heals 10 more.',
    flavor: 'Whistles a little early, so you are never late.',
    mods: { restHeal: 10 },
  },
  seed_catalog: {
    name: 'Seed Catalog', icon: 'ks_seed_catalog', rarity: 'uncommon',
    desc: 'Card rewards offer 1 extra choice.',
    flavor: 'Every page dog-eared. Nana wanted all of them.',
    mods: { extraCardChoice: 1 },
  },
  rain_barrel: {
    name: 'Rain Barrel', icon: 'ks_rain_barrel', rarity: 'common',
    desc: 'On Rainy turns, plants grow 1 extra. On Drought turns, plants grow 1 anyway.',
    flavor: 'Full when it rains, and then for a long while after.',
    hooks: { turnStart(ctx) { if (ctx.weather === 'rain' || ctx.weather === 'drought') ctx.grow(1, 'all'); } },
  },
  beehive: {
    name: "Pell's Beehive", icon: 'ks_beehive', rarity: 'uncommon',
    desc: 'Whenever a plant blooms, add a Honey Drop to your hand.',
    flavor: 'The bees came with it. The bees will not be discussing the arrangement.',
    hooks: { bloom(ctx, plant) { if (isWeed(plant)) return; ctx.addCard('honey_drop', 'hand'); } },
  },
  old_boot: {
    name: 'Old Boot', icon: 'ks_old_boot', rarity: 'common',
    desc: 'Whenever you play a Compost card, gain 3 Bark.',
    flavor: 'Pulled out of the creek. Something was living in it. Something still might be.',
    hooks: { cardPlayed(ctx, card) { if (card && isCompost(card.id)) ctx.bark(3); } },
  },
  pressed_flower: {
    name: 'Pressed Flower', icon: 'ks_pressed_flower', rarity: 'rare',
    desc: 'Whenever a plant blooms, draw 1 card.',
    flavor: 'A frostlily, flat and pale, between two pages of the Almanac that it refuses to give up.',
    hooks: { bloom(ctx, plant) { if (isWeed(plant)) return; ctx.draw(1); } },
  },
  music_box: {
    name: 'Music Box', icon: 'ks_music_box', rarity: 'boss',
    desc: 'Gain 1 Stamina each turn. Draw 1 fewer card each turn.',
    flavor: 'Plays the heron song. You find you can hum along, and cannot remember learning it.',
    mods: { startStamina: 1, drawBonus: -1 },
  },
  river_stone: {
    name: 'River Stone', icon: 'ks_river_stone', rarity: 'boss',
    desc: 'Gain 25 max Heart. Card rewards offer 1 fewer choice.',
    flavor: 'Heavy, smooth, and warm in the hand long after you put it down.',
    mods: { maxHp: 25, extraCardChoice: -1 },
  },
  compass: {
    name: 'Brass Compass', icon: 'ks_compass', rarity: 'uncommon',
    desc: 'Elite and boss critters start each combat with 2 Dazed.',
    flavor: 'Points at the Hollow no matter how you hold it. Useful, in a grim way.',
    hooks: {
      combatStart(ctx) {
        for (const en of ctx.enemies) { const def = ENEMIES[en.id]; if (def && def.tier !== 'normal') ctx.apply(en, 'dazed', 2); }
      },
    },
  },
  tallow_candle: {
    name: 'Tallow Candle', icon: 'ks_candle', rarity: 'uncommon',
    desc: 'Whenever a critter is mended, heal 4.',
    flavor: 'Mossy makes them. They smell like the inside of a warm coat.',
    hooks: { enemyMended(ctx) { ctx.heal(4); } },
  },
  work_gloves: {
    name: 'Work Gloves', icon: 'ks_gloves', rarity: 'common',
    desc: 'Start each combat with 1 Grit.',
    flavor: "Bram's spare pair. Too big, which he says is the correct size.",
    hooks: { combatStart(ctx) { ctx.apply('self', 'grit', 1); } },
  },
  wishbone: {
    name: 'Wishbone', icon: 'ks_wishbone', rarity: 'uncommon',
    desc: 'At the start of each combat, add a random Seed card to your hand.',
    flavor: 'You got the long half. You are not sure what you wished for. Whatever it was, here are some seeds.',
    hooks: { combatStart(ctx) { ctx.addCard(randomSeedId(ctx), 'hand'); } },
  },
  jam_spoon: {
    name: 'Jam Spoon', icon: 'ks_jam_spoon', rarity: 'common',
    desc: 'Heal 6 when the last critter in a combat is mended.',
    flavor: 'Licked clean after every fight. That is the rule.',
    hooks: { enemyMended(ctx) { if (livingEnemies(ctx) === 0) ctx.heal(6); } },
  },
  owl_feather: {
    name: 'Owl Feather', icon: 'ks_owl_feather', rarity: 'boss',
    desc: 'Draw 1 extra card each turn. Start each combat with a Gloom in your draw pile.',
    flavor: 'From the mothowl. It sees everything, including the bits you would rather it did not.',
    mods: { drawBonus: 1 },
    hooks: { combatStart(ctx) { ctx.addCard('gloom', 'draw'); } },
  },
  tin_weathervane: {
    name: 'Tin Weathervane', icon: 'ks_weathervane', rarity: 'uncommon',
    desc: 'At the start of your turn: if Windy, gain 6 Bark. If Foggy, draw 1 card.',
    flavor: 'A tin rooster. Faces into the weather like it has something to prove.',
    hooks: { turnStart(ctx) { if (ctx.weather === 'wind') ctx.bark(6); else if (ctx.weather === 'fog') ctx.draw(1); } },
  },
  four_leaf_clover: {
    name: 'Four-Leaf Clover', icon: 'ks_clover', rarity: 'uncommon',
    desc: "Odile's prices are 20% lower.",
    flavor: 'Found by Juniper, who traded it to you for a beetle. She feels she won.',
    mods: { shopDiscount: 20 },
  },
  lucky_button: {
    name: 'Lucky Button', icon: 'ks_lucky_button', rarity: 'common',
    desc: 'Whenever a critter is mended, gain 3 coin.',
    flavor: "Off Juniper's coat. Sir Pointy's first trophy, on loan.",
    hooks: { enemyMended(ctx) { ctx.coin(3); } },
  },

  // ================================================================== 2.0: Pell's keepsakes
  queen_cell: {
    name: 'Queen Cell', icon: 'ks_queen_cell', rarity: 'starter', pool: 'pell',
    desc: 'Start each combat with 2 Bees. Whenever a plant blooms, gain 1 Bee and 1 Honey.',
    flavor: 'A waxy thimble with a future in it. Pell carries it in his shirt pocket, over the heart, where it is warm.',
    hooks: {
      combatStart(ctx) { addBees(ctx, 2); },
      bloom(ctx, plant) { if (isWeed(plant)) return; addBees(ctx, 1); addHoney(ctx, 1); },
    },
  },
  bee_brooch: {
    name: 'Bee Brooch', icon: 'ks_bee_brooch', rarity: 'common', pool: 'pell',
    desc: 'Start each combat with 3 Bees.',
    flavor: "Tin and glass, from Odile's crate. The real bees find it very convincing.",
    hooks: { combatStart(ctx) { addBees(ctx, 3); } },
  },
  veil_hat: {
    name: 'Veil Hat', icon: 'ks_veil_hat', rarity: 'uncommon', pool: 'pell',
    desc: 'Whenever you lose Heart to an attack, gain 1 Bee.',
    flavor: 'Wide brim, long net, a hole where a hornet got through once. The hive remembers the hornet.',
    hooks: { attacked(ctx, dmg) { if (dmg > 0) addBees(ctx, 1); } },
  },
  hive_key: {
    name: 'Hive Key', icon: 'ks_hive_key', rarity: 'boss', pool: 'pell',
    desc: 'Whenever a plant blooms, sting 3 times.',
    flavor: 'Opens nothing. The bees just like it when you hold it up, and they show it by going where you point.',
    hooks: { async bloom(ctx, plant) { if (isWeed(plant)) return; await ctx.sting(3); } },
  },

  // ================================================================== 2.0: shared keepsakes
  garden_gnome: {
    name: 'Garden Gnome', icon: 'ks_garden_gnome', rarity: 'common',
    desc: 'At the start of each combat, every planted plot gains Guard.',
    flavor: 'Bram made it. It has his eyebrows. Tramplers find it unsettling, which is the idea.',
    hooks: { combatStart(ctx) { if ((ctx.plants || []).some(Boolean)) ctx.guard('all', 1); } },
  },
  spade_pin: {
    name: 'Spade Pin', icon: 'ks_spade_pin', rarity: 'uncommon', unlock: { villager: 'juniper', tier: 2 },
    desc: 'Start each combat with a 4th plot.',
    flavor: 'Juniper\'s badge for Junior Gardener, Second Class. She made the rank up. She made the badge, too.',
    hooks: { combatStart(ctx) { ctx.addPlot(); } },
  },
  brass_bell: {
    name: 'Brass Bell', icon: 'ks_brass_bell', rarity: 'rare', unlock: { villager: 'bram', tier: 3 },
    desc: 'Whenever a critter plants a Gloamweed, it is uprooted at once and a random critter takes 6 damage.',
    flavor: 'Bram cast it from a rusted plough. It rings at grey things. Grey things do not care for it.',
    hooks: { async weedPlanted(ctx) { ctx.uproot('weeds'); await ctx.attackRandom(6); } },
  },
  wax_seal: {
    name: 'Wax Seal', icon: 'ks_wax_seal', rarity: 'uncommon',
    desc: 'Whenever a card is Composted, a random critter gains 1 Wilt.',
    flavor: "Pell's, pressed with a bee. Whatever you close with it stays closed and starts, slowly, to rot.",
    hooks: { cardExhausted(ctx) { ctx.apply('random', 'wilt', 1); } },
  },
  brass_smoker: {
    name: 'Brass Smoker', icon: 'ks_smoker', rarity: 'common',
    desc: 'Critters start each combat with 1 Dazed.',
    flavor: 'Two puffs before you open anything. Works on hives. Works on hedgehogs. Works, a little, on Odile.',
    hooks: { combatStart(ctx) { ctx.apply('all', 'dazed', 1); } },
  },
  honey_pot: {
    name: 'Honey Pot', icon: 'ks_honey_pot', rarity: 'common',
    desc: 'Start each combat with 2 Bees. They came with the pot.',
    flavor: 'Stoneware, sticky, and never quite empty. Two bees live in the lid and will not be moved.',
    hooks: { combatStart(ctx) { addBees(ctx, 2); } },
  },
};

export const STARTER_KEEPSAKE = 'nana_locket';
