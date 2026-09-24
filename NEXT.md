- [ ] [cody] Play a full 2.0 year as Pell and as the Farmer, note what feels off
    Balance is sim-tuned (tools/runsim.mjs, targets in DESIGN.md); boss win rates run ~80-90% by design.
- [ ] [cody] Play a full year on phone and desktop, note what feels off
    Balance is sim-tuned only (tools/sim.mjs); no human has played past Spring.
- [ ] [cody] Listen to the score and mark revisions by track
    Composer's review list is in the audio agent's notes: boss Gb/F pedal, ornament density, winter sparseness.
    2.0 ear list: Gm7b5/F boss lift, victory descant + Bbm6/Db cadence, hearth inversion, Pell's harp bees, the hum voice, intensity layers, Mossy/Juniper motifs, lead levels; fall + market run 4-6 dB hot.
- [ ] Teach the sim bot about bees so Pell's balance numbers stop understating him
    tools/runsim.mjs scores sting cards as 1 (src/engine/bot.js scorePlay ignores bees).
- [x] Tune the Scorchmoth fight, the hardest boss in simulation
    Bot win rate ~20% vs 45-70% for the others; drought shuts off the garden.
- [x] Add a plot-protection card that blocks one trample per fight
    Needs a `trampled` hook in the engine; the Scarecrow archetype's signature card.
- [x] Decide whether to git init and where the game should live online
