# Bramblewick: a deckbuilding year

Working folder name: Slaydew Valley. Game title: **Bramblewick**.

A cozy roguelike deckbuilder. Slay the Spire's turn-based card combat and branching map, set in a
warm pixel-art farming valley. You play through one year: Spring, Summer, Fall, Winter. Each season
is one act with its own map, palette, weather, critters, music, and boss.

## Story

You inherit Nana Wren's overgrown farm in the valley of Bramblewick. The valley's year has stopped
turning. The **Gloam**, a grey fog of forgetting, has crept up out of the old Hollow under the hill,
and the creatures it touches turn grumpy, thorny and mean. Nana's **Almanac**, a small living book
that talks, is torn: each season's page is held by a great Gloamed creature. Win a season's boss
and its page is restored, the valley turns to the next season, and the villagers slowly come back
out of their houses.

Defeated critters are never killed. They are **mended**: the Gloam lifts off them and they trundle
home. Every enemy has a `mendText` line shown when it's defeated. HP loss is "the Gloam cracking".

The Almanac is the narrator and companion (sprite `almanac`). Tone: warm, a little funny, wistful
about Nana. Think a kind children's book with teeth.

### Villagers (recurring across events; friendship persists between runs)
| id | name | who | sprite |
|---|---|---|---|
| odile | Odile | runs the market stall, retired river-barge captain, gruff and generous | vil_odile |
| rue | Auntie Rue | herbalist, keeps the Hearth fire, cooks, heals | vil_rue |
| bram | Bram | tinker and smith, fixes tools, talks to his anvil | vil_bram |
| juniper | Juniper | kid, fearless, collects bugs, wants to be a knight | vil_juniper |
| pell | Pell | beekeeper, soft-spoken, knows the old songs | vil_pell |
| mossy | Old Mossy | hermit at the edge of the Hollow, knew Nana, knows what the Gloam is | vil_mossy |

## Core rules (engine owns these)

- Player: **72 Heart** (HP), **3 Stamina** per turn (energy), draws **5** cards per turn.
- Discard hand at end of turn. Reshuffle discard into draw pile when empty.
- **Bark** = block. Removed at the start of the owner's turn.
- Starting deck (10): 5x `hoe_swing`, 4x `mulch`, 1x `turnip_seeds`.

### The Garden (the original mechanic)
- Combat shows **3 soil plots**. Playing a **Seed** card plants that plant in the leftmost empty plot.
  If all plots are full, Seed cards can't be played.
- Each plant has `growTime` (number of growth points it needs). At the **start of each player turn**,
  every plant gains growth based on weather. When growth >= growTime, the plant **blooms**: its
  `bloom(ctx)` effect fires, then it is removed. A **perennial** plant resets to 0 growth and stays.
- Cards can add growth (`ctx.grow`), force a bloom (`ctx.harvest`), etc.
- Enemies can **trample** (destroy a plant) or **nibble** (remove growth). This is the tension.
- Plants persist only within a combat.

### Weather (rolls each round, shown as a badge; season-weighted)
| id | effect |
|---|---|
| sun | plants +1 growth |
| rain | plants +2 growth |
| drought | plants +0 growth |
| wind | plants +1 growth; all attacks (both sides) deal +2 |
| frost | plants +0 growth; everyone gains +3 Bark when they gain Bark |
| fog | plants +1 growth; enemy intents are hidden |

Season tables: spring (sun 3, rain 4, wind 2, fog 1), summer (sun 5, drought 3, rain 1, wind 1),
fall (wind 3, rain 3, fog 3, sun 1), winter (frost 4, fog 2, sun 1, wind 1).

### Statuses (engine-defined)
| id | name | on | meaning |
|---|---|---|---|
| bark | Bark | any | blocks damage; clears at start of owner's turn |
| grit | Grit | any | +N damage per hit |
| sturdy | Sturdy | any | +N Bark whenever Bark is gained from a card or move |
| dazed | Dazed | any | deals 25% less attack damage; -1 each turn |
| soggy | Soggy | any | takes 50% more attack damage; -1 each turn |
| wilt | Wilt | any | loses N HP at start of its turn, then N-1 |
| thorns | Thorns | any | attackers take N damage per hit |
| rooted | Rooted | player | can't gain Stamina from cards this turn (rare enemy debuff) |

Content can add **powers** (persistent named buffs, e.g. from Charm cards or enemy passives), see below.

### Card types
- `tool` (attack, red-brown frame), `tend` (skill, green frame), `seed` (plants, soil frame),
  `charm` (power, gold frame), `gloom` (junk/status, grey frame, usually unplayable).
- Keywords shown on cards: **Compost** (exhausted when played), **Early** (starts in opening hand),
  **Keep** (retained at end of turn), **Fleeting** (exhausted if still in hand at end of turn),
  **Unplayable**.

### Map
Per season: 12 floors + boss. Engine generates a branching map. Node types:
`fight` (critter skirmish), `elite` (Thicket, a Gloamheart elite), `forage` (small random find),
`villager` (event), `market` (Odile's stall), `hearth` (Auntie Rue's fire: rest or cook = upgrade),
`boss`. Full heal at each season change.

### Rewards
Fight: 10-20 coin (elite 25-35), pick 1 of 3 cards (or skip), 40% chance of a Preserve.
Elite: also a Keepsake. Boss: rare card pick + pick 1 of 3 Keepsakes.
**Preserves** = potions (jars, max 3 slots). **Keepsakes** = relics. **Coin** = gold.

## Directory + ownership

```
index.html, styles.css, src/main.js, src/engine/*, src/ui/*   -> engine/UI (lead)
src/pixel.js                    -> sprite registry (lead; read-only for everyone else)
src/art/chars_a.js              -> farmer, almanac, villagers, spring + summer enemies
src/art/chars_b.js              -> fall + winter enemies
src/art/plants.js               -> plant growth stages
src/art/icons.js                -> card art, UI, status, intent, weather, map nodes, keepsakes, jars, textures
src/art/scenery.js              -> animated canvas landscapes + particles (Scenery class)
src/audio.js                    -> generative music + SFX
src/data/*.js                   -> all game content (cards, plants, enemies, keepsakes, preserves, events, story)
```
Do not edit files you don't own. Plain ES modules, no build step, no npm dependencies.
Served by `python3 -m http.server` from the project root.

## Sprite contract (src/pixel.js)

```js
import { registerSprites, PAL } from '../pixel.js';
registerSprites({
  en_gloamslug: {
    palette: { a: PAL.ink, b: PAL.gloom, c: '#c9a0ff' }, // chars -> hex. '.' or ' ' = transparent
    outline: true,          // optional: auto 1px PAL.ink outline into transparent neighbours (leave a 1px margin)
    rows: [ '....aaaa....', ... ],  // every row same length
  },
  jar_red: { from: 'jar_base', swap: { [PAL.gold]: PAL.red } }, // palette-swap variant
});
```
Art modules are side-effect only (they call registerSprites) and must not touch the DOM at import.
Prefer PAL colors for cohesion; extra hexes are fine. Warm light from upper-left. Soft, round,
chunky shapes. Cute over scary: even Gloamed critters are grumpy, not horrifying. Gloam corruption
reads as grey-violet patches, drips and glowing lilac eyes (PAL.gloom / gloomDark / gloomGlow).

Self-check: `node tools/sprite-sheet.mjs src/art/<file>.js /path/out.png 4 [idPrefix]` writes a
PNG contact sheet you can open with the Read tool. Look at your work and iterate.

Sizes: characters face **right** (farmer) or **left** (enemies, villager portraits face right is fine).

### Sprite id registry (every id must exist)

**chars_a.js**
- `farmer` 32x32: the player. Straw hat, overalls, neckerchief, holding a hoe. Friendly, gender-neutral.
- `almanac` 24x24: small living book with a face, a ribbon bookmark, one torn corner.
- Villager portraits 32x32 (head + shoulders, framed-portrait friendly): `vil_odile`, `vil_rue`,
  `vil_bram`, `vil_juniper`, `vil_pell`, `vil_mossy`.
- Spring enemies 32x32: `en_gloamslug`, `en_burrlet` (burr/seed-pod imp), `en_greycrow`, `en_moleling`.
  Spring elite 40x40: `en_bramblehog` (thorny hedgehog). Spring boss 56x56: `boss_rootstag` (great stag, antlers of tangled roots).
- Summer enemies 32x32: `en_sunwasp`, `en_dusttoad`, `en_brassbeetle`, `en_emberfly`.
  Summer elite 40x40: `en_sandmantis`. Summer boss 56x56: `boss_scorchmoth` (huge moth queen, sun-eye wings).

**chars_b.js**
- Fall enemies 32x32: `en_gourdling` (little pumpkin guy), `en_sporecap` (mushroom), `en_hollowbat`, `en_leafling` (leaf-pile sprite).
  Fall elite 40x40: `en_mothowl`. Fall boss 56x56: `boss_hollowjack` (harvest scarecrow, lantern head).
- Winter enemies 32x32: `en_snowhare`, `en_icewisp`, `en_frostcrab`, `en_snowmite`.
  Winter elite 40x40: `en_gloamwolf`. Winter boss 56x56: `boss_nightheron` (vast heron of night and starlight, the heart of the Gloam).

**plants.js**: 16x16 each, 4 stages `plant_<id>_<0..3>`: 0 = seed mound in soil, 1 = sprout,
2 = growing, 3 = ripe/bloom (the showpiece). Soil is drawn by the UI; draw a small dirt mound only
in stage 0. Plant ids: `turnip, sunflower, pumpkin, blueberry, chili, mint, thornvine, frostlily, moonmelon, glowcap`.

**icons.js** (16x16 unless noted)
- Card art: `icon_hoe, icon_watering_can, icon_scythe, icon_axe, icon_pickaxe, icon_sickle, icon_rake,
  icon_shovel, icon_fishing_rod, icon_slingshot, icon_straw_hat, icon_fence, icon_basket, icon_seed_pouch,
  icon_compost, icon_lantern, icon_teacup, icon_bread, icon_honey, icon_feather, icon_acorn, icon_leaf,
  icon_mushroom, icon_flower, icon_sun, icon_raincloud, icon_snowflake, icon_wind, icon_moon, icon_star,
  icon_heart, icon_bell, icon_scarecrow, icon_bee, icon_egg, icon_milk, icon_pie, icon_quilt, icon_book,
  icon_gloom, icon_stone, icon_log, icon_scroll, icon_flute, icon_kite, icon_snail`
- UI: `ui_heart, ui_coin, ui_stamina (a little sun/leaf orb), ui_bark (bark shield), ui_deck, ui_discard,
  ui_compost, ui_map, ui_gear, ui_sound_on, ui_sound_off`
- Status: `st_bark, st_grit, st_sturdy, st_dazed, st_soggy, st_wilt, st_thorns, st_rooted, st_power` (generic)
- Intent (enemy's next move): `intent_attack, intent_block, intent_buff, intent_debuff, intent_trample,
  intent_summon, intent_mystery, intent_heal`
- Weather: `w_sun, w_rain, w_drought, w_wind, w_frost, w_fog`
- Map nodes 20x20: `node_fight, node_elite, node_forage, node_villager, node_market, node_hearth, node_boss`
- Keepsakes: `ks_pocketwatch, ks_horseshoe, ks_trowel, ks_scarf, ks_kettle, ks_seed_catalog, ks_rain_barrel,
  ks_beehive, ks_old_boot, ks_pressed_flower, ks_music_box, ks_river_stone, ks_compass, ks_candle,
  ks_gloves, ks_wishbone, ks_jam_spoon, ks_owl_feather, ks_weathervane, ks_clover, ks_lucky_button, ks_nana_locket`
- Preserve jars: `jar_red, jar_orange, jar_yellow, jar_green, jar_blue, jar_purple, jar_pink, jar_amber`
- Tileable textures 32x32 (for CSS backgrounds): `tex_wood, tex_parchment, tex_soil, tex_stone, tex_grass`

## Scenery contract (src/art/scenery.js)

```js
export class Scenery {
  constructor(canvas)                       // full-viewport canvas behind the DOM UI; handles resize + DPR
  setScene({ kind, season, weather, dusk }) // kind: title|map|combat|hearth|market|event|victory|defeat
                                            // season: spring|summer|fall|winter; weather: see table; dusk: bool (boss fights)
  setWeather(w)
  burst(x, y, type, count)                  // CSS-pixel coords. type: hit|leaf|bloom|heal|bark|gold|gloom|sparkle|mend
  shake(intensity = 6)                      // screen shake (applies CSS transform to document.body's #app, or draws offset)
  start(); stop();
}
```
Render at low internal resolution (about 320px wide, height to aspect) scaled up with no smoothing,
so it reads as pixel art. Layered parallax, gentle constant motion (clouds, swaying grass, water
shimmer, drifting season particles: petals / pollen + fireflies / falling leaves / snow). Weather
overlays: rain streaks, fog banks, heat shimmer for drought, wind-blown particles, frost sparkle.
In `combat`, the ground (a meadow the characters stand on) should begin at about 42% of the
viewport height; top of screen is sky. In `map` the whole screen is a soft, low-contrast field
(the map UI scrolls over it). `hearth` is a warm night interior/firelight glow, `market` a sunny
stall with bunting. `title` is the valley at golden hour with the farmhouse. Must run at 60fps on a
phone: cap particles, cache static layers to offscreen canvases.

## Audio contract (src/audio.js)

```js
export const audio = {
  unlock(),               // call from a user gesture; creates/resumes AudioContext
  music(track),           // crossfade to track: title|spring|summer|fall|winter|boss|elite|hearth|market|event|victory|defeat|null
  sfx(name, opts),        // one-shot. opts.pitch (semitones), opts.vol
  setMusicVolume(v), setSfxVolume(v), toggleMute() -> bool muted, muted (getter)
};
```
SFX names: `click, hover, card_draw, card_play, shuffle, hit, hit_heavy, bark, plant, grow, bloom,
heal, coin, buy, enemy_hurt, mend, player_hurt, debuff, buff, end_turn, turn_start, gloom, rain,
page_turn, upgrade, victory, defeat, error, step, open`.

## Content contract (src/data/*.js)

Everything is plain objects exported from modules. Functions receive a context object from the
engine. Numbers in `desc` must match `play`. `u` = upgraded (boolean).

### cards.js
```js
export const CARDS = {
  hoe_swing: {
    name: 'Hoe Swing', type: 'tool', rarity: 'starter', cost: 1, target: 'enemy', art: 'icon_hoe',
    desc: u => `Deal ${u ? 9 : 6} damage.`,
    async play(ctx) { await ctx.attack(ctx.u ? 9 : 6); },
  },
  // optional fields: costUp (upgraded cost), keywords: ['compost','early','keep','fleeting','unplayable'],
  // season: 'spring'|... (reward pool weighting), flavor: 'short italic line',
  // canPlay(ctx) -> bool (extra condition), onDraw(ctx), onEndTurnInHand(ctx) (for gloom cards)
};
export const STARTER_DECK = ['hoe_swing', ...];
```
rarity: starter | common | uncommon | rare | special (not in reward pools: tokens, gloom junk).
Target 'enemy' = pick one enemy; 'none' = no target (use ctx.attackAll / attackRandom for area hits).

`play`, `bloom`, hooks and `use` may be async; always `await` attacks so animations sequence.

**Card ctx API** (also used by plants, powers, keepsakes, preserves):
```
ctx.u                          upgraded flag
ctx.target                     chosen enemy (target:'enemy') else null
ctx.player                     { hp, maxHp, status:{...}, stamina }
ctx.enemies                    living enemies [{ id, name, hp, maxHp, status }]
ctx.weather                    current weather id
ctx.season                     current season id
ctx.turn                       round number (1-based)
ctx.plants                     [{ id, growth, growTime, u }] | null per plot (length 3)
ctx.hand / ctx.drawPile / ctx.discardPile   arrays of card instances { id, u, cost }
ctx.cardsPlayedThisTurn        number
await ctx.attack(n, target?)          one hit; applies grit/dazed/soggy/wind/thorns, hits Bark first
await ctx.attackAll(n)                hit every enemy
await ctx.attackRandom(n, times=1)    random enemy per hit
ctx.bark(n)                    player gains Bark (sturdy/frost apply)
ctx.draw(n)
ctx.gainStamina(n)
ctx.heal(n)
ctx.loseHp(n)                  player loses HP (ignores Bark)
ctx.apply(target, status, n)   target: enemy object | 'all' | 'self' | 'random'
ctx.plant(plantId)             plant in leftmost empty plot; returns false if full
ctx.grow(n, which='all')       which: 'all' | 'random' | 'oldest' | plot index
ctx.harvest(which='oldest')    force a bloom now
ctx.freePlots()                number of empty plots
ctx.addCard(cardId, where='hand', u=false)   where: hand|draw|discard
ctx.discardRandom(n)
ctx.exhaustRandom(n)           compost random cards from hand
ctx.coin(n)                    gain coin
ctx.setWeather(w)
ctx.addPower(powerId, n)       add stacks of a power to the player
ctx.enemyPower(enemy, powerId, n)
ctx.rand()                     seeded random 0..1
ctx.log(text)                  floating text
```

### plants.js
```js
export const PLANTS = {
  turnip: { name: 'Turnip', growTime: 2, sprite: 'plant_turnip', perennial: false,
    desc: u => `Blooms: deal ${u ? 14 : 10} damage to a random critter.`,
    async bloom(ctx) { await ctx.attackRandom(ctx.u ? 14 : 10); } },
};
```
Sprites resolve to `plant_<id>_<stage>`. A seed card typically is
`{ type:'seed', target:'none', art:'icon_seed_pouch', play(ctx){ ctx.plant('turnip'); } }` and the
engine passes the card's `u` through to the plant. Plant ids fixed: turnip, sunflower, pumpkin,
blueberry, chili, mint, thornvine, frostlily, moonmelon, glowcap. Each needs at least one seed card.

### powers (in cards.js): `export const POWERS = { id: { name, icon:'st_power' or an icon id, desc: n => '', hooks } }`
Hooks (all optional, may be async, receive `(ctx, n, ...args)`): `combatStart, turnStart, turnEnd,
cardPlayed(card), bloom(plant), planted(plant), barkGained(amount), attacked(dmg) (player took damage),
enemyMended(enemy)`. Powers are used by Charm cards and by enemies (enemy passives: hooks get
`ctx.self` = that enemy).

### enemies.js
```js
export const ENEMIES = {
  gloamslug: {
    name: 'Gloamslug', sprite: 'en_gloamslug', season: 'spring', tier: 'normal', hp: [18, 22],
    flavor: 'Leaves a trail of grey forgetting.',
    mendText: 'The slug sighs, shines, and slides off toward the cabbages.',
    powers: { thornsy: 0 },          // optional starting powers/statuses: { status or powerId: n }
    moves: {
      slime:  { intent: 'debuff', label: 'Slime', run: e => e.apply('player', 'soggy', 1) },
      chomp:  { intent: 'attack', dmg: 7, run: e => e.attack(7) },
    },
    next(e) { return e.turn % 2 ? 'slime' : 'chomp'; },   // e.history = past move keys
  },
};
export const ENCOUNTERS = {   // per season, lists of enemy-id groups
  spring: { easy: [['gloamslug']], normal: [['burrlet','burrlet'], ...], elite: [['bramblehog']], boss: [['rootstag']] },
  ...
};
```
Intents: `attack` (needs `dmg` and optional `times`, used to render the intent number),
`block`, `buff`, `debuff`, `trample`, `summon`, `mystery`, `heal`. Moves can combine
(e.g. `intent:'attack', dmg:6, alt:'debuff'`).

**Enemy ctx (`e`)**: `e.self, e.player, e.allies, e.turn, e.history, e.weather, e.season, e.rand(),
await e.attack(n, times=1), e.bark(n), e.apply('player'|'self'|'allies'|enemyObj, status, n),
e.heal(n), e.trample(n=1), e.nibble(n=1) (remove growth from all plants), e.addGloom(cardId='gloom', n=1, where='discard'),
e.summon(enemyId), e.setWeather(w), e.say(text)` (speech bubble; use for boss personality).

### keepsakes.js
```js
export const KEEPSAKES = {
  trowel: { name: "Nana's Trowel", icon: 'ks_trowel', rarity: 'starter'|'common'|'uncommon'|'rare'|'boss',
    desc: 'At the start of each combat, plant a Turnip.', flavor: '...',
    hooks: { combatStart(ctx) { ctx.plant('turnip'); } },
    pickup(run) {},        // optional, run API below
    mods: { maxHp: 0, restHeal: 0, shopDiscount: 0, extraCardChoice: 0, startStamina: 0, drawBonus: 0 } }, // optional
};
export const STARTER_KEEPSAKE = 'trowel';
```

### preserves.js
```js
export const PRESERVES = { strawberry_jam: { name, jar: 'jar_red', desc, target: 'enemy'|'none', use(ctx) {} } };
```

### events.js
```js
export const EVENTS = [{
  id: 'pell_bees', villager: 'pell', title: 'The Quiet Hive', seasons: ['spring','summer'] /* optional */,
  text: 'Paragraph(s). Keep it short and charming. {friendship} not needed.',
  choices: [
    { label: 'Help calm the bees', hint: 'Lose 6 Heart. Gain a rare card.', async do(ev) { ev.damage(6); await ev.cardReward('rare'); return 'Result text.'; } },
    { label: 'Leave them be', do(ev) { return 'You tiptoe away.'; } },
  ],
}];
```
**Event ctx (`ev`)** (also the `run` API for keepsake pickup): `ev.run` (state: hp, maxHp, coin,
deck, keepsakes, season, floor), `ev.gainCoin(n), ev.loseCoin(n), ev.heal(n), ev.damage(n),
ev.gainMaxHp(n), ev.addCard(id, u=false), await ev.removeCard(), await ev.upgradeCard(),
await ev.transformCard(), await ev.cardReward(rarity?), ev.addKeepsake(id|'random'),
ev.addPreserve(id|'random'), ev.friendship(villagerId, n), ev.getFriendship(villagerId),
await ev.fight(enemyIdGroup), ev.rand()`. `cond(ev)` on a choice hides/disables it.
Friendship persists between runs; write events that react to it (higher friendship = warmer lines,
better offers).

### story.js
```js
export const INTRO = [ { speaker: 'almanac'|null, text }, ... ];        // opening slides
export const SEASONS = { spring: { title, subtitle, intro:[...slides], outro:[...slides], color }, ... };
export const ENDING = [ ...slides ];     // after winter boss: the year turns, the valley wakes
export const DEFEAT_LINES = [ ... ];     // Almanac consolations on death (cozy: you wake up at the farm)
export const VILLAGERS = { odile: { name, role, sprite:'vil_odile', greeting: [by friendship tier 0..3] }, ... };
export const HEARTH_LINES = [ ... ], MARKET_LINES = [ ... ];  // Auntie Rue / Odile flavor barks
export const TIPS = [ ... ];             // loading/title tips from the Almanac
```

## Look & feel

- Palette warm and soft; parchment + wood UI; chunky pixel frames; Google font "Pixelify Sans".
- Everything bobs a little. Hits squash and flash. Blooms burst with petals. Mends sparkle and the
  critter hops off-screen.
- Mobile first (portrait 390x844): stage top ~45%, garden row, hand at bottom. Desktop widens the stage.

---

# 2.0 contract (additive: everything above still holds unless overridden here)

Shared tree, parallel crew. Own only your files (PLAN-2.0.md table). If another seat's file is broken
mid-edit, work around it; never fix it. Storage keys: `bramblewick2.run`, `bramblewick2.meta`,
`bramblewick2.settings` (never write `bramblewick.*`; that's 1.0's).

## Characters (`src/data/characters.js`, content)
```js
export const CHARACTERS = {
  farmer: { name: 'The Farmer', sprite: 'farmer', portrait: 'portrait_farmer', hp: 72, color: '#6fae4a',
    starterDeck: [...], starterKeepsake: 'nana_locket', blurb: '...', unlock: null },
  pell: { name: 'Pell', sprite: 'pc_pell', portrait: 'vil_pell', hp: 66, color: '#f2b53a',
    starterDeck: [...], starterKeepsake: '...', blurb: '...', unlock: { boss: 'rootstag' } },
};
```
Cards and keepsakes gain optional `pool: 'farmer' | 'pell'` (absent = shared by both) and optional
`unlock: { villager: 'rue', tier: 2 } | { boss: 'hollowjack' }` (absent = always available).
Friendship tiers: 0-1 = 0, 2-3 = 1, 4-6 = 2, 7+ = 3.

**Bees** (Pell's mechanic) is an engine status `bees`: never decays. At the end of the player's turn each
Bee stings a random critter for 1 damage (ignores Bark, not an attack, no Grit/Soggy). Content builds the
rest of Pell's identity on top (e.g. blooms feed the hive, cards spend Bees).

## New engine statuses
`bees` (above) and `guard` (on plots, not units; see Garden).

## Garden 2.0 (engine)
- `ctx.guard(which = 'all', n = 1)`: add Guard (a scarecrow) to planted plots (`which` as in `grow`).
  A trample on a guarded plot removes 1 Guard instead of the plant. Plot objects expose `guard`.
- Gloamweed: critters can plant weeds. `e.plantWeed(n = 1)` plants plant id `gloamweed` into empty plots
  (right-most first). Gloamweeds grow like plants; their `bloom` hurts the player. They occupy plots.
- `ctx.uproot(which = 'oldest' | index | 'weeds')`: remove a plant with no bloom. `'weeds'` removes all gloamweeds.
- Weather lock: `ctx.setWeather(w, { lock: true })` skips the next weather roll (the lock shows on the badge).
- Plots stay 3. Keepsakes/cards may add a 4th: `ctx.addPlot()` (max 4, this combat only).

## New card ctx APIs (engine implements; also on keepsake/power/preserve ctx)
```
await ctx.choose(prompt, options)          options: [{ label, desc?, icon? }] -> chosen index (UI modal; sim picks)
await ctx.pickCards({ from: 'hand'|'draw'|'discard', n = 1, min = 0, filter?, prompt })  -> [inst]
ctx.exhaust(inst) / ctx.discard(inst) / ctx.moveCard(inst, 'hand'|'draw'|'drawTop'|'discard')
ctx.upgrade(inst)                          upgrade for this combat
ctx.card.data                              per-instance scratch object (this combat)
ctx.card.perm                              per-deck-card object persisted in the run (e.g. "+2 each time played")
ctx.cardsPlayedThisTurn                    count BEFORE the current card
ctx.guard / ctx.uproot / ctx.addPlot / ctx.setWeather(w, {lock})   (above)
ctx.sting(n)                               n bee stings now (same rule as end-of-turn stings)
```
New hooks (keepsake `(ctx, ...args)`, power `(ctx, n, ...args)`): `trampled(plot)`, `weatherChanged(w)`,
`cardExhausted(inst)`, `stung(enemy)`, `weedPlanted(plot)`.

## New enemy ctx
`e.plantWeed(n)`, `e.stealCoin(n)` (player loses coin, floats), `e.phase(n, text?)`: sets
`self.phase` and fires a `bossPhase` fx (title flash + stinger). Movesets may read `e.self.phase`.

## Engine -> UI interface (the combat view implements; the sim stubs)
```
ui.sync()
await ui.fx(type, data)        1.0 types plus: guard {idx,n}, guardBlock {idx}, uproot {idx}, weed {idx},
                               exhaust {inst}, upgrade {inst}, sting {target, amount}, weatherLock {weather},
                               steal {enemy, n}, bossPhase {enemy, n, text}, choose/pick handled below
await ui.choose(prompt, options) -> index
await ui.pickCards({ prompt, cards, n, min }) -> [inst]
ui.checkpoint?.(snapshot)      called at the start of every player turn with combat.serialize()
```
`combat.serialize()` -> plain JSON (piles, plots, statuses, powers, enemies with hp/status/history/moveKey/phase,
turn, weather, lock). `Combat.restore(run, snapshot, opts)` rebuilds it; `resume()` continues the player turn.

## Run modifiers (difficulty + daily), engine applies, content defines
Modifier keys (numbers; engine sums/multiplies): `enemyHpMult, eliteHpMult, bossHpMult, enemyDmgAdd,
startHpLoss, maxHpAdd, coinMult, restHealMult, shopPriceMult, cardChoicesAdd, startGloom (gloom cards in deck),
weatherWeights ({weatherId: addedWeight}), eliteExtraMove (bool), startRareCard (bool), startCoin`.
- `src/data/modes.js`: `export const YEARS = [ { n: 1, name, desc, mods: {...} }, ... up to 10 ]` (cumulative),
  `export const DAILY_MODS = [ { id, name, desc, mods } ]` (daily picks 2 by seed).
- Engine exports `applyMods(run)`; `run.mods` holds the merged result. Daily seed = hash of `YYYY-MM-DD`;
  score = floors*10 + bosses*100 + hp + coin/5 - turns (engine `scoreRun(run)`).

## Meta (`bramblewick2.meta`)
`{ friendship, runs, wins, bestSeason, yearsUnlocked: { farmer: 0, pell: 0 }, bossesMended: [ids],
  seen: { cards: [], enemies: [], keepsakes: [] }, tipsSeen: [], daily: { 'YYYY-MM-DD': score } }`.
Engine exports `isUnlocked(entry, meta)` and uses it for reward pools.

## Tutorial + tips (`src/data/tutorial.js`, content; runs in the combat UI)
```js
export const TUTORIAL = { enemies: ['gloamslug'], drawOrder: [...card ids], weather: ['sun','rain','sun'],
  steps: [ { on: 'start'|'cardPlayed:<id>'|'turn:<n>'|'bloom'|'intent', text, highlight: '.plot' | '.hand .card' | ... } ] };
export const FIRST_TIPS = { trampleIntent: '...', weedIntent: '...', fog: '...', drought: '...', frost: '...',
  firstElite: '...', firstBoss: '...', gloomCard: '...', fullPlots: '...', bees: '...' };
```
Engine: `new Combat(run, group, { script: { drawOrder, weather } })` forces draw order and weather rolls.

## Sprite additions
- Animation frames (same size as base, optional, UI falls back): `<id>~1` idle frame 2, `<id>~atk` attack pose,
  `<id>~hurt` hurt pose. For `farmer`, `pc_pell`, every `en_*` and `boss_*`.
- chars_c.js: `pc_pell` 32x32 (faces right, beekeeper veil pushed back, smoker, bees), `portrait_farmer` 32x32,
  new enemies (face left): spring `en_mudpup` 32, `en_rookmother` 40 (elite); summer `en_cicada` 32,
  `en_hornetknight` 40 (elite); fall `en_strawling` 32, `en_rustboar` 40 (elite); winter `en_frostmoth` 32,
  `en_snowbear` 40 (elite). Each with ~1/~atk/~hurt.
- plants.js: `plant_gloamweed_0..3` (grey-violet thorny weed, obviously hostile but still cute-creepy).
- icons2.js (16x16 unless noted): `icon_hive, icon_smoker, icon_veil, icon_honey_dipper, icon_pollen, icon_wax,
  icon_queen, icon_flower_crown, icon_lute, icon_jam_jar, icon_trowel, icon_hand_fork, icon_seed_tray,
  icon_greenhouse, icon_rain_gauge, icon_umbrella, icon_boots, icon_bucket, icon_hay, icon_mortar, icon_letter,
  icon_ribbon, icon_owl, icon_frog, icon_fox, icon_quill, icon_root, icon_thorn, icon_chestnut, icon_pinecone,
  icon_icicle, icon_ember, icon_swarm, icon_comb`; keepsakes `ks_queen_cell, ks_smoker, ks_bee_brooch,
  ks_honey_pot, ks_veil_hat, ks_wax_seal, ks_hive_key, ks_brass_bell, ks_garden_gnome, ks_spade_pin`;
  UI `ui_star, ui_calendar, ui_book, ui_lock, ui_trophy, ui_speed, ui_text`; status `st_bees, st_guard`;
  intents `intent_weed, intent_steal`; plot overlay `ov_scarecrow` 12x16; PWA source `app_icon` 32x32.
- Weak 1.0 sprites to redo (character art seat): `en_sandmantis`, `en_icewisp`, `vil_mossy` brows;
  (new art seat): `st_grit` (a fist), `ui_stamina` vs `ui_coin` must differ at a glance (stamina = green-gold leaf sun).

## Scenery additions
```
setScene({ ..., kind: 'select' | ...1.0 kinds, arena?: 'rootstag'|'scorchmoth'|'hollowjack'|'nightheron' })
await cover(type = 'page')   // top-layer transition canvas; resolves when the screen is fully covered. types: page|leaves|iris|snow
await uncover()              // reveals the new screen
setDanger(0..1)              // low-heart vignette, gentle pulse
setQuality('high'|'low')     // low = fewer particles, no parallax (reduced motion / battery)
flash(color = '#fff', ms = 120)
```
Boss arenas: unique combat backdrops per boss (Rootstag: a blossoming root-cathedral glade; Scorchmoth:
sun-bleached hilltop at noon with a huge sun; Hollowjack: moonlit harvest field of lanterns; Nightheron:
frozen lake under aurora and stars).

## Audio additions
```
audio.intensity(0..1)        adaptive layers in combat tracks (0 calm .. 1 low heart / boss phase 2+)
audio.stinger(name)          'bloom' | 'bossPhase' | 'unlock' | 'daily' | 'tip'
audio.motif(villagerId)      short phrase for that villager (odile, rue, bram, juniper, pell, mossy)
audio.duck(amount, ms)
tracks add: 'select', 'pell' (Pell's run theme, used for Pell's map screens), 'tutorial'
```

## Balance targets (full-run sim, decent bot, Year 0)
Reach Summer ~80%, reach Fall ~55%, reach Winter ~35%, win ~20%. Each boss 40-70% for a bot arriving with
a drafted deck. Harder Years lower these by roughly 3-4 points each.
