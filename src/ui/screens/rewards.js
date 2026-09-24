// Rewards, card/keepsake pickers, deck operations, jars, unlock celebrations. Reward rules live in
// engine/rewards.js; this module presents them.
import { h, img, toast, setTip } from '../dom.js';
import { Hud } from '../hud.js';
import * as CV from '../cardview.js';

const { renderCard, cardName } = CV;
// Long-press / right-click inspect from the combat-UI seat, when present.
const inspectable = (el, inst) => { CV.attachInspect?.(el, () => inst); return el; };
import { CARDS } from '../../data/cards.js';
import { KEEPSAKES } from '../../data/keepsakes.js';
import { PRESERVES } from '../../data/preserves.js';
import { E, markSeen, unlockState } from './deps.js';

export const RewardScreens = {
  // ---------- pools (engine/rewards.js: character pool + unlocks; dailies ignore unlocks) ----------
  cardChoices(kind, n = 3, rarity = null, filter = null) {
    return this.offer(E.cardChoices(this.run, kind, { n, rarity, filter, extra: n >= 3 }));
  },
  offer(insts) { if (markSeen(this.meta, 'cards', insts.map(i => i.id))) this.saveMeta(); return insts; },
  randomKeepsake(rarities, exclude = []) { return E.randomKeepsake(this.run, rarities, exclude); },

  // ---------- pickers ----------
  // Card choice with a "see upgraded" toggle. Resolves with the chosen instance (never upgraded) or null.
  chooseCard(title, choices, { skip = true } = {}) {
    return new Promise(res => {
      let up = false;
      const row = h('div.card-row');
      const draw = () => {
        row.replaceChildren(...choices.map(inst => {
          const shown = up ? { ...inst, u: true } : inst;
          const c = inspectable(renderCard(shown, { className: 'big' }), shown);
          c.addEventListener('click', () => { m.remove(); this.audio.sfx('page_turn'); res(inst); });
          return c;
        }));
      };
      const toggle = h('button.btn.small.upgrade-toggle', { 'aria-pressed': 'false', onclick: () => { up = !up; toggle.classList.toggle('on', up); toggle.setAttribute('aria-pressed', String(up)); toggle.textContent = up ? 'Showing upgraded' : 'See upgraded'; draw(); } }, 'See upgraded');
      const m = h('div.modal.choose-card', h('h2', title), toggle, h('div.scroll', row),
        skip ? h('button.btn', { onclick: () => { m.remove(); res(null); } }, 'Skip') : null);
      draw();
      if (!choices.length) row.append(h('p', { style: { color: '#fff4d6' } }, 'Nothing to choose from.'));
      this.overlay(m);
    });
  },
  chooseKeepsake(opts, { title = 'Choose one keepsake', skip = true } = {}) {
    markSeen(this.meta, 'keepsakes', opts);
    this.saveMeta();
    return new Promise(res => {
      const list = h('div.keep-choices');
      const m = h('div.modal', h('h2', title), h('div.sheet.panel', list), skip ? h('button.btn', { onclick: () => { m.remove(); res(false); } }, 'Skip') : null);
      for (const id of opts) {
        const d = KEEPSAKES[id];
        list.append(h('button.btn.keep-choice', { onclick: () => { m.remove(); this.gainKeepsake(id); res(true); } },
          h('div.slot', img(d.icon, 3)),
          h('span', h('b', d.name), h('small', d.desc), d.flavor ? h('small.flavor', d.flavor) : null)));
      }
      this.overlay(m);
    });
  },

  // ---------- gains ----------
  addCardToDeck(inst) {
    this.run.deck.push({ id: inst.id, u: !!inst.u, uid: E.uid() });
    markSeen(this.meta, 'cards', inst.id);
    toast(`${cardName(inst)} added to your deck`);
  },
  // Keepsake gain effects (mods.maxHp, pickup()) via the engine. `already` = it is in run.keepsakes.
  applyKeepsakeGain(id, silent = false) {
    if (!KEEPSAKES[id]) return;
    E.gainKeepsake(this.run, id, this.evApi(), { already: true });
    if (!silent) { this.audio.sfx('buy'); toast(`Keepsake: ${KEEPSAKES[id].name}`); }
  },
  gainKeepsake(id) {
    if (!KEEPSAKES[id] || this.run.keepsakes.includes(id)) return;
    this.run.keepsakes.push(id);
    markSeen(this.meta, 'keepsakes', id);
    this.saveMeta();
    this.applyKeepsakeGain(id);
  },
  gainPreserve(id) {
    const i = this.run.preserves.indexOf(null);
    if (i < 0 || !PRESERVES[id]) { toast('Your jar shelf is full'); return false; }
    this.run.preserves[i] = id;
    this.audio.sfx('open');
    return true;
  },
  jarModal(slot, onUse) {
    const id = this.run.preserves[slot];
    const d = PRESERVES[id];
    if (!d) return;
    const m = h('div.modal', h('div.sheet.panel',
      h('div.event-head', h('div.portrait.slot', img(d.jar, 3)), h('div', h('h2', d.name), h('p', d.desc))),
      h('div.choices',
        onUse ? h('button.btn.green', { onclick: () => { m.remove(); onUse(); } }, 'Open the jar') : null,
        h('button.btn', { onclick: () => { m.remove(); this.run.preserves[slot] = null; this.view?.hud?.update?.(); this.view?.sync?.(); this.save(); toast('Tossed it'); } }, 'Toss it'),
        h('button.btn', { onclick: () => m.remove() }, 'Keep it'))));
    this.overlay(m);
  },

  // ---------- deck ----------
  showPile(title, list, sorted = false) {
    const items = sorted ? [...list].sort((a, b) => (CARDS[a.id]?.name || '').localeCompare(CARDS[b.id]?.name || '')) : list;
    const row = h('div.card-row');
    for (const inst of items) row.append(inspectable(renderCard(inst), inst));
    const m = h('div.modal', h('h2', `${title} (${list.length})`), h('div.scroll', row), h('button.btn.green', { onclick: () => m.remove() }, 'Close'));
    if (!items.length) row.append(h('p', { style: { color: '#fff4d6' } }, 'Nothing here.'));
    this.overlay(m);
  },
  pickFromDeck(title, filter = () => true, preview = null) {
    return new Promise(res => {
      const row = h('div.card-row');
      const cards = this.run.deck.filter(filter);
      const m = h('div.modal', h('h2', title), h('div.scroll', row), h('button.btn', { onclick: () => { m.remove(); res(null); } }, 'Cancel'));
      if (!cards.length) row.append(h('p', { style: { color: '#fff4d6' } }, 'No cards qualify.'));
      for (const inst of cards) {
        const c = inspectable(renderCard(inst), inst);
        c.addEventListener('click', () => {
          if (!preview) { m.remove(); res(inst); return; }
          const after = preview(inst);
          const cm = h('div.modal', h('h2', 'Like this?'), h('div.card-row', renderCard(inst, { className: 'big' }), renderCard(after, { className: 'big' })),
            h('div.row', h('button.btn.green', { onclick: () => { cm.remove(); m.remove(); res(inst); } }, 'Yes'), h('button.btn', { onclick: () => cm.remove() }, 'Back')));
          this.overlay(cm);
        });
        row.append(c);
      }
      this.overlay(m);
    });
  },
  async upgradeCard() {
    const inst = await this.pickFromDeck('Cook up an upgrade', i => !i.u && CARDS[i.id] && CARDS[i.id].type !== 'gloom', i => ({ ...i, u: true }));
    if (!inst) return false;
    inst.u = true;
    this.audio.sfx('upgrade');
    toast(`${cardName(inst)}!`);
    return true;
  },
  async removeCard(title = 'Remove a card from your deck') {
    const inst = await this.pickFromDeck(title);
    if (!inst) return false;
    this.run.deck.splice(this.run.deck.indexOf(inst), 1);
    toast(`${cardName(inst)} removed`);
    return true;
  },
  async transformCard() {
    const inst = await this.pickFromDeck('Transform a card');
    if (!inst) return false;
    const nid = E.transformTarget(this.run, inst);
    const i = this.run.deck.indexOf(inst);
    if (nid && i >= 0) { this.run.deck[i] = { id: nid, u: false, uid: E.uid() }; markSeen(this.meta, 'cards', nid); }
    toast(`${cardName(inst)} became ${nid ? cardName({ id: nid }) : 'compost'}`);
    return true;
  },

  // ---------- the rewards screen ----------
  async rewards(kind) {
    const run = this.run;
    const R = E.rollRewards(run, kind);
    const items = [];
    items.push({ icon: 'ui_coin', label: `${R.coin} coin`, take: () => { run.coin += R.coin; this.audio.sfx('coin'); } });
    const choices = this.offer(R.cards || []);
    items.push({ icon: 'icon_seed_pouch', label: 'Choose a card', tip: kind === 'boss' ? 'A rare one' : null, keep: true, take: async () => {
      const pick = await this.chooseCard('Choose a card for your deck', choices);
      if (pick) { this.addCardToDeck(pick); return true; }
      return false;
    } });
    if (R.preserve && PRESERVES[R.preserve]) {
      const d = PRESERVES[R.preserve];
      items.push({ icon: d.jar, label: d.name, tip: d.desc, take: () => this.gainPreserve(R.preserve) });
    }
    if (R.keepsake && KEEPSAKES[R.keepsake]) {
      const d = KEEPSAKES[R.keepsake];
      markSeen(this.meta, 'keepsakes', R.keepsake);
      items.push({ icon: d.icon, label: d.name, tip: d.desc, take: () => this.gainKeepsake(R.keepsake) });
    }
    if (R.keepsakeChoices?.length) {
      items.push({ icon: 'ks_nana_locket', label: 'Choose a keepsake', tip: `${R.keepsakeChoices.length} to pick from`, keep: true, take: () => this.chooseKeepsake(R.keepsakeChoices) });
    }
    this.saveMeta();
    await new Promise(res => {
      const hud = new Hud(this);
      const list = h('div.reward-list');
      for (const it of items) {
        const b = h('button.btn', img(it.icon, 2), h('span', it.label, it.tip ? h('small', { style: { display: 'block', fontSize: '12px', fontWeight: 400 } }, it.tip) : null));
        if (it.tip) setTip(b, `<b>${it.label}</b>${it.tip}`);
        b.addEventListener('click', async () => {
          const r = await it.take();
          if (!it.keep || r) b.remove();
          hud.update();
          this.save();
        });
        list.append(b);
      }
      this.show(h('div.screen.rewards', hud.el, h('div.center', h('div.sheet.panel',
        h('h2', kind === 'boss' ? 'The season keeper is mended' : 'The critters trundle home'), list,
        h('div.choices', h('button.btn.green', { onclick: res }, 'Continue'))))), { scene: { kind: 'victory' }, cover: false });
    });
  },

  // ---------- unlock celebrations ----------
  // Compare against a snapshot from unlockState(meta); show anything new with the unlock stinger.
  async celebrateUnlocks(before) {
    const after = unlockState(this.meta);
    const news = [];
    for (const id of after.chars) if (!before.chars.includes(id)) news.push({ kind: 'char', id });
    for (const [c, n] of Object.entries(after.years)) if ((n || 0) > (before.years[c] || 0)) news.push({ kind: 'year', char: c, n });
    const cards = after.cards.filter(id => !before.cards.includes(id));
    const keeps = after.keeps.filter(id => !before.keeps.includes(id));
    if (cards.length) news.push({ kind: 'cards', ids: cards });
    if (keeps.length) news.push({ kind: 'keeps', ids: keeps });
    for (const n of news) await this.unlockModal(n);
    return news;
  },
};
