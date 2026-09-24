// Title screen: seasonal backdrop (furthest season reached), Continue (resumes mid-fight), New Year,
// Daily Almanac, Compendium, How to play.
import { h, img } from '../dom.js';
import { TIPS, SEASONS } from '../../data/story.js';
import { E, SEASON_ORDER, charDef, charOf, seasonTitle, todayStr, fmt, spr } from './deps.js';

export const TitleScreens = {
  title() {
    this.run = null;
    this.tempRun = false;
    this.battleCtx = null;
    const m = this.meta;
    const best = Math.max(0, Math.min(3, m.bestSeason));
    this.titleSeason = SEASON_ORDER[best];
    document.documentElement.style.setProperty('--season', SEASONS[this.titleSeason]?.color || '#6fae4a');
    const saved = E.loadRun();
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    const today = todayStr();
    const dailyDone = m.daily[today] != null && !(saved?.daily && (saved.dailyDate || saved.daily) === today);

    let contLabel = null;
    if (saved) {
      const who = charDef(charOf(saved)).name;
      const where = seasonTitle(SEASON_ORDER[saved.seasonIdx]) || '';
      contLabel = h('span', 'Continue', h('small', `${who} · ${where}${saved.combat ? ' · mid-fight' : ''}${saved.daily ? ' · Daily' : ''}`));
    }
    const menu = h('div.menu',
      saved ? h('button.btn.gold.stacked', { onclick: () => this.continueRun(saved) }, contLabel) : null,
      h('button.btn.green', { onclick: () => (saved ? this.confirm('Start a new year? Your current one will be lost.', () => this.characterSelect()) : this.characterSelect()) }, 'Begin a New Year'),
      h('button.btn.stacked', { onclick: () => this.dailyScreen() },
        h('span', spr(['ui_calendar', 'icon_scroll'], 2, 'ico'), 'Daily Almanac'),
        h('small', dailyDone ? `Today: ${fmt(m.daily[today])} pts` : 'One try a day, same seed for everyone')),
      h('div.menu-row',
        h('button.btn', { onclick: () => this.compendium() }, spr(['ui_book', 'icon_book'], 2, 'ico'), 'Compendium'),
        h('button.btn', { onclick: () => this.howTo() }, 'How to Play')),
    );
    const rec = m.runs ? h('div.records', `Years begun: ${m.runs} · Years completed: ${m.wins}${m.bestSeason >= 0 ? ` · Furthest: ${seasonTitle(SEASON_ORDER[best])}` : ''}`) : null;
    const gear = h('button.icon-btn.corner', { 'aria-label': 'Settings', onclick: () => this.settingsModal() }, img('ui_gear', 2));
    const el = h(`div.screen.title.meta-title.season-${this.titleSeason}`,
      gear,
      h('div.logo', h('h1', 'Bramblewick'), h('p', m.bestSeason >= 0 ? `${seasonTitle(this.titleSeason)} in the valley` : 'a deckbuilding year in the valley')),
      h('div.title-mid', menu, rec),
      tip ? h('div.tip.panel', img('almanac', 3), h('div', tip)) : null,
    );
    this.show(el, { scene: { kind: 'title', season: this.titleSeason }, music: 'title', type: 'page' });
  },

  howTo() {
    this.story([
      { speaker: 'almanac', text: 'Cards cost Stamina. You get 3 each turn and draw 5 cards. Tools hit, Tend cards protect, Charms stay with you all fight.' },
      { speaker: 'almanac', text: 'Seed cards plant into your garden plots. Each turn the weather grows them. Rain grows fast; drought and frost stall.' },
      { speaker: 'almanac', text: 'When a plant is fully grown it Blooms, and its effect goes off by itself. Plan ahead: a turnip planted now is a wallop later.' },
      { speaker: 'almanac', text: 'Watch the little icons over each critter. That is what it will do next. Some will trample your garden. Rude, but honest.' },
      { speaker: 'almanac', text: 'Bark blocks damage until your next turn. Drag a card onto a critter, or tap it and then tap the critter. Off you go.' },
    ], () => this.title());
  },
};
