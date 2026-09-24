// Top bar: heart, coin, preserves, keepsakes, season, deck, settings.
import { KEEPSAKES } from '../data/keepsakes.js';
import { PRESERVES } from '../data/preserves.js';
import { SEASONS } from '../data/story.js';
import { h, img, setTip, applySettings, getSettings } from './dom.js';
import { season } from '../engine/state.js';

export class Hud {
  constructor(game, { hpSource } = {}) {
    this.game = game;
    this.hpSource = hpSource || (() => game.run);
    this.onJar = slot => game.jarModal(slot, null);
    this.hpEl = h('div.stat', img('ui_heart', 2), h('span'));
    setTip(this.hpEl, '<b>Heart</b>If it hits zero, the Gloam sends you home to rest. Your year starts over.');
    this.coinEl = h('div.stat', img('ui_coin', 2), h('span'));
    setTip(this.coinEl, '<b>Coin</b>Spend it at Odile\'s stall.');
    this.jarsEl = h('div.jars');
    this.keepsEl = h('div.keeps');
    this.seasonEl = h('div.season-chip.chip');
    this.deckBtn = h('button.icon-btn', { onclick: () => game.showPile('Your deck', game.run.deck, false) }, img('ui_deck', 2), h('span.deck-n', ''));
    setTip(this.deckBtn, '<b>Deck</b>Every card you carry.');
    this.gearBtn = h('button.icon-btn.gear', { 'aria-label': 'Settings', onclick: () => {
      if (typeof game.settingsModal === 'function') game.settingsModal();
      else if (typeof game.settings === 'function') game.settings(); // 1.0 fallback
    } }, img('ui_gear', 2));
    this.el = h('div.hud', this.hpEl, this.coinEl, this.jarsEl, h('div.spacer'), this.seasonEl, this.deckBtn, this.gearBtn, this.keepsEl);
    this.update();
  }
  update() {
    const run = this.game.run;
    if (!run) return;
    const src = this.hpSource();
    this.hpEl.lastChild.textContent = `${Math.max(0, src.hp)}/${src.maxHp}`;
    this.coinEl.lastChild.textContent = run.coin;
    const s = season(run);
    this.seasonEl.textContent = SEASONS[s]?.title || s;
    this.deckBtn.lastChild.textContent = run.deck.length;
    this.hpEl.classList.toggle('low', src.hp > 0 && src.hp / src.maxHp <= 0.3);
    applySettings(getSettings(this.game));
    const jarsKey = run.preserves.join(',');
    if (this.jarsEl.dataset.k !== jarsKey) {
      this.jarsEl.dataset.k = jarsKey;
      this.jarsEl.innerHTML = '';
      run.preserves.forEach((id, i) => {
        const def = PRESERVES[id];
        const b = h('button.jar-slot.slot' + (def ? '' : '.empty'), { onclick: () => def && this.onJar(i) }, def ? img(def.jar, 2) : null);
        setTip(b, def ? `<b>${def.name}</b>${def.desc}` : '<b>Empty jar shelf</b>Preserves go here.');
        this.jarsEl.append(b);
      });
    }
    const kKey = run.keepsakes.join(',');
    if (this.keepsEl.dataset.k !== kKey) {
      this.keepsEl.dataset.k = kKey;
      this.keepsEl.innerHTML = '';
      for (const k of run.keepsakes) {
        const def = KEEPSAKES[k];
        if (!def) continue;
        const i = img(def.icon, 2);
        i.dataset.k = k;
        i.classList.add('has-tip');
        setTip(i, `<b>${def.name}</b>${def.desc}${def.flavor ? `<br><i style="color:#8a5a3b">${def.flavor}</i>` : ''}`);
        this.keepsEl.append(i);
      }
    }
  }
  flashKeepsake(id) {
    const el = this.keepsEl.querySelector(`[data-k="${id}"]`);
    if (!el) return;
    el.classList.remove('flash'); el.offsetWidth; el.classList.add('flash');
  }
}
