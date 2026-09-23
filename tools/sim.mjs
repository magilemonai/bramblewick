// Headless combat simulator: runs every encounter with a simple greedy bot to catch engine/content errors
// and give a rough balance read. Usage: node tools/sim.mjs [trials=20]
import { Combat } from '../src/engine/combat.js';
import { newRun } from '../src/engine/state.js';
import { CARDS, STARTER_DECK } from '../src/data/cards.js';
import { ENCOUNTERS } from '../src/data/enemies.js';
import { STARTER_KEEPSAKE } from '../src/data/keepsakes.js';

const trials = +(process.argv[2] || 20);
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map(x => (x && x.stack) || String(x)).join(' ')); };

const pool = r => Object.keys(CARDS).filter(id => CARDS[id].rarity === r);
function deckFor(seasonIdx, rng) {
  const deck = [...STARTER_DECK];
  const adds = 3 + seasonIdx * 4;
  for (let i = 0; i < adds; i++) {
    const r = rng() < 0.6 ? 'common' : rng() < 0.85 ? 'uncommon' : 'rare';
    const p = pool(r); deck.push(p[Math.floor(rng() * p.length)]);
  }
  return deck;
}

async function fight(seasonIdx, group, kind) {
  const run = newRun({ starterDeck: deckFor(seasonIdx, Math.random), starterKeepsake: STARTER_KEEPSAKE });
  run.seasonIdx = seasonIdx;
  run.maxHp = run.hp = 72 + seasonIdx * 6;
  run.deck.forEach(c => { if (Math.random() < seasonIdx * 0.2) c.u = true; });
  const c = new Combat(run, group, { kind });
  const trail = []; const pc = c.playCard.bind(c); c.playCard = (i, t) => { trail.push(i.id); return pc(i, t); };
  const ob = c.bloom.bind(c); c.bloom = i => { trail.push('bloom:' + c.plots[i]?.id); return ob(i); };
  let turns = 0;
  const bot = async () => {
    while (!c.over && turns < 60) {
      if (c.phase !== 'player') { await new Promise(r => setTimeout(r, 0)); continue; }
      const playable = c.hand.filter(i => c.canPlay(i));
      if (playable.length) {
        const incoming = c.alive().reduce((a, e) => { const it = c.intentOf(e); return a + (it && it.dmg != null ? it.dmg * it.times : 0); }, 0);
        const needBlock = incoming > (c.player.status.bark || 0);
        const score = i => { const d = CARDS[i.id]; return d.type === 'charm' ? 5 : d.type === 'seed' ? 4 : d.type === 'tend' ? (needBlock ? 3 : 1) : 2; };
        playable.sort((a, b) => score(b) - score(a) + (Math.random() - 0.5) * 0.5);
        const inst = playable[0];
        if (!c.alive().length) { for (let k = 0; k < 20 && !c.over; k++) await new Promise(r => setTimeout(r, 0)); if (c.over) continue; errors.push('STUCK: no enemies alive but combat not over; phase=' + c.phase + ' hp=' + c.enemies.map(e => e.id + ':' + e.hp + ':' + e.alive).join(',') + ' trail=' + trail.slice(-4).join('>')); c.checkEnd(); continue; }
        const weakest = c.alive().reduce((a, e) => (e.hp < a.hp ? e : a));
        await c.playCard(inst, weakest);
      } else { turns++; await c.endPlayerTurn(); }
    }
    if (!c.over) c.finish('timeout');
  };
  c.start();
  await bot();
  const result = await c.done;
  return { result, hp: c.player.hp, turns };
}

const seasons = ['spring', 'summer', 'fall', 'winter'];
for (const [si, s] of seasons.entries()) {
  const E = ENCOUNTERS[s] || {};
  for (const kind of ['easy', 'normal', 'elite', 'boss']) {
    for (const g of E[kind] || []) {
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
