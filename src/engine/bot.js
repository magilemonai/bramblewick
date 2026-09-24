// Headless player bot for the sims (tools/sim.mjs, tools/runsim.mjs). Reads card text to guess what a
// card does, so it keeps working while content changes. Not used by the game itself.
import { CARDS, PRESERVES } from './content.js';
import { cardDef } from './combat.js';

const num = (re, s) => { const m = re.exec(s); return m ? +m[1] : 0; };
function descOf(d, u) { try { return typeof d.desc === 'function' ? String(d.desc(!!u)) : String(d.desc || ''); } catch { return ''; } }

// Rough read of a card: { dmg, hits, aoe, block, draw, stamina, heal, type }
export function readCard(id, u = false) {
  const d = CARDS[id];
  if (!d) return { type: 'none' };
  const t = descOf(d, u);
  const hits = /three times/i.test(t) ? 3 : /twice/i.test(t) ? 2 : 1;
  return {
    type: d.type, rarity: d.rarity, cost: d.cost,
    dmg: num(/Deal (\d+) damage/i, t),
    hits, aoe: /all critters/i.test(t),
    block: num(/Gain (\d+) Bark/i, t),
    draw: num(/Draw (\d+)/i, t),
    stamina: num(/Gain (\d+) Stamina/i, t),
    heal: num(/Heal (\d+)/i, t),
    bees: num(/(\d+) Bees?/i, t),
  };
}

export function incoming(c) {
  let sum = 0;
  for (const e of c.alive()) {
    const it = c.intentOf(e);
    if (it && it.dmg != null) sum += it.dmg * (it.times || 1);
  }
  return sum;
}

function scorePlay(c, inst) {
  const d = cardDef(inst);
  const r = readCard(inst.id, inst.u);
  const cost = c.cost(inst) || 0;
  const unblocked = Math.max(0, incoming(c) - (c.player.status.bark || 0));
  const alive = c.alive();
  const hpf = c.player.hp / c.player.maxHp;
  const urgency = unblocked > 0 ? 1.2 + (unblocked / Math.max(1, c.player.hp)) * 3 + (hpf < 0.5 ? 0.6 : 0) : 0;
  let s = 1;
  if (d.type === 'charm') s = c.turn <= 3 ? 9 : 4;
  else if (d.type === 'seed') s = c.turn <= 4 ? 7 : 4;
  if (r.block) s = Math.max(s, unblocked > 0 ? Math.min(r.block, unblocked) * urgency + 1 : 0.8);
  if (r.dmg) {
    const per = r.dmg * r.hits;
    const tgt = pickTarget(c, per);
    let v = per * (r.aoe ? alive.length : 1);
    if (tgt && per >= tgt.hp + (tgt.status.bark || 0)) v += 6;
    s = Math.max(s, v);
  }
  if (r.draw || r.stamina) s = Math.max(s, 3 + r.draw + r.stamina * 2);
  if (r.heal && c.player.hp < c.player.maxHp * 0.7) s = Math.max(s, r.heal);
  return s / (cost > 0 ? cost : 0.6);
}

export function pickTarget(c, dmg = 0) {
  const alive = c.alive();
  if (!alive.length) return null;
  const killable = alive.filter(e => dmg >= e.hp + (e.status.bark || 0));
  const pool = killable.length ? killable : alive;
  return pool.reduce((a, e) => (e.hp < a.hp ? e : a));
}

async function maybePreserve(c) {
  const slots = c.run.preserves.map((id, i) => ({ id, i })).filter(p => p.id && PRESERVES[p.id]);
  if (!slots.length) return false;
  const hpFrac = c.player.hp / c.player.maxHp;
  const danger = hpFrac < 0.35 || (incoming(c) - (c.player.status.bark || 0)) >= c.player.hp;
  const big = c.kind !== 'fight' && c.turn >= 2;
  if (!danger && !big) return false;
  const desc = p => String(PRESERVES[p.id].desc || '');
  const defensive = slots.find(p => /Heal|Bark/i.test(desc(p)));
  const pick = danger ? defensive || slots[0] : slots.find(p => /damage|Wilt|Dazed|Grit|Stamina|Draw/i.test(desc(p))) || null;
  if (!pick) return false;
  await c.usePreserve(pick.i, pickTarget(c));
  return true;
}

// Plays a combat to the end. Returns 'victory' | 'defeat' | 'timeout'.
export async function botFight(c, { maxTurns = 60, maxPlaysPerTurn = 40 } = {}) {
  await c.begin();
  let turns = 0, plays = 0, lastTurn = c.turn;
  while (!c.over && turns < maxTurns) {
    if (c.turn !== lastTurn) { lastTurn = c.turn; plays = 0; }
    if (c.phase !== 'player') { console.error('bot: combat stuck in phase ' + c.phase + ' on turn ' + c.turn); c.finish('timeout'); break; }
    if (await maybePreserve(c)) continue;
    const playable = plays < maxPlaysPerTurn ? c.hand.filter(i => c.canPlay(i)) : [];
    if (playable.length) {
      const best = playable.map(i => ({ i, s: scorePlay(c, i) })).sort((a, b) => b.s - a.s)[0].i;
      const r = readCard(best.id, best.u);
      plays++;
      await c.playCard(best, pickTarget(c, r.dmg * (r.hits || 1)));
    } else {
      turns++;
      await c.endPlayerTurn();
    }
  }
  if (!c.over) c.finish('timeout');
  return c.done;
}

// Draft scoring for reward screens and the market. Returns a number; ~2 = worth taking.
export function draftScore(id, run) {
  const d = CARDS[id];
  if (!d || d.type === 'gloom') return -5;
  const r = readCard(id);
  const deck = run.deck.map(x => readCard(x.id));
  const n = deck.length || 1;
  const atk = deck.filter(x => x.dmg).length / n;
  const blk = deck.filter(x => x.block).length / n;
  const seeds = deck.filter(x => x.type === 'seed').length;
  let s = { common: 1, uncommon: 1.8, rare: 2.8 }[d.rarity] || 1;
  if (d.type === 'charm') s += 0.8;
  if (r.dmg && (r.aoe || r.hits > 1)) s += 0.6;
  if (r.dmg && atk < 0.4) s += 1;
  if (r.block && blk < 0.3) s += 0.8;
  if (d.type === 'seed' && seeds < 3) s += 0.7;
  if (n > 22) s -= 0.8;
  return s;
}
