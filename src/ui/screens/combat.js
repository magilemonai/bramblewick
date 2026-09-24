// Fights: normal/elite/boss battles, resume mid-fight from a checkpoint, and the guided tutorial fight.
import { h, sleep, banner, toast } from '../dom.js';
import { Hud } from '../hud.js';
import { CombatView } from '../combatview.js';
import { ENEMIES } from '../../data/enemies.js';
import { D, E, markSeen, charDef } from './deps.js';

export const DEFEAT = Symbol('defeat');

export const CombatScreens = {
  pickEncounter(kind) { return E.pickEncounter(this.run, kind); },

  async battle(kind, group, { fromEvent = false } = {}) {
    const run = this.run;
    group = group || this.pickEncounter(kind);
    if (kind === 'fight' || kind === 'elite') run.seasonFights = (run.seasonFights || 0) + 1;
    run.stats.fights = (run.stats.fights || 0) + 1;
    this.battleCtx = { kind, group, fromEvent };
    const combat = new E.Combat(run, group, { kind });
    return this.runCombat(combat, { kind, group, fromEvent });
  },

  // Continue from run.combat (saved by checkpoint()). Falls back to restarting the fight if the engine
  // can't restore a snapshot.
  async resumeBattle() {
    const run = this.run;
    const cb = run.combat || {};
    const kind = cb.kind || 'fight';
    const group = cb.group;
    let combat = null, resumed = false;
    if (cb.snapshot && typeof E.Combat.restore === 'function') {
      try { combat = await E.Combat.restore(run, cb.snapshot, { kind }); resumed = !!combat; } catch (err) { console.error('Combat.restore failed', err); }
    }
    if (!combat) {
      if (!group?.length) { delete run.combat; this.map(); return; }
      combat = new E.Combat(run, group, { kind });
    }
    // An event fight's continuation can't be rebuilt; after it, go back to the map.
    this.battleCtx = { kind, group, fromEvent: false };
    return this.runCombat(combat, { kind, group: group || combat.enemies?.map(e => e.id) || [], fromEvent: false, resumed });
  },

  async runCombat(combat, { kind, group, fromEvent = false, resumed = false }) {
    const run = this.run;
    const hud = new Hud(this, { hpSource: () => combat.player });
    const view = new CombatView(this, combat, { hud });
    const boss = kind === 'boss';
    await this.show(view.root, {
      view, type: boss ? 'iris' : undefined,
      scene: { kind: 'combat', weather: combat.weather || 'sun', dusk: boss, arena: boss ? group[0] : undefined },
      music: boss ? 'boss' : kind === 'elite' ? 'elite' : E.season(run),
    });
    if (resumed) toast('Back where you left off');
    await sleep(boss ? 500 : 250);
    view.sync();
    let result = resumed && typeof combat.resume === 'function' ? await combat.resume() : await combat.start();
    if (result !== 'victory' && result !== 'defeat') result = await combat.done;
    view.sync();
    delete run.combat;
    this.battleCtx = null;
    if (result === 'defeat') {
      await sleep(900);
      if (fromEvent) throw DEFEAT;
      this.defeat();
      return 'defeat';
    }
    const mended = (combat.enemies || []).map(e => e.id).filter(id => ENEMIES[id]);
    markSeen(this.meta, 'enemies', mended);
    if (boss && group[0] && !this.meta.bossesMended.includes(group[0])) this.meta.bossesMended.push(group[0]);
    if (boss) { run.bossesMended = [...new Set([...(run.bossesMended || []), group[0]])]; run.stats.bosses = (run.stats.bosses || 0) + 1; }
    this.saveMeta();
    this.audio.sfx('victory');
    this.haptic([10, 30, 10]);
    banner('All mended!', '#e4d4ff');
    this.scenery?.burst?.(innerWidth / 2, innerHeight * 0.35, 'sparkle', 30);
    await sleep(1300 / this.settings.speed);
    if (fromEvent) return 'victory';
    this.save();
    await this.rewards(kind);
    if (boss) this.seasonEnd();
    else this.afterNode();
    return 'victory';
  },

  // Guided first fight. Uses TUTORIAL (content) through the engine script option and the combat view's
  // tutorial option. Never changes the run: HP, stats and RNG are restored afterwards.
  async tutorialFight({ then }) {
    const T = D.TUTORIAL;
    const run = this.run;
    if (!T || !run) { then(); return; }
    const keep = { hp: run.hp, stats: { ...run.stats }, rngState: run.rngState, seasonFights: run.seasonFights };
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      Object.assign(run, { hp: keep.hp, stats: keep.stats, rngState: keep.rngState, seasonFights: keep.seasonFights });
      delete run.combat;
      this.meta.tutorialDone = true;
      this.saveMeta();
      this.save();
      document.querySelector('.tutorial-skip')?.remove();
      then();
    };
    this.battleCtx = null;
    let combat;
    try {
      combat = new E.Combat(run, T.enemies || ['gloamslug'], { kind: 'fight', tutorial: true, script: { drawOrder: T.drawOrder, weather: T.weather } });
    } catch (err) { console.error('tutorial combat', err); finish(); return; }
    const hud = new Hud(this, { hpSource: () => combat.player });
    const view = new CombatView(this, combat, { hud, tutorial: T });
    const skip = h('button.btn.small.tutorial-skip', { onclick: () => { this.audio.sfx('page_turn'); finish(); } }, 'Skip tutorial ▸▸');
    await this.show(view.root, { view, scene: { kind: 'combat', weather: (T.weather || ['sun'])[0], dusk: false }, music: this.track('tutorial', E.season(run)) });
    this.overlay(skip);
    await sleep(250);
    view.sync();
    let result;
    try {
      result = await combat.start();
      if (result !== 'victory' && result !== 'defeat') result = await combat.done;
    } catch (err) { console.error('tutorial fight', err); }
    if (over) return;
    view.sync();
    if (result === 'victory') { this.audio.sfx('victory'); banner('Nicely done!', '#e4d4ff'); }
    await sleep(1100 / this.settings.speed);
    finish();
  },

  // Settings -> "Replay tutorial": a throwaway run that is never saved, then back to the title.
  replayTutorial() {
    if (!D.TUTORIAL) return;
    this.save();
    const c = charDef('farmer');
    let run;
    try { run = E.newRun({ character: 'farmer', year: 0, starterDeck: c.starterDeck, starterKeepsake: c.starterKeepsake }); } catch (err) { console.error(err); return; }
    this.run = run;
    this.run.stats ||= {};
    this.tempRun = true;
    this.tutorialFight({ then: () => { this.tempRun = false; this.title(); } });
  },
};
