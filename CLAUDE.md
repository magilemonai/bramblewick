# Bramblewick (folder: Slaydew Valley)

Plain english first: a cozy roguelike deckbuilder. Slay the Spire's card combat and branching map, set in a
Stardew-style pixel valley across four seasons. Plain ES modules, no build step, no npm dependencies.

## Run it
- `npm run dev` (runs `python3 tools/serve.py 5173`, a no-cache server), then open http://localhost:5173
- Phone preview: http://localhost:5173/tools/phone.html (390x844 iframe; `?w=&h=` to change)
- Engine/content smoke test: `node tools/sim.mjs 20` (bot plays every encounter; must end with `0 unique errors`)
- Sprite contact sheet: `node tools/sprite-sheet.mjs src/art/<file>.js out.png 4 [idPrefix]`

## Contract
- `DESIGN.md` is the binding contract between engine, content, art, and audio (ctx APIs, sprite ids, statuses).
  Change it first, then the code on both sides.
- Engine owns rules (`src/engine/`); content lives only in `src/data/`; presentation goes through `ui.fx()`.
- Content functions may skip `await`; the engine serializes ctx actions and drains after every card, bloom and hook.
- Enemy passive hooks receive the card ctx with `ctx.self` set to the critter.
- Mobile is part of done: check at 390px via `tools/phone.html` before calling a UI change finished.
