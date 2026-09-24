// Headless combat simulator: runs every encounter with the shared bot (src/engine/bot.js) to catch
// engine/content errors and give a rough balance read.
// Usage: node tools/sim.mjs [trials=20] [character=farmer]
import { Combat } from '../src/engine/combat.js';
import { newRun } from '../src/engine/state.js';
import { ENCOUNTERS, ENEMIES } from '../src/engine/content.js';
import { cardPool } from '../src/engine/rewards.js';
import { botFight } from '../src/engine/bot.js';

const trials = +(process.argv[2] || 20);
const character = process.argv[3] || 'farmer';
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(x => (x && x.stack) || String(x)).join(' ')); };

function deckFor(run, seasonIdx, rng) {
  const adds = 3 + seasonIdx * 4;
  for (let i = 0; i < adds; i++) {
    const r = rng() < 0.6 ? 'common' : rng() < 0.85 ? 'uncommon' : 'rare';
    const p = cardPool(run, { rarity: r, meta: null });
    if (p.length) run.deck.push({ id: p[Math.floor(rng() * p.length)], u: false, uid: 'sim' + i });
  }
}

async function fight(seasonIdx, group, kind) {
  const run = newRun({ character });
  deckFor(run, seasonIdx, Math.random);
  run.seasonIdx = seasonIdx;
  run.maxHp = run.hp = run.maxHp + seasonIdx * 6;
  run.deck.forEach(c => { if (Math.random() < seasonIdx * 0.2) c.u = true; });
  const c = new Combat(run, group, { kind });
  const result = await botFight(c);
  return { result, hp: c.player.hp, turns: c.turn };
}

const seasons = ['spring', 'summer', 'fall', 'winter'];
for (const [si, s] of seasons.entries()) {
  const E = ENCOUNTERS[s] || {};
  for (const kind of ['easy', 'normal', 'elite', 'boss']) {
    for (const g of E[kind] || []) {
      if (!Array.isArray(g) || !g.every(id => ENEMIES[id])) { errors.push(`content: ${s}/${kind} group ${JSON.stringify(g)} names an unknown enemy`); continue; }
      let wins = 0, hpSum = 0, turnSum = 0, to = 0;
      for (let t = 0; t < trials; t++) {
        try {
          const r = await fight(si, g, kind === 'boss' ? 'boss' : kind === 'elite' ? 'elite' : 'fight');
          if (r.result === 'victory') { wins++; hpSum += r.hp; }
          if (r.result === 'timeout') to++;
          turnSum += r.turns;
        } catch (err) { errors.push(`${s}/${kind}/${g}: ${err.stack}`); }
      }
      console.log(`${s.padEnd(7)} ${kind.padEnd(6)} ${g.join('+').padEnd(34)} win ${String(Math.round(wins / trials * 100)).padStart(3)}%  avgHpLeft ${wins ? Math.round(hpSum / wins) : '-'}  turns ${(turnSum / trials).toFixed(1)}${to ? `  timeouts ${to}` : ''}`);
    }
  }
}
const uniq = [...new Set(errors)];
console.log(`\n${uniq.length} unique errors`);
for (const e of uniq.slice(0, 30)) console.log('-', e.split('\n').slice(0, 4).join('\n  '));
console.error = origErr;
