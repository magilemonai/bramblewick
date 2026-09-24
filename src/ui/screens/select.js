// Character select: portraits, blurb, HP, starter keepsake, Harder Years per character (sequential).
// Also newGame(): builds the 2.0 run, then intro -> first-run tutorial -> season intro -> map.
import { h, img } from '../dom.js';
import { KEEPSAKES } from '../../data/keepsakes.js';
import { INTRO } from '../../data/story.js';
import { D, E, characters, charDef, isUnlocked, unlockHint, yearDef, MAX_YEAR, markSeen, spr, unlockState } from './deps.js';

export const SelectScreens = {
  characterSelect({ daily = null } = {}) {
    const ids = Object.keys(characters());
    let pick = this.meta.lastCharacter && ids.includes(this.meta.lastCharacter) && isUnlocked(charDef(this.meta.lastCharacter), this.meta) ? this.meta.lastCharacter : ids[0];
    const years = {};
    for (const id of ids) years[id] = Math.min(this.meta.lastYear?.[id] ?? 0, this.maxYear(id));

    const cardsEl = h('div.char-list');
    const yearsEl = h('div.years');
    const beginBtn = h('button.btn.green.begin', { onclick: () => this.newGame({ character: pick, year: daily ? 0 : years[pick], daily }) }, 'Begin');
    // The select scene has two rugs (scenery.spots); stand each character on one, behind the UI.
    const stage = h('div.select-stage');
    const placeStage = () => {
      const spots = this.scenery?.spots;
      if (!spots?.length) { stage.replaceChildren(); return; }
      const scale = innerWidth >= 820 && innerHeight > 500 ? 4 : 3;
      stage.replaceChildren(...ids.slice(0, spots.length).map((id, i) => {
        const c = charDef(id);
        const open = isUnlocked(c, this.meta);
        const im = spr([c.sprite, 'farmer'], scale, open ? '' : 'silhouette');
        const el = h(`button.stand${id === pick ? '.on' : ''}${open ? '' : '.locked'}`, { 'aria-label': open ? c.name : 'Locked', style: { left: spots[i].x + 'px', top: spots[i].y + 'px' },
          onclick: () => { if (open) { pick = id; this.audio.sfx('page_turn', { vol: 0.5 }); render(); } } }, im);
        return el;
      }));
    };
    const render = () => {
      placeStage();
      cardsEl.replaceChildren(...ids.map(id => this.charCard(id, id === pick, () => { if (isUnlocked(charDef(id), this.meta)) { pick = id; this.audio.sfx('page_turn', { vol: 0.5 }); render(); } })));
      if (!daily) this.renderYears(yearsEl, pick, years, render);
      beginBtn.textContent = daily ? `Begin today's Almanac as ${charDef(pick).name.replace(/^The /, 'the ')}` : `Begin as ${charDef(pick).name.replace(/^The /, 'the ')}`;
      document.documentElement.style.setProperty('--pick', charDef(pick).color || '#6fae4a');
    };
    render();
    const back = h('button.btn.small', { onclick: () => (daily ? this.dailyScreen() : this.title()) }, '‹ Back');
    const el = h('div.screen.select', stage,
      h('div.select-head', back, h('h2', daily ? 'Who walks the valley today?' : 'Who tends Bramblewick this year?')),
      h('div.select-body', cardsEl, daily ? null : yearsEl),
      h('div.select-foot', beginBtn));
    const onResize = () => placeStage();
    addEventListener('resize', onResize);
    this.show(el, { scene: { kind: 'select', season: this.titleSeason || 'spring' }, music: this.track('select', 'title'), view: { destroy: () => removeEventListener('resize', onResize) } })
      .then(() => requestAnimationFrame(placeStage));
  },

  maxYear(id) { return Math.max(0, Math.min(MAX_YEAR, this.meta.yearsUnlocked?.[id] || 0)); },

  charCard(id, selected, onpick) {
    const c = charDef(id);
    const open = isUnlocked(c, this.meta);
    const ks = KEEPSAKES[c.starterKeepsake];
    const portrait = spr([c.portrait, c.sprite, 'farmer'], 3, open ? '' : 'silhouette');
    const body = open
      ? h('div.char-info',
          h('h3', c.name),
          h('p.blurb', c.blurb || ''),
          h('div.char-stats', h('span', img('ui_heart', 2), `${c.hp} Heart`), h('span', `${(c.starterDeck || []).length} cards`)),
          ks ? h('div.char-keep', img(ks.icon, 2), h('span', h('b', ks.name), ' ', ks.desc)) : null)
      : h('div.char-info', h('h3', '???'), h('p.blurb.locked', spr('ui_lock', 2, 'ico'), unlockHint(c)));
    return h(`button.char-card${selected ? '.selected' : ''}${open ? '' : '.locked'}`, { style: { '--c': c.color || '#6fae4a' }, onclick: onpick, disabled: !open },
      h('div.char-portrait.slot', portrait), body);
  },

  renderYears(el, id, years, rerender) {
    const max = this.maxYear(id);
    const cur = years[id];
    const chips = [];
    for (let n = 0; n <= MAX_YEAR; n++) {
      const locked = n > max;
      chips.push(h(`button.year-chip${n === cur ? '.on' : ''}${locked ? '.locked' : ''}`, {
        disabled: locked, 'aria-label': n ? `Harder Year ${n}` : 'First Year',
        onclick: () => { years[id] = n; rerender(); },
      }, String(n)));
    }
    const y = yearDef(cur);
    const desc = cur === 0 ? 'The valley as Nana knew it.' : y ? `${y.name ? y.name + '. ' : ''}${y.desc || ''}` : `Harder Year ${cur}.`;
    const next = max < MAX_YEAR ? `Finish a year with ${charDef(id).name.replace(/^The /, 'the ')} to unlock Year ${max + 1}.` : 'Every Harder Year is open.';
    el.replaceChildren(
      h('div.years-head', spr(['ui_star', 'icon_star'], 2, 'ico'), h('b', cur ? `Harder Year ${cur}` : 'First Year'), h('small', ` · ${max} of ${MAX_YEAR} unlocked`)),
      h('div.year-chips', chips),
      h('p.year-desc', desc),
      h('p.year-next', next));
  },

  newGame({ character = 'farmer', year = 0, daily = null } = {}) {
    E.clearRun();
    const run = E.newRun({ character, year, daily, meta: this.meta });
    if (run.daily) run.dailyDate = run.daily;
    this.run = run;
    this.tempRun = false;
    this.unlockBaseline = unlockState(this.meta);
    for (const k of run.keepsakes || []) this.applyKeepsakeGain(k, true);
    E.recordRunStart(this.meta);
    this.meta.lastCharacter = character;
    this.meta.lastYear = { ...(this.meta.lastYear || {}), [character]: year };
    if (daily) this.meta.daily[run.dailyDate] = this.meta.daily[run.dailyDate] ?? 0; // the attempt is spent
    markSeen(this.meta, 'cards', run.deck.map(c => c.id));
    markSeen(this.meta, 'keepsakes', run.keepsakes);
    this.saveMeta();
    this.save();
    const cs = D.CHARACTER_STORY?.[character];
    const intro = Array.isArray(cs) ? cs : cs?.intro || INTRO;
    this.story(intro, () => this.afterIntro(), { scene: { kind: 'title', season: 'spring', dusk: true } });
  },

  afterIntro() {
    const firstRun = !this.meta.tutorialDone && D.TUTORIAL && !this.run.daily;
    if (!firstRun) { this.seasonIntro(); return; }
    const m = h('div.modal', h('div.sheet.panel',
      h('div.event-head', h('div.portrait.slot', img('almanac', 3)), h('div', h('h2', 'A practice patch?'),
        h('p', '"Before the Gloam gets a vote, shall I walk you through one friendly scuffle? Takes a minute. I will narrate. I love narrating."'))),
      h('div.choices',
        h('button.btn.green', { onclick: () => { m.remove(); this.tutorialFight({ then: () => this.seasonIntro() }); } }, 'Show me the ropes'),
        h('button.btn', { onclick: () => { m.remove(); this.meta.tutorialDone = true; this.saveMeta(); this.seasonIntro(); } }, 'Skip, I know my way around'))));
    this.overlay(m);
  },
};
