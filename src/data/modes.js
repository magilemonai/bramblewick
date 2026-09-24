// Bramblewick: run modifiers. The engine merges these (src/engine/modes.js): *Mult keys multiply,
// booleans OR, weatherWeights add per weather, everything else sums.
//
// YEARS are the Harder Years, unlocked one at a time per character by winning. They are cumulative:
// Year 3 applies the entries for 1, 2 and 3. Written as almanac entries, because that is what they are.
// DAILY_MODS: the Daily Almanac picks two by the date's seed. Fun over fair; everyone gets the same two.

export const YEARS = [
  {
    n: 1, name: 'The Lean Year',
    desc: 'The critters came through the winter with more meat on them. Every critter has 6% more Heart.',
    mods: { enemyHpMult: 1.06 },
  },
  {
    n: 2, name: 'The Wet Year',
    desc: 'Fog sat on the lane most mornings and nobody could read anybody. More Fog, all year.',
    mods: { weatherWeights: { fog: 2 } },
  },
  {
    n: 3, name: 'The Long Year',
    desc: 'Odile kept her prices and the coin stopped coming anyway. Coin is worth 15% less and the Hearth heals 10% less.',
    mods: { coinMult: 0.85, restHealMult: 0.9 },
  },
  {
    n: 4, name: 'The Thorny Year',
    desc: 'The Thickets grew in close. Elites have 10% more Heart and open every fight with an extra move.',
    mods: { eliteHpMult: 1.1, eliteExtraMove: true },
  },
  {
    n: 5, name: 'The Hungry Year',
    desc: 'You start the year 8 Heart down and nobody has a spare loaf to fix it.',
    mods: { startHpLoss: 8 },
  },
  {
    n: 6, name: 'The Grey Year',
    desc: 'The Gloam got into the seed tin. A Gloom card starts in your deck, and the Season Keepers have 8% more Heart.',
    mods: { startGloom: 1, bossHpMult: 1.08 },
  },
  {
    n: 7, name: 'The Dry Year',
    desc: 'The rain barrel stood empty from Spring to Winter. More Drought, more Frost, and the coin dries up with them: 10% less.',
    mods: { weatherWeights: { drought: 1, frost: 1 }, coinMult: 0.9 },
  },
  {
    n: 8, name: 'The Dear Year',
    desc: "Odile's prices went up by a quarter and she would not be talked down.",
    mods: { shopPriceMult: 1.25 },
  },
  {
    n: 9, name: 'The Quiet Year',
    desc: 'Everybody stayed indoors and the valley forgot how to be loud. 6 less max Heart. The Hearth heals 10% less again.',
    mods: { maxHpAdd: -6, restHealMult: 0.9 },
  },
  {
    n: 10, name: 'The Year the Heron Remembers',
    desc: 'It knows your walk now. Every critter has 6% more Heart, Thickets 5% more, and the Keepers 8% more on top of everything.',
    mods: { enemyHpMult: 1.06, eliteHpMult: 1.05, bossHpMult: 1.08 },
  },
];

export const DAILY_MODS = [
  { id: 'bumper_crop', name: 'Bumper Crop', desc: 'Start with a random rare card. Critters have 10% more Heart to make up for it.',
    mods: { startRareCard: true, enemyHpMult: 1.1 } },
  { id: 'odiles_sale', name: "Odile's Sale", desc: 'Everything on the stall is 40% off. Fight rewards pay 25% less; she has to make it up somewhere.',
    mods: { shopPriceMult: 0.6, coinMult: 0.75 } },
  { id: 'moonshine_morning', name: 'Moonshine Morning', desc: "You start 15 Heart down and 60 coin up. Mossy says you'll thank him.",
    mods: { startHpLoss: 15, startCoin: 60 } },
  { id: 'fog_fortnight', name: 'Foggy Fortnight', desc: 'Fog most days, all year. Read intents while you can.',
    mods: { weatherWeights: { fog: 4 } } },
  { id: 'monsoon', name: 'Monsoon', desc: 'Rain most days. The garden loves it. So do the critters, who hit 1 harder.',
    mods: { weatherWeights: { rain: 4 }, enemyDmgAdd: 1 } },
  { id: 'heatwave', name: 'Heatwave', desc: 'Drought and Sun crowd out everything else. Bring water.',
    mods: { weatherWeights: { drought: 3, sun: 2 } } },
  { id: 'deep_freeze', name: 'Deep Freeze', desc: 'Frost most days, even in Summer. Bark comes big and plants come slow.',
    mods: { weatherWeights: { frost: 3 } } },
  { id: 'grey_morning', name: 'Grey Morning', desc: 'Three Gloom cards start in your deck. Card rewards offer one extra choice to dig out from under them.',
    mods: { startGloom: 3, cardChoicesAdd: 1 } },
  { id: 'thicket_season', name: 'Thicket Season', desc: 'Elites open with an extra move but have 20% less Heart. Hit first.',
    mods: { eliteExtraMove: true, eliteHpMult: 0.8 } },
  { id: 'big_critters', name: 'Big Critters', desc: 'Every critter has 25% more Heart and hits 1 softer. Long fights.',
    mods: { enemyHpMult: 1.25, enemyDmgAdd: -1 } },
  { id: 'glass_hoe', name: 'Glass Hoe', desc: 'Start with a random rare card and an extra card choice at every reward. 20 less max Heart.',
    mods: { startRareCard: true, cardChoicesAdd: 1, maxHpAdd: -20 } },
  { id: 'rues_kitchen', name: "Rue's Kitchen", desc: 'The Hearth heals half again as much and you have 10 more max Heart. Critters hit 2 harder; she says it builds character.',
    mods: { restHealMult: 1.5, maxHpAdd: 10, enemyDmgAdd: 2 } },
  { id: 'gale_warning', name: 'Gale Warning', desc: 'Wind most days. Every attack in the valley, yours and theirs, hits 2 harder.',
    mods: { weatherWeights: { wind: 4 } } },
  { id: 'windfall', name: 'Windfall', desc: 'Start with 100 extra coin. Fight rewards pay half; the windfall was the whole windfall.',
    mods: { startCoin: 100, coinMult: 0.5 } },
];
