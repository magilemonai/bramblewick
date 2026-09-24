# Bramblewick 2.0 plan

1.0 is frozen: tag `v1.0.0`, branch `release/1.0`, playable at `/v1/`. 2.0 ships on `main` at the root URL.
2.0 saves use new storage keys (`bramblewick2.*`) so a 1.0 run in the same browser is never overwritten;
1.0 friendship carries forward once, read-only.

## What gets materially better

| Pillar | 1.0 | 2.0 |
|---|---|---|
| Depth | One character, garden + 4 archetypes | Second playable character (Pell the Beekeeper, bee swarm mechanic), unlocked by mending the Rootstag. Scarecrow guards, gloamweeds critters plant in your plots, player choices, targeted composting, weather locks |
| Variety | 24 critters | 32 critters (a new normal + a new elite per season), boss arenas, more events |
| Replay | One difficulty, no meta | Harder Years 1-10 per character, Daily Almanac (same seed for everyone, shareable score), friendship + boss unlocks that add cards to the pool, a Compendium |
| Feel | Static sprites with CSS bob | 2-frame idle, attack and hurt poses for every character, hit-stop, page-turn scene transitions, boss title cards, danger vignette, map walking token |
| Onboarding | A 5-slide explainer | Guided first fight with a scripted hand, plus one-time Almanac tips the first time you meet each mechanic |
| Platform | Web page | Installable PWA that plays offline, long-press inspect, haptics, keyboard shortcuts, landscape phone layout, resume mid-fight |
| Settings | Volume | Text size, animation speed (1x/2x), reduced motion, high-contrast intents |
| Music | Written generative score | Composer-review fixes, adaptive combat intensity layers, bloom stingers in key, villager motifs, Pell's theme |
| Quality | Headless sim | `node --test` unit suite for the engine, a full-run sim with a deckbuilding bot and win-rate targets, crash recovery back to the last checkpoint |

## Crew (parallel, disjoint files; contract in DESIGN.md "2.0 contract")

| Seat | Model | Owns |
|---|---|---|
| Engine | opus | `src/engine/*`, `tests/*`, `tools/sim.mjs`, `tools/runsim.mjs` |
| Content + balance | fable | `src/data/*` |
| Character art | opus | `src/art/chars_a.js`, `src/art/chars_b.js` (frames, fixes) |
| New art | opus | `src/art/chars_c.js`, `src/art/icons2.js`, `src/art/plants.js` (gloamweed) |
| Scenery + VFX | opus | `src/art/scenery.js` |
| Audio | opus | `src/audio.js` |
| Combat UI + juice | opus | `src/ui/combatview.js`, `cardview.js`, `dom.js`, `hud.js`, `frames.js`, `tutorial.js`, `styles.css` |
| Meta UI + platform | opus | `src/main.js`, `src/ui/screens/*`, `styles-meta.css`, `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` |

Lead (this session): contract, integration, sim + browser verification at 390px and desktop, deploy.

## Gates before 2.0 ships
1. `node --test` green; `node tools/sim.mjs 20` 0 errors; full-run sim win rates inside targets (DESIGN.md).
2. Browser pass at 390x844 and desktop: title, select, tutorial, map, every node type, a boss, season change, daily, compendium, settings. Console clean.
3. `/v1/` still boots 1.0 unchanged.
