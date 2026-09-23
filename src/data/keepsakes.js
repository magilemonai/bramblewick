// Bramblewick: keepsakes (relics). Hooks use the card ctx API and receive (ctx, ...args).
// mods are applied by the engine: maxHp, restHeal, shopDiscount (percent), extraCardChoice,
// startStamina, drawBonus.

import { CARDS, SEED_CARD_IDS, plotIndexOf } from './cards.js';
import { ENEMIES } from './enemies.js';

const randomSeedId = ctx => SEED_CARD_IDS[Math.floor(ctx.rand() * SEED_CARD_IDS.length)];
const livingEnemies = ctx => ctx.enemies.filter(en => en.hp > 0).length;
const isCompost = id => ((CARDS[id] || {}).keywords || []).includes('compost');

export const KEEPSAKES = {
  nana_locket: {
    name: "Nana's Locket", icon: 'ks_nana_locket', rarity: 'starter',
    desc: 'At the start of each combat, a Turnip is already planted in your garden.',
    flavor: 'A tiny portrait inside: Nana, squinting at the sun. Smells faintly of turnip greens.',
    hooks: { combatStart(ctx) { ctx.plant('turnip'); } },
  },
  trowel: {
    name: "Nana's Trowel", icon: 'ks_trowel', rarity: 'common',
    desc: 'Whenever you plant a seed, it starts with 1 growth.',
    flavor: 'The handle is worn to the shape of a hand that was not yours. It fits anyway.',
    hooks: { planted(ctx, plant) { const i = plotIndexOf(ctx, plant); ctx.grow(1, i >= 0 ? i : 'random'); } },
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
    hooks: { bloom(ctx) { ctx.addCard('honey_drop', 'hand'); } },
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
    hooks: { bloom(ctx) { ctx.draw(1); } },
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
};

export const STARTER_KEEPSAKE = 'nana_locket';
