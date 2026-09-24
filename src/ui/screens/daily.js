// Daily Almanac: today's seeded run. Shows the two daily modifiers up front, one attempt per day
// (meta.daily[date]), and a share button once today's score is in.
import { h, toast } from '../dom.js';
import { D, E, characters, isUnlocked, dailyModsFor, todayStr, fmt, share, spr } from './deps.js';

export const DailyScreens = {
  dailyScreen() {
    const date = todayStr();
    const m = this.meta;
    const played = m.daily[date] != null;
    const mods = dailyModsFor(null, date);
    const last = m.lastRun?.daily === date ? m.lastRun : null;
    const modList = mods.length
      ? h('div.daily-mods', mods.map(md => h('div.daily-mod.chip', h('b', md.name), h('small', md.desc || ''))))
      : h('p.daily-none', 'No special rules today. Just the valley, same for everyone.');
    const unlockedChars = Object.entries(characters()).filter(([, c]) => isUnlocked(c, m)).map(([id]) => id);
    const saved = E.loadRun();
    const inProgress = saved && saved.dailyDate === date;
    const start = () => { this.stinger('daily'); return unlockedChars.length > 1 ? this.characterSelect({ daily: date }) : this.newGame({ character: unlockedChars[0] || 'farmer', year: 0, daily: date }); };
    const begin = () => (saved ? this.confirm("Start today's Almanac? Your current year will be lost.", start) : start());
    let foot;
    if (inProgress) {
      foot = h('div.choices', h('button.btn.gold', { onclick: () => this.continueRun(saved) }, "Continue today's Almanac"), h('button.btn', { onclick: () => this.title() }, 'Back'));
    } else if (!played) {
      foot = h('div.choices', h('button.btn.green', { onclick: begin }, "Begin today's Almanac"), h('button.btn', { onclick: () => this.title() }, 'Back'));
    } else {
      const score = m.daily[date];
      const text = last ? `Bramblewick Daily ${date} · ${fmt(score)} pts · ${last.won ? 'mended the whole year' : `reached ${['Spring', 'Summer', 'Fall', 'Winter'][last.season] || 'Spring'}`} with ${(characters()[last.character]?.name || 'the Farmer').replace(/^The /, 'the ')}` : `Bramblewick Daily ${date} · ${fmt(score)} pts`;
      foot = h('div.choices',
        h('div.score', h('small', "Today's score"), h('b', fmt(score))),
        h('div.share-text', text),
        h('button.btn.gold', { onclick: async () => { const r = await share(text); toast(r === 'copied' ? 'Copied to your clipboard' : r === 'shared' ? 'Shared' : 'Maybe later'); } }, 'Share'),
        h('p.daily-next', 'A fresh page turns at midnight.'),
        h('button.btn', { onclick: () => this.title() }, 'Back'));
    }
    const history = Object.entries(m.daily).filter(([d]) => d !== date).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5);
    const el = h('div.screen.daily', h('div.center', h('div.sheet.panel',
      h('div.event-head', h('div.portrait.slot', spr(['ui_calendar', 'almanac'], 3)), h('div', h('h2', 'Daily Almanac'), h('small.daily-date', date))),
      h('p', inProgress ? 'Your page for today is still open. Pick up where you left off.' : played ? 'You have walked today\'s page. Same seed for everyone, one try a day.' : 'Everyone in the valley gets the same year today: same map, same critters, same luck. One try. Today the Almanac adds:'),
      played && !inProgress ? null : modList,
      foot,
      history.length ? h('div.daily-history', h('small', 'Recent days'), ...history.map(([d, s]) => h('div', h('span', d), h('b', fmt(s))))) : null)));
    this.show(el, { scene: { kind: 'title', season: this.titleSeason || 'spring', dusk: true }, music: 'title' });
    if (!played && !D.DAILY_MODS.length) console.warn('[meta] DAILY_MODS missing: daily runs have no modifiers');
  },
};

