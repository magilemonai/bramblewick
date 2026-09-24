// Season end, the year's ending, defeat, the run summary (stats, score, share), unlock celebrations.
import { h, img, toast } from '../dom.js';
import { CARDS } from '../../data/cards.js';
import { KEEPSAKES } from '../../data/keepsakes.js';
import { SEASONS, ENDING, DEFEAT_LINES } from '../../data/story.js';
import { renderCard } from '../cardview.js';
import { D, E, SEASON_ORDER, charDef, charOf, scoreRun, shareText, share, fmt, seasonTitle, unlockState, spr } from './deps.js';

export const EndScreens = {
  async seasonEnd() {
    const run = this.run;
    const s = E.season(run);
    this.meta.bestSeason = Math.max(this.meta.bestSeason, run.seasonIdx);
    this.saveMeta();
    await this.celebrateUnlocks(this.unlockBaseline || unlockState(this.meta));
    this.unlockBaseline = unlockState(this.meta);
    const outro = SEASONS[s]?.outro || [];
    this.story(outro, () => {
      if (run.seasonIdx >= 3) { this.ending(); return; }
      run.seasonIdx++;
      run.seasonFights = 0;
      run.hp = run.maxHp;
      E.nextSeasonMap(run);
      this.save();
      this.seasonIntro();
    }, { dim: false, scene: { kind: 'victory' }, music: 'victory' });
  },

  ending() {
    this.recordEnd(true);
    E.clearRun();
    const cs = D.CHARACTER_STORY?.[charOf(this.run)];
    const slides = (!Array.isArray(cs) && cs?.ending) || ENDING;
    this.story(slides, () => this.summary(true), { dim: false, scene: { kind: 'victory', season: 'spring' }, music: 'victory' });
  },

  defeat() {
    this.recordEnd(false);
    E.clearRun();
    this.audio.sfx('defeat');
    this.haptic([40, 60, 40]);
    const line = DEFEAT_LINES[Math.floor(Math.random() * DEFEAT_LINES.length)] || 'You wake up at the farm.';
    this.story([{ speaker: 'almanac', text: line }], () => this.summary(false), { scene: { kind: 'defeat' }, music: 'defeat' });
  },

  // Meta bookkeeping at the end of a run (engine recordRunEnd: best season, wins, bosses, Harder Year
  // unlock, daily best). Idempotent per run.
  recordEnd(won) {
    const run = this.run;
    if (!run || run.ended || this.tempRun) return;
    run.ended = true;
    run.won = won;
    run.score = scoreRun(run);
    E.recordRunEnd(this.meta, run, won, run.score);
    this.meta.lastRun = { character: charOf(run), year: run.year || 0, score: run.score, won, season: run.seasonIdx, daily: run.daily || null };
    this.saveMeta();
  },

  async summary(won) {
    const run = this.run;
    const st = run.stats || {};
    const mins = Math.max(1, Math.round((Date.now() - (st.started || Date.now())) / 60000));
    const score = run.score ?? scoreRun(run);
    const text = shareText(run, score, won);
    const c = charDef(charOf(run));
    const notices = h('div.unlock-notes');
    const shareBtn = h('button.btn.gold', { onclick: async () => {
      const r = await share(text);
      toast(r === 'copied' ? 'Copied to your clipboard' : r === 'shared' ? 'Shared' : r === 'failed' ? 'Could not share' : 'Maybe later');
    } }, spr('ui_star', 2, 'ico'), 'Share');
    const row = (label, v) => [h('span', label), h('b', String(v))];
    const el = h('div.screen.summary', h('div.center', h('div.sheet.panel',
      h('div.summary-head', h('div.slot', spr([c.portrait, c.sprite, 'farmer'], 3)), h('div',
        h('h2', won ? 'The year turns' : 'Rest now'),
        h('small', [c.name, run.year ? `Harder Year ${run.year}` : null, run.daily ? `Daily ${run.dailyDate || ''}` : null].filter(Boolean).join(' · ')))),
      h('p', won ? 'Bramblewick wakes up. The kettle is on. Somewhere, a turnip is proud of you.' : `You made it to ${seasonTitle(SEASON_ORDER[run.seasonIdx])}. The valley will wait for you.`),
      h('div.score', h('small', 'Score'), h('b', fmt(score)), run.daily && this.meta.daily[run.dailyDate] > score ? h('small', `best today ${fmt(this.meta.daily[run.dailyDate])}`) : null),
      h('div.stats',
        row('Seasons reached', `${run.seasonIdx + 1} of 4`),
        row('Paths walked', run.floorsCleared || 0),
        row('Critters mended', st.mended || 0),
        row('Plants bloomed', st.blooms || 0),
        row('Cards played', st.cardsPlayed || 0),
        row('Gloam cracked', st.damage || 0),
        st.turns ? row('Turns taken', st.turns) : null,
        row('Deck size', run.deck.length),
        row('Coin in pocket', run.coin || 0),
        row('Time in the valley', `${mins} min`)),
      h('div.share-text', text),
      notices,
      h('div.choices',
        shareBtn,
        h('button.btn.green', { onclick: () => this.title() }, 'Back to the farmhouse')))));
    await this.show(el, { scene: { kind: won ? 'victory' : 'defeat' } });
    const news = await this.celebrateUnlocks(this.unlockBaseline || unlockState(this.meta));
    this.unlockBaseline = unlockState(this.meta);
    for (const n of news) notices.append(h('div.unlock-note.chip', spr(['ui_lock', 'ui_star'], 2, 'ico'), unlockLine(n)));
  },

  // One celebration modal. Resolves when dismissed.
  unlockModal(n) {
    this.stinger('unlock');
    this.audio.sfx('upgrade');
    this.haptic([15, 40, 15, 40]);
    return new Promise(res => {
      let body;
      if (n.kind === 'char') {
        const c = charDef(n.id);
        body = [h('div.unlock-art.slot', spr([c.portrait, c.sprite], 4)), h('h2', `${c.name} joins you`), h('p', c.blurb || ''), h('p', h('small', 'Choose them when you begin a new year.'))];
      } else if (n.kind === 'year') {
        const c = charDef(n.char);
        body = [h('div.unlock-art', spr(['ui_star', 'icon_star'], 5)), h('h2', `Harder Year ${n.n} unlocked`), h('p', `${c.name} can now take on Harder Year ${n.n}.`)];
      } else if (n.kind === 'cards') {
        body = [h('h2', n.ids.length === 1 ? 'A new card joins the pool' : `${n.ids.length} new cards join the pool`),
          h('div.card-row.unlock-cards', n.ids.slice(0, 3).map(id => renderCard({ id, u: false }, { className: 'big' }))),
          n.ids.length > 3 ? h('p', `and ${n.ids.length - 3} more in the Compendium`) : null];
      } else {
        body = [h('h2', 'New keepsakes in the valley'), h('div.keep-choices', n.ids.map(id => h('div.keep-choice', h('div.slot', img(KEEPSAKES[id].icon, 3)), h('span', h('b', KEEPSAKES[id].name), h('small', KEEPSAKES[id].desc)))))];
      }
      const m = h('div.modal.unlock', h('div.sheet.panel', h('small.unlock-kicker', 'Unlocked!'), ...body,
        h('div.choices', h('button.btn.green', { onclick: () => { m.remove(); res(); } }, 'Wonderful'))));
      this.overlay(m);
    });
  },
};

function unlockLine(n) {
  if (n.kind === 'char') return `${charDef(n.id).name} is now playable`;
  if (n.kind === 'year') return `Harder Year ${n.n} for ${charDef(n.char).name}`;
  if (n.kind === 'cards') return `New cards: ${n.ids.map(id => CARDS[id]?.name || id).join(', ')}`;
  return `New keepsakes: ${n.ids.map(id => KEEPSAKES[id]?.name || id).join(', ')}`;
}
