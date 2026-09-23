// Bramblewick: plants. Each seed card plants one of these in a plot.
// growTime = growth points needed. Growth comes from weather at the start of each player turn
// (sun 1, rain 2, wind 1, fog 1, drought 0, frost 0) plus cards. Perennials reset and stay.
// bloom(ctx) uses the card ctx API; ctx.u is the seed card's upgrade flag.

const v = (u, a, b) => (u ? b : a);

export const PLANTS = {
  turnip: {
    name: 'Turnip', growTime: 2, sprite: 'plant_turnip', perennial: false,
    desc: u => `Grows in 2. Blooms: deal ${v(u, 10, 14)} damage to a random critter.`,
    async bloom(ctx) { await ctx.attackRandom(v(ctx.u, 10, 14)); },
  },
  sunflower: {
    name: 'Sunflower', growTime: 2, sprite: 'plant_sunflower', perennial: false,
    desc: u => `Grows in 2. Blooms: gain ${v(u, 1, 2)} Stamina and draw 1 card.`,
    bloom(ctx) { ctx.gainStamina(v(ctx.u, 1, 2)); ctx.draw(1); },
  },
  pumpkin: {
    name: 'Pumpkin', growTime: 4, sprite: 'plant_pumpkin', perennial: false,
    desc: u => `Grows in 4. Blooms: deal ${v(u, 24, 32)} damage to a random critter.`,
    async bloom(ctx) { await ctx.attackRandom(v(ctx.u, 24, 32)); },
  },
  blueberry: {
    name: 'Blueberry', growTime: 2, sprite: 'plant_blueberry', perennial: true,
    desc: u => `Perennial. Grows in 2. Blooms: heal ${v(u, 3, 5)}.`,
    bloom(ctx) { ctx.heal(v(ctx.u, 3, 5)); },
  },
  chili: {
    name: 'Chili', growTime: 3, sprite: 'plant_chili', perennial: false,
    desc: u => `Grows in 3. Blooms: gain ${v(u, 2, 3)} Grit.`,
    bloom(ctx) { ctx.apply('self', 'grit', v(ctx.u, 2, 3)); },
  },
  mint: {
    name: 'Mint', growTime: 1, sprite: 'plant_mint', perennial: true,
    desc: u => `Perennial. Grows in 1. Blooms: draw 1 card${u ? ' and gain 2 coin' : ''}.`,
    bloom(ctx) { ctx.draw(1); if (ctx.u) ctx.coin(2); },
  },
  thornvine: {
    name: 'Thornvine', growTime: 2, sprite: 'plant_thornvine', perennial: false,
    desc: u => `Grows in 2. Blooms: gain ${v(u, 3, 5)} Thorns.`,
    bloom(ctx) { ctx.apply('self', 'thorns', v(ctx.u, 3, 5)); },
  },
  frostlily: {
    name: 'Frostlily', growTime: 2, sprite: 'plant_frostlily', perennial: false,
    desc: u => `Grows in 2. Blooms: gain ${v(u, 6, 9)} Bark and ${v(u, 2, 3)} Sturdy.`,
    bloom(ctx) { ctx.apply('self', 'sturdy', v(ctx.u, 2, 3)); ctx.bark(v(ctx.u, 6, 9)); },
  },
  moonmelon: {
    name: 'Moonmelon', growTime: 3, sprite: 'plant_moonmelon', perennial: false,
    desc: u => `Grows in 3. Blooms: deal ${v(u, 12, 16)} damage to all critters and apply 1 Soggy to each.`,
    async bloom(ctx) { await ctx.attackAll(v(ctx.u, 12, 16)); ctx.apply('all', 'soggy', 1); },
  },
  glowcap: {
    name: 'Glowcap', growTime: 2, sprite: 'plant_glowcap', perennial: false,
    desc: u => `Grows in 2. Blooms: apply ${v(u, 4, 6)} Wilt to all critters.`,
    bloom(ctx) { ctx.apply('all', 'wilt', v(ctx.u, 4, 6)); },
  },
};

export const PLANT_IDS = Object.keys(PLANTS);
