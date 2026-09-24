// Combat engine. Pure game logic; all presentation goes through the UI interface (DESIGN.md "Engine -> UI"):
//   ui.sync(), await ui.fx(type, data), await ui.choose(prompt, options), await ui.pickCards({...}),
//   ui.checkpoint?.(snapshot). Every UI method is optional: fx/sync no-op, choose/pickCards fall back to random.
import { CARDS, POWERS, ENEMIES, KEEPSAKES, PRESERVES, plantDef, weedDef } from './content.js';
import { runRng, uid, season } from './state.js';
import { keepsakeMods } from './rewards.js';
import { runMods } from './modes.js';

export { keepsakeMods };

export const STATUSES = ['bark', 'grit', 'sturdy', 'dazed', 'soggy', 'wilt', 'thorns', 'rooted', 'bees'];
export const STATUS_INFO = {
  bark: { name: 'Bark', icon: 'st_bark', desc: n => `Blocks the next ${n} damage. Falls away at the start of the next turn.` },
  grit: { name: 'Grit', icon: 'st_grit', desc: n => `Attacks deal ${n} more damage.` },
  sturdy: { name: 'Sturdy', icon: 'st_sturdy', desc: n => `Gain ${n} extra Bark whenever gaining Bark.` },
  dazed: { name: 'Dazed', icon: 'st_dazed', desc: n => `Deals 25% less attack damage. ${n} turn${n === 1 ? '' : 's'}.` },
  soggy: { name: 'Soggy', icon: 'st_soggy', desc: n => `Takes 50% more attack damage. ${n} turn${n === 1 ? '' : 's'}.` },
  wilt: { name: 'Wilt', icon: 'st_wilt', desc: n => `Loses ${n} HP at the start of its turn, then Wilt drops by 1.` },
  thorns: { name: 'Thorns', icon: 'st_thorns', desc: n => `Attackers take ${n} damage per hit.` },
  rooted: { name: 'Rooted', icon: 'st_rooted', desc: () => `Can't gain Stamina from cards this turn.` },
  bees: { name: 'Bees', icon: 'st_bees', desc: n => `At the end of your turn, ${n} bee${n === 1 ? '' : 's'} sting${n === 1 ? 's' : ''} a random critter for 1 each (ignores Bark). Never fades.` },
  guard: { name: 'Guard', icon: 'st_guard', desc: n => `A scarecrow. Blocks the next ${n} trample${n === 1 ? '' : 's'} on this plot.` },
};
export const WEATHER = {
  sun: { name: 'Sunny', icon: 'w_sun', growth: 1, desc: 'Plants grow +1.' },
  rain: { name: 'Rain', icon: 'w_rain', growth: 2, desc: 'Plants grow +2.' },
  drought: { name: 'Drought', icon: 'w_drought', growth: 0, desc: 'Plants do not grow.' },
  wind: { name: 'Windy', icon: 'w_wind', growth: 1, desc: 'Plants grow +1. All attacks deal +2.' },
  frost: { name: 'Frost', icon: 'w_frost', growth: 0, desc: 'Plants do not grow. Bark gains are +3.' },
  fog: { name: 'Fog', icon: 'w_fog', growth: 1, desc: "Plants grow +1. Critters' intents are hidden." },
};
export const SEASON_WEATHER = {
  spring: { sun: 3, rain: 4, wind: 2, fog: 1 },
  summer: { sun: 5, drought: 3, rain: 1, wind: 1 },
  fall: { wind: 3, rain: 3, fog: 3, sun: 1 },
  winter: { frost: 4, fog: 2, sun: 1, wind: 1 },
};
export const MAX_HAND = 10;
export const MAX_PLOTS = 4;
export const MAX_ENEMIES = 5;

export const cardDef = inst => CARDS[inst.id];
export function cardKeywords(inst) {
  const d = cardDef(inst);
  if (!d) return [];
  return (inst.u && d.keywordsUp) || d.keywords || [];
}
export function baseCost(inst) {
  const d = cardDef(inst);
  if (!d || d.cost == null) return null;
  return inst.u && d.costUp != null ? d.costUp : d.cost;
}

// Action queue shared by card and enemy contexts. Un-awaited calls run in order; `_drain` waits for all.
// Deadlock guard: a call made while one of this queue's own actions is executing (re-entrancy, e.g. an
// engine callback into content during that action) runs immediately instead of waiting behind itself.
function makeQueue() {
  let q = Promise.resolve();
  let running = 0;
  const wrap = (name, fn) => (...a) => {
    const exec = async () => { running++; try { return await fn(...a); } finally { running--; } };
    if (running > 0) return exec();
    const p = q.then(exec);
    q = p.catch(err => console.error('ctx.' + name, err));
    return p;
  };
  const drain = async () => {
    let prev;
    do {
      prev = q;
      await q;
      for (let k = 0; k < 3; k++) await null; // let .then() continuations of finished actions enqueue theirs
    } while (prev !== q);
  };
  return { wrap, drain };
}

export class Combat {
  // opts: { ui, kind: 'fight'|'elite'|'boss', script: { drawOrder: [cardId], weather: [weatherId per turn] } }
  constructor(run, group, { ui, kind = 'fight', script = null, restore = false } = {}) {
    this.run = run;
    if (!run.stats) run.stats = { fights: 0, mended: 0, blooms: 0, cardsPlayed: 0, damage: 0, turns: 0, bosses: 0 };
    this.ui = ui || null;
    this.kind = kind;
    this.script = script || null;
    this.rng = runRng(run);
    this.season = season(run) || 'spring';
    this.mods = keepsakeMods(run);
    this.runMods = runMods(run);
    this.player = { isPlayer: true, name: 'You', hp: run.hp, maxHp: run.maxHp, status: {}, powers: {}, stamina: 0, alive: true };
    this.group = [...group];
    this.enemies = [];
    if (!restore) for (const id of group) this.enemies.push(this.makeEnemy(id));
    this.plots = [null, null, null];
    this.plantSeq = 0;
    this.drawPile = []; this.hand = []; this.discardPile = []; this.exhaustPile = []; this.powerPile = [];
    this.playing = null;
    this.turn = 0; this.cardsPlayedThisTurn = 0;
    this.weather = 'sun';
    this.weatherLock = false;
    this.phase = 'start';
    this.over = false; this.result = null;
    this.done = new Promise(res => { this._resolve = res; });
  }

  // ---------- UI plumbing ----------
  async fx(type, data) {
    const ui = this.ui;
    if (!ui || typeof ui.fx !== 'function') return;
    try { await ui.fx(type, data); } catch (err) { console.error('ui.fx', type, err); }
  }
  sync() { try { this.ui?.sync?.(); } catch (err) { console.error('ui.sync', err); } }

  // ---------- setup ----------
  makeEnemy(id) {
    const def = ENEMIES[id];
    if (!def) throw new Error('Unknown enemy ' + id);
    let hp = Array.isArray(def.hp) ? this.rng.int(def.hp[0], def.hp[1]) : def.hp;
    const m = this.runMods;
    const mult = (m.enemyHpMult ?? 1) * (def.tier === 'elite' ? m.eliteHpMult ?? 1 : 1) * (def.tier === 'boss' ? m.bossHpMult ?? 1 : 1);
    hp = Math.max(1, Math.round(hp * mult));
    const en = { uid: uid(), id, def, name: def.name, sprite: def.sprite, hp, maxHp: hp, status: {}, powers: {}, history: [], alive: true, moveKey: null, tier: def.tier, phase: 1 };
    for (const [k, n] of Object.entries(def.powers || {})) {
      if (STATUSES.includes(k)) en.status[k] = n; else en.powers[k] = n;
    }
    return en;
  }
  newInst(id, u = false, temp = true) { return { id, u: !!u, uid: uid(), temp, data: {}, perm: {} }; }
  instFromDeck(c) { return { ...c, data: {}, perm: c.perm || {} }; }
  alive() { return this.enemies.filter(e => e.alive); }
  randomEnemy() { const a = this.alive(); return a.length ? a[Math.floor(this.rng() * a.length)] : null; }
  allInsts() { return [...this.drawPile, ...this.hand, ...this.discardPile, ...this.exhaustPile, ...this.powerPile, ...(this.playing ? [this.playing] : [])]; }

  weatherTable() {
    const t = { ...(SEASON_WEATHER[this.season] || { sun: 1 }) };
    for (const [w, n] of Object.entries(this.runMods.weatherWeights || {})) if (WEATHER[w]) t[w] = Math.max(0, (t[w] || 0) + n);
    return Object.values(t).some(v => v > 0) ? t : { sun: 1 };
  }
  rollWeather(turn) {
    const forced = this.script?.weather?.[turn - 1];
    return forced && WEATHER[forced] ? forced : this.rng.weighted(this.weatherTable());
  }

  // start() resolves with the result ('victory'|'defeat'); begin() resolves once the first player turn is ready.
  async start() { await this.begin(); return this.done; }
  async begin() {
    const insts = this.run.deck.map(c => this.instFromDeck(c));
    this.rng.shuffle(insts);
    const order = this.script?.drawOrder;
    if (order?.length) {
      const pool = [...insts]; const top = [];
      for (const id of order) {
        const i = pool.findIndex(x => x.id === id);
        if (i >= 0) top.push(pool.splice(i, 1)[0]);
        else if (CARDS[id]) top.push(this.newInst(id));
      }
      this.drawPile = [...pool, ...top.reverse()];
    } else {
      const early = insts.filter(i => cardKeywords(i).includes('early'));
      this.drawPile = [...insts.filter(i => !early.includes(i)), ...early];
    }
    this.weather = this.rollWeather(1);
    for (const e of this.enemies) this.chooseIntent(e, 1);
    this.sync();
    await this.fire('combatStart');
    for (const e of this.enemies) if (e.def.start) await this.callEnemy('enemy start ' + e.id, e.def.start, e);
    if (this.runMods.eliteExtraMove) {
      // Harder Years: elites take one free move before your first turn, then telegraph turn 1 as usual.
      for (const e of this.alive()) {
        if (e.tier !== 'elite' || this.over) continue;
        await this.enemyAct(e);
        if (e.alive) this.chooseIntent(e, 1);
      }
    }
    await this.startPlayerTurn();
  }

  // ---------- turn flow ----------
  async startPlayerTurn() {
    if (this.over) return;
    this.turn++;
    this.cardsPlayedThisTurn = 0;
    this.run.stats.turns = (this.run.stats.turns || 0) + 1;
    if (this.turn > 1) {
      if (this.weatherLock) { this.weatherLock = false; await this.fx('weather', { weather: this.weather, locked: true }); }
      else await this.changeWeather(this.rollWeather(this.turn));
    }
    if (this.over) return;
    this.player.status.bark = 0;
    await this.tickWilt(this.player);
    if (this.over) return;
    await this.fx('turnStart', { turn: this.turn });
    const g = WEATHER[this.weather]?.growth || 0;
    if (g > 0 && this.plots.some(Boolean)) await this.grow(g, 'all', true);
    if (this.over) return;
    this.player.stamina = 3 + (this.turn === 1 ? this.mods.startStamina : 0);
    await this.draw(Math.max(0, 5 + this.mods.drawBonus));
    await this.fire('turnStart');
    if (this.over) return;
    this.phase = 'player';
    this.persistPerm();
    this.sync();
    if (typeof this.ui?.checkpoint === 'function') {
      try { this.ui.checkpoint(this.serialize()); } catch (err) { console.error('ui.checkpoint', err); }
    }
  }

  async endPlayerTurn() {
    if (this.phase !== 'player' || this.over) return;
    this.phase = 'enemy';
    this.sync();
    await this.fire('turnEnd');
    if (this.over) return;
    const bees = this.player.status.bees || 0;
    if (bees > 0) await this.sting(bees);
    if (this.over) return;
    for (const inst of [...this.hand]) {
      const d = cardDef(inst);
      if (d?.onEndTurnInHand) await this.safeCall('card onEndTurnInHand ' + inst.id, d.onEndTurnInHand, this.makeCtx({ card: inst, u: inst.u }));
      if (this.over) return;
    }
    const kept = [], fleeting = [];
    for (const inst of this.hand) {
      const kw = cardKeywords(inst);
      if (kw.includes('keep')) kept.push(inst);
      else if (kw.includes('fleeting')) fleeting.push(inst);
      else this.discardPile.push(inst);
    }
    this.hand = kept;
    for (const inst of fleeting) await this.exhaustInst(inst, 'fleeting');
    this.decay(this.player);
    delete this.player.status.rooted;
    await this.fx('endTurn', {});
    this.sync();

    for (const e of this.enemies) { // live list (1.0 behavior): critters summoned this turn also act
      if (!e.alive || this.over) continue;
      e.status.bark = 0;
      await this.tickWilt(e);
      if (!e.alive || this.over) continue;
      await this.enemyAct(e);
      this.decay(e);
      this.sync();
      if (this.checkEnd()) return;
    }
    await this.fireEnemyHook('enemyTurnEnd');
    for (const e of this.alive()) this.chooseIntent(e, this.turn + 1);
    this.sync();
    if (this.checkEnd()) return;
    await this.startPlayerTurn();
  }

  async enemyAct(e) {
    const move = e.def.moves?.[e.moveKey];
    if (!move) return;
    await this.fx('enemyAct', { enemy: e, move });
    await this.callEnemy('enemy move ' + e.id + '.' + e.moveKey, move.run, e);
    e.history.push(e.moveKey);
  }

  decay(who) {
    for (const s of ['dazed', 'soggy']) if (who.status[s] > 0) { who.status[s]--; if (!who.status[s]) delete who.status[s]; }
  }
  async tickWilt(who) {
    const w = who.status.wilt || 0;
    if (w <= 0) return;
    await this.loseHp(who, w, 'wilt');
    if (who.status.wilt) who.status.wilt = w - 1;
    if (!who.status.wilt) delete who.status.wilt;
  }

  chooseIntent(e, turn) {
    const ctx = this.enemyCtx(e);
    ctx.turn = turn;
    let key;
    try { key = e.def.next(ctx, e.history); } catch (err) { console.error('enemy next ' + e.id, err); }
    if (!e.def.moves?.[key]) key = Object.keys(e.def.moves || {})[0];
    e.moveKey = key;
  }
  intentOf(e) {
    const move = e.def.moves?.[e.moveKey];
    if (!move) return null;
    const hidden = this.weather === 'fog';
    return {
      type: move.intent, alt: move.alt, label: move.label || e.moveKey, hidden,
      dmg: move.dmg != null ? this.calcAttack(e, this.player, move.dmg) : null,
      times: move.times || 1,
    };
  }

  // ---------- damage ----------
  calcAttack(src, tgt, base) {
    let d = base + (src?.status?.grit || 0) + (this.weather === 'wind' ? 2 : 0);
    if (src && !src.isPlayer) d += this.runMods.enemyDmgAdd || 0;
    if (src?.status?.dazed) d = Math.floor(d * 0.75);
    if (tgt && tgt.status.soggy) d = Math.floor(d * 1.5);
    return Math.max(0, d);
  }
  async hit(src, tgt, base) {
    if (this.over || !tgt || !tgt.alive || (src && !src.alive)) return 0;
    const d = this.calcAttack(src, tgt, base);
    const bark = tgt.status.bark || 0;
    const blocked = Math.min(bark, d);
    if (blocked) tgt.status.bark = bark - blocked;
    const lost = d - blocked;
    tgt.hp -= lost;
    if (!tgt.isPlayer) this.run.stats.damage += lost;
    await this.fx('hit', { src, target: tgt, amount: lost, blocked });
    if (lost > 0 && tgt.isPlayer) await this.fire('attacked', lost);
    await this.checkDeath(tgt);
    const th = tgt.status.thorns || 0;
    if (th > 0 && src && src.alive && !this.over) await this.loseHp(src, th, 'thorns');
    return lost;
  }
  async loseHp(who, n, why = '') {
    if (this.over || !who.alive || n <= 0) return;
    who.hp -= n;
    await this.fx('loseHp', { target: who, amount: n, why });
    await this.checkDeath(who);
  }
  async heal(who, n) {
    if (!who.alive || n <= 0) return;
    const before = who.hp;
    who.hp = Math.min(who.maxHp, who.hp + n);
    await this.fx('heal', { target: who, amount: who.hp - before });
  }
  async gainBark(who, n) {
    if (n <= 0 || !who.alive) return;
    const total = n + (who.status.sturdy || 0) + (this.weather === 'frost' ? 3 : 0);
    who.status.bark = (who.status.bark || 0) + total;
    await this.fx('bark', { target: who, amount: total });
    if (who.isPlayer) await this.fire('barkGained', total);
  }
  async applyTo(who, id, n) {
    if (!who || !who.alive || !n) return;
    if (STATUSES.includes(id)) {
      who.status[id] = (who.status[id] || 0) + n;
      if (who.status[id] <= 0) delete who.status[id];
    } else {
      who.powers[id] = (who.powers[id] || 0) + n;
      if (who.powers[id] <= 0) delete who.powers[id];
    }
    await this.fx('status', { target: who, id, n });
  }
  // Bee stings: 1 damage each to a random critter. Ignores Bark, not an attack (no Grit/Soggy/Wind/Thorns).
  async sting(n = 1) {
    for (let k = 0; k < n; k++) {
      if (this.over) return;
      const e = this.randomEnemy();
      if (!e) return;
      e.hp -= 1;
      this.run.stats.damage += 1;
      await this.fx('sting', { target: e, amount: 1 });
      await this.checkDeath(e);
      await this.fire('stung', e);
    }
  }
  async checkDeath(who) {
    if (who.hp > 0 || !who.alive) return;
    who.hp = 0;
    if (who.isPlayer) {
      who.alive = false;
      this.finish('defeat');
      return;
    }
    who.alive = false;
    this.run.stats.mended++;
    await this.fx('mend', { enemy: who });
    await this.fire('enemyMended', who);
    this.checkEnd();
  }
  checkEnd() {
    if (this.over) return true;
    if (!this.player.alive) { this.finish('defeat'); return true; }
    if (!this.alive().length) { this.finish('victory'); return true; }
    return false;
  }
  finish(result) {
    if (this.over) return;
    this.over = true;
    this.result = result;
    this.phase = 'over';
    this.run.hp = Math.max(0, this.player.hp);
    if (result === 'victory' && this.kind === 'boss') {
      this.run.stats.bosses = (this.run.stats.bosses || 0) + 1;
      const ids = this.enemies.filter(e => e.tier === 'boss').map(e => e.id);
      if (!this.run.bossesMended) this.run.bossesMended = [];
      for (const id of ids.length ? ids : this.group.slice(0, 1)) if (!this.run.bossesMended.includes(id)) this.run.bossesMended.push(id);
    }
    this.persistPerm();
    this.sync();
    this._resolve(result);
  }

  // ---------- garden ----------
  // Plot: { uid, id, def, growth, growTime, u, age, seq, perennial, guard, weed }
  // Player-side growth/harvest/guard never touch gloamweeds; only weather grows them and only uproot removes them.
  makePlot(id, def, u, weed) {
    return { uid: uid(), id, def, growth: 0, growTime: def.growTime, u: !!u, age: this.turn, seq: ++this.plantSeq, perennial: !!def.perennial, guard: 0, weed: !!weed };
  }
  freePlots() { return this.plots.filter(p => !p).length; }
  async plant(id, u = false) {
    const idx = this.plots.findIndex(p => !p);
    const def = plantDef(id);
    if (idx < 0 || !def) return false;
    this.plots[idx] = this.makePlot(id, def, u, id === 'gloamweed' || !!def.weed);
    await this.fx('plant', { idx });
    await this.fire('planted', this.plots[idx]);
    return true;
  }
  async plantWeed(n = 1) {
    let planted = 0;
    for (let k = 0; k < n; k++) {
      let idx = -1;
      for (let i = this.plots.length - 1; i >= 0; i--) if (!this.plots[i]) { idx = i; break; }
      if (idx < 0) break;
      const p = this.makePlot('gloamweed', weedDef(), false, true);
      this.plots[idx] = p;
      planted++;
      await this.fx('weed', { idx });
      await this.fire('weedPlanted', p, idx);
    }
    return planted;
  }
  isOlder(a, b) { return a.age < b.age || (a.age === b.age && (a.seq || 0) < (b.seq || 0)); }
  plotTargets(which, { weeds = false } = {}) {
    const ok = p => p && (weeds === 'only' ? p.weed : weeds || !p.weed);
    const filled = this.plots.map((p, i) => (ok(p) ? i : -1)).filter(i => i >= 0);
    if (!filled.length) return [];
    if (which === 'all') return filled;
    if (which === 'random') return [filled[Math.floor(this.rng() * filled.length)]];
    if (which === 'oldest') return [filled.reduce((a, b) => (this.isOlder(this.plots[b], this.plots[a]) ? b : a))];
    if (typeof which === 'number') return filled.includes(which) ? [which] : [];
    return filled;
  }
  async grow(n, which = 'all', fromWeather = false) {
    const idxs = this.plotTargets(which, { weeds: fromWeather });
    if (!idxs.length || n <= 0) return;
    for (const i of idxs) this.plots[i].growth = Math.min(this.plots[i].growTime, this.plots[i].growth + n);
    await this.fx('grow', { idxs, n, fromWeather });
    for (const i of idxs) {
      const p = this.plots[i];
      if (p && p.growth >= p.growTime && !this.over) await this.bloom(i);
    }
  }
  async bloom(i) {
    const p = this.plots[i];
    if (!p || p.blooming) return;
    p.blooming = true;
    await this.fx('bloom', { idx: i, plant: p, weed: p.weed });
    if (p.def?.bloom) await this.safeCall((p.weed ? 'weed' : 'plant') + ' bloom ' + p.id, p.def.bloom, this.makeCtx({ u: p.u, plant: p, weed: p.weed }));
    p.blooming = false;
    if (p.perennial) p.growth = 0;
    else if (this.plots[i] === p) this.plots[i] = null;
    this.sync();
    if (!p.weed) {
      this.run.stats.blooms++;
      await this.fire('bloom', p);
    }
    this.checkEnd();
  }
  async harvest(which = 'oldest') {
    for (const i of this.plotTargets(which)) if (!this.over) await this.bloom(i);
  }
  async trample(n = 1) {
    for (let k = 0; k < n; k++) {
      const filled = this.plotTargets('all');
      if (!filled.length) return;
      const i = filled.reduce((a, b) => (this.plots[b].growth > this.plots[a].growth ? b : a));
      const p = this.plots[i];
      if (p.guard > 0) {
        p.guard--;
        await this.fx('guardBlock', { idx: i });
        this.sync();
        continue;
      }
      await this.fx('trample', { idx: i });
      this.plots[i] = null;
      this.sync();
      await this.fire('trampled', p, i);
    }
  }
  async nibble(n = 1) {
    const idxs = this.plotTargets('all');
    if (!idxs.length) return;
    for (const i of idxs) this.plots[i].growth = Math.max(0, this.plots[i].growth - n);
    await this.fx('nibble', { idxs });
  }
  async guard(which = 'all', n = 1) {
    const idxs = this.plotTargets(which);
    for (const i of idxs) {
      this.plots[i].guard = (this.plots[i].guard || 0) + n;
      await this.fx('guard', { idx: i, n });
    }
    this.sync();
    return idxs.length;
  }
  // which: 'oldest' | 'random' | plot index | 'weeds' (every gloamweed). Removes without blooming.
  async uproot(which = 'oldest') {
    const idxs = which === 'weeds' ? this.plotTargets('all', { weeds: 'only' }) : this.plotTargets(which, { weeds: true });
    for (const i of idxs) {
      await this.fx('uproot', { idx: i, plant: this.plots[i] });
      this.plots[i] = null;
    }
    this.sync();
    return idxs.length;
  }
  async addPlot() {
    if (this.plots.length >= MAX_PLOTS) return false;
    this.plots.push(null);
    await this.fx('addPlot', { idx: this.plots.length - 1 });
    this.sync();
    return true;
  }
  async changeWeather(w) {
    const prev = this.weather;
    this.weather = w;
    await this.fx('weather', { weather: w });
    if (prev !== w) await this.fire('weatherChanged', w, prev);
  }
  async setWeather(w, { lock = false } = {}) {
    if (!WEATHER[w]) return;
    await this.changeWeather(w);
    if (lock) {
      this.weatherLock = true;
      await this.fx('weatherLock', { weather: w });
      this.sync();
    }
  }

  // ---------- cards ----------
  cost(inst) { const b = baseCost(inst); return b == null ? null : Math.max(0, b + (inst.costMod || 0)); }
  canPlay(inst) {
    if (this.phase !== 'player' || this.over) return false;
    const d = cardDef(inst);
    if (!d || d.cost == null || cardKeywords(inst).includes('unplayable')) return false;
    if (this.cost(inst) > this.player.stamina) return false;
    if (d.type === 'seed' && !this.freePlots()) return false;
    try {
      if (d.canPlay && !d.canPlay(this.makeCtx({ card: inst, u: inst.u }))) return false;
    } catch (err) { console.error('card canPlay ' + inst.id, err); return false; }
    return true;
  }
  whyNot(inst) {
    const d = cardDef(inst);
    if (!d || d.cost == null || cardKeywords(inst).includes('unplayable')) return "That one can't be played.";
    if (this.cost(inst) > this.player.stamina) return 'Not enough Stamina.';
    if (d.type === 'seed' && !this.freePlots()) return 'Your plots are full.';
    return "Can't play that right now.";
  }
  async draw(n) {
    let drew = 0;
    for (let k = 0; k < n; k++) {
      if (this.hand.length >= MAX_HAND) break;
      if (!this.drawPile.length) {
        if (!this.discardPile.length) break;
        this.drawPile = this.rng.shuffle(this.discardPile);
        this.discardPile = [];
        await this.fx('shuffle', {});
      }
      const inst = this.drawPile.pop();
      this.hand.push(inst);
      drew++;
      const d = cardDef(inst);
      if (d?.onDraw) await this.safeCall('card onDraw ' + inst.id, d.onDraw, this.makeCtx({ card: inst, u: inst.u }));
      if (this.over) break;
    }
    if (drew) await this.fx('draw', { n: drew });
    return drew;
  }
  async addCard(id, where = 'hand', u = false) {
    if (!CARDS[id]) return null;
    const inst = this.newInst(id, u);
    this.placeInst(inst, where);
    await this.fx('addCard', { inst, where });
    return inst;
  }
  placeInst(inst, where) {
    if (where === 'hand' && this.hand.length < MAX_HAND) this.hand.push(inst);
    else if (where === 'draw') this.drawPile.splice(Math.floor(this.rng() * (this.drawPile.length + 1)), 0, inst);
    else if (where === 'drawTop') this.drawPile.push(inst);
    else this.discardPile.push(inst);
  }
  pileOf(inst) {
    for (const [name, pile] of [['hand', this.hand], ['draw', this.drawPile], ['discard', this.discardPile], ['exhaust', this.exhaustPile], ['power', this.powerPile]]) {
      if (pile.includes(inst)) return name;
    }
    return null;
  }
  takeInst(inst) {
    for (const pile of [this.hand, this.drawPile, this.discardPile, this.exhaustPile, this.powerPile]) {
      const i = pile.indexOf(inst);
      if (i >= 0) { pile.splice(i, 1); return true; }
    }
    return false;
  }
  async exhaustInst(inst, from = null) {
    if (!inst) return false;
    this.takeInst(inst);
    this.exhaustPile.push(inst);
    await this.fx('exhaust', { inst, from });
    await this.fire('cardExhausted', inst);
    this.sync();
    return true;
  }
  async discardInst(inst) {
    if (!inst || this.pileOf(inst) === 'discard') return false;
    this.takeInst(inst);
    this.discardPile.push(inst);
    await this.fx('discard', { inst });
    this.sync();
    return true;
  }
  // where: 'hand' | 'draw' (random spot) | 'drawTop' | 'discard' | 'exhaust'
  async moveCard(inst, where = 'discard') {
    if (!inst) return false;
    if (where === 'exhaust') return this.exhaustInst(inst);
    this.takeInst(inst);
    this.placeInst(inst, where === 'hand' && this.hand.length >= MAX_HAND ? 'discard' : where);
    await this.fx('moveCard', { inst, where });
    this.sync();
    return true;
  }
  async upgradeInst(inst) {
    if (!inst || inst.u) return false;
    inst.u = true;
    await this.fx('upgrade', { inst });
    this.sync();
    return true;
  }
  async discardRandom(n) {
    for (let k = 0; k < n && this.hand.length; k++) {
      const i = Math.floor(this.rng() * this.hand.length);
      this.discardPile.push(...this.hand.splice(i, 1));
    }
    this.sync();
  }
  async exhaustRandom(n) {
    for (let k = 0; k < n && this.hand.length; k++) {
      const i = Math.floor(this.rng() * this.hand.length);
      await this.exhaustInst(this.hand[i], 'random');
    }
    await this.fx('compost', {});
  }

  // ---------- choices (UI modal; random fallback when the UI does not implement them) ----------
  async choose(prompt, options = []) {
    if (!options.length) return -1;
    if (typeof this.ui?.choose === 'function') {
      try {
        const i = await this.ui.choose(prompt, options);
        if (Number.isInteger(i) && i >= 0 && i < options.length) return i;
      } catch (err) { console.error('ui.choose', err); }
    }
    return Math.floor(this.rng() * options.length);
  }
  async pickCards({ from = 'hand', n = 1, min = 0, filter = null, prompt = 'Choose a card' } = {}) {
    const pile = { hand: this.hand, draw: this.drawPile, discard: this.discardPile, exhaust: this.exhaustPile }[from] || this.hand;
    let cards = pile.filter(i => { try { return !filter || filter(i, cardDef(i)); } catch { return false; } });
    if (from === 'draw') cards = [...cards].reverse(); // top of the draw pile first
    n = Math.min(n, cards.length); min = Math.min(min, n);
    if (!cards.length || n <= 0) return [];
    let picked = null;
    if (typeof this.ui?.pickCards === 'function') {
      try {
        const r = await this.ui.pickCards({ prompt, cards, n, min, from });
        if (Array.isArray(r)) picked = [...new Set(r)].filter(i => cards.includes(i)).slice(0, n);
      } catch (err) { console.error('ui.pickCards', err); }
    }
    if (!picked) picked = this.rng.shuffle([...cards]).slice(0, n);
    if (picked.length < min) picked.push(...this.rng.shuffle(cards.filter(i => !picked.includes(i))).slice(0, min - picked.length));
    return picked;
  }

  async playCard(inst, target) {
    if (!this.canPlay(inst)) return false;
    const d = cardDef(inst);
    if (d.target === 'enemy' && (!target || !target.alive)) target = this.alive()[0];
    this.player.stamina -= this.cost(inst);
    const hi = this.hand.indexOf(inst);
    if (hi >= 0) this.hand.splice(hi, 1);
    this.phase = 'resolving';
    this.playing = inst;
    const before = this.cardsPlayedThisTurn;
    await this.fx('play', { inst, target });
    if (d.play) await this.safeCall('card play ' + inst.id, d.play, this.makeCtx({ card: inst, u: inst.u, target: d.target === 'enemy' ? target : null, cardsPlayed: before }));
    this.playing = null;
    this.cardsPlayedThisTurn++;
    this.run.stats.cardsPlayed++;
    if (!this.pileOf(inst)) { // the card may have moved itself during play (ctx.moveCard / ctx.exhaust)
      const kw = cardKeywords(inst);
      if (d.type === 'charm') this.powerPile.push(inst); // powers leave the deck for this fight
      else if (kw.includes('compost')) await this.exhaustInst(inst, 'play');
      else this.discardPile.push(inst);
    }
    await this.fire('cardPlayed', inst);
    if (!this.over) this.phase = 'player';
    this.persistPerm();
    this.sync();
    this.checkEnd();
    return true;
  }
  async usePreserve(slot, target) {
    if (this.phase !== 'player' || this.over) return;
    const id = this.run.preserves[slot];
    const def = PRESERVES[id];
    if (!def) return;
    this.run.preserves[slot] = null;
    this.phase = 'resolving';
    await this.fx('preserve', { id });
    if (def.use) await this.safeCall('preserve ' + id, def.use, this.makeCtx({ target: target && target.alive ? target : this.alive()[0], preserve: id }));
    if (!this.over) this.phase = 'player';
    this.sync();
    this.checkEnd();
  }

  // card.perm lives on the run deck entry (by uid) so it survives between fights and saves.
  persistPerm() {
    const byUid = new Map((this.run.deck || []).map(c => [c.uid, c]));
    for (const inst of this.allInsts()) {
      if (inst.temp || !inst.perm) continue;
      const entry = byUid.get(inst.uid);
      if (entry && entry.perm !== inst.perm && Object.keys(inst.perm).length) entry.perm = inst.perm;
    }
  }

  // ---------- hooks ----------
  async fire(name, ...args) {
    if (this.over && name !== 'enemyMended') return;
    for (const k of this.run.keepsakes) {
      const h = KEEPSAKES[k]?.hooks?.[name];
      if (h) {
        await this.safeCall('keepsake ' + k + '.' + name, h, this.makeCtx({ keepsake: k }), ...args);
        this.fx('keepsake', { id: k });
      }
    }
    for (const [pid, n] of Object.entries(this.player.powers)) {
      const h = POWERS[pid]?.hooks?.[name];
      if (h) await this.safeCall('power ' + pid + '.' + name, h, this.makeCtx({ power: pid }), n, ...args);
    }
    await this.fireEnemyHook(name, ...args);
  }
  async fireEnemyHook(name, ...args) {
    for (const e of this.alive()) {
      for (const [pid, n] of Object.entries(e.powers)) {
        const h = POWERS[pid]?.hooks?.[name];
        if (h) await this.safeCall('enemy power ' + pid + '.' + name, h, this.makeCtx({ self: e }), n, ...args);
      }
    }
  }

  // Run a content function, then wait for any ctx actions it fired without awaiting.
  async call(fn, ctx, ...args) {
    try { await fn.call(null, ctx, ...args); } finally { await ctx._drain(); }
  }
  async safeCall(label, fn, ctx, ...args) {
    try { await this.call(fn, ctx, ...args); } catch (err) { console.error(label, err); }
  }
  async callEnemy(label, fn, e) {
    const ctx = this.enemyCtx(e);
    try { await fn.call(null, ctx); } catch (err) { console.error(label, err); }
    await ctx._drain();
  }

  // ---------- contexts ----------
  resolveTargets(t) {
    if (t === 'self') return [this.player];
    if (t === 'all') return this.alive();
    if (t === 'random') { const e = this.randomEnemy(); return e ? [e] : []; }
    if (t && typeof t === 'object') return [t];
    return [];
  }
  makeCtx(extra = {}) {
    const c = this;
    const card = extra.card || null;
    if (card) { if (!card.data) card.data = {}; if (!card.perm) card.perm = {}; }
    const played = extra.cardsPlayed;
    const ctx = {
      u: !!extra.u, target: extra.target || null, card, plant: extra.plant || null, self: extra.self || null,
      keepsake: extra.keepsake || null, power: extra.power || null, weed: !!extra.weed,
      get player() { return c.player; },
      get enemies() { return c.alive(); },
      get weather() { return c.weather; },
      get weatherLocked() { return c.weatherLock; },
      get season() { return c.season; },
      get turn() { return c.turn; },
      get kind() { return c.kind; },
      get character() { return c.run.character || 'farmer'; },
      get plants() { return c.plots; },
      get plots() { return c.plots; },
      get hand() { return c.hand; },
      get drawPile() { return c.drawPile; },
      get discardPile() { return c.discardPile; },
      get exhaustPile() { return c.exhaustPile; },
      get cardsPlayedThisTurn() { return played != null ? played : c.cardsPlayedThisTurn; },
      get run() { return c.run; },
      attack: (n, t) => {
        let tgt = t || ctx.target;
        if (!tgt || !tgt.alive) tgt = c.randomEnemy();
        return tgt ? c.hit(c.player, tgt, n) : Promise.resolve(0);
      },
      attackAll: async n => { for (const e of c.alive()) await c.hit(c.player, e, n); },
      attackRandom: async (n, times = 1) => {
        for (let k = 0; k < times; k++) { const e = c.randomEnemy(); if (!e) break; await c.hit(c.player, e, n); }
      },
      bark: n => c.gainBark(c.player, n),
      draw: n => c.draw(n),
      gainStamina: async n => {
        if (c.player.status.rooted) return;
        c.player.stamina += n;
        await c.fx('stamina', { n });
      },
      heal: n => c.heal(c.player, n),
      loseHp: n => c.loseHp(c.player, n),
      apply: async (t, s, n) => { for (const w of c.resolveTargets(t)) await c.applyTo(w, s, n); },
      plant: id => c.plant(id, ctx.u),
      grow: (n, which = 'all') => c.grow(n, which),
      harvest: (which = 'oldest') => c.harvest(which),
      freePlots: () => c.freePlots(),
      addCard: (id, where = 'hand', u = false) => c.addCard(id, where, u),
      discardRandom: n => c.discardRandom(n),
      exhaustRandom: n => c.exhaustRandom(n),
      coin: async n => { c.run.coin += n; await c.fx('coin', { n }); },
      setWeather: (w, opts) => c.setWeather(w, opts),
      addPower: (id, n) => c.applyTo(c.player, id, n),
      enemyPower: (e, id, n) => c.applyTo(e, id, n),
      rand: () => c.rng(),
      log: text => c.fx('log', { text }),
      // 2.0
      choose: (prompt, options) => c.choose(prompt, options),
      pickCards: (opts = {}) => c.pickCards(opts),
      exhaust: inst => c.exhaustInst(inst),
      discard: inst => c.discardInst(inst),
      moveCard: (inst, where) => c.moveCard(inst, where),
      upgrade: inst => c.upgradeInst(inst),
      guard: (which = 'all', n = 1) => c.guard(which, n),
      uproot: (which = 'oldest') => c.uproot(which),
      addPlot: () => c.addPlot(),
      sting: (n = 1) => c.sting(n),
    };
    const { wrap, drain } = makeQueue();
    for (const k of ['attack', 'attackAll', 'attackRandom', 'bark', 'draw', 'gainStamina', 'heal', 'loseHp', 'apply', 'plant', 'grow', 'harvest', 'addCard', 'discardRandom', 'exhaustRandom', 'coin', 'setWeather', 'addPower', 'enemyPower', 'log',
      'choose', 'pickCards', 'exhaust', 'discard', 'moveCard', 'upgrade', 'guard', 'uproot', 'addPlot', 'sting']) {
      ctx[k] = wrap(k, ctx[k]);
    }
    ctx._drain = drain;
    return ctx;
  }
  enemyCtx(self) {
    const c = this;
    const e = {
      self, turn: c.turn, history: self.history,
      get player() { return c.player; },
      get allies() { return c.alive(); },
      get weather() { return c.weather; },
      get season() { return c.season; },
      get plants() { return c.plots; },
      get hand() { return c.hand; },
      get kind() { return c.kind; },
      rand: () => c.rng(),
      attack: async (n, times = 1) => { for (let k = 0; k < times; k++) { if (c.over || !self.alive) break; await c.hit(self, c.player, n); } },
      bark: n => c.gainBark(self, n),
      apply: async (t, s, n) => {
        const ws = t === 'player' ? [c.player] : t === 'self' ? [self] : t === 'allies' ? c.alive() : t && typeof t === 'object' ? [t] : [];
        for (const w of ws) await c.applyTo(w, s, n);
      },
      heal: n => c.heal(self, n),
      trample: (n = 1) => c.trample(n),
      nibble: (n = 1) => c.nibble(n),
      addGloom: async (id = 'gloom', n = 1, where = 'discard') => { for (let k = 0; k < n; k++) await c.addCard(id, where); await c.fx('gloom', { enemy: self, n }); },
      summon: async id => {
        if (c.alive().length >= MAX_ENEMIES || !ENEMIES[id]) return null;
        const en = c.makeEnemy(id);
        c.enemies.push(en);
        c.chooseIntent(en, c.turn + 1);
        await c.fx('summon', { enemy: en });
        return en;
      },
      setWeather: w => c.setWeather(w),
      say: text => c.fx('say', { enemy: self, text }),
      addPower: (id, n) => c.applyTo(self, id, n),
      // 2.0
      plantWeed: (n = 1) => c.plantWeed(n),
      stealCoin: async (n = 1) => {
        const amt = Math.max(0, Math.min(c.run.coin || 0, n));
        c.run.coin -= amt;
        self.stolen = (self.stolen || 0) + amt;
        await c.fx('steal', { enemy: self, n: amt });
        return amt;
      },
      phase: async (n, text) => {
        self.phase = n;
        await c.fx('bossPhase', { enemy: self, n, text: text || '' });
      },
    };
    const { wrap, drain } = makeQueue();
    for (const k of ['attack', 'bark', 'apply', 'heal', 'trample', 'nibble', 'addGloom', 'summon', 'setWeather', 'say', 'addPower', 'plantWeed', 'stealCoin', 'phase']) e[k] = wrap(k, e[k]);
    e._drain = drain;
    return e;
  }

  // ---------- save / restore ----------
  // Plain JSON snapshot. Taken by the engine at the start of each player turn (ui.checkpoint).
  serialize() {
    const snap = {
      v: 2, kind: this.kind, group: this.group, season: this.season,
      turn: this.turn, weather: this.weather, weatherLock: this.weatherLock, phase: this.phase,
      cardsPlayedThisTurn: this.cardsPlayedThisTurn, plantSeq: this.plantSeq,
      player: this.player,
      piles: { draw: this.drawPile, hand: this.hand, discard: this.discardPile, exhaust: this.exhaustPile, power: this.powerPile },
      plots: this.plots.map(p => p && { ...p, def: undefined, blooming: undefined }),
      enemies: this.enemies.map(e => ({ ...e, def: undefined })),
      script: this.script,
      rngState: this.run.rngState,
      run: { hp: this.run.hp, coin: this.run.coin, preserves: this.run.preserves, stats: this.run.stats, bossesMended: this.run.bossesMended || [] },
    };
    return JSON.parse(JSON.stringify(snap));
  }
  // Rebuild a combat from serialize() output. Call resume() to continue the player's turn.
  static restore(run, snap, opts = {}) {
    const s = JSON.parse(JSON.stringify(snap));
    run.rngState = s.rngState;
    if (s.run) {
      run.coin = s.run.coin;
      run.preserves = [...s.run.preserves];
      run.stats = { ...s.run.stats };
      run.bossesMended = [...(s.run.bossesMended || [])];
    }
    const c = new Combat(run, s.group || [], { ...opts, kind: s.kind || opts.kind || 'fight', script: s.script || null, restore: true });
    c.turn = s.turn; c.weather = s.weather; c.weatherLock = !!s.weatherLock;
    c.cardsPlayedThisTurn = s.cardsPlayedThisTurn || 0; c.plantSeq = s.plantSeq || 0;
    c.player = s.player;
    c.enemies = (s.enemies || []).map(e => ({ ...e, def: ENEMIES[e.id] })).filter(e => e.def);
    c.plots = (s.plots || [null, null, null]).map(p => {
      if (!p) return null;
      const def = p.weed ? weedDef() : plantDef(p.id);
      return def ? { ...p, def } : null;
    });
    const P = s.piles || {};
    c.drawPile = P.draw || []; c.hand = P.hand || []; c.discardPile = P.discard || []; c.exhaustPile = P.exhaust || []; c.powerPile = P.power || [];
    for (const inst of c.allInsts()) { if (!inst.data) inst.data = {}; if (!inst.perm) inst.perm = {}; }
    c.phase = 'restored';
    return c;
  }
  resume() {
    if (!this.over) {
      if (!this.alive().length) this.checkEnd();
      else this.phase = 'player';
    }
    this.persistPerm();
    this.sync();
    return this.done;
  }
}
