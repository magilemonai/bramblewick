// Combat screen: renders a Combat, animates its fx events, and implements the engine UI interface
// (fx, sync, choose, pickCards, checkpoint). DESIGN.md "2.0 contract" is the source of truth.
import { POWERS } from '../data/cards.js';
import { PLANTS } from '../data/plants.js';
import { PRESERVES } from '../data/preserves.js';
import { hasSprite } from '../pixel.js';
import { h, img, sleep, floatText, banner, centerOf, setTip, showTip, hideTip, toast, getSettings, applySettings, buzz, isDesktop, isLandscapePhone } from './dom.js';
import { renderCard, cardTip, plantTip, cardName, inspectCard, attachInspect } from './cardview.js';
import { STATUS_INFO, WEATHER, cardDef } from '../engine/combat.js';
import { SpriteAnim, setIdlePaused } from './frames.js';
import { Tutorial, Tips } from './tutorial.js';

const INTENT_TIP = {
  attack: 'Intends to attack', block: 'Intends to put up Bark', buff: 'Intends to grow stronger', debuff: 'Intends to hinder you',
  trample: 'Intends to trample your garden!', summon: 'Intends to call for friends', mystery: 'Something mysterious...', heal: 'Intends to heal',
  weed: 'Intends to plant Gloamweed in your plots', steal: 'Intends to pinch your coin',
};
// Fallbacks so 2.0 statuses read correctly even before the engine's STATUS_INFO has them.
const EXTRA_STATUS = {
  bees: { name: 'Bees', icon: 'st_bees', desc: n => `At the end of your turn, each Bee stings a random critter for 1 (ignores Bark). ${n} Bee${n === 1 ? '' : 's'}.` },
  guard: { name: 'Guard', icon: 'st_guard', desc: n => `A trample knocks down 1 Guard instead of the plant. ${n} left.` },
};
const statusInfo = id => STATUS_INFO[id] || EXTRA_STATUS[id];
const statusIcon = (id, info) => (hasSprite(info.icon) ? info.icon : id === 'bees' && hasSprite('icon_bee') ? 'icon_bee' : 'st_power');
const BAD = ['dazed', 'soggy', 'wilt', 'rooted'];

// Plots are plant-or-null in 1.0; tolerate a { plant, guard } shape too.
const plotPlant = p => (p && p.plant && p.growTime == null ? p.plant : p) || null;
const plotGuard = p => (p ? (p.guard ?? p.plant?.guard ?? 0) : 0) || 0;
const isWeed = p => !!(p && (p.id === 'gloamweed' || p.weed || p.def?.weed || p.def?.hostile));

export class CombatView {
  constructor(game, combat, { hud, tutorial } = {}) {
    this.game = game;
    this.c = combat;
    this.hud = hud;
    this.units = new Map();
    this.cardEls = new Map();
    this.selected = null;
    this.pendingJar = null;
    this.hover = null;
    this.phaseBoost = 0;
    this.lockShown = null;
    this.mood = '';
    combat.ui = this;
    this.build();
    this.tips = new Tips(game, this);
    this.tutorial = tutorial ? new Tutorial(game, this, tutorial) : null;
    this.onKey = e => this.key(e);
    addEventListener('keydown', this.onKey);
    this.applySettings();
  }

  get audio() { return this.game.audio || {}; }
  get scenery() { return this.game.scenery; }
  get set() { return getSettings(this.game); }
  get spd() { return Math.max(1, +this.set.speed || 1); }
  wait(ms) { return sleep(ms / this.spd); }
  shake(n) { if (!this.set.reducedMotion) this.scenery?.shake(n); }
  sfx(name, opts) { this.audio.sfx?.(name, opts); }

  applySettings() {
    const s = this.set;
    applySettings(s);
    setIdlePaused(!!s.reducedMotion);
    const q = s.reducedMotion ? 'low' : 'high';
    if (this._quality !== q) { this._quality = q; this.scenery?.setQuality?.(q); }
  }

  build() {
    this.stageEl = h('div.stage', { onclick: e => { if (e.target === this.stageEl || e.target === this.enemiesEl) this.deselect(); } });
    this.enemiesEl = h('div.enemies');
    this.playerBox = h('div.farmer-box');
    this.stageEl.append(this.playerBox, this.enemiesEl);
    this.units.set('player', this.makeUnit(this.c.player, true));
    this.playerBox.append(this.units.get('player').root);

    this.lockEl = h('i.wlock', hasSprite('ui_lock') ? img('ui_lock', 2) : '🔒');
    this.weatherEl = h('div.weather', img('w_sun', 3), h('span', 'Sunny'), this.lockEl);
    setTip(this.weatherEl, () => {
      const w = WEATHER[this.c.weather];
      return `<b>${w.name}</b>${w.desc}${this.locked() ? '<br><i>Locked: the next weather roll is skipped.</i>' : ''}`;
    });
    this.plotEls = [];
    this.plotsEl = h('div.plots');
    this.ensurePlots();
    this.garden = h('div.garden-row', this.weatherEl, this.plotsEl);

    this.staminaEl = h('div.stamina', img('ui_stamina', 4), h('b', '3/3'));
    setTip(this.staminaEl, '<b>Stamina</b>Spend it to play cards. Refills each turn.');
    const pile = (icon, name, fn) => {
      const b = h('button.pile', { onclick: fn }, img(icon, 2), h('span', '0'));
      setTip(b, `<b>${name}</b>Tap to look.`);
      return b;
    };
    this.drawEl = pile('ui_deck', 'Draw pile', () => this.game.showPile('Draw pile (random order)', this.c.drawPile, true));
    this.discardEl = pile('ui_discard', 'Discard pile', () => this.game.showPile('Discard pile', this.c.discardPile));
    this.compostEl = pile('ui_compost', 'Compost', () => this.game.showPile('Composted this fight', this.c.exhaustPile));
    this.endBtn = h('button.btn.green.endturn', { onclick: () => this.endTurn() }, 'End Turn');
    this.controls = h('div.controls', h('div.ctl-left', this.staminaEl, h('div.piles', this.drawEl, this.discardEl, this.compostEl)), this.endBtn);

    this.hintEl = h('div.hand-hint');
    this.handEl = h('div.hand', this.hintEl);
    this.root = h('div.screen.combat', this.hud.el, this.stageEl, this.garden, this.controls, this.handEl);

    this.onResize = () => { this._fitKey = ''; this.sync(); };
    addEventListener('resize', this.onResize);
    this.hud.onJar = slot => this.jarMenu(slot);
  }
  destroy() {
    removeEventListener('resize', this.onResize);
    removeEventListener('keydown', this.onKey);
    hideTip();
    for (const u of this.units.values()) u.anim?.destroy();
    this.tutorial?.destroy();
    this.tips?.destroy();
    this.scenery?.setDanger?.(0);
    this.audio.intensity?.(0);
    document.documentElement.classList.remove('hitstop');
    document.querySelectorAll('.modal.inspect, .modal.choose, .modal.pick').forEach(m => m.remove());
    this.closeModal = null;
  }

  // ---------- units ----------
  playerSprite() {
    const p = this.c.player;
    if (p.sprite && hasSprite(p.sprite)) return p.sprite;
    const ch = this.game.run?.character || this.game.run?.char;
    if (ch && ch !== 'farmer' && hasSprite('pc_' + ch)) return 'pc_' + ch;
    return 'farmer';
  }
  makeUnit(who, isPlayer) {
    const spriteId = isPlayer ? this.playerSprite() : who.sprite;
    const sprImg = img(spriteId, 1);
    const w = +sprImg.dataset.w || 32;
    const root = h(`div.unit.${isPlayer ? 'player' : 'enemy'}${who.tier === 'boss' ? '.boss' : ''}${who.tier === 'elite' ? '.elite' : ''}`);
    root.style.setProperty('--sw', w);
    const intent = h('div.intent');
    const sprite = h('div.sprite', h('div.shadow'), sprImg);
    const fill = h('div.fill'), ghost = h('div.ghost'), txt = h('span');
    const hpbar = h('div.hpbar' + (isPlayer ? '' : '.gloam'), ghost, fill, txt);
    const barkbadge = h('div.barkbadge', img('ui_bark', 2), h('span'));
    const bars = h('div.bars', hpbar, barkbadge);
    const statuses = h('div.statuses');
    root.append(isPlayer ? h('div.intent-pad') : intent, sprite, bars, statuses);
    if (!isPlayer) {
      sprite.addEventListener('click', e => { e.stopPropagation(); this.enemyTapped(who); });
      sprite.addEventListener('pointerenter', () => { if (this.dragging) return; this.hover = who; this.markAim(); });
      setTip(sprite, () => this.enemyTip(who));
      setTip(intent, () => this.intentTip(who));
    } else {
      setTip(sprite, spriteId === 'farmer' ? '<b>You</b>Nana Wren\'s grandkid. Tired, stubborn, fond of turnips.' : `<b>${esc(this.c.player.name && this.c.player.name !== 'You' ? this.c.player.name : 'You')}</b>`);
    }
    const anim = new SpriteAnim(sprImg, spriteId);
    return { root, sprite, img: sprImg, fill, ghost, txt, hpbar, barkbadge, statuses, intent, who, anim };
  }
  enemyTip(e) {
    const box = h('div', h('b', e.name));
    if (e.def.flavor) box.append(h('div', { style: { fontStyle: 'italic', color: '#8a5a3b' } }, e.def.flavor));
    if (e.phase > 1) box.append(h('div', { style: { color: '#b8522e', fontWeight: 700 } }, `Phase ${e.phase}`));
    for (const [pid, n] of Object.entries(e.powers)) {
      const p = POWERS[pid];
      if (p) box.append(h('div', { style: { marginTop: '3px' } }, h('span', { style: { fontWeight: 700 } }, p.name + ': '), safe(() => p.desc(n))));
    }
    return box;
  }
  intentTip(e) {
    const it = this.c.intentOf(e);
    if (!it) return '';
    if (it.hidden) return '<b>Hidden</b>The fog hides what this critter is planning.';
    let t = `<b>${esc(it.label)}</b>${INTENT_TIP[it.type] || ''}`;
    if (it.dmg != null) t += ` for ${it.dmg}${it.times > 1 ? ` x${it.times}` : ''} damage`;
    if (it.alt) t += `, and ${(INTENT_TIP[it.alt] || '').toLowerCase().replace('intends to ', '')}`;
    return t + '.';
  }
  updateUnit(u) {
    const who = u.who;
    const pct = Math.max(0, who.hp / who.maxHp);
    u.fill.style.transform = `scaleX(${pct})`;
    u.ghost.style.transform = `scaleX(${pct})`;
    u.txt.textContent = `${Math.max(0, who.hp)}/${who.maxHp}`;
    const bark = who.status.bark || 0;
    u.barkbadge.style.display = bark ? '' : 'none';
    u.barkbadge.querySelector('span').textContent = bark;
    u.hpbar.classList.toggle('barked', bark > 0);
    // statuses + powers (rebuilt only when they change, so hover tips don't flicker)
    const sig = JSON.stringify([who.status, who.powers]);
    if (u.stSig !== sig) {
      u.stSig = sig;
      u.statuses.innerHTML = '';
      for (const [id, n] of Object.entries(who.status)) {
        if (id === 'bark' || !n) continue;
        const info = statusInfo(id);
        if (!info) continue;
        const st = h('div.st.st-' + id, img(statusIcon(id, info), 2), id === 'rooted' ? null : h('b', n));
        setTip(st, `<b>${info.name}</b>${info.desc(n)}`);
        u.statuses.append(st);
      }
      for (const [pid, n] of Object.entries(who.powers)) {
        const p = POWERS[pid];
        if (!p) continue;
        const st = h('div.st', img(p.icon && hasSprite(p.icon) ? p.icon : 'st_power', 2), typeof n === 'number' && n !== 1 ? h('b', n) : null);
        setTip(st, () => `<b>${esc(p.name)}</b>${esc(safe(() => p.desc(n)))}`);
        u.statuses.append(st);
      }
    }
    if (who.isPlayer) return;
    // intent
    const it = who.alive && this.c.phase !== 'over' ? this.c.intentOf(who) : null;
    const isig = it ? JSON.stringify([it.hidden, it.type, it.alt, it.dmg, it.times]) : '';
    if (u.itSig !== isig) {
      u.itSig = isig;
      u.intent.innerHTML = '';
      u.intent.className = 'intent';
      if (it?.hidden) { u.intent.classList.add('hidden-intent'); u.intent.append(img('intent_mystery', 2), '?'); }
      else if (it) {
        u.intent.classList.add(it.type);
        if (it.alt) u.intent.classList.add('alt-' + it.alt);
        u.intent.append(img('intent_' + (hasSprite('intent_' + it.type) ? it.type : 'mystery'), 2));
        if (it.dmg != null) u.intent.append(h('span.inum', it.times > 1 ? `${it.dmg}x${it.times}` : String(it.dmg)));
        if (it.alt && hasSprite('intent_' + it.alt)) u.intent.append(img('intent_' + it.alt, 2));
      }
    }
    u.root.classList.toggle('targetable', this.needsTarget() && who.alive);
    u.root.classList.toggle('phased', (who.phase || 0) > 1);
  }

  // Pick integer-ish sprite scales that fit the stage for the current enemy line-up.
  fitSprites() {
    const alive = this.c.enemies.filter(e => e.alive || this.units.get(e.uid)?.root.style.visibility !== 'hidden');
    const desk = isDesktop();
    const stageW = this.stageEl.clientWidth || innerWidth, stageH = this.stageEl.clientHeight || innerHeight * 0.4;
    const widths = alive.map(e => +(this.units.get(e.uid)?.img.dataset.w || 32));
    const total = widths.reduce((a, b) => a + b, 0) || 32;
    const tallest = Math.max(32, ...widths);
    const room = stageW * (desk ? 0.62 : 0.72) - alive.length * 6;
    let sc = Math.min(room / total, (stageH - 90) / tallest, desk ? 5 : 3.6);
    sc = Math.max(1.5, Math.floor(sc * 4) / 4);
    const psc = Math.max(2, Math.min(desk ? 4.5 : 3.2, (stageH - 90) / 32, stageW * 0.24 / 32));
    this.stageEl.style.setProperty('--esc', sc);
    this.stageEl.style.setProperty('--psc', Math.floor(psc * 4) / 4);
  }

  // ---------- sync ----------
  ensurePlots() {
    const n = Math.max(3, this.c.plots.length);
    while (this.plotEls.length < n) {
      const i = this.plotEls.length;
      const guard = h('div.guard', hasSprite('ov_scarecrow') ? img('ov_scarecrow', 3) : hasSprite('icon_scarecrow') ? img('icon_scarecrow', 2) : null, h('b'));
      const el = h('div.plot.empty', guard);
      setTip(el, () => this.plotTip(i));
      if (this.plotEls.length >= 3) el.classList.add('extra');
      this.plotEls.push(el);
      this.plotsEl.append(el);
    }
    this.plotsEl.classList.toggle('four', n >= 4);
  }
  plotTip(i) {
    const raw = this.c.plots[i], p = plotPlant(raw), g = plotGuard(raw);
    const gt = g ? `<div style="margin-top:3px"><b style="display:inline">Guard ${g}:</b> a trample knocks down a scarecrow instead of the plant.</div>` : '';
    if (!p) return '<b>Empty plot</b>Play a Seed card to plant here.' + gt;
    const box = plantTip(p);
    if (isWeed(p)) box.prepend(h('div', { style: { color: '#b8522e', fontWeight: 700 } }, 'Hostile! Uproot it before it blooms.'));
    if (g) box.append(h('div', { html: gt }));
    return box;
  }
  locked() {
    const c = this.c;
    return 'weatherLock' in c ? !!c.weatherLock : !!this.lockShown;
  }
  sync() {
    const c = this.c;
    this.applySettings();
    for (const e of c.enemies) {
      if (!this.units.has(e.uid)) {
        const u = this.makeUnit(e, false);
        this.units.set(e.uid, u);
        this.enemiesEl.append(u.root);
        u.root.style.animation = 'rise .5s ease both';
      }
    }
    for (const u of this.units.values()) this.updateUnit(u);
    const key = c.enemies.map(e => e.uid).join() + innerWidth + 'x' + innerHeight;
    if (this._fitKey !== key) { this._fitKey = key; this.fitSprites(); }
    // garden
    this.ensurePlots();
    const g = WEATHER[c.weather]?.growth ?? 1;
    this.plotEls.forEach((el, i) => {
      const raw = c.plots[i];
      const p = plotPlant(raw);
      const guard = plotGuard(raw);
      el.hidden = i >= c.plots.length;
      el.classList.toggle('empty', !p);
      el.classList.toggle('weed', isWeed(p));
      el.classList.toggle('guarded', guard > 0);
      el.querySelector('.guard b').textContent = guard > 1 ? guard : '';
      const ready = !!p && p.growth + g >= p.growTime && c.phase === 'player';
      el.classList.toggle('ready', ready && !isWeed(p));
      el.classList.toggle('threat', ready && isWeed(p));
      let plantImg = el.querySelector('img.plant');
      let pips = el.querySelector('.pips');
      if (!p) { plantImg?.remove(); pips?.remove(); el.dataset.key = ''; return; }
      const stage = p.growth <= 0 ? 0 : p.growth >= p.growTime ? 3 : p.growth / p.growTime < 0.5 ? 1 : 2;
      const k = `${p.uid}:${stage}`;
      if (el.dataset.key !== k) {
        plantImg?.remove();
        const sid = `plant_${p.id}_${stage}`;
        plantImg = img(hasSprite(sid) ? sid : isWeed(p) ? `plant_thornvine_${stage}` : sid, 4, 'plant');
        el.prepend(plantImg);
        el.dataset.key = k;
      }
      if (!pips) { pips = h('div.pips'); el.append(pips); }
      const psig = p.growth + '/' + p.growTime;
      if (pips.dataset.s !== psig) {
        pips.dataset.s = psig;
        pips.innerHTML = '';
        for (let n = 0; n < p.growTime; n++) pips.append(h('i' + (n < p.growth ? '.on' : '')));
      }
    });
    // weather
    const w = WEATHER[c.weather];
    if (w && this.weatherEl.dataset.w !== c.weather) {
      this.weatherEl.dataset.w = c.weather;
      this.weatherEl.firstChild.replaceWith(img(w.icon, 3));
      this.weatherEl.children[1].textContent = w.name;
    }
    this.weatherEl.classList.toggle('locked', this.locked());
    // controls
    const maxSt = c.player.maxStamina || 3;
    this.staminaEl.querySelector('b').textContent = `${c.player.stamina}/${maxSt}`;
    this.staminaEl.classList.toggle('empty', c.player.stamina <= 0);
    this.drawEl.lastChild.textContent = c.drawPile.length;
    this.discardEl.lastChild.textContent = c.discardPile.length;
    this.compostEl.lastChild.textContent = c.exhaustPile.length;
    this.compostEl.style.display = c.exhaustPile.length ? '' : 'none';
    const myTurn = c.phase === 'player';
    this.endBtn.disabled = !myTurn;
    this.endBtn.classList.toggle('nudge', myTurn && !c.hand.some(i => c.canPlay(i)));
    this.hud.update();
    this.layoutHand();
    this.updateMood();
    if (myTurn && this._turnSeen !== c.turn) { this._turnSeen = c.turn; this.onPlayerTurn(); }
    if (myTurn) this.checkTips();
  }

  // Low heart -> danger vignette + music intensity; boss phases push intensity up.
  updateMood() {
    const c = this.c, p = c.player;
    const pct = Math.max(0, p.hp / p.maxHp);
    const danger = c.over ? 0 : pct < 0.5 ? Math.min(1, (0.5 - pct) / 0.38) : 0;
    const base = c.kind === 'boss' ? 0.45 : c.kind === 'elite' ? 0.3 : 0.12;
    const inten = c.over ? 0 : Math.min(1, Math.max(base, this.phaseBoost, base + danger * (1 - base)));
    const sig = danger.toFixed(2) + '|' + inten.toFixed(2);
    if (sig === this.mood) return;
    this.mood = sig;
    this.scenery?.setDanger?.(danger);
    this.audio.intensity?.(inten);
    this.root.classList.toggle('danger', danger > 0.4);
  }

  onPlayerTurn() {
    const c = this.c;
    if (c.turn === 1) {
      this.tutorial?.trigger('start');
      if (c.kind === 'elite' || c.enemies.some(e => e.tier === 'elite')) this.tips.want('firstElite', () => this.firstEnemyEl('elite'));
      if (c.kind === 'boss' || c.enemies.some(e => e.tier === 'boss')) this.tips.want('firstBoss', () => this.firstEnemyEl('boss'));
    }
    if (c.turn === 1) this.tutorial?.trigger('turn:1');
    if (['fog', 'drought', 'frost', 'wind'].includes(c.weather)) this.tips.want(c.weather, this.weatherEl);
  }
  firstEnemyEl(tier) {
    const e = this.c.alive().find(x => x.tier === tier) || this.c.alive()[0];
    return this.units.get(e?.uid)?.sprite;
  }
  checkTips() {
    const c = this.c;
    for (const e of c.alive()) {
      const it = c.intentOf(e);
      if (!it || it.hidden) continue;
      const u = this.units.get(e.uid);
      if (it.type === 'trample' || it.alt === 'trample') this.tips.want('trampleIntent', u?.intent);
      if (it.type === 'weed' || it.alt === 'weed') this.tips.want('weedIntent', u?.intent);
      if (it.type === 'steal' || it.alt === 'steal') this.tips.want('stealIntent', u?.intent);
    }
    for (const kw of ['keep', 'compost']) {
      const inst = c.hand.find(i => (cardDef(i)?.keywords || []).includes(kw));
      if (inst) this.tips.want(kw, () => this.cardEls.get(inst.uid));
    }
    for (const u of this.units.values()) if (u.who.alive && u.who.status.wilt > 0) { this.tips.want('wilt', u.statuses); break; }
    const pi = c.plots.findIndex(p => plotPlant(p)?.perennial && !isWeed(plotPlant(p)));
    if (pi >= 0) this.tips.want('perennial', this.plotEls[pi]);
    if (c.player.status.honey > 0 || c.player.powers?.honey > 0) this.tips.want('honey', this.units.get('player').statuses);
    const gloom = c.hand.find(i => cardDef(i)?.type === 'gloom');
    if (gloom) this.tips.want('gloomCard', () => this.cardEls.get(gloom.uid));
    if (c.plots.length && c.plots.every(p => plotPlant(p)) && c.hand.some(i => cardDef(i)?.type === 'seed')) this.tips.want('fullPlots', this.plotsEl);
    if (c.player.status.bees > 0) this.tips.want('bees', () => this.units.get('player').statuses.querySelector('.st-bees') || this.units.get('player').sprite);
  }

  // ---------- hand ----------
  layoutHand() {
    const c = this.c;
    const hand = c.hand;
    for (const [id, el] of this.cardEls) if (!hand.some(i => i.uid === id) && !el.classList.contains('leaving')) { el.remove(); this.cardEls.delete(id); }
    if (this.selected && !hand.includes(this.selected)) this.selected = null;
    const W = this.handEl.clientWidth || innerWidth;
    const n = hand.length;
    const probe = [...this.cardEls.values()].find(e => !e.classList.contains('leaving'));
    const cw = probe?.offsetWidth || Math.min(100, innerWidth * 0.255);
    const ch = probe?.offsetHeight || cw * 1.42;
    const desktop = isDesktop(), land = isLandscapePhone();
    const spacing = n > 1 ? Math.min(cw * 0.95, (Math.min(W, 1000) - cw - 12) / (n - 1)) : 0;
    const mid = (n - 1) / 2;
    const step = Math.min(4, 22 / Math.max(1, n));
    const fresh = [];
    hand.forEach((inst, i) => {
      let el = this.cardEls.get(inst.uid);
      if (el && el.dataset.u !== String(!!inst.u)) {   // upgraded mid-fight: re-render in place
        const nu = renderCard(inst, { cost: c.cost(inst) });
        nu.dataset.u = String(!!inst.u);
        nu.style.transform = el.style.transform;
        this.bindCard(nu, inst);
        el.replaceWith(nu);
        this.cardEls.set(inst.uid, nu);
        el = nu;
        el.classList.add('upflash');
        setTimeout(() => el.classList.remove('upflash'), 900);
      }
      if (!el) {
        el = renderCard(inst, { cost: c.cost(inst) });
        el.dataset.u = String(!!inst.u);
        this.bindCard(el, inst);
        this.cardEls.set(inst.uid, el);
        this.handEl.append(el);
        fresh.push(el);
      } else {
        const costEl = el.querySelector('.cost b');
        if (costEl) costEl.textContent = c.cost(inst);
      }
      el.dataset.key = i < 9 ? i + 1 : '';
      const off = i - mid;
      let x = off * spacing, y = Math.abs(off) ** 2 * 1.6, r = off * step, s = 1;
      if (inst === this.selected) {
        y = -ch * (desktop ? 0.42 : land ? 0.3 : 0.62); r = 0; s = desktop ? 1.32 : land ? 1.25 : 1.55;
        x = Math.max(-W / 2 + cw * s / 2 + 4, Math.min(W / 2 - cw * s / 2 - 4, x));
      } else if (inst === this.hoverCard && desktop) { y = -ch * 0.28; r = 0; s = 1.18; }
      const tf = `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`;
      if (!el.classList.contains('dragging')) el.style.transform = tf;
      el.style.zIndex = inst === this.selected ? 30 : inst === this.hoverCard ? 25 : 10 + i;
      el.classList.toggle('unplayable', !c.canPlay(inst) && c.phase === 'player');
      el.classList.toggle('selected', inst === this.selected);
      el._base = { x, y, tf };
    });
    // new cards arc in from the draw pile, a beat apart
    if (fresh.length) {
      const dr = this.drawEl.getBoundingClientRect(), hr = this.handEl.getBoundingClientRect();
      const sx = dr.left + dr.width / 2 - (hr.left + hr.width / 2), sy = dr.top - hr.bottom + ch * 0.5;
      fresh.forEach((el, k) => {
        if (this.set.reducedMotion || !el.animate) return;
        const { x, y, tf } = el._base;
        el.style.transition = 'none';
        const a = el.animate([
          { transform: `translate(${sx}px, ${sy}px) rotate(-40deg) scale(.3)`, opacity: 0.4 },
          { transform: `translate(${(sx + x) / 2}px, ${Math.min(sy, y) - ch * 0.55}px) rotate(-12deg) scale(.8)`, opacity: 1, offset: 0.55 },
          { transform: tf, opacity: 1 },
        ], { duration: 420 / this.spd, delay: (k * 70) / this.spd, easing: 'cubic-bezier(.3,.6,.35,1)', fill: 'backwards' });
        a.onfinish = a.oncancel = () => { el.style.transition = ''; };
      });
    }
    this.updateHint();
  }
  updateHint() {
    let t = '';
    if (this.pendingJar != null) t = 'Tap a critter for the jar';
    else if (this.selected) {
      const d = cardDef(this.selected);
      t = d.target === 'enemy' && this.c.alive().length > 1 ? 'Tap a critter (or drag onto one)' : 'Tap again or drag up to play';
    }
    this.hintEl.textContent = t;
    for (const u of this.units.values()) if (!u.who.isPlayer) u.root.classList.toggle('targetable', this.needsTarget() && u.who.alive);
  }
  needsTarget() {
    if (this.pendingJar != null) return true;
    return !!this.selected && cardDef(this.selected)?.target === 'enemy';
  }
  select(inst) {
    this.selected = inst;
    this.hoverCard = null;
    this.sfx('hover');
    this.layoutHand();
    const el = this.cardEls.get(inst?.uid);
    hideTip();
    if (el && inst) {
      const tip = cardTip(inst);
      if (tip.childNodes.length > 1) { setTip(el, tip); setTimeout(() => { if (this.selected === inst && !document.querySelector('.modal')) showTip(el, { x: innerWidth / 2, y: this.hud.el.getBoundingClientRect().bottom + 6 }); }, 200); }
    }
    this.markAim();
  }
  deselect() { if (this.selected || this.pendingJar != null) { this.selected = null; this.pendingJar = null; hideTip(); this.layoutHand(); this.markAim(); } }

  inspect(inst) {
    if (document.querySelector('.modal.inspect')) return;
    this.dragging = null;
    inspectCard(inst, { cost: this.c.cost(inst) });
  }

  bindCard(el, inst) {
    let start = null;
    el.addEventListener('contextmenu', e => { e.preventDefault(); if (start) { clearTimeout(start.lp); start.inspected = true; } this.inspect(inst); });
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !this.dragging && !this.selected) { this.hoverCard = inst; this.layoutHand(); } });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && this.hoverCard === inst) { this.hoverCard = null; this.layoutHand(); } });
    el.addEventListener('pointerdown', e => {
      if (e.button === 2) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, inspected: false };
      // long-press inspects (touch or mouse); works outside your turn too
      start.lp = setTimeout(() => { if (start && !start.moved) { start.inspected = true; el.classList.remove('dragging'); this.inspect(inst); } }, 450);
      try { el.setPointerCapture(e.pointerId); } catch { /* */ }
    });
    el.addEventListener('pointermove', e => {
      if (!start || e.pointerId !== start.id || start.inspected) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) > 12) {
        clearTimeout(start.lp);
        if (this.c.phase !== 'player') { start = null; return; }
        start.moved = true;
        this.dragging = inst;
        if (this.selected !== inst) { this.selected = inst; this.layoutHand(); }
        el.classList.add('dragging');
        hideTip();
      }
      if (start.moved) {
        const b = el._base;
        el.style.transform = `translate(${b.x + dx}px, ${b.y + dy}px) rotate(${dx * 0.04}deg) scale(1.1)`;
        this.aimAt(e.clientX, e.clientY);
      }
    });
    const up = e => {
      if (!start || e.pointerId !== start.id) return;
      clearTimeout(start.lp);
      const { moved, inspected } = start;
      start = null;
      el.classList.remove('dragging');
      this.dragging = null;
      if (inspected) { this.layoutHand(); return; }
      if (this.c.phase !== 'player') return;
      if (moved) {
        const d = cardDef(inst);
        const handTop = this.handEl.getBoundingClientRect().top;
        if (d.target === 'enemy') {
          const tgt = this.enemyAt(e.clientX, e.clientY) || (this.c.alive().length === 1 && e.clientY < handTop - 30 ? this.c.alive()[0] : null);
          if (tgt) return this.tryPlay(inst, tgt);
        } else if (e.clientY < handTop - 30) return this.tryPlay(inst, null);
        this.hover = null; this.markAim();
        this.layoutHand();
        return;
      }
      // tap
      if (this.selected === inst) this.playSelected(false);
      else {
        this.pendingJar = null;
        if (!this.c.canPlay(inst)) toast(this.c.whyNot(inst));
        this.select(inst);
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { if (start) clearTimeout(start.lp); start = null; el.classList.remove('dragging'); this.dragging = null; this.layoutHand(); });
  }
  // Play the selected card: at the aimed critter, the only critter, or (keyboard) the first one.
  playSelected(fromKey = true) {
    const inst = this.selected;
    if (this.pendingJar != null) {
      const t = (this.hover?.alive && this.hover) || (fromKey ? this.c.alive()[0] : null);
      if (t) { const s = this.pendingJar; this.pendingJar = null; this.useJar(s, t); }
      return;
    }
    if (!inst) return;
    const d = cardDef(inst);
    if (d.target !== 'enemy') return this.tryPlay(inst, null);
    const alive = this.c.alive();
    const t = alive.length === 1 ? alive[0] : fromKey ? ((this.hover?.alive && this.hover) || alive[0]) : null;
    if (t) this.tryPlay(inst, t); else this.deselect();
  }
  enemyAt(x, y) {
    for (const u of this.units.values()) {
      if (u.who.isPlayer || !u.who.alive) continue;
      const r = u.root.getBoundingClientRect();
      if (x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 20 && y <= r.bottom + 10) return u.who;
    }
    return null;
  }
  aimAt(x, y) { this.hover = this.enemyAt(x, y); this.markAim(); }
  markAim() {
    for (const u of this.units.values()) if (!u.who.isPlayer) u.root.classList.toggle('aimed', !!(this.needsTarget() || this.kbAim) && u.who === this.hover);
  }
  enemyTapped(enemy) {
    if (!enemy.alive || this.c.phase !== 'player') return;
    if (this.pendingJar != null) { const s = this.pendingJar; this.pendingJar = null; this.useJar(s, enemy); return; }
    if (this.selected && cardDef(this.selected).target === 'enemy') this.tryPlay(this.selected, enemy);
  }
  async tryPlay(inst, target) {
    if (!this.c.canPlay(inst)) { toast(this.c.whyNot(inst)); this.sfx('error'); this.layoutHand(); return; }
    this.selected = null; this.hover = null; this.kbAim = false; this.markAim(); hideTip();
    const ok = await this.c.playCard(inst, target);
    this.afterAction();
    if (ok !== false) this.tutorial?.trigger('cardPlayed:' + inst.id);
  }
  async endTurn() {
    if (this.c.phase !== 'player') return;
    this.deselect();
    this.sfx('end_turn');
    await this.c.endPlayerTurn();
  }
  afterAction() { this.sync(); }

  // ---------- keyboard ----------
  // 1-9 select (again = play), Space play selected, Tab cycle targets, Enter/E end turn, Esc cancel.
  key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (this.closeModal) return this.modalKey?.(e);
    if (document.querySelector('.modal')) return;
    const c = this.c, k = e.key;
    if (/^[1-9]$/.test(k)) {
      const inst = c.hand[+k - 1];
      if (!inst || c.phase !== 'player') return;
      e.preventDefault();
      if (this.selected === inst) this.playSelected(true);
      else { this.pendingJar = null; if (!c.canPlay(inst)) toast(c.whyNot(inst)); this.select(inst); }
    } else if (k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      if (c.phase === 'player') this.playSelected(true);
    } else if (k === 'Tab') {
      e.preventDefault();
      const alive = c.alive();
      if (!alive.length) return;
      const i = alive.indexOf(this.hover);
      this.hover = alive[(i + (e.shiftKey ? -1 : 1) + alive.length) % alive.length];
      this.kbAim = true;
      this.markAim();
      const u = this.units.get(this.hover.uid);
      if (u && !this.needsTarget()) showTip(u.sprite);
    } else if (k === 'Enter' || k === 'e' || k === 'E') {
      if (c.phase !== 'player') return;
      e.preventDefault();
      this.endTurn();
    } else if (k === 'Escape') {
      this.kbAim = false; this.hover = null;
      this.deselect(); this.markAim(); hideTip();
    }
  }

  // ---------- jars ----------
  jarMenu(slot) {
    const id = this.game.run.preserves[slot];
    const def = PRESERVES[id];
    if (!def) return;
    const inCombat = this.c.phase === 'player';
    this.game.jarModal(slot, inCombat ? () => {
      if (def.target === 'enemy' && this.c.alive().length > 1) { this.selected = null; this.pendingJar = slot; this.layoutHand(); }
      else this.useJar(slot, this.c.alive()[0]);
    } : null);
  }
  async useJar(slot, target) {
    this.layoutHand();
    await this.c.usePreserve(slot, target);
    this.sync();
  }

  // ---------- engine UI interface: choices ----------
  checkpoint(snapshot) { try { this.game.checkpoint?.(snapshot); } catch (err) { console.warn('checkpoint', err); } }

  openModal(m, onKey, close) {
    hideTip();
    (document.getElementById('overlay') || document.body).append(m);
    this.modalKey = onKey;
    this.closeModal = () => { m.remove(); this.modalKey = null; this.closeModal = null; close?.(); };
  }
  choose(prompt, options = []) {
    if (!options.length) return Promise.resolve(0);
    return new Promise(res => {
      const pick = i => { this.closeModal(); this.sfx('click'); res(i); };
      const btns = options.map((o, i) => h('button.btn.opt', { onclick: () => pick(i) },
        o.icon && hasSprite(o.icon) ? img(o.icon, 2) : null,
        h('span.opt-text', h('b', o.label ?? `Option ${i + 1}`), o.desc ? h('small', o.desc) : null),
        i < 9 ? h('kbd', i + 1) : null));
      const tip = this.tips.consume('choose');
      const m = h('div.modal.choose', h('div.sheet.panel', h('h2', prompt || 'Choose one'),
        tip ? h('div.modal-tip', img('almanac', 2), h('span', tip)) : null, h('div.choices', btns)));
      this.openModal(m, e => {
        if (/^[1-9]$/.test(e.key) && options[+e.key - 1]) { e.preventDefault(); pick(+e.key - 1); }
      });
      btns[0]?.focus({ preventScroll: true });
    });
  }
  pickCards({ prompt, cards = [], n = 1, min = 0, from = null } = {}) {
    n = Math.max(1, Math.min(n, cards.length));
    min = Math.max(0, Math.min(min, cards.length));
    if (!cards.length) return Promise.resolve([]);
    return new Promise(res => {
      const chosen = new Set();
      const single = n === 1;
      const confirm = h('button.btn.green', { onclick: () => done() });
      const count = h('div.pick-count');
      const done = () => { if (chosen.size < min || chosen.size > n) return; this.closeModal(); this.sfx('click'); res(cards.filter(c => chosen.has(c))); };
      const refresh = () => {
        count.textContent = single ? (min ? 'Pick a card' : 'Pick a card, or skip') : `${chosen.size} / ${n}${min && min < n ? ` (at least ${min})` : ''}`;
        confirm.textContent = chosen.size ? 'Confirm' : 'Skip';
        confirm.disabled = chosen.size < min;
        confirm.hidden = single && min > 0;
        grid.querySelectorAll('.card').forEach((el, i) => el.classList.toggle('picked', chosen.has(cards[i])));
      };
      const toggle = inst => {
        this.sfx('hover');
        if (single) { chosen.clear(); chosen.add(inst); return done(); }
        if (chosen.has(inst)) chosen.delete(inst); else if (chosen.size < n) chosen.add(inst);
        refresh();
      };
      const grid = h('div.card-row.pick-grid');
      cards.forEach(inst => {
        const el = renderCard(inst, { cost: this.c.cost?.(inst) ?? undefined });
        attachInspect(el, () => inst);
        el.addEventListener('click', () => toggle(inst));
        grid.append(el);
      });
      const FROM = { hand: 'from your hand', draw: 'from your draw pile, top first', discard: 'from your discard pile' };
      const m = h('div.modal.pick', h('h2', prompt || (single ? 'Choose a card' : `Choose up to ${n} cards`)),
        FROM[from] ? h('div.pick-count.pick-from', FROM[from]) : null, count, h('div.scroll', grid), h('div.row', confirm));
      this.openModal(m, e => {
        if (/^[1-9]$/.test(e.key) && cards[+e.key - 1]) { e.preventDefault(); toggle(cards[+e.key - 1]); }
        else if (e.key === 'Enter') { e.preventDefault(); done(); }
      });
      refresh();
    });
  }

  // ---------- fx ----------
  unitOf(who) { return who?.isPlayer ? this.units.get('player') : this.units.get(who?.uid); }
  at(who) { const u = this.unitOf(who); return u ? centerOf(u.sprite) : { x: innerWidth / 2, y: innerHeight / 3 }; }
  retrigger(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  async hitStop(ms) {
    if (this.set.reducedMotion) return;
    const r = document.documentElement;
    r.classList.add('hitstop');
    await sleep(ms / this.spd);
    r.classList.remove('hitstop');
  }
  // A small sprite that flies from a to b along a wobbly arc (bees, coins).
  flyer(id, a, b, ms, cls = '') {
    const el = h('div.flyer' + (cls ? '.' + cls : ''), img(hasSprite(id) ? id : 'st_power', 2));
    el.style.left = a.x + 'px'; el.style.top = a.y + 'px';
    document.body.append(el);
    const dx = b.x - a.x, dy = b.y - a.y;
    const anim = el.animate?.([
      { transform: 'translate(-50%,-50%) scale(.6)' },
      { transform: `translate(calc(-50% + ${dx * 0.35}px), calc(-50% + ${dy * 0.35 - 46}px)) scale(1)`, offset: 0.35 },
      { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.7 + 18}px)) scale(1)`, offset: 0.7 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.8)` },
    ], { duration: ms / this.spd, easing: 'ease-in-out', fill: 'forwards' });
    return new Promise(r => {
      const end = () => { el.remove(); r(); };
      if (anim) anim.onfinish = end; else setTimeout(end, ms / this.spd);
    });
  }

  async fx(type, d = {}) {
    try { await this.runFx(type, d); } catch (err) { console.error('fx', type, err); }
  }
  async runFx(type, d) {
    const A = this.audio, S = this.scenery;
    switch (type) {
      case 'hit': {
        const u = this.unitOf(d.target);
        const src = this.unitOf(d.src);
        if (src) {
          src.root.classList.remove('lunge-left', 'lunge-right'); void src.root.offsetWidth;
          src.root.classList.add(d.src.isPlayer ? 'lunge-right' : 'lunge-left');
          src.anim?.setPose('atk', 380 / this.spd);
          setTimeout(() => src.root.classList.remove('lunge-left', 'lunge-right'), 420 / this.spd);
        }
        await this.wait(d.src && !d.src.isPlayer ? 160 : 60);
        const p = this.at(d.target);
        if (u) { this.retrigger(u.root, 'hurt'); if (d.amount > 0) u.anim?.setPose('hurt', 380 / this.spd); }
        if (d.amount > 0) {
          const heavy = d.amount >= 12 || (d.amount >= 6 && d.amount >= d.target.maxHp * 0.25);
          const mag = 1 + Math.min(1, d.amount / 25) * 0.9;
          floatText(p.x + rnd(-14, 14), p.y - 10, d.amount, 'dmg' + (heavy ? ' heavy' : ''), { mag });
          S?.burst(p.x, p.y, 'hit', Math.min(24, 8 + d.amount));
          if (d.target.isPlayer) {
            this.sfx('player_hurt'); this.shake(Math.min(14, 4 + d.amount / 2));
            buzz(this.game, heavy ? [30, 30, 50] : 25);
            this.retrigger(this.root, 'ouch');
          } else {
            this.sfx(heavy ? 'hit_heavy' : 'hit', { pitch: rnd(-2, 2) });
            if (heavy) { this.shake(d.amount / 2); buzz(this.game, 20); }
          }
          this.sync();
          if (heavy) await this.hitStop(Math.min(140, 60 + d.amount * 3));
        } else {
          if (d.blocked) { floatText(p.x, p.y - 10, 'Blocked', 'bark'); this.sfx('bark'); S?.burst(p.x, p.y, 'bark', 8); }
          this.sync();
        }
        await this.wait(230);
        break;
      }
      case 'loseHp': {
        const p = this.at(d.target);
        floatText(p.x, p.y - 20, d.amount, 'dmg small');
        if (d.why === 'wilt') S?.burst(p.x, p.y, 'gloom', 8);
        const u = this.unitOf(d.target);
        if (u) { this.retrigger(u.root, 'hurt'); u.anim?.setPose('hurt', 320 / this.spd); }
        this.sfx(d.target.isPlayer ? 'player_hurt' : 'enemy_hurt', { vol: 0.6 });
        if (d.target.isPlayer) buzz(this.game, 15);
        this.sync(); await this.wait(220); break;
      }
      case 'heal': {
        if (!d.amount) break;
        const p = this.at(d.target);
        floatText(p.x, p.y - 20, '+' + d.amount, 'heal'); S?.burst(p.x, p.y, 'heal', 10); this.sfx('heal');
        this.sync(); await this.wait(240); break;
      }
      case 'bark': {
        const p = this.at(d.target);
        floatText(p.x, p.y, '+' + d.amount + ' Bark', 'bark'); S?.burst(p.x, p.y + 10, 'bark', 8); this.sfx('bark');
        this.sync(); await this.wait(170); break;
      }
      case 'status': {
        const p = this.at(d.target);
        const name = statusInfo(d.id)?.name || POWERS[d.id]?.name || d.id;
        floatText(p.x, p.y - 36, `${name} ${d.n > 0 ? '+' : ''}${d.n}`, 'status');
        const bad = BAD.includes(d.id);
        this.sfx(bad === !!d.target.isPlayer ? 'debuff' : 'buff');
        this.sync(); await this.wait(160); break;
      }
      case 'mend': {
        const u = this.unitOf(d.enemy);
        const p = this.at(d.enemy);
        this.sfx('mend');
        S?.burst(p.x, p.y, 'mend', 30);
        if (u) { u.root.classList.add('mended'); u.anim?.destroy(); }
        if (d.enemy.def?.mendText) {
          const t = h('div.mend-text.chip', d.enemy.def.mendText);
          document.body.append(t); setTimeout(() => t.remove(), 3000);
        }
        this.sync();
        await this.wait(700);
        setTimeout(() => { if (u) u.root.style.visibility = 'hidden'; }, 700 / this.spd);
        break;
      }
      case 'plant': {
        this.sync();
        const el = this.plotEls[d.idx];
        if (!el) break;
        const p = centerOf(el);
        S?.burst(p.x, p.y + 10, 'leaf', 8); this.sfx('plant');
        this.retrigger(el, 'growpop');
        await this.wait(240); break;
      }
      case 'grow': {
        this.sync();
        this.sfx('grow', { pitch: d.n });
        for (const i of d.idxs || []) {
          const el = this.plotEls[i];
          if (!el) continue;
          this.retrigger(el, 'growpop');
          const p = centerOf(el);
          floatText(p.x, p.y - 20, '+' + d.n, 'heal small');
          if (d.fromWeather && this.c.weather === 'rain') S?.burst(p.x, p.y - 10, 'sparkle', 4);
        }
        await this.wait(360); break;
      }
      case 'bloom': {
        const el = this.plotEls[d.idx];
        this.sync();
        if (!el) break;
        const p = centerOf(el);
        const weed = isWeed(d.plant) || el.classList.contains('weed');
        el.classList.add('blooming');
        if (weed) {
          this.sfx('gloom'); S?.burst(p.x, p.y - 10, 'gloom', 22); this.shake(5);
          floatText(p.x, p.y - 44, 'Gloamweed bursts!', 'dmg small');
        } else {
          // pop, petals and stinger on the same frame
          const ring = h('div.bloom-ring'); ring.style.left = p.x + 'px'; ring.style.top = p.y + 'px';
          document.body.append(ring); setTimeout(() => ring.remove(), 700);
          if (A.stinger) { A.stinger('bloom'); this.sfx('bloom', { vol: 0.5 }); } else this.sfx('bloom');
          S?.burst(p.x, p.y - 10, 'bloom', 26);
          floatText(p.x, p.y - 44, `${PLANTS[d.plant?.id]?.name || 'Plant'} blooms!`, 'status');
          buzz(this.game, 18);
          this.tutorial?.trigger('bloom');
        }
        await this.wait(520);
        el.classList.remove('blooming');
        break;
      }
      case 'trample': {
        const el = this.plotEls[d.idx];
        if (!el) break;
        const p = centerOf(el);
        this.retrigger(el, 'trampled');
        S?.burst(p.x, p.y, 'leaf', 14); this.shake(5); this.sfx('hit_heavy', { pitch: -5 });
        floatText(p.x, p.y - 30, 'Trampled!', 'dmg small');
        buzz(this.game, 30);
        await this.wait(380); break;
      }
      case 'nibble': {
        for (const i of d.idxs || []) { const el = this.plotEls[i]; if (!el) continue; const p = centerOf(el); floatText(p.x, p.y - 30, 'Nibbled', 'dmg small'); S?.burst(p.x, p.y, 'leaf', 5); }
        this.sfx('debuff'); this.sync(); await this.wait(300); break;
      }
      // ----- Garden 2.0 -----
      case 'guard': {
        this.sync();
        const el = this.plotEls[d.idx];
        if (!el) break;
        const p = centerOf(el);
        this.retrigger(el.querySelector('.guard'), 'pop');
        floatText(p.x, p.y - 30, `+${d.n || 1} Guard`, 'bark small');
        this.tips.want('guard', el);
        this.sfx('bark', { pitch: 3 });
        await this.wait(220); break;
      }
      case 'guardBlock': {
        const el = this.plotEls[d.idx];
        if (!el) break;
        const p = centerOf(el);
        this.retrigger(el.querySelector('.guard'), 'wobble');
        this.retrigger(el, 'trampled');
        S?.burst(p.x, p.y - 8, 'bark', 10); this.shake(3); this.sfx('bark', { pitch: -4 });
        floatText(p.x, p.y - 30, 'Guarded!', 'bark small');
        await this.wait(420);
        this.sync();
        break;
      }
      case 'uproot': {
        const el = this.plotEls[d.idx];
        if (!el) break;
        const p = centerOf(el);
        const old = el.querySelector('img.plant');
        if (old) {
          const r = old.getBoundingClientRect();
          const ghost = old.cloneNode();
          ghost.className = 'px uproot-fly';
          Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
          document.body.append(ghost); setTimeout(() => ghost.remove(), 700);
          old.style.visibility = 'hidden';
        }
        this.sync();
        S?.burst(p.x, p.y, 'leaf', 10); this.sfx('plant', { pitch: -4 });
        floatText(p.x, p.y - 30, 'Uprooted', 'status small');
        await this.wait(320); break;
      }
      case 'weed': {
        this.sync();
        const el = this.plotEls[d.idx];
        if (!el) break;
        const p = centerOf(el);
        this.retrigger(el, 'weedpop');
        S?.burst(p.x, p.y, 'gloom', 12); this.sfx('gloom', { vol: 0.7 });
        floatText(p.x, p.y - 30, 'Gloamweed!', 'dmg small');
        await this.wait(360); break;
      }
      case 'weather': {
        this.sync();
        S?.setWeather(d.weather);
        this.retrigger(this.weatherEl, 'change');
        if (d.locked) { const p = centerOf(this.weatherEl); floatText(p.x, p.y - 30, 'The weather holds', 'status small'); }
        if (d.weather === 'rain') this.sfx('rain');
        await this.wait(300); break;
      }
      case 'addPlot': {
        this.sync();
        const el = this.plotEls[d.idx];
        if (!el) break;
        const p = centerOf(el);
        this.retrigger(el, 'weedpop');
        S?.burst(p.x, p.y, 'leaf', 10); this.sfx('plant', { pitch: 5 });
        floatText(p.x, p.y - 30, 'New plot!', 'heal small');
        this.tips.want('fourthPlot', el);
        await this.wait(300); break;
      }
      case 'discard': {
        const el = d.inst && this.cardEls.get(d.inst.uid);
        if (el) {
          this.cardEls.delete(d.inst.uid);
          const hr = this.handEl.getBoundingClientRect(), pr = this.discardEl.getBoundingClientRect();
          el.classList.add('leaving', 'flyout');
          el.style.transform = `translate(${pr.left + pr.width / 2 - (hr.left + hr.width / 2)}px, ${pr.top - hr.bottom + 40}px) scale(.25) rotate(40deg)`;
          setTimeout(() => el.remove(), 380 / this.spd);
        }
        this.sync(); this.retrigger(this.discardEl, 'pilepop');
        await this.wait(200); break;
      }
      case 'moveCard': {
        this.sync();
        if (d.inst && d.where && d.where !== 'hand') {
          const pile = d.where === 'discard' ? this.discardEl : this.drawEl;
          const p = centerOf(pile);
          floatText(p.x, p.y - 30, `${cardName(d.inst)} ${d.where === 'drawTop' ? 'on top' : '→'}`, 'status small');
          this.retrigger(pile, 'pilepop');
        }
        await this.wait(180); break;
      }
      case 'weatherLock': {
        this.lockShown = d.weather || this.c.weather;
        this._lockTurn = this.c.turn;
        this.sync();
        const p = centerOf(this.weatherEl);
        this.retrigger(this.weatherEl, 'lockpop');
        floatText(p.x, p.y - 30, 'Locked!', 'status small');
        this.tips.want('weatherLock', this.weatherEl);
        this.sfx('buff', { pitch: -3 });
        await this.wait(300); break;
      }
      case 'turnStart': {
        // a lock is spent by the next weather roll (turn 1 never rolls), which lands right before this
        if (this.lockShown && d.turn > Math.max(1, this._lockTurn)) this.lockShown = null;
        if (d.turn > 1) this.tutorial?.trigger('turn:' + d.turn);   // before growth, so a bloom step can follow it
        banner(d.turn === 1 ? 'Your turn' : `Turn ${d.turn}`); this.sfx('turn_start'); await this.wait(450); break;
      }
      case 'endTurn': {
        const hr = this.handEl.getBoundingClientRect();
        let k = 0;
        for (const [id, el] of this.cardEls) {
          if (this.c.hand.some(i => i.uid === id)) continue;
          const toCompost = this.c.exhaustPile.some(i => i.uid === id);
          const pr = (toCompost ? this.compostEl : this.discardEl).getBoundingClientRect();
          const tx = pr.left + pr.width / 2 - (hr.left + hr.width / 2), ty = pr.top - hr.bottom + 40;
          el.classList.add('leaving');
          this.cardEls.delete(id);
          const from = el.style.transform || 'none';
          if (el.animate && !this.set.reducedMotion) {
            const a = el.animate([
              { transform: from },
              { transform: `translate(${tx * 0.5}px, ${Math.min(ty, 0) - 90}px) rotate(20deg) scale(.6)`, offset: 0.45 },
              { transform: `translate(${tx}px, ${ty}px) rotate(40deg) scale(.22)`, opacity: toCompost ? 0 : 0.3 },
            ], { duration: 380 / this.spd, delay: (k++ * 40) / this.spd, easing: 'ease-in', fill: 'forwards' });
            a.onfinish = () => el.remove();
          } else el.remove();
        }
        await this.wait(300 + k * 20); break;
      }
      case 'enemyAct': {
        const u = this.unitOf(d.enemy);
        if (u) { u.root.style.transform = 'translateY(-6px)'; setTimeout(() => (u.root.style.transform = ''), 220 / this.spd); }
        await this.wait(this.c.weather === 'fog' ? 380 : 240); break;
      }
      case 'draw': {
        for (let k = 0; k < Math.min(d.n, 6); k++) setTimeout(() => this.sfx('card_draw', { pitch: k }), (k * 55) / this.spd);
        this.sync(); await this.wait(140 + d.n * 50); break;
      }
      case 'shuffle': { this.sfx('shuffle'); const p = centerOf(this.drawEl); floatText(p.x + 20, p.y - 30, 'Shuffled', 'status'); await this.wait(260); break; }
      case 'play': {
        const el = this.cardEls.get(d.inst.uid);
        this.sfx('card_play');
        if (el) {
          this.cardEls.delete(d.inst.uid);
          el.classList.remove('selected');
          const from = centerOf(el);
          const t = d.target ? this.at(d.target) : { x: innerWidth / 2, y: innerHeight * 0.4 };
          const hr = this.handEl.getBoundingClientRect();
          const tf = `translate(${t.x - hr.left - hr.width / 2}px, ${t.y - hr.bottom + 60}px) scale(.55) rotate(${d.target ? -8 : 0}deg)`;
          // two fading ghosts chase the card for a streak, plus a sparkle trail along the path
          if (!this.set.reducedMotion) {
            for (const [delay, op] of [[45, 0.35], [90, 0.18]]) {
              const g = el.cloneNode(true);
              g.classList.add('trail', 'leaving');
              g.style.opacity = op;
              this.handEl.append(g);
              void g.offsetWidth;
              g.style.transitionDelay = delay / this.spd + 'ms';
              g.style.transform = tf;
              setTimeout(() => g.remove(), (420 + delay) / this.spd);
            }
            for (let k = 1; k <= 4; k++) setTimeout(() => S?.burst(from.x + (t.x - from.x) * k / 5, from.y + (t.y - from.y) * k / 5, 'sparkle', 2), (k * 55) / this.spd);
          }
          el.classList.add('leaving', 'flyout');
          el.style.transform = tf;
          setTimeout(() => el.remove(), 380 / this.spd);
        }
        this.layoutHand();
        await this.wait(200); break;
      }
      case 'addCard': {
        this.sync();
        const pile = d.where === 'hand' ? this.handEl : d.where === 'draw' ? this.drawEl : this.discardEl;
        const p = centerOf(pile);
        floatText(p.x, p.y - 30, '+' + cardName(d.inst), 'status small');
        await this.wait(160); break;
      }
      case 'compost': this.sfx('gloom', { vol: 0.5 }); this.sync(); await this.wait(200); break;
      case 'exhaust': {
        const el = d.inst && this.cardEls.get(d.inst.uid);
        this.sfx('gloom', { vol: 0.6 });
        if (el) {
          this.cardEls.delete(d.inst.uid);
          el.classList.add('leaving', 'burn');
          setTimeout(() => el.remove(), 560 / this.spd);
        } else if (d.inst) {
          const p = centerOf(this.compostEl.style.display === 'none' ? this.discardEl : this.compostEl);
          floatText(p.x, p.y - 34, `Composted ${cardName(d.inst)}`, 'status small');
        }
        this.sync();
        this.retrigger(this.compostEl, 'pilepop');
        await this.wait(300); break;
      }
      case 'upgrade': {
        const had = d.inst && this.cardEls.has(d.inst.uid);
        this.sfx('upgrade');
        this.sync();   // layoutHand re-renders an upgraded hand card with a flash
        if (d.inst && !had) {
          const p = centerOf(this.handEl);
          floatText(p.x, p.y - 40, cardName(d.inst) + '!', 'heal small');
        } else if (had) {
          const el = this.cardEls.get(d.inst.uid);
          if (el) { const p = centerOf(el); S?.burst(p.x, p.y, 'sparkle', 10); }
        }
        await this.wait(380); break;
      }
      case 'sting': {
        const pu = this.units.get('player');
        const a = pu ? centerOf(pu.sprite) : { x: innerWidth * 0.2, y: innerHeight * 0.3 };
        const b = this.at(d.target);
        this.sfx('buff', { pitch: 12, vol: 0.35 });
        await this.flyer(hasSprite('icon_bee') ? 'icon_bee' : 'st_bees', { x: a.x + 10, y: a.y - 20 }, b, 300, 'bee');
        const u = this.unitOf(d.target);
        if (u) { this.retrigger(u.root, 'hurt'); u.anim?.setPose('hurt', 250 / this.spd); }
        if (d.amount) floatText(b.x + rnd(-10, 10), b.y - 16, d.amount, 'dmg small sting');
        this.tips.want('sting', u?.sprite);
        this.sfx('hit', { pitch: 7, vol: 0.5 });
        this.sync();
        await this.wait(90); break;
      }
      case 'steal': {
        const e = d.enemy;
        const from = centerOf(this.hud.coinEl);
        floatText(from.x, from.y + 26, `-${d.n}`, 'dmg small');
        this.sfx('coin', { pitch: -7 });
        this.hud.update();
        if (e) await this.flyer('ui_coin', from, this.at(e), 420, 'coin');
        if (e) { const p = this.at(e); floatText(p.x, p.y - 40, 'Pinched!', 'status small'); this.tips.want('steal', this.hud.coinEl); }
        await this.wait(160); break;
      }
      case 'bossPhase': {
        const n = d.n || 2;
        this.phaseBoost = n >= 3 ? 1 : 0.85;
        const u = this.unitOf(d.enemy);
        S?.flash?.('#fff', 160);
        A.stinger?.('bossPhase');
        this.shake(10);
        buzz(this.game, [40, 40, 90]);
        if (u) { this.retrigger(u.root, 'phaseup'); u.anim?.setPose('atk', 700 / this.spd); }
        const t = h('div.phase-title', h('small', d.enemy?.name || ''), h('div', d.text || `Phase ${n}`));
        document.body.append(t);
        setTimeout(() => t.remove(), 1900 / this.spd);
        this.sync();
        this.tips.want('bossPhase', u?.sprite);
        await this.wait(1400); break;
      }
      case 'coin': { const p = centerOf(this.hud.coinEl); floatText(p.x, p.y + 30, '+' + d.n, 'heal small'); this.sfx('coin'); this.hud.update(); await this.wait(150); break; }
      case 'stamina': { const p = centerOf(this.staminaEl); floatText(p.x, p.y - 30, `+${d.n}`, 'heal'); this.sfx('buff'); this.sync(); await this.wait(160); break; }
      case 'say': {
        const u = this.unitOf(d.enemy);
        if (!u) break;
        u.root.querySelector('.bubble')?.remove();
        const b = h('div.bubble.chip', d.text);
        u.root.append(b);
        setTimeout(() => b.remove(), 2600 / Math.sqrt(this.spd));
        await this.wait(900); break;
      }
      case 'summon': {
        this.sync(); this.sfx('open');
        const p = this.at(d.enemy);
        S?.burst(p.x, p.y, 'gloom', 14);
        await this.wait(380); break;
      }
      case 'gloom': { const p = this.at(this.c.player); S?.burst(p.x, p.y, 'gloom', 12); this.sfx('gloom'); floatText(p.x, p.y - 40, `+${d.n} Gloam`, 'status'); this.sync(); await this.wait(300); break; }
      case 'keepsake': this.hud.flashKeepsake(d.id); break;
      case 'preserve': this.sfx('open'); break;
      case 'log': { floatText(innerWidth / 2, innerHeight * 0.36, d.text, 'status'); await this.wait(200); break; }
      default: break;
    }
  }
}

function rnd(a, b) { return a + Math.random() * (b - a); }
function safe(fn) { try { return fn(); } catch { return ''; } }
function esc(s) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
