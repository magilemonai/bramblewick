// Story slides (typewriter dialog) and the season title card.
import { h } from '../dom.js';
import { SEASONS, VILLAGERS } from '../../data/story.js';
import { E, charDef, charOf, spr } from './deps.js';

export const StoryScreens = {
  seasonColor() { return SEASONS[this.run ? E.season(this.run) : this.titleSeason || 'spring']?.color || '#6fae4a'; },

  speakerOf(sp) {
    if (!sp) return null;
    if (sp === 'almanac') return { name: 'The Almanac', sprite: 'almanac' };
    if (sp === 'player' || sp === 'you') { const c = charDef(charOf(this.run)); return { name: c.name, sprite: c.portrait || c.sprite }; }
    if (VILLAGERS[sp]) return { name: VILLAGERS[sp].name, sprite: VILLAGERS[sp].sprite };
    if (sp === 'farmer') { const c = charDef('farmer'); return { name: c.name, sprite: c.portrait || c.sprite }; }
    return { name: sp, sprite: null };
  },

  story(slides, done, { dim = true, scene, music } = {}) {
    slides = (slides || []).filter(s => s && s.text);
    if (!slides.length) { done(); return; }
    let i = 0;
    const portrait = h('div.portrait');
    const who = h('div.who');
    const text = h('div.text');
    const more = h('div.more', 'tap ▸');
    const skip = slides.length > 2 ? h('button.btn.small.story-skip', { onclick: e => { e.stopPropagation(); finish(); } }, 'Skip ▸▸') : null;
    const box = h('div.dialog.panel', portrait, h('div', { style: { flex: 1 } }, who, text, more));
    const el = h('div.screen.story', { style: dim ? {} : { background: 'none' } }, skip, box);
    let typing = null, finished = false;
    const finish = () => { if (finished) return; finished = true; clearInterval(typing); done(); };
    const render = () => {
      const s = slides[i];
      const sp = this.speakerOf(s.speaker);
      portrait.innerHTML = '';
      const pimg = sp?.sprite ? spr(sp.sprite, 3) : null;
      portrait.style.display = pimg ? '' : 'none';
      if (pimg) portrait.append(pimg);
      who.textContent = sp?.name || '';
      who.style.display = who.textContent ? '' : 'none';
      const full = s.text;
      clearInterval(typing);
      text.dataset.full = full;
      if (this.settings.reducedMotion) { text.textContent = full; typing = null; }
      else {
        let n = 0;
        text.textContent = '';
        typing = setInterval(() => {
          n += 2 * this.settings.speed;
          text.textContent = full.slice(0, n);
          if (n >= full.length) { clearInterval(typing); typing = null; }
        }, 18);
      }
      more.textContent = i < slides.length - 1 ? 'tap ▸' : 'tap to continue ▸';
    };
    el.addEventListener('click', () => {
      if (finished) return;
      if (typing) { clearInterval(typing); typing = null; text.textContent = text.dataset.full; return; }
      i++;
      this.audio.sfx('page_turn', { vol: 0.5 });
      if (i >= slides.length) { finish(); return; }
      render();
    });
    render();
    this.show(el, { scene, music });
  },

  seasonIntro() {
    const s = E.season(this.run);
    const S = SEASONS[s] || { title: s, subtitle: '', intro: [] };
    this.setSeasonColor();
    this.audio.sfx('page_turn');
    const c = charDef(charOf(this.run));
    const card = h('div.screen', h('div.season-card', h('div', h('h2', S.title), h('p', S.subtitle || ''),
      h('p.season-who', spr([c.sprite, 'farmer'], 2, 'ico'), `${c.name}${this.run.year ? ` · Harder Year ${this.run.year}` : ''}${this.run.daily ? ' · Daily Almanac' : ''}`))));
    this.show(card, { scene: { kind: 'map' }, music: this.mapTrack(), type: 'page' });
    const ms = this.settings.reducedMotion ? 1400 : 2200 / this.settings.speed;
    setTimeout(() => this.story(S.intro || [], () => this.map(), { dim: false }), ms);
  },
};

