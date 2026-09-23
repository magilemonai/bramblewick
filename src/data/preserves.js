// Bramblewick: preserves (potions). Jars from Odile's stall and Rue's pantry. Max 3 slots.

export const PRESERVES = {
  strawberry_jam: {
    name: 'Strawberry Jam', jar: 'jar_red', target: 'none',
    desc: 'Heal 12.',
    use(ctx) { ctx.heal(12); },
  },
  pepper_relish: {
    name: 'Pepper Relish', jar: 'jar_orange', target: 'enemy',
    desc: 'Deal 15 damage to a critter.',
    async use(ctx) { await ctx.attack(15); },
  },
  clover_honey: {
    name: 'Clover Honey', jar: 'jar_amber', target: 'none',
    desc: 'Gain 2 Stamina.',
    use(ctx) { ctx.gainStamina(2); },
  },
  hot_cider: {
    name: 'Hot Cider', jar: 'jar_yellow', target: 'none',
    desc: 'Gain 2 Grit.',
    use(ctx) { ctx.apply('self', 'grit', 2); },
  },
  dill_pickles: {
    name: 'Dill Pickles', jar: 'jar_green', target: 'enemy',
    desc: 'Apply 3 Dazed and 2 Soggy to a critter.',
    use(ctx) { ctx.apply(ctx.target, 'dazed', 3); ctx.apply(ctx.target, 'soggy', 2); },
  },
  blueberry_preserves: {
    name: 'Blueberry Preserves', jar: 'jar_purple', target: 'none',
    desc: 'Draw 3 cards.',
    use(ctx) { ctx.draw(3); },
  },
  bottled_rain: {
    name: 'Bottled Rain', jar: 'jar_blue', target: 'none',
    desc: 'Grow all plants 2. Weather becomes Rain.',
    use(ctx) { ctx.grow(2, 'all'); ctx.setWeather('rain'); },
  },
  rosehip_cordial: {
    name: 'Rosehip Cordial', jar: 'jar_pink', target: 'none',
    desc: 'Gain 15 Bark.',
    use(ctx) { ctx.bark(15); },
  },
  nettle_wine: {
    name: 'Nettle Wine', jar: 'jar_green', target: 'none',
    desc: 'Apply 5 Wilt to all critters.',
    use(ctx) { ctx.apply('all', 'wilt', 5); },
  },
  pumpkin_butter: {
    name: 'Pumpkin Butter', jar: 'jar_orange', target: 'none',
    desc: 'Harvest all your plants now. Heal 4.',
    async use(ctx) { for (let i = 2; i >= 0; i--) if (ctx.plants[i]) await ctx.harvest(i); ctx.heal(4); },
  },
  mossy_moonshine: {
    name: "Mossy's Moonshine", jar: 'jar_amber', target: 'none',
    desc: 'Deal 20 damage to a random critter. Lose 4 Heart.',
    async use(ctx) { await ctx.attackRandom(20); ctx.loseHp(4); },
  },
};
