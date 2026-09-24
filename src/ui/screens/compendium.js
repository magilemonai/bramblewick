// Compendium: Cards (seen vs silhouette, filter by character), Critters (mended ones in full, unmet as
// silhouettes), Keepsakes, Villagers (friendship hearts + greeting by tier).
import { h, img } from '../dom.js';
import * as CV from '../cardview.js';

const { renderCard, cardName } = CV;
import { CARDS } from '../../data/cards.js';
import { ENEMIES } from '../../data/enemies.js';
import { KEEPSAKES } from '../../data/keepsakes.js';
import { VILLAGERS } from '../../data/story.js';
import { SEASON_ORDER, characters, isUnlocked, unlockHint, tierOf, seasonTitle, spr } from './deps.js';
import { heartsEl } from './events.js';

const CARD_RARITIES = ['starter', 'common', 'uncommon', 'rare'];
const RAR_ORDER = { starter: 0, common: 1, uncommon: 2, rare: 3 };
const TYPE_ORDER = { tool: 0, tend: 1, seed: 2, charm: 3, gloom: 4 };
const TIER_ORDER = { normal: 0, elite: 1, boss: 2 };

export const CompendiumScreens = {
  compendium(tab = 'cards') {
    const m = this.meta;
    const tabs = [['cards', 'Cards'], ['critters', 'Critters'], ['keepsakes', 'Keepsakes'], ['villagers', 'Villagers']];
    const body = h('div.comp-body');
    const tabBar = h('div.comp-tabs', { role: 'tablist' });
    let cardFilter = 'all';
    const select = t => {
      tab = t;
      tabBar.replaceChildren(...tabs.map(([id, label]) => h(`button.comp-tab${id === tab ? '.on' : ''}`, { role: 'tab', 'aria-selected': String(id === tab), onclick: () => { this.audio.sfx('page_turn', { vol: 0.4 }); select(id); } }, label)));
      body.replaceChildren(...[].concat(this[`comp_${tab}`](m, { cardFilter, setFilter: f => { cardFilter = f; select('cards'); } })));
      body.scrollTop = 0;
    };
    select(tab);
    const el = h('div.screen.compendium',
      h('div.comp-head', h('button.btn.small', { onclick: () => this.title() }, '‹ Back'), h('h2', spr(['ui_book', 'icon_book'], 2, 'ico'), 'Compendium')),
      tabBar, body);
    this.show(el, { scene: { kind: 'title', season: this.titleSeason || 'spring', dusk: true } });
  },

  comp_cards(m, { cardFilter, setFilter }) {
    const seen = new Set(m.seen.cards);
    const chars = Object.entries(characters());
    const all = Object.entries(CARDS).filter(([, d]) => CARD_RARITIES.includes(d.rarity))
      .filter(([, d]) => cardFilter === 'all' || (cardFilter === 'shared' ? !d.pool : d.pool === cardFilter))
      .sort(([, a], [, b]) => (RAR_ORDER[a.rarity] - RAR_ORDER[b.rarity]) || (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || a.name.localeCompare(b.name));
    const count = all.filter(([id]) => seen.has(id)).length;
    const filters = [['all', 'All'], ...chars.map(([id, c]) => [id, c.name.replace(/^The /, '')]), ['shared', 'Shared']];
    const bar = h('div.comp-filters', filters.map(([id, label]) => h(`button.chip-btn${id === cardFilter ? '.on' : ''}`, { onclick: () => setFilter(id) }, label)));
    const row = h('div.card-row.comp-cards');
    for (const [id, d] of all) {
      const inst = { id, u: false };
      if (seen.has(id)) {
        const c = renderCard(inst);
        c.addEventListener('click', () => (CV.inspectCard ? CV.inspectCard(inst) : this.cardDetail(inst)));
        row.append(c);
      } else {
        const c = renderCard(inst, { className: 'silhouette' });
        const locked = d.unlock && !isUnlocked(d, m);
        c.setAttribute('aria-label', locked ? unlockHint(d) : 'Not yet found');
        c.append(h('div.sil-label', locked ? spr('ui_lock', 2) : null, locked ? unlockHint(d) : '?'));
        row.append(c);
      }
    }
    return [h('div.comp-count', `${count} of ${all.length} found`), bar, row];
  },

  cardDetail(inst) {
    const m = h('div.modal', h('h2', cardName(inst)), h('div.card-row', renderCard(inst, { className: 'big' }), renderCard({ ...inst, u: true }, { className: 'big' })),
      CARDS[inst.id]?.flavor ? h('p.flavor-line', CARDS[inst.id].flavor) : null,
      h('button.btn.green', { onclick: () => m.remove() }, 'Close'));
    m.addEventListener('click', e => { if (e.target === m) m.remove(); });
    this.overlay(m);
  },

  comp_critters(m) {
    const met = new Set(m.seen.enemies);
    const out = [];
    const total = Object.keys(ENEMIES).length;
    out.push(h('div.comp-count', `${Object.keys(ENEMIES).filter(id => met.has(id)).length} of ${total} mended`));
    for (const s of SEASON_ORDER) {
      const list = Object.entries(ENEMIES).filter(([, e]) => e.season === s).sort(([, a], [, b]) => (TIER_ORDER[a.tier] ?? 0) - (TIER_ORDER[b.tier] ?? 0) || a.name.localeCompare(b.name));
      if (!list.length) continue;
      out.push(h('h3.comp-season', seasonTitle(s)));
      out.push(h('div.critter-grid', list.map(([id, e]) => {
        const known = met.has(id);
        const card = h(`div.critter.panel${known ? '' : '.unknown'}${e.tier === 'boss' ? '.boss' : e.tier === 'elite' ? '.elite' : ''}`,
          h('div.critter-sprite', spr([e.sprite], e.tier === 'boss' ? 2 : 3, known ? '' : 'silhouette')),
          h('div.critter-info',
            h('b', known ? e.name : '???'),
            h('small.tier', e.tier === 'boss' ? 'Season keeper' : e.tier === 'elite' ? 'Thicket elite' : 'Critter'),
            known && e.flavor ? h('p.flavor', e.flavor) : null,
            known && e.mendText ? h('p.mend', e.mendText) : null,
            known ? null : h('p.flavor', 'Not yet mended.')));
        return card;
      })));
    }
    return out;
  },

  comp_keepsakes(m) {
    const seen = new Set(m.seen.keepsakes);
    const all = Object.entries(KEEPSAKES).sort(([, a], [, b]) => a.name.localeCompare(b.name));
    return [h('div.comp-count', `${all.filter(([id]) => seen.has(id)).length} of ${all.length} found`),
      h('div.keep-grid', all.map(([id, d]) => {
        const known = seen.has(id);
        const locked = d.unlock && !isUnlocked(d, m);
        return h(`div.keep-entry.chip${known ? '' : '.unknown'}`,
          h('div.slot', img(d.icon, 3, known ? '' : 'silhouette')),
          h('div', h('b', known ? d.name : '???'),
            h('small', known ? d.desc : locked ? unlockHint(d) : 'Not yet found.'),
            known && d.flavor ? h('small.flavor', d.flavor) : null));
      }))];
  },

  comp_villagers(m) {
    return [h('div.vil-list', Object.entries(VILLAGERS).map(([id, v]) => {
      const f = m.friendship[id] || 0;
      const t = tierOf(f);
      const greet = Array.isArray(v.greeting) ? v.greeting[Math.min(t, v.greeting.length - 1)] : v.greeting;
      return h('div.vil-entry.panel',
        h('div.slot.vil-portrait', img(v.sprite, 3)),
        h('div', h('b', v.name), heartsEl(f), h('small.role', v.role || ''), greet ? h('p.greet', greet) : null,
          t < 3 ? h('small.next', `${[2, 4, 7][t] - f} more to the next heart`) : h('small.next', 'Dear friends.')));
    }))];
  },
};
