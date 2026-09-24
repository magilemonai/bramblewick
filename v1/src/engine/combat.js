// Combat engine. Pure game logic; all presentation goes through `ui.fx(type, data)` (async) and `ui.sync()`.
import { CARDS, POWERS } from '../data/cards.js';
import { PLANTS } from '../data/plants.js';
import { ENEMIES } from '../data/enemies.js';
import { KEEPSAKES } from '../data/keepsakes.js';
import { PRESERVES } from '../data/preserves.js';
import { runRng, uid, season } from './state.js';

export const STATUSES = ['bark', 'grit', 'sturdy', 'dazed', 'soggy', 'wilt', 'thorns', 'rooted'];
export const STATUS_INFO = {
  bark: { name: 'Bark', icon: 'st_bark', desc: n => `Blocks the next ${n} damage. Falls away at the start of the next turn.` },
  grit: { name: 'Grit', icon: 'st_grit', desc: n => `Attacks deal ${n} more damage.` },
  sturdy: { name: 'Sturdy', icon: 'st_sturdy', desc: n => `Gain ${n} extra Bark whenever gaining Bark.` },
  dazed: { name: 'Dazed', icon: 'st_dazed', desc: n => `Deals 25% less attack damage. ${n} turn${n === 1 ? '' : 's'}.` },
  soggy: { name: 'Soggy', icon: 'st_soggy', desc: n => `Takes 50% more attack damage. ${n} turn${n === 1 ? '' : 's'}.` },
  wilt: { name: 'Wilt', icon: 'st_wilt', desc: n => `Loses ${n} HP at the start of its turn, then Wilt drops by 1.` },
  thorns: { name: 'Thorns', icon: 'st_thorns', desc: n => `Attackers take ${n} damage per hit.` },
  rooted: { name: 'Rooted', icon: 'st_rooted', desc: () => `Can't gain Stamina from cards this turn.` },
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

export function keepsakeMods(run) {
  const m = { maxHp: 0, restHeal: 0, shopDiscount: 0, extraCardChoice: 0, startStamina: 0, drawBonus: 0 };
  for (const k of run.keepsakes) {
    const mods = KEEPSAKES[k]?.mods;
    if (mods) for (const [a, v] of Object.entries(mods)) m[a] = (m[a] || 0) + v;
  }
  return m;
}

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

export class Combat {
  constructor(run, group, { ui, kind = 'fight' } = {}) {
    this.run = run;
    this.ui = ui || { fx: async () => {}, sync: () => {} };
    this.kind = kind;
    this.rng = runRng(run);
    this.season = season(run);
    this.mods = keepsakeMods(run);
    this.player = { isPlayer: true, name: 'You', hp: run.hp, maxHp: run.maxHp, status: {}, powers: {}, stamina: 0, alive: true };
    this.enemies = [];
    for (const id of group) this.enemies.push(this.makeEnemy(id));
    this.plots = [null, null, null];
    this.drawPile = []; this.hand = []; this.discardPile = []; this.exhaustPile = [];
    this.turn = 0; this.cardsPlayedThisTurn = 0;
    this.weather = 'sun';
    this.phase = 'start';
    this.over = false; this.result = null;
    this.done = new Promise(res => { this._resolve = res; });
  }

  // ---------- setup ----------
  makeEnemy(id) {
    const def = ENEMIES[id];
    if (!def) throw new Error('Unknown enemy ' + id);
    const hp = Array.isArray(def.hp) ? this.rng.int(def.hp[0], def.hp[1]) : def.hp;
    const en = { uid: uid(), id, def, name: def.name, sprite: def.sprite, hp, maxHp: hp, status: {}, powers: {}, history: [], alive: true, moveKey: null, tier: def.tier };
    for (const [k, n] of Object.entries(def.powers || {})) {
      if (STATUSES.includes(k)) en.status[k] = n; else en.powers[k] = n;
    }
    return en;
  }
  alive() { return this.enemies.filter(e => e.alive); }
  randomEnemy() { const a = this.alive(); return a.length ? a[Math.floor(this.rng() * a.length)] : null; }

  async start() {
    const insts = this.run.deck.map(c => ({ ...c }));
    this.rng.shuffle(insts);
    const early = insts.filter(i => cardKeywords(i).includes('early'));
    this.drawPile = [...insts.filter(i => !early.includes(i)), ...early];
    this.weather = this.rng.weighted(SEASON_WEATHER[this.season]);
    for (const e of this.enemies) this.chooseIntent(e, 1);
    this.ui.sync();
    await this.fire('combatStart');
    for (const e of this.enemies) if (e.def.start) await e.def.start(this.enemyCtx(e));
    await this.startPlayerTurn();
    return this.done;
  }

  // ---------- turn flow ----------
  async startPlayerTurn() {
    if (this.over) return;
    this.turn++;
    this.cardsPlayedThisTurn = 0;
    if (this.turn > 1) {
      this.weather = this.rng.weighted(SEASON_WEATHER[this.season]);
      await this.ui.fx('weather', { weather: this.weather });
    }
    this.player.status.bark = 0;
    await this.tickWilt(this.player);
    if (this.over) return;
    await this.ui.fx('turnStart', { turn: this.turn });
    const g = WEATHER[this.weather].growth;
    if (g > 0 && this.plots.some(Boolean)) await this.grow(g, 'all', true);
    if (this.over) return;
    this.player.stamina = 3 + (this.turn === 1 ? this.mods.startStamina : 0);
    await this.draw(5 + this.mods.drawBonus);
    await this.fire('turnStart');
    this.phase = 'player';
    this.ui.sync();
  }

  async endPlayerTurn() {
    if (this.phase !== 'player' || this.over) return;
    this.phase = 'enemy';
    this.ui.sync();
    await this.fire('turnEnd');
    for (const inst of [...this.hand]) {
      const d = cardDef(inst);
      if (d?.onEndTurnInHand) await this.call(d.onEndTurnInHand, this.makeCtx({ card: inst, u: inst.u }));
      if (this.over) return;
    }
    const kept = [];
    for (const inst of this.hand) {
      const kw = cardKeywords(inst);
      if (kw.includes('keep')) kept.push(inst);
      else if (kw.includes('fleeting')) this.exhaustPile.push(inst);
      else this.discardPile.push(inst);
    }
    this.hand = kept;
    this.decay(this.player);
    delete this.player.status.rooted;
    await this.ui.fx('endTurn', {});
    this.ui.sync();

    for (const e of this.enemies) {
      if (!e.alive || this.over) continue;
      e.status.bark = 0;
      await this.tickWilt(e);
      if (!e.alive || this.over) continue;
      const move = e.def.moves[e.moveKey];
      if (move) {
        await this.ui.fx('enemyAct', { enemy: e, move });
        await move.run(this.enemyCtx(e));
        e.history.push(e.moveKey);
      }
      this.decay(e);
      this.ui.sync();
      if (this.checkEnd()) return;
    }
    await this.fireEnemyHook('enemyTurnEnd');
    for (const e of this.alive()) this.chooseIntent(e, this.turn + 1);
    this.ui.sync();
    if (this.checkEnd()) return;
    await this.startPlayerTurn();
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
    let key = e.def.next(ctx, e.history);
    if (!e.def.moves[key]) key = Object.keys(e.def.moves)[0];
    e.moveKey = key;
  }
  intentOf(e) {
    const move = e.def.moves[e.moveKey];
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
    let d = base + (src.status.grit || 0) + (this.weather === 'wind' ? 2 : 0);
    if (src.status.dazed) d = Math.floor(d * 0.75);
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
    await this.ui.fx('hit', { src, target: tgt, amount: lost, blocked });
    if (lost > 0 && tgt.isPlayer) await this.fire('attacked', lost);
    await this.checkDeath(tgt);
    const th = tgt.status.thorns || 0;
    if (th > 0 && src && src.alive && !this.over) await this.loseHp(src, th, 'thorns');
    return lost;
  }
  async loseHp(who, n, why = '') {
    if (this.over || !who.alive || n <= 0) return;
    who.hp -= n;
    await this.ui.fx('loseHp', { target: who, amount: n, why });
    await this.checkDeath(who);
  }
  async heal(who, n) {
    if (!who.alive || n <= 0) return;
    const before = who.hp;
    who.hp = Math.min(who.maxHp, who.hp + n);
    await this.ui.fx('heal', { target: who, amount: who.hp - before });
  }
  async gainBark(who, n) {
    if (n <= 0 || !who.alive) return;
    const total = n + (who.status.sturdy || 0) + (this.weather === 'frost' ? 3 : 0);
    who.status.bark = (who.status.bark || 0) + total;
    await this.ui.fx('bark', { target: who, amount: total });
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
    await this.ui.fx('status', { target: who, id, n });
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
    await this.ui.fx('mend', { enemy: who });
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
    this.ui.sync();
    this._resolve(result);
  }

  // ---------- garden ----------
  freePlots() { return this.plots.filter(p => !p).length; }
  async plant(id, u = false) {
    const idx = this.plots.findIndex(p => !p);
    const def = PLANTS[id];
    if (idx < 0 || !def) return false;
    this.plots[idx] = { uid: uid(), id, def, growth: 0, growTime: def.growTime, u, age: this.turn, perennial: !!def.perennial };
    await this.ui.fx('plant', { idx });
    await this.fire('planted', this.plots[idx]);
    return true;
  }
  plotTargets(which) {
    const filled = this.plots.map((p, i) => (p ? i : -1)).filter(i => i >= 0);
    if (!filled.length) return [];
    if (which === 'all') return filled;
    if (which === 'random') return [filled[Math.floor(this.rng() * filled.length)]];
    if (which === 'oldest') return [filled.reduce((a, b) => (this.plots[b].age < this.plots[a].age ? b : a))];
    if (typeof which === 'number') return this.plots[which] ? [which] : [];
    return filled;
  }
  async grow(n, which = 'all', fromWeather = false) {
    const idxs = this.plotTargets(which);
    if (!idxs.length || n <= 0) return;
    for (const i of idxs) this.plots[i].growth = Math.min(this.plots[i].growTime, this.plots[i].growth + n);
    await this.ui.fx('grow', { idxs, n, fromWeather });
    for (const i of idxs) {
      const p = this.plots[i];
      if (p && p.growth >= p.growTime && !this.over) await this.bloom(i);
    }
  }
  async bloom(i) {
    const p = this.plots[i];
    if (!p || p.blooming) return;
    p.blooming = true;
    await this.ui.fx('bloom', { idx: i, plant: p });
    await this.call(p.def.bloom, this.makeCtx({ u: p.u, plant: p }));
    this.run.stats.blooms++;
    p.blooming = false;
    if (p.perennial) p.growth = 0;
    else if (this.plots[i] === p) this.plots[i] = null;
    this.ui.sync();
    await this.fire('bloom', p);
    this.checkEnd();
  }
  async harvest(which = 'oldest') {
    for (const i of this.plotTargets(which)) if (!this.over) await this.bloom(i);
  }
  async trample(n = 1) {
    for (let k = 0; k < n; k++) {
      const filled = this.plots.map((p, i) => (p ? i : -1)).filter(i => i >= 0);
      if (!filled.length) return;
      const i = filled.reduce((a, b) => (this.plots[b].growth > this.plots[a].growth ? b : a));
      await this.ui.fx('trample', { idx: i });
      this.plots[i] = null;
      this.ui.sync();
    }
  }
  async nibble(n = 1) {
    const idxs = this.plotTargets('all');
    if (!idxs.length) return;
    for (const i of idxs) this.plots[i].growth = Math.max(0, this.plots[i].growth - n);
    await this.ui.fx('nibble', { idxs });
  }
  async setWeather(w) {
    if (!WEATHER[w]) return;
    this.weather = w;
    await this.ui.fx('weather', { weather: w });
  }

  // ---------- cards ----------
  cost(inst) { const b = baseCost(inst); return b == null ? null : Math.max(0, b + (inst.costMod || 0)); }
  canPlay(inst) {
    if (this.phase !== 'player' || this.over) return false;
    const d = cardDef(inst);
    if (!d || d.cost == null || cardKeywords(inst).includes('unplayable')) return false;
    if (this.cost(inst) > this.player.stamina) return false;
    if (d.type === 'seed' && !this.freePlots()) return false;
    if (d.canPlay && !d.canPlay(this.makeCtx({ card: inst, u: inst.u }))) return false;
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
      if (this.hand.length >= 10) break;
      if (!this.drawPile.length) {
        if (!this.discardPile.length) break;
        this.drawPile = this.rng.shuffle(this.discardPile);
        this.discardPile = [];
        await this.ui.fx('shuffle', {});
      }
      const inst = this.drawPile.pop();
      this.hand.push(inst);
      drew++;
      const d = cardDef(inst);
      if (d?.onDraw) await this.call(d.onDraw, this.makeCtx({ card: inst, u: inst.u }));
    }
    if (drew) await this.ui.fx('draw', { n: drew });
  }
  async addCard(id, where = 'hand', u = false) {
    if (!CARDS[id]) return;
    const inst = { id, u, uid: uid(), temp: true };
    if (where === 'hand' && this.hand.length < 10) this.hand.push(inst);
    else if (where === 'draw') this.drawPile.splice(Math.floor(this.rng() * (this.drawPile.length + 1)), 0, inst);
    else this.discardPile.push(inst);
    await this.ui.fx('addCard', { inst, where });
  }
  async discardRandom(n) {
    for (let k = 0; k < n && this.hand.length; k++) {
      const i = Math.floor(this.rng() * this.hand.length);
      this.discardPile.push(...this.hand.splice(i, 1));
    }
    this.ui.sync();
  }
  async exhaustRandom(n) {
    for (let k = 0; k < n && this.hand.length; k++) {
      const i = Math.floor(this.rng() * this.hand.length);
      this.exhaustPile.push(...this.hand.splice(i, 1));
    }
    await this.ui.fx('compost', {});
  }
  async playCard(inst, target) {
    if (!this.canPlay(inst)) return false;
    const d = cardDef(inst);
    if (d.target === 'enemy' && (!target || !target.alive)) target = this.alive()[0];
    this.player.stamina -= this.cost(inst);
    const hi = this.hand.indexOf(inst);
    if (hi >= 0) this.hand.splice(hi, 1);
    this.phase = 'resolving';
    await this.ui.fx('play', { inst, target });
    try {
      if (d.play) await this.call(d.play, this.makeCtx({ card: inst, u: inst.u, target: d.target === 'enemy' ? target : null }));
    } catch (err) { console.error('card error', inst.id, err); }
    this.cardsPlayedThisTurn++;
    this.run.stats.cardsPlayed++;
    const kw = cardKeywords(inst);
    if (d.type === 'charm') { /* powers leave the deck for this fight */ }
    else if (kw.includes('compost')) this.exhaustPile.push(inst);
    else this.discardPile.push(inst);
    await this.fire('cardPlayed', inst);
    if (!this.over) this.phase = 'player';
    this.ui.sync();
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
    await this.ui.fx('preserve', { id });
    try { await this.call(def.use, this.makeCtx({ target: target || this.alive()[0] })); } catch (err) { console.error('preserve error', id, err); }
    if (!this.over) this.phase = 'player';
    this.ui.sync();
    this.checkEnd();
  }

  // ---------- hooks ----------
  async fire(name, ...args) {
    if (this.over && name !== 'enemyMended') return;
    for (const k of this.run.keepsakes) {
      const h = KEEPSAKES[k]?.hooks?.[name];
      if (h) {
        try { await this.call(h, this.makeCtx({ keepsake: k }), ...args); } catch (err) { console.error('keepsake', k, name, err); }
        this.ui.fx('keepsake', { id: k });
      }
    }
    for (const [pid, n] of Object.entries(this.player.powers)) {
      const h = POWERS[pid]?.hooks?.[name];
      if (h) try { await this.call(h, this.makeCtx({ power: pid }), n, ...args); } catch (err) { console.error('power', pid, name, err); }
    }
    await this.fireEnemyHook(name, ...args);
  }
  async fireEnemyHook(name, ...args) {
    for (const e of this.alive()) {
      for (const [pid, n] of Object.entries(e.powers)) {
        const h = POWERS[pid]?.hooks?.[name];
        if (h) try { await this.call(h, this.makeCtx({ self: e }), n, ...args); } catch (err) { console.error('enemy power', pid, name, err); }
      }
    }
  }

  // Run a content function, then wait for any ctx actions it fired without awaiting.
  async call(fn, ctx, ...args) {
    await fn.call(null, ctx, ...args);
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
    const ctx = {
      u: !!extra.u, target: extra.target || null, card: extra.card || null, plant: extra.plant || null, self: extra.self || null,
      get player() { return c.player; },
      get enemies() { return c.alive(); },
      get weather() { return c.weather; },
      get season() { return c.season; },
      get turn() { return c.turn; },
      get plants() { return c.plots; },
      get hand() { return c.hand; },
      get drawPile() { return c.drawPile; },
      get discardPile() { return c.discardPile; },
      get cardsPlayedThisTurn() { return c.cardsPlayedThisTurn; },
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
        await c.ui.fx('stamina', { n });
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
      coin: async n => { c.run.coin += n; await c.ui.fx('coin', { n }); },
      setWeather: w => c.setWeather(w),
      addPower: (id, n) => c.applyTo(c.player, id, n),
      enemyPower: (e, id, n) => c.applyTo(e, id, n),
      rand: () => c.rng(),
      log: text => c.ui.fx('log', { text }),
    };
    // Serialize async actions so un-awaited calls in content still resolve in order.
    let q = Promise.resolve();
    for (const k of ['attack', 'attackAll', 'attackRandom', 'bark', 'draw', 'gainStamina', 'heal', 'loseHp', 'apply', 'plant', 'grow', 'harvest', 'addCard', 'discardRandom', 'exhaustRandom', 'coin', 'setWeather', 'addPower', 'enemyPower', 'log']) {
      const fn = ctx[k];
      ctx[k] = (...a) => { const p = q.then(() => fn(...a)); q = p.catch(err => console.error('ctx.' + k, err)); return p; };
    }
    ctx._drain = async () => { let prev; do { prev = q; await q; } while (prev !== q); };
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
      addGloom: async (id = 'gloom', n = 1, where = 'discard') => { for (let k = 0; k < n; k++) await c.addCard(id, where); await c.ui.fx('gloom', { enemy: self, n }); },
      summon: async id => {
        if (c.alive().length >= 5 || !ENEMIES[id]) return;
        const en = c.makeEnemy(id);
        c.enemies.push(en);
        c.chooseIntent(en, c.turn + 1);
        await c.ui.fx('summon', { enemy: en });
      },
      setWeather: w => c.setWeather(w),
      say: text => c.ui.fx('say', { enemy: self, text }),
      addPower: (id, n) => c.applyTo(self, id, n),
    };
    return e;
  }
}
