// Bramblewick: playable characters. The Farmer is 1.0's player; Pell the Beekeeper unlocks when the
// Rootstag has been mended once. Cards and keepsakes carry pool: 'farmer' | 'pell' (absent = shared).
//
// Pell in five lines:
//   Bees never leave. Every Bee stings a random critter for 1 at the end of the turn, through Bark.
//   Blooms feed the hive: the Queen Cell turns every bloom into a Bee and a Honey.
//   Honey is spent, never lost: cake heals, mead is Stamina, wax is Bark, the Golden Comb is a bomb.
//   Smoke is his defence: Dazed critters hit softer while the swarm does the work.
//   His fights start slow and end loud. Keep the garden alive and the hive does the rest.

import { STARTER_DECK } from './cards.js';

export const CHARACTERS = {
  farmer: {
    name: 'The Farmer', sprite: 'farmer', portrait: 'portrait_farmer', hp: 72, color: '#6fae4a',
    starterDeck: STARTER_DECK,
    starterKeepsake: 'nana_locket',
    blurb: "Nana Wren's kin. A hoe with opinions, three plots of good soil, and a whole year to get turning. Plant it, whack it, mend it.",
    tagline: 'The garden and the hoe.',
    unlock: null,
  },
  pell: {
    name: 'Pell', sprite: 'pc_pell', portrait: 'vil_pell', hp: 66, color: '#f2b53a',
    starterDeck: [
      'hive_tool', 'hive_tool', 'hive_tool', 'hive_tool',
      'bee_veil', 'bee_veil', 'bee_veil',
      'smoker', 'smoker',
      'sunflower_seeds',
    ],
    starterKeepsake: 'queen_cell',
    blurb: 'The beekeeper. Soft-spoken, knows the old songs, never fights alone. Bees stay for the whole fight and sting through anything; blooms feed the hive; honey pays for everything else.',
    tagline: 'The hive and the song.',
    unlock: { boss: 'rootstag' },
    unlockText: 'Mend the Rootstag once and Pell will walk the year with you.',
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);
