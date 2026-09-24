// Settings modal: text size, animation speed, reduced motion, high contrast, haptics, volumes, mute,
// replay tutorial, save & quit, abandon run.
import { h, toast } from '../dom.js';
import { D, E } from './deps.js';

export const SettingsScreens = {
  settingsModal() {
    document.querySelector('.modal.settings')?.remove();
    const s = this.settings;
    const close = () => m.remove();
    const seg = (label, key, options) => {
      const wrap = h('div.seg', { role: 'group', 'aria-label': label });
      const draw = () => wrap.replaceChildren(...options.map(([v, text]) => h(`button.seg-btn${s[key] === v ? '.on' : ''}`, {
        'aria-pressed': String(s[key] === v), onclick: () => { this.setSetting(key, v); draw(); },
      }, text)));
      draw();
      return h('div.set-row', h('span.set-label', label), wrap);
    };
    const toggle = (label, key, hint, after) => {
      const b = h('button.switch', { role: 'switch' });
      const draw = () => { b.classList.toggle('on', !!s[key]); b.setAttribute('aria-checked', String(!!s[key])); b.textContent = s[key] ? 'On' : 'Off'; };
      b.addEventListener('click', () => { this.setSetting(key, !s[key]); draw(); after?.(); });
      draw();
      return h('div.set-row', h('span.set-label', label, hint ? h('small', hint) : null), b);
    };
    const vol = (label, key, fn) => {
      const cur = this.audio[key];
      const input = h('input', { type: 'range', min: 0, max: 100, value: Math.round((typeof cur === 'number' ? cur : 0.7) * 100), 'aria-label': label });
      input.addEventListener('input', () => fn(input.value / 100));
      return h('div.set-row', h('span.set-label', label), input);
    };
    const muteBtn = h('button.switch');
    const drawMute = () => { const on = !this.audio.muted; muteBtn.classList.toggle('on', on); muteBtn.setAttribute('aria-checked', String(on)); muteBtn.textContent = on ? 'On' : 'Off'; };
    muteBtn.setAttribute('role', 'switch');
    muteBtn.addEventListener('click', () => { this.audio.toggleMute(); drawMute(); });
    drawMute();

    const inRun = !!this.run && !this.tempRun;
    const m = h('div.modal.settings', h('div.sheet.panel',
      h('h2', 'Settings'),
      h('div.set-group',
        h('h3', 'Reading'),
        seg('Text size', 'textScale', [[1, 'A'], [1.15, 'A+'], [1.3, 'A++']]),
        toggle('High contrast', 'highContrast', 'Bolder intents and outlines')),
      h('div.set-group',
        h('h3', 'Motion'),
        seg('Animation speed', 'speed', [[1, '1x'], [2, '2x']]),
        toggle('Reduced motion', 'reducedMotion', 'No shake, fewer particles, instant page turns'),
        'vibrate' in navigator ? toggle('Haptics', 'haptics', 'Little buzzes on hits and taps') : null),
      h('div.set-group',
        h('h3', 'Sound'),
        h('div.set-row', h('span.set-label', 'Sound'), muteBtn),
        vol('Music', 'musicVolume', v => this.audio.setMusicVolume(v)),
        vol('Sound effects', 'sfxVolume', v => this.audio.setSfxVolume(v))),
      h('div.choices',
        D.TUTORIAL ? h('button.btn', { onclick: () => { close(); this.closeOverlays(); this.replayTutorial(); } }, 'Replay tutorial') : null,
        inRun ? h('button.btn', { onclick: () => { close(); this.closeOverlays(); this.save(); this.title(); } }, 'Save & return to title') : null,
        inRun ? h('button.btn.red', { onclick: () => { close(); this.confirm('Abandon this year? This run ends and cannot be continued.', () => { this.closeOverlays(); this.abandonRun(); }); } }, 'Abandon run') : null,
        h('button.btn.green', { onclick: close }, 'Done'))));
    this.overlay(m);
  },

  closeOverlays() { document.querySelectorAll('#overlay > .modal').forEach(x => x.remove()); document.querySelector('.tutorial-skip')?.remove(); },

  abandonRun() {
    this.recordEnd(false);
    E.clearRun();
    toast('The Almanac closes gently');
    this.summary(false);
  },
};
