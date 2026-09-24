// Bramblewick 2.0: boot, the Game object, settings, transitions, checkpoints, crash boundary, PWA.
// Screens live in src/ui/screens/* and are mixed into Game.prototype.
import { spriteURL, hasSprite } from './pixel.js';
import { installFrames } from './ui/frames.js';
import * as Dom from './ui/dom.js';

const { h, img, installTips, hideTip } = Dom;
import { D, E, loadDeps, normalizeMeta, withTimeout } from './ui/screens/deps.js';
import { TitleScreens } from './ui/screens/title.js';
import { SelectScreens } from './ui/screens/select.js';
import { StoryScreens } from './ui/screens/story.js';
import { MapScreens } from './ui/screens/map.js';
import { CombatScreens } from './ui/screens/combat.js';
import { RewardScreens } from './ui/screens/rewards.js';
import { EventScreens } from './ui/screens/events.js';
import { EndScreens } from './ui/screens/end.js';
import { CompendiumScreens } from './ui/screens/compendium.js';
import { SettingsScreens } from './ui/screens/settings.js';
import { DailyScreens } from './ui/screens/daily.js';

const ART = ['./art/chars_a.js', './art/chars_b.js', './art/chars_c.js', './art/plants.js', './art/icons.js', './art/icons2.js'];
const SETTINGS_KEY = 'bramblewick2.settings';
const RESUME_FLAG = 'bramblewick2.resume';
const COVER_BY_SEASON = { spring: 'page', summer: 'iris', fall: 'leaves', winter: 'snow' };

const silentAudio = { unlock() {}, music() {}, sfx() {}, setMusicVolume() {}, setSfxVolume() {}, toggleMute() { return true }, muted: true };

const DEFAULT_SETTINGS = { textScale: 1, speed: 1, reducedMotion: false, highContrast: false, haptics: true };
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch { /* private mode */ }
  const out = { ...DEFAULT_SETTINGS, ...s };
  if (s.reducedMotion == null) { try { out.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* */ } }
  if (![1, 1.15, 1.3].includes(out.textScale)) out.textScale = 1;
  if (![1, 2].includes(out.speed)) out.speed = 1;
  return out;
}

// A scenery transition that throws (sync or async) must never block a screen change.
function tryCall(fn) { try { return Promise.resolve(fn()).catch(err => console.warn('scenery transition', err)); } catch (err) { console.warn('scenery transition', err); return null; } }

class Game {
  constructor() {
    this.app = document.getElementById('app');
    this.meta = normalizeMeta(E.loadMeta());
    this.run = null;
    this.audio = silentAudio;
    this.scenery = null;
    this.view = null;
    this.battleCtx = null;   // { kind, group, fromEvent } of the fight on screen (for checkpoints)
    this.tempRun = false;    // tutorial replays run on a throwaway run that is never saved
    this._showToken = 0;
    this.settings = loadSettings();   // { textScale, speed, reducedMotion, highContrast, haptics }
    this.applySettings();
  }

  async boot() {
    await Promise.all(ART.map(p => import(p).catch(err => console.warn('art module missing', p, err.message))));
    await loadDeps();
    installFrames();
    for (const t of ['soil', 'parchment', 'wood', 'grass']) if (hasSprite('tex_' + t)) document.documentElement.style.setProperty('--tex-' + t, `url(${spriteURL('tex_' + t, 2)})`);
    try { this.audio = (await import('./audio.js')).audio; } catch (err) { console.warn('audio missing', err.message); }
    try {
      const { Scenery } = await import('./art/scenery.js');
      this.scenery = new Scenery(document.getElementById('scenery'));
      this.scenery.start();
      this.scenery.setQuality?.(this.settings.reducedMotion ? 'low' : 'high');
    } catch (err) { console.warn('scenery missing', err); }
    installTips();
    addEventListener('pointerdown', () => this.audio.unlock(), { passive: true });
    document.addEventListener('click', e => { if (e.target.closest('button')) { this.audio.sfx('click'); this.haptic(8); } }, true);
    this.installCrashBoundary();
    this.registerServiceWorker();
    document.getElementById('boot').classList.add('gone');
    let resume = false;
    try { resume = sessionStorage.getItem(RESUME_FLAG) === '1'; sessionStorage.removeItem(RESUME_FLAG); } catch { /* */ }
    const saved = resume ? E.loadRun() : null;
    if (saved) this.continueRun(saved);
    else this.title();
  }

  // ---------- plumbing ----------
  scene(opts) { this.scenery?.setScene({ season: this.run ? E.season(this.run) : 'spring', weather: 'sun', dusk: false, ...opts }); }
  coverType(kind) {
    if (kind === 'boss') return 'iris';
    return COVER_BY_SEASON[this.run ? E.season(this.run) : this.titleSeason || 'spring'] || 'page';
  }
  // Swap the whole screen. Goes through scenery.cover()/uncover() when available; never blocks on it.
  async show(el, { cover = true, type, scene, music, view } = {}) {
    const token = ++this._showToken;
    const sc = this.scenery;
    const useCover = cover && typeof sc?.cover === 'function' && !this.settings.reducedMotion && this.app.firstChild;
    if (useCover) await withTimeout(tryCall(() => sc.cover(type || this.coverType())), 1600);
    if (token !== this._showToken) return false;
    hideTip();
    try { this.view?.destroy?.(); } catch (err) { console.warn('view destroy', err); }
    this.view = view || null;
    if (scene) this.scene(scene);
    if (music !== undefined) this.audio.music(music);
    this.app.replaceChildren(el);
    if (useCover && typeof sc.uncover === 'function') withTimeout(tryCall(() => sc.uncover()), 1600);
    return true;
  }
  overlay(el) { document.getElementById('overlay').append(el); return el; }
  save() { if (this.run && !this.tempRun) E.saveRun(this.run); }
  saveMeta() { E.saveMeta(this.meta); }
  rng() { return E.runRng(this.run); }
  setSeasonColor() { document.documentElement.style.setProperty('--season', this.seasonColor()); }
  haptic(pattern = 12) { if (this.settings.haptics) { try { navigator.vibrate?.(pattern); } catch { /* */ } } }
  stinger(name) { try { this.audio.stinger?.(name); } catch (err) { console.warn('stinger', err); } }
  motif(v) { try { this.audio.motif?.(v); } catch (err) { console.warn('motif', err); } }

  // Called by the combat view at the start of every player turn with combat.serialize().
  checkpoint(snapshot) {
    if (!this.run || this.tempRun || !this.battleCtx || !snapshot) return;
    this.run.combat = { ...this.battleCtx, snapshot };
    this.save();
  }

  // ---------- settings ----------
  setSetting(key, value) {
    this.settings[key] = value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
    this.applySettings();
  }
  // CSS hooks on <html>: dom.js applySettings() sets --ts/--tsc/--tsd/--spd and .rm/.hc/.fast (shared with
  // the combat UI); --text-scale/--speed and .reduced-motion/.high-contrast are set here too for the meta CSS.
  applySettings() {
    const s = this.settings, root = document.documentElement;
    try { Dom.applySettings?.(s); } catch (err) { console.warn('applySettings', err); }
    root.style.setProperty('--text-scale', s.textScale);
    root.style.setProperty('--speed', s.speed);
    root.classList.toggle('reduced-motion', !!s.reducedMotion);
    root.classList.toggle('high-contrast', !!s.highContrast);
    root.classList.toggle('rm', !!s.reducedMotion);
    root.classList.toggle('hc', !!s.highContrast);
    this.scenery?.setQuality?.(s.reducedMotion ? 'low' : 'high');
    dispatchEvent(new CustomEvent('bramblewick:settings', { detail: { ...s } }));
  }

  // ---------- crash boundary ----------
  installCrashBoundary() {
    const onErr = (err, src) => {
      console.error(`[crash boundary] ${src}:`, err);
      if (!this.run || this.tempRun || this._crashOpen) return;
      this.crashModal();
    };
    addEventListener('error', e => {
      const msg = String(e.message || e.error?.message || '');
      if (/ResizeObserver loop/.test(msg)) return;
      if (!e.error && !msg) return; // resource load errors (they don't bubble here anyway)
      onErr(e.error || msg, 'error');
    });
    addEventListener('unhandledrejection', e => onErr(e.reason, 'unhandledrejection'));
  }
  crashModal() {
    this._crashOpen = true;
    const m = h('div.modal.crash', h('div.sheet.panel',
      h('div.event-head', h('div.portrait.slot', img('almanac', 3)), h('div', h('h2', 'The Almanac lost its page'),
        h('p', 'Something tore in the binding. Your year is safe up to the start of your last turn.'))),
      h('div.choices',
        h('button.btn.green', { onclick: () => { try { sessionStorage.setItem(RESUME_FLAG, '1'); } catch { /* */ } location.reload(); } }, 'Return to last checkpoint'),
        h('button.btn', { onclick: () => { this._crashOpen = false; m.remove(); } }, 'Keep going anyway'))));
    this.overlay(m);
  }

  // ---------- PWA ----------
  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (location.protocol !== 'https:' && !local) return;
    if (new URLSearchParams(location.search).has('nosw')) {
      navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
      return;
    }
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(err => console.warn('service worker', err.message));
  }

  confirm(text, yes, { yesLabel = 'Yes', noLabel = 'Never mind' } = {}) {
    const m = h('div.modal', h('div.sheet.panel', h('p', text), h('div.choices',
      h('button.btn.green', { onclick: () => { m.remove(); yes(); } }, yesLabel),
      h('button.btn', { onclick: () => m.remove() }, noLabel))));
    this.overlay(m);
  }
}

Object.assign(Game.prototype, TitleScreens, SelectScreens, StoryScreens, MapScreens, CombatScreens, RewardScreens,
  EventScreens, EndScreens, CompendiumScreens, SettingsScreens, DailyScreens);

const game = new Game();
window.__game = game; // handy for debugging
window.__deps = D;
game.boot().catch(err => {
  console.error(err);
  const b = document.getElementById('boot');
  b.classList.remove('gone');
  b.textContent = 'Something went wrong: ' + err.message;
});
