// Full-run simulator: a bot plays whole years (map paths, fights, drafts, hearths, market, events, all four
// seasons) through the same engine + reward rules the game uses.
// Usage: node tools/runsim.mjs [runs=50] [character=farmer] [year=0] [unlocks=none|all] [seedBase=1000]
import { Combat } from '../src/engine/combat.js';
import { newRun, nextSeasonMap, season } from '../src/engine/state.js';
import { defaultMeta } from '../src/engine/meta.js';
import { CARDS, ENEMIES } from '../src/engine/content.js';
import { rollRewards, pickEncounter, shopInventory, restAmount, pickEvent } from '../src/engine/rewards.js';
import { makeRunApi, gainKeepsake, gainPreserve, addCardToDeck, upgradable } from '../src/engine/runapi.js';
import { botFight, draftScore } from '../src/engine/bot.js';
import { makeRng } from '../src/engine/rng.js';
import { scoreRun } from '../src/engine/modes.js';

const RUNS = +(process.argv[2] || 50);
const CHARACTER = process.argv[3] || 'farmer';
const YEAR = +(process.argv[4] || 0);
const UNLOCKS = process.argv[5] || 'none';
const SEED_BASE = +(process.argv[6] || 1000);

// ---------- error capture (content functions are wrapped by the engine and log via console.error) ----------
const errors = new Map();
const origErr = console.error;
function note(kind, msg) {
  const key = kind + ': ' + String(msg).split('\n').slice(0, 3).join(' | ').replace(/c[0-9a-z]{8,}/g, '<uid>');
  errors.set(key, (errors.get(key) || 0) + 1);
}
console.error = (...a) => {
  const text = a.map(x => (x && x.stack) || String(x)).join(' ');
  const engine = /^bot:/.test(text) || (/src\/engine\//.test(text) && !/src\/data\//.test(text) && !/^(card|plant|weed|keepsake|power|enemy|preserve|ctx\.)/.test(text));
  note(engine ? 'ENGINE' : 'content', text);
};

function allUnlockedMeta() {
  const m = defaultMeta();
  for (const v of ['odile', 'rue', 'bram', 'juniper', 'pell', 'mossy']) m.friendship[v] = 10;
  m.bossesMended = Object.keys(ENEMIES).filter(id => ENEMIES[id].tier === 'boss');
  return m;
}

// ---------- node handlers ----------
function reachable(run) {
  const { map, pos } = run;
  if (!pos) return map.starts.map(c => `0,${c}`).filter(id => map.nodes[id]);
  return map.nodes[pos]?.next || [];
}
function choosePath(run, rng) {
  const opts = reachable(run).map(id => run.map.nodes[id]).filter(Boolean);
  if (!opts.length) return null;
  const hpf = run.hp / run.maxHp;
  const w = n => ({
    fight: 4, villager: 3, forage: 3, market: run.coin >= 90 ? 4 : 1,
    hearth: hpf < 0.5 ? 9 : hpf < 0.75 ? 3 : 1, elite: hpf > 0.8 && run.deck.length >= 13 ? 2 : 0.1, boss: 1,
  }[n.type] ?? 1);
  const total = opts.reduce((a, n) => a + w(n), 0);
  let r = rng() * total;
  for (const n of opts) if ((r -= w(n)) < 0) return n;
  return opts[opts.length - 1];
}

async function battle(ctx, kind, group) {
  const { run, st } = ctx;
  group = group || pickEncounter(run, kind);
  if (kind === 'fight' || kind === 'elite') run.seasonFights = (run.seasonFights || 0) + 1;
  run.stats.fights++;
  if (kind === 'boss') st.bossArrive[group[0]] = (st.bossArrive[group[0]] || 0) + 1;
  const c = new Combat(run, group, { kind });
  const res = await botFight(c);
  if (res === 'timeout') note('timeout', `${season(run)} ${kind} ${group.join('+')}`);
  if (res === 'victory' && kind === 'boss') st.bossWin[group[0]] = (st.bossWin[group[0]] || 0) + 1;
  if (res !== 'victory') { ctx.dead = true; ctx.killer = `${kind}:${group.join('+')}`; }
  return res;
}

function draft(run, insts, rng, { canSkip = true } = {}) {
  if (!insts.length) return null;
  const scored = insts.map(i => ({ i, s: draftScore(i.id, run) + rng() * 0.3 })).sort((a, b) => b.s - a.s);
  if (canSkip && scored[0].s < (run.deck.length < 18 ? 1.1 : 1.8)) return null;
  return scored[0].i;
}

async function rewards(ctx, kind) {
  const { run, rng, meta } = ctx;
  const r = rollRewards(run, kind, { meta });
  run.coin += r.coin;
  const pick = draft(run, r.cards, rng);
  if (pick) addCardToDeck(run, pick.id, pick.u);
  if (r.preserve) gainPreserve(run, r.preserve);
  if (r.keepsake) gainKeepsake(run, r.keepsake, ctx.api);
  if (r.keepsakeChoices.length) gainKeepsake(run, r.keepsakeChoices[0], ctx.api);
}

function bestUpgrade(run) {
  const c = run.deck.filter(upgradable);
  if (!c.length) return null;
  return c.map(i => ({ i, s: draftScore(i.id, run) + (CARDS[i.id].rarity === 'starter' ? -1 : 0) })).sort((a, b) => b.s - a.s)[0].i;
}
function worstCard(run) {
  const c = run.deck.filter(i => CARDS[i.id]);
  if (!c.length) return null;
  const s = i => (CARDS[i.id].type === 'gloom' ? -10 : CARDS[i.id].rarity === 'starter' ? (i.id === 'turnip_seeds' ? 2 : 0) : draftScore(i.id, run));
  return c.sort((a, b) => s(a) - s(b))[0];
}

function hearth(ctx) {
  const { run } = ctx;
  if (run.hp < run.maxHp * 0.65) run.hp = Math.min(run.maxHp, run.hp + restAmount(run));
  else { const i = bestUpgrade(run); if (i) i.u = true; else run.hp = Math.min(run.maxHp, run.hp + restAmount(run)); }
}

function market(ctx) {
  const { run, rng, meta } = ctx;
  const inv = shopInventory(run, { meta });
  const w = worstCard(run);
  if (w && run.coin >= inv.removePrice && (CARDS[w.id].type === 'gloom' || CARDS[w.id].rarity === 'starter')) {
    run.coin -= inv.removePrice; run.deck.splice(run.deck.indexOf(w), 1); run.removeCost = (run.removeCost || 75) + 25;
  }
  for (const k of inv.keepsakes) if (run.coin >= k.price && rng() < 0.5) { run.coin -= k.price; gainKeepsake(run, k.id, ctx.api); }
  for (const c of [...inv.cards].sort((a, b) => draftScore(b.inst.id, run) - draftScore(a.inst.id, run))) {
    if (run.coin >= c.price && draftScore(c.inst.id, run) >= 2.4 && rng() < 0.6) { run.coin -= c.price; addCardToDeck(run, c.inst.id); }
  }
  for (const p of inv.preserves) if (run.coin >= p.price + 20 && run.preserves.includes(null) && rng() < 0.4) { run.coin -= p.price; gainPreserve(run, p.id); }
}

async function forage(ctx) {
  const { run, rng, api } = ctx;
  const finds = [
    () => api.heal(10),
    () => api.gainCoin(30 + Math.floor(rng() * 16)),
    () => api.addPreserve('random'),
    () => api.upgradeCard(),
    () => api.removeCard(),
    () => api.cardReward(),
  ];
  await finds[Math.floor(rng() * finds.length)]();
}

async function villager(ctx) {
  const { run, rng, api } = ctx;
  const ev = pickEvent(run);
  if (!ev) return;
  ctx.st.events[ev.id] = (ctx.st.events[ev.id] || 0) + 1;
  try { if (typeof ev.text === 'function') ev.text(api); } catch (err) { note('content', `event ${ev.id} text: ${err.message}`); }
  const allowed = (ev.choices || []).filter(ch => { try { return !ch.cond || ch.cond(api); } catch (err) { note('content', `event ${ev.id} cond: ${err.message}`); return false; } });
  if (!allowed.length) { note('content', `event ${ev.id}: no allowed choice`); return; }
  const ch = allowed[Math.floor(rng() * allowed.length)];
  try { await ch.do(api); } catch (err) {
    if (err && err.defeat) return;
    note('content', `event ${ev.id} "${ch.label}": ${err && err.stack ? err.stack.split('\n').slice(0, 2).join(' ') : err}`);
  }
}

// ---------- one run ----------
async function playRun(i) {
  const seed = SEED_BASE + i;
  const meta = UNLOCKS === 'all' ? allUnlockedMeta() : defaultMeta();
  const run = newRun({ character: CHARACTER, year: YEAR, meta, seed });
  const rng = makeRng(seed ^ 0x5bd1e995);
  const ctx = { run, rng, meta, st, dead: false, killer: null };
  ctx.api = makeRunApi(run, {
    meta,
    fight: async group => {
      const r = await battle(ctx, 'fight', group);
      if (r !== 'victory') { const e = new Error('defeat'); e.defeat = true; throw e; }
      return r;
    },
    pickers: {
      chooseCard: async (title, insts) => draft(run, insts, rng),
      pickDeckCard: async (title, filter) => {
        const cards = run.deck.filter(filter);
        if (!cards.length) return null;
        if (/upgrade|cook|sharp/i.test(title)) return bestUpgrade(run);
        if (/remove|heap/i.test(title)) { const w = worstCard(run); return cards.includes(w) ? w : cards[0]; }
        return cards[Math.floor(rng() * cards.length)];
      },
    },
  });
  for (const k of [...run.keepsakes]) gainKeepsake(run, k, ctx.api, { already: true });

  for (let s = 0; s < 4 && !ctx.dead; s++) {
    st.reach[s]++;
    let guard = 0;
    while (!ctx.dead && guard++ < 40) {
      const n = choosePath(run, rng);
      if (!n) { note('ENGINE', `no reachable node from ${run.pos} in ${season(run)}`); ctx.dead = true; break; }
      if (run.pos) run.visited.push(run.pos);
      run.pos = n.id;
      run.floorsCleared++;
      if (n.type === 'fight' || n.type === 'elite' || n.type === 'boss') {
        const r = await battle(ctx, n.type, null);
        if (r !== 'victory') break;
        await rewards(ctx, n.type);
        if (n.type === 'boss') break;
      } else if (n.type === 'hearth') hearth(ctx);
      else if (n.type === 'market') market(ctx);
      else if (n.type === 'forage') await forage(ctx);
      else if (n.type === 'villager') await villager(ctx);
    }
    if (ctx.dead) break;
    if (s < 3) { run.seasonIdx++; run.seasonFights = 0; run.hp = run.maxHp; nextSeasonMap(run); }
  }
  const won = !ctx.dead;
  if (won) st.wins++;
  else st.deaths[ctx.killer] = (st.deaths[ctx.killer] || 0) + 1;
  st.deck += run.deck.length;
  st.score += scoreRun(run);
  st.floors += run.floorsCleared;
}

const st = { reach: [0, 0, 0, 0], wins: 0, bossArrive: {}, bossWin: {}, deck: 0, score: 0, floors: 0, deaths: {}, events: {} };
const t0 = Date.now();
for (let i = 0; i < RUNS; i++) {
  try { await playRun(i); } catch (err) { note('ENGINE', 'run crashed: ' + (err.stack || err)); }
}
console.error = origErr;

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
console.log(`Bramblewick full-run sim: ${RUNS} runs, character=${CHARACTER}, year=${YEAR}, unlocks=${UNLOCKS}, seeds ${SEED_BASE}..${SEED_BASE + RUNS - 1} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`reach: spring ${pct(st.reach[0], RUNS)}  summer ${pct(st.reach[1], RUNS)}  fall ${pct(st.reach[2], RUNS)}  winter ${pct(st.reach[3], RUNS)}  |  win ${pct(st.wins, RUNS)}`);
console.log('boss win rate (arrivals):');
for (const [b, n] of Object.entries(st.bossArrive)) console.log(`  ${b.padEnd(14)} ${pct(st.bossWin[b] || 0, n).padStart(4)}  (${st.bossWin[b] || 0}/${n})`);
console.log(`avg deck size ${(st.deck / RUNS).toFixed(1)}  avg floors ${(st.floors / RUNS).toFixed(1)}  avg score ${Math.round(st.score / RUNS)}`);
const topDeaths = Object.entries(st.deaths).sort((a, b) => b[1] - a[1]).slice(0, 8);
if (topDeaths.length) console.log('top run-enders: ' + topDeaths.map(([k, n]) => `${k} ${n}`).join(', '));
const list = [...errors.entries()];
const eng = list.filter(([k]) => k.startsWith('ENGINE'));
console.log(`\n${eng.length} engine errors, ${list.length - eng.length} content/other issues (unique)`);
for (const [k, n] of list.slice(0, 40)) console.log(`- (${n}x) ${k}`);
