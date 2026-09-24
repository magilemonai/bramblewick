// Combat screen: renders a Combat and animates its fx events.
import { CARDS, POWERS } from '../data/cards.js';
import { PLANTS } from '../data/plants.js';
import { PRESERVES } from '../data/preserves.js';
import { hasSprite } from '../pixel.js';
import { h, img, sleep, floatText, banner, centerOf, setTip, showTip, hideTip, toast } from './dom.js';
import { renderCard, cardTip, plantTip, cardName } from './cardview.js';
import { STATUS_INFO, WEATHER, cardDef } from '../engine/combat.js';

const INTENT_TIP = {
  attack: 'Intends to attack', block: 'Intends to put up Bark', buff: 'Intends to grow stronger', debuff: 'Intends to hinder you',
  trample: 'Intends to trample your garden!', summon: 'Intends to call for friends', mystery: 'Something mysterious...', heal: 'Intends to heal',
};

export class CombatView {
  constructor(game, combat, { hud }) {
    this.game = game;
    this.c = combat;
    this.hud = hud;
    this.units = new Map();
    this.cardEls = new Map();
    this.selected = null;
    this.pendingJar = null;
    this.hover = null;
    combat.ui = this;
    this.build();
  }

  get audio() { return this.game.audio; }
  get scenery() { return this.game.scenery; }

  build() {
    this.stageEl = h('div.stage', { onclick: e => { if (e.target === this.stageEl || e.target === this.enemiesEl) this.deselect(); } });
    this.enemiesEl = h('div.enemies');
    this.playerBox = h('div.farmer-box');
    this.stageEl.append(this.playerBox, this.enemiesEl);
    this.units.set('player', this.makeUnit(this.c.player, true));
    this.playerBox.append(this.units.get('player').root);

    this.weatherEl = h('div.weather', img('w_sun', 3), h('span', 'Sunny'));
    setTip(this.weatherEl, () => { const w = WEATHER[this.c.weather]; return `<b>${w.name}</b>${w.desc}`; });
    this.plotEls = [0, 1, 2].map(i => {
      const el = h('div.plot.empty');
      setTip(el, () => (this.c.plots[i] ? plantTip(this.c.plots[i]) : '<b>Empty plot</b>Play a Seed card to plant here.'));
      return el;
    });
    this.garden = h('div.garden-row', this.weatherEl, h('div.plots', this.plotEls));

    this.staminaEl = h('div.stamina', img('ui_stamina', 4), h('b', '3/3'));
    setTip(this.staminaEl, '<b>Stamina</b>Spend it to play cards. Refills to 3 each turn.');
    const pile = (icon, name, fn) => {
      const b = h('button.pile', { onclick: fn }, img(icon, 2), h('span', '0'));
      setTip(b, `<b>${name}</b>Tap to look.`);
      return b;
    };
    this.drawEl = pile('ui_deck', 'Draw pile', () => this.game.showPile('Draw pile (random order)', this.c.drawPile, true));
    this.discardEl = pile('ui_discard', 'Discard pile', () => this.game.showPile('Discard pile', this.c.discardPile));
    this.compostEl = pile('ui_compost', 'Compost', () => this.game.showPile('Composted this fight', this.c.exhaustPile));
    this.endBtn = h('button.btn.green.endturn', { onclick: () => this.endTurn() }, 'End Turn');
    this.controls = h('div.controls', h('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } }, this.staminaEl, h('div.piles', this.drawEl, this.discardEl, this.compostEl)), this.endBtn);

    this.hintEl = h('div.hand-hint');
    this.handEl = h('div.hand', this.hintEl);
    this.root = h('div.screen.combat', this.hud.el, this.stageEl, this.garden, this.controls, this.handEl);

    this.onResize = () => this.layoutHand();
    addEventListener('resize', this.onResize);
    this.hud.onJar = slot => this.jarMenu(slot);
  }
  destroy() { removeEventListener('resize', this.onResize); hideTip(); }

  // ---------- units ----------
  makeUnit(who, isPlayer) {
    const spriteId = isPlayer ? 'farmer' : who.sprite;
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
    root.append(isPlayer ? h('div.intent', { style: { visibility: 'hidden' } }) : intent, sprite, bars, statuses);
    if (!isPlayer) {
      sprite.addEventListener('click', e => { e.stopPropagation(); this.enemyTapped(who); });
      sprite.addEventListener('pointerenter', () => { if (this.dragging) return; this.hover = who; this.markAim(); });
      setTip(sprite, () => this.enemyTip(who));
      setTip(intent, () => this.intentTip(who));
    } else {
      setTip(sprite, '<b>You</b>Nana Wren\'s grandkid. Tired, stubborn, fond of turnips.');
    }
    return { root, sprite, img: sprImg, fill, ghost, txt, hpbar, barkbadge, statuses, intent, who };
  }
  enemyTip(e) {
    const box = h('div', h('b', e.name));
    if (e.def.flavor) box.append(h('div', { style: { fontStyle: 'italic', color: '#8a5a3b' } }, e.def.flavor));
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
    // statuses + powers
    u.statuses.innerHTML = '';
    for (const [id, n] of Object.entries(who.status)) {
      if (id === 'bark' || !n) continue;
      const info = STATUS_INFO[id];
      if (!info) continue;
      const st = h('div.st', img(info.icon, 2), id === 'rooted' ? null : h('b', n));
      setTip(st, `<b>${info.name}</b>${info.desc(n)}`);
      u.statuses.append(st);
    }
    for (const [pid, n] of Object.entries(who.powers)) {
      const p = POWERS[pid];
      if (!p) continue;
      const st = h('div.st', img(p.icon && hasSprite(p.icon) ? p.icon : 'st_power', 2), n > 1 || typeof n === 'number' ? h('b', n) : null);
      setTip(st, () => `<b>${esc(p.name)}</b>${esc(safe(() => p.desc(n)))}`);
      u.statuses.append(st);
    }
    // intent
    if (!who.isPlayer) {
      u.intent.innerHTML = '';
      const it = who.alive && this.c.phase !== 'over' ? this.c.intentOf(who) : null;
      if (it) {
        if (it.hidden) u.intent.append(img('intent_mystery', 2), '?');
        else {
          u.intent.className = 'intent ' + it.type;
          u.intent.append(img('intent_' + (hasSprite('intent_' + it.type) ? it.type : 'mystery'), 2));
          if (it.dmg != null) u.intent.append(it.times > 1 ? `${it.dmg}x${it.times}` : String(it.dmg));
          if (it.alt && hasSprite('intent_' + it.alt)) u.intent.append(img('intent_' + it.alt, 2));
        }
      }
      const needs = this.needsTarget();
      u.root.classList.toggle('targetable', needs && who.alive);
    }
  }

  // Pick integer-ish sprite scales that fit the stage for the current enemy line-up.
  fitSprites() {
    const alive = this.c.enemies.filter(e => e.alive || this.units.get(e.uid)?.root.style.visibility !== 'hidden');
    const stageW = this.stageEl.clientWidth || innerWidth, stageH = this.stageEl.clientHeight || innerHeight * 0.4;
    const widths = alive.map(e => +(this.units.get(e.uid)?.img.dataset.w || 32));
    const total = widths.reduce((a, b) => a + b, 0) || 32;
    const tallest = Math.max(32, ...widths);
    const room = stageW * (innerWidth >= 820 ? 0.62 : 0.72) - alive.length * 6;
    let esc = Math.min(room / total, (stageH - 90) / tallest, innerWidth >= 820 ? 5 : 3.6);
    esc = Math.max(1.5, Math.floor(esc * 4) / 4);
    const psc = Math.max(2, Math.min(innerWidth >= 820 ? 4.5 : 3.2, (stageH - 90) / 32, stageW * 0.24 / 32));
    this.stageEl.style.setProperty('--esc', esc);
    this.stageEl.style.setProperty('--psc', Math.floor(psc * 4) / 4);
  }

  // ---------- sync ----------
  sync() {
    const c = this.c;
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
    c.plots.forEach((p, i) => {
      const el = this.plotEls[i];
      el.classList.toggle('empty', !p);
      const g = WEATHER[c.weather].growth;
      el.classList.toggle('ready', !!p && p.growth + g >= p.growTime && c.phase === 'player');
      let plantImg = el.querySelector('img.plant');
      let pips = el.querySelector('.pips');
      if (!p) { plantImg?.remove(); pips?.remove(); el.dataset.key = ''; return; }
      const stage = p.growth <= 0 ? 0 : p.growth >= p.growTime ? 3 : p.growth / p.growTime < 0.5 ? 1 : 2;
      const key = `${p.uid}:${stage}`;
      if (el.dataset.key !== key) {
        plantImg?.remove();
        plantImg = img(`plant_${p.id}_${stage}`, 4, 'plant');
        el.append(plantImg);
        el.dataset.key = key;
      }
      if (!pips) { pips = h('div.pips'); el.append(pips); }
      pips.innerHTML = '';
      for (let k = 0; k < p.growTime; k++) pips.append(h('i' + (k < p.growth ? '.on' : '')));
    });
    // weather
    const w = WEATHER[c.weather];
    if (this.weatherEl.dataset.w !== c.weather) {
      this.weatherEl.dataset.w = c.weather;
      this.weatherEl.firstChild.replaceWith(img(w.icon, 3));
      this.weatherEl.lastChild.textContent = w.name;
    }
    // controls
    this.staminaEl.querySelector('b').textContent = `${c.player.stamina}/3`;
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
  }

  // ---------- hand ----------
  layoutHand() {
    const c = this.c;
    const hand = c.hand;
    for (const [id, el] of this.cardEls) if (!hand.some(i => i.uid === id) && !el.classList.contains('flyout')) { el.remove(); this.cardEls.delete(id); }
    if (this.selected && !hand.includes(this.selected)) this.selected = null;
    const W = this.handEl.clientWidth || innerWidth;
    const n = hand.length;
    const probe = this.cardEls.values().next().value;
    const cw = probe?.offsetWidth || Math.min(100, innerWidth * 0.255);
    const ch = probe?.offsetHeight || cw * 1.42;
    const desktop = innerWidth >= 820;
    const spacing = n > 1 ? Math.min(cw * 0.95, (Math.min(W, 1000) - cw - 12) / (n - 1)) : 0;
    const mid = (n - 1) / 2;
    const step = Math.min(4, 22 / Math.max(1, n));
    hand.forEach((inst, i) => {
      let el = this.cardEls.get(inst.uid);
      if (!el) {
        el = renderCard(inst, { cost: c.cost(inst) });
        this.bindCard(el, inst);
        this.cardEls.set(inst.uid, el);
        // enter from the draw pile
        const dr = this.drawEl.getBoundingClientRect(), hr = this.handEl.getBoundingClientRect();
        el.style.transition = 'none';
        el.style.transform = `translate(${dr.left - hr.left - hr.width / 2 + cw / 2}px, ${-20}px) scale(.3) rotate(-30deg)`;
        this.handEl.append(el);
        el.offsetWidth; // reflow
        el.style.transition = '';
      } else {
        const costEl = el.querySelector('.cost b');
        if (costEl) costEl.textContent = c.cost(inst);
      }
      const off = i - mid;
      let x = off * spacing, y = Math.abs(off) ** 2 * 1.6, r = off * step, s = 1;
      if (inst === this.selected) {
        y = -ch * (desktop ? 0.42 : 0.62); r = 0; s = desktop ? 1.32 : 1.55;
        x = Math.max(-W / 2 + cw * s / 2 + 4, Math.min(W / 2 - cw * s / 2 - 4, x));
      } else if (inst === this.hoverCard && desktop) { y = -ch * 0.28; r = 0; s = 1.18; }
      if (!el.classList.contains('dragging')) el.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`;
      el.style.zIndex = inst === this.selected ? 30 : inst === this.hoverCard ? 25 : 10 + i;
      el.classList.toggle('unplayable', !c.canPlay(inst) && c.phase === 'player');
      el.classList.toggle('selected', inst === this.selected);
      el._base = { x, y };
    });
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
    return !!this.selected && cardDef(this.selected).target === 'enemy';
  }
  select(inst) {
    this.selected = inst;
    this.hoverCard = null;
    this.audio.sfx('hover');
    this.layoutHand();
    const el = this.cardEls.get(inst?.uid);
    hideTip();
    if (el && inst) {
      const tip = cardTip(inst);
      if (tip.childNodes.length > 1) { setTip(el, tip); setTimeout(() => { if (this.selected === inst) showTip(el, { x: innerWidth / 2, y: this.hud.el.getBoundingClientRect().bottom + 6 }); }, 200); }
    }
  }
  deselect() { if (this.selected || this.pendingJar != null) { this.selected = null; this.pendingJar = null; hideTip(); this.layoutHand(); } }

  bindCard(el, inst) {
    let start = null;
    el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !this.dragging && !this.selected) { this.hoverCard = inst; this.layoutHand(); } });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && this.hoverCard === inst) { this.hoverCard = null; this.layoutHand(); } });
    el.addEventListener('pointerdown', e => {
      if (this.c.phase !== 'player') return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) > 12) {
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
      const moved = start.moved;
      start = null;
      el.classList.remove('dragging');
      this.dragging = null;
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
      if (this.selected === inst) {
        const d = cardDef(inst);
        if (d.target !== 'enemy') this.tryPlay(inst, null);
        else if (this.c.alive().length === 1) this.tryPlay(inst, this.c.alive()[0]);
        else this.deselect();
      } else {
        this.pendingJar = null;
        if (!this.c.canPlay(inst)) toast(this.c.whyNot(inst));
        this.select(inst);
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', () => { start = null; el.classList.remove('dragging'); this.dragging = null; this.layoutHand(); });
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
    for (const u of this.units.values()) if (!u.who.isPlayer) u.root.classList.toggle('aimed', this.needsTarget() && u.who === this.hover);
  }
  enemyTapped(enemy) {
    if (!enemy.alive || this.c.phase !== 'player') return;
    if (this.pendingJar != null) { const s = this.pendingJar; this.pendingJar = null; this.useJar(s, enemy); return; }
    if (this.selected && cardDef(this.selected).target === 'enemy') this.tryPlay(this.selected, enemy);
  }
  async tryPlay(inst, target) {
    if (!this.c.canPlay(inst)) { toast(this.c.whyNot(inst)); this.audio.sfx('error'); this.layoutHand(); return; }
    this.selected = null; this.hover = null; this.markAim(); hideTip();
    await this.c.playCard(inst, target);
    this.afterAction();
  }
  async endTurn() {
    if (this.c.phase !== 'player') return;
    this.deselect();
    this.audio.sfx('end_turn');
    await this.c.endPlayerTurn();
  }
  afterAction() { this.sync(); }

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

  // ---------- fx ----------
  unitOf(who) { return who?.isPlayer ? this.units.get('player') : this.units.get(who?.uid); }
  at(who) { const u = this.unitOf(who); return u ? centerOf(u.sprite) : { x: innerWidth / 2, y: innerHeight / 3 }; }

  async fx(type, d) {
    const A = this.audio, S = this.scenery;
    switch (type) {
      case 'hit': {
        const u = this.unitOf(d.target);
        const src = this.unitOf(d.src);
        if (src) { src.root.classList.remove('lunge-left', 'lunge-right'); src.root.offsetWidth; src.root.classList.add(d.src.isPlayer ? 'lunge-right' : 'lunge-left'); setTimeout(() => src.root.classList.remove('lunge-left', 'lunge-right'), 420); }
        await sleep(d.src && !d.src.isPlayer ? 160 : 60);
        const p = this.at(d.target);
        if (u) { u.root.classList.remove('hurt'); u.root.offsetWidth; u.root.classList.add('hurt'); }
        if (d.amount > 0) {
          floatText(p.x + rnd(-14, 14), p.y - 10, d.amount, 'dmg' + (d.amount >= 15 ? ' big' : ''));
          S?.burst(p.x, p.y, 'hit', Math.min(24, 8 + d.amount));
          if (d.target.isPlayer) { A.sfx('player_hurt'); S?.shake(Math.min(14, 4 + d.amount / 2)); }
          else { A.sfx(d.amount >= 15 ? 'hit_heavy' : 'hit', { pitch: rnd(-2, 2) }); if (d.amount >= 12) S?.shake(d.amount / 2); }
        } else if (d.blocked) { floatText(p.x, p.y - 10, 'Blocked', 'bark'); A.sfx('bark'); S?.burst(p.x, p.y, 'bark', 8); }
        this.sync();
        await sleep(230);
        break;
      }
      case 'loseHp': {
        const p = this.at(d.target);
        floatText(p.x, p.y - 20, d.amount, 'dmg small');
        if (d.why === 'wilt') S?.burst(p.x, p.y, 'gloom', 8);
        const u = this.unitOf(d.target);
        if (u) { u.root.classList.remove('hurt'); u.root.offsetWidth; u.root.classList.add('hurt'); }
        A.sfx(d.target.isPlayer ? 'player_hurt' : 'enemy_hurt', { vol: 0.6 });
        this.sync(); await sleep(220); break;
      }
      case 'heal': {
        if (!d.amount) break;
        const p = this.at(d.target);
        floatText(p.x, p.y - 20, '+' + d.amount, 'heal'); S?.burst(p.x, p.y, 'heal', 10); A.sfx('heal');
        this.sync(); await sleep(240); break;
      }
      case 'bark': {
        const p = this.at(d.target);
        floatText(p.x, p.y, '+' + d.amount + ' Bark', 'bark'); S?.burst(p.x, p.y + 10, 'bark', 8); A.sfx('bark');
        this.sync(); await sleep(170); break;
      }
      case 'status': {
        const p = this.at(d.target);
        const name = STATUS_INFO[d.id]?.name || POWERS[d.id]?.name || d.id;
        floatText(p.x, p.y - 36, `${name} ${d.n > 0 ? '+' : ''}${d.n}`, 'status');
        const bad = ['dazed', 'soggy', 'wilt', 'rooted'].includes(d.id);
        A.sfx(bad === !!d.target.isPlayer ? 'debuff' : 'buff');
        this.sync(); await sleep(160); break;
      }
      case 'mend': {
        const u = this.unitOf(d.enemy);
        const p = this.at(d.enemy);
        A.sfx('mend');
        S?.burst(p.x, p.y, 'mend', 30);
        if (u) u.root.classList.add('mended');
        if (d.enemy.def.mendText) {
          const t = h('div.mend-text.chip', d.enemy.def.mendText);
          document.body.append(t); setTimeout(() => t.remove(), 3000);
        }
        this.sync();
        await sleep(700);
        setTimeout(() => { if (u) u.root.style.visibility = 'hidden'; }, 700);
        break;
      }
      case 'plant': {
        this.sync();
        const el = this.plotEls[d.idx];
        const p = centerOf(el);
        S?.burst(p.x, p.y + 10, 'leaf', 8); A.sfx('plant');
        el.classList.remove('growpop'); el.offsetWidth; el.classList.add('growpop');
        await sleep(240); break;
      }
      case 'grow': {
        this.sync();
        A.sfx('grow', { pitch: d.n });
        for (const i of d.idxs) {
          const el = this.plotEls[i];
          el.classList.remove('growpop'); el.offsetWidth; el.classList.add('growpop');
          const p = centerOf(el);
          floatText(p.x, p.y - 20, '+' + d.n, 'heal small');
          if (d.fromWeather && this.c.weather === 'rain') S?.burst(p.x, p.y - 10, 'sparkle', 4);
        }
        await sleep(360); break;
      }
      case 'bloom': {
        const el = this.plotEls[d.idx];
        this.sync();
        const p = centerOf(el);
        el.classList.add('blooming');
        A.sfx('bloom');
        S?.burst(p.x, p.y - 10, 'bloom', 26);
        floatText(p.x, p.y - 44, `${PLANTS[d.plant.id]?.name || 'Plant'} blooms!`, 'status');
        await sleep(520);
        el.classList.remove('blooming');
        break;
      }
      case 'trample': {
        const el = this.plotEls[d.idx];
        const p = centerOf(el);
        el.classList.remove('trampled'); el.offsetWidth; el.classList.add('trampled');
        S?.burst(p.x, p.y, 'leaf', 14); S?.shake(5); A.sfx('hit_heavy', { pitch: -5 });
        floatText(p.x, p.y - 30, 'Trampled!', 'dmg small');
        await sleep(380); break;
      }
      case 'nibble': {
        for (const i of d.idxs) { const p = centerOf(this.plotEls[i]); floatText(p.x, p.y - 30, 'Nibbled', 'dmg small'); S?.burst(p.x, p.y, 'leaf', 5); }
        A.sfx('debuff'); this.sync(); await sleep(300); break;
      }
      case 'weather': {
        this.sync();
        S?.setWeather(d.weather);
        this.weatherEl.classList.remove('change'); this.weatherEl.offsetWidth; this.weatherEl.classList.add('change');
        if (d.weather === 'rain') A.sfx('rain');
        await sleep(300); break;
      }
      case 'turnStart': banner(d.turn === 1 ? 'Your turn' : `Turn ${d.turn}`); A.sfx('turn_start'); await sleep(450); break;
      case 'endTurn': {
        const dr = this.discardEl.getBoundingClientRect(), hr = this.handEl.getBoundingClientRect();
        for (const [id, el] of this.cardEls) {
          if (this.c.hand.some(i => i.uid === id)) continue;
          el.classList.add('flyout');
          el.style.transform = `translate(${dr.left - hr.left - hr.width / 2 + 20}px, -40px) scale(.25) rotate(40deg)`;
          setTimeout(() => el.remove(), 360);
          this.cardEls.delete(id);
        }
        await sleep(300); break;
      }
      case 'enemyAct': {
        const u = this.unitOf(d.enemy);
        if (u) { u.root.style.transform = 'translateY(-6px)'; setTimeout(() => (u.root.style.transform = ''), 220); }
        await sleep(this.c.weather === 'fog' ? 380 : 240); break;
      }
      case 'draw': {
        for (let k = 0; k < Math.min(d.n, 6); k++) setTimeout(() => A.sfx('card_draw', { pitch: k }), k * 55);
        this.sync(); await sleep(140 + d.n * 40); break;
      }
      case 'shuffle': { A.sfx('shuffle'); const p = centerOf(this.drawEl); floatText(p.x + 20, p.y - 30, 'Shuffled', 'status'); await sleep(260); break; }
      case 'play': {
        const el = this.cardEls.get(d.inst.uid);
        A.sfx('card_play');
        if (el) {
          this.cardEls.delete(d.inst.uid);
          el.classList.remove('selected');
          el.classList.add('flyout');
          const t = d.target ? this.at(d.target) : { x: innerWidth / 2, y: innerHeight * 0.4 };
          const hr = this.handEl.getBoundingClientRect();
          el.style.transform = `translate(${t.x - hr.left - hr.width / 2}px, ${t.y - hr.bottom + 60}px) scale(.55) rotate(${d.target ? -8 : 0}deg)`;
          setTimeout(() => el.remove(), 380);
        }
        this.layoutHand();
        await sleep(200); break;
      }
      case 'addCard': {
        this.sync();
        const pile = d.where === 'hand' ? this.handEl : d.where === 'draw' ? this.drawEl : this.discardEl;
        const p = centerOf(pile);
        floatText(p.x, p.y - 30, '+' + cardName(d.inst), 'status small');
        await sleep(160); break;
      }
      case 'compost': A.sfx('gloom', { vol: 0.5 }); this.sync(); await sleep(200); break;
      case 'coin': { const p = centerOf(this.hud.coinEl); floatText(p.x, p.y + 30, '+' + d.n, 'heal small'); A.sfx('coin'); this.hud.update(); await sleep(150); break; }
      case 'stamina': { const p = centerOf(this.staminaEl); floatText(p.x, p.y - 30, `+${d.n}`, 'heal'); A.sfx('buff'); this.sync(); await sleep(160); break; }
      case 'say': {
        const u = this.unitOf(d.enemy);
        if (!u) break;
        u.root.querySelector('.bubble')?.remove();
        const b = h('div.bubble.chip', d.text);
        u.root.append(b);
        setTimeout(() => b.remove(), 2600);
        await sleep(900); break;
      }
      case 'summon': this.sync(); A.sfx('open'); S?.burst(...Object.values(this.at(d.enemy)).slice(0, 2), 'gloom', 14); await sleep(380); break;
      case 'gloom': { const p = this.at(this.c.player); S?.burst(p.x, p.y, 'gloom', 12); A.sfx('gloom'); floatText(p.x, p.y - 40, `+${d.n} Gloam`, 'status'); this.sync(); await sleep(300); break; }
      case 'keepsake': this.hud.flashKeepsake(d.id); break;
      case 'preserve': A.sfx('open'); break;
      case 'log': { floatText(innerWidth / 2, innerHeight * 0.36, d.text, 'status'); await sleep(200); break; }
      default: break;
    }
  }
}

function rnd(a, b) { return a + Math.random() * (b - a); }
function safe(fn) { try { return fn(); } catch { return ''; } }
function esc(s) { return String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
