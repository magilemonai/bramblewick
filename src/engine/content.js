// Content access for the engine. Data modules are owned by the content seat and change underneath us,
// so everything here is defensive: namespace imports (a missing named export never breaks linking),
// optional 2.0 modules loaded with a guarded dynamic import, and local fallbacks for anything missing.
import * as cardsMod from '../data/cards.js';
import * as plantsMod from '../data/plants.js';
import * as enemiesMod from '../data/enemies.js';
import * as keepsakesMod from '../data/keepsakes.js';
import * as preservesMod from '../data/preserves.js';
import * as eventsMod from '../data/events.js';

async function optional(path) {
  try { return await import(path); } catch (err) {
    const missing = /not found|cannot find|failed to fetch|ERR_MODULE_NOT_FOUND|404/i.test(String(err && (err.code || '') + ' ' + err.message));
    if (!missing) console.error('content module failed to load', path, err);
    return {};
  }
}
const charsMod = await optional('../data/characters.js');
const modesMod = await optional('../data/modes.js');
const tutorialMod = await optional('../data/tutorial.js');

export const CARDS = cardsMod.CARDS || {};
export const POWERS = cardsMod.POWERS || {};
export const PLANTS = plantsMod.PLANTS || {};
export const ENEMIES = enemiesMod.ENEMIES || {};
export const ENCOUNTERS = enemiesMod.ENCOUNTERS || {};
export const KEEPSAKES = keepsakesMod.KEEPSAKES || {};
export const PRESERVES = preservesMod.PRESERVES || {};
export const EVENTS = eventsMod.EVENTS || [];
export const YEARS = modesMod.YEARS || [];
export const DAILY_MODS = modesMod.DAILY_MODS || [];
export const TUTORIAL = tutorialMod.TUTORIAL || null;
export const FIRST_TIPS = tutorialMod.FIRST_TIPS || {};

const FALLBACK_DECK = ['hoe_swing', 'hoe_swing', 'hoe_swing', 'hoe_swing', 'hoe_swing', 'mulch', 'mulch', 'mulch', 'mulch', 'turnip_seeds'];
export const STARTER_DECK = cardsMod.STARTER_DECK || FALLBACK_DECK;
export const STARTER_KEEPSAKE = keepsakesMod.STARTER_KEEPSAKE || 'nana_locket';

// Characters: content's table when present, else a 1.0-equivalent farmer.
export const CHARACTERS = charsMod.CHARACTERS || {
  farmer: { name: 'The Farmer', sprite: 'farmer', portrait: 'portrait_farmer', hp: 72, color: '#6fae4a',
    starterDeck: STARTER_DECK, starterKeepsake: STARTER_KEEPSAKE, blurb: '', unlock: null },
};
export function characterDef(id) {
  const c = CHARACTERS[id] || CHARACTERS.farmer || Object.values(CHARACTERS)[0];
  return {
    hp: 72, ...c,
    starterDeck: c?.starterDeck?.length ? c.starterDeck : STARTER_DECK,
    starterKeepsake: c?.starterKeepsake || STARTER_KEEPSAKE,
  };
}

// Gloamweed: content's plant when present, else a local stand-in so critters can always plant weeds.
const WEED_FALLBACK = {
  name: 'Gloamweed', growTime: 3, sprite: 'plant_gloamweed', perennial: false, weed: true,
  desc: () => 'A weed of the Gloam. Blooms: you lose 4 Heart.',
  bloom(ctx) { ctx.loseHp(4); },
};
export const weedDef = () => PLANTS.gloamweed || WEED_FALLBACK;
export const plantDef = id => (id === 'gloamweed' ? weedDef() : PLANTS[id]);
