// Season map: branching paths, a walking player token, boss title cards, the character + year banner.
import { h, img, sleep, setTip } from '../dom.js';
import { Hud } from '../hud.js';
import { ENEMIES } from '../../data/enemies.js';
import { SEASONS } from '../../data/story.js';
import { E, charDef, charOf, spr, unlockState } from './deps.js';

const NODE_ICON = { fight: 'node_fight', elite: 'node_elite', forage: 'node_forage', villager: 'node_villager', market: 'node_market', hearth: 'node_hearth', boss: 'node_boss' };
const ROW_H = 76, PAD = 70;

function jitter(s, amt) { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return ((x % 1000) / 1000 - 0.5) * 2 * amt; }

export const MapScreens = {
  mapTrack() { return charOf(this.run) === 'pell' ? this.track('pell', E.season(this.run)) : E.season(this.run); },
  // A 2.0 track name if the audio module knows it, else the 1.0 fallback.
  track(name, fallback) {
    let known = null;
    try { known = this.audio._debug?.()?.tracks; } catch { /* */ }
    return !known || known.includes(name) ? name : fallback;
  },

  continueRun(saved) {
    this.run = saved;
    this.tempRun = false;
    this.unlockBaseline = unlockState(this.meta);
    this.setSeasonColor();
    if (saved.combat?.snapshot || saved.combat?.group) { this.resumeBattle(); return; }
    this.map();
  },

  reachable() {
    const { map, pos } = this.run;
    if (!pos) return map.starts.map(c => `0,${c}`).filter(id => map.nodes[id]);
    return map.nodes[pos]?.next || [];
  },

  async map() {
    const run = this.run;
    this.save();
    const hud = new Hud(this);
    const S = SEASONS[E.season(run)] || {};
    const open = new Set(this.reachable());
    const height = (E.FLOORS + 1) * ROW_H + PAD * 2;
    const board = h('div.map-board', { style: { height: height + 'px' } });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    board.append(svg);
    const nodes = Object.values(run.map.nodes);
    const pts = Object.fromEntries(nodes.map(n => [n.id, {
      x: n.type === 'boss' ? 50 : 8 + (n.col / (E.COLS - 1)) * 84 + jitter(n.id, 3),
      y: height - PAD - n.row * ROW_H + (n.type === 'boss' ? -20 : jitter(n.id + 'y', 10)),
    }]));
    const startPt = { x: 50, y: height - PAD + ROW_H * 0.7 };
    let busy = false;
    const place = () => {
      svg.innerHTML = '';
      const W = board.clientWidth || 360;
      svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
      for (const n of nodes) for (const t of n.next) {
        const a = pts[n.id], b = pts[t];
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const ax = a.x / 100 * W, bx = b.x / 100 * W;
        p.setAttribute('d', `M${ax},${a.y} C${ax},${(a.y + b.y) / 2} ${bx},${(a.y + b.y) / 2} ${bx},${b.y}`);
        if (run.visited.includes(n.id) && (run.visited.includes(t) || run.pos === t)) p.classList.add('done');
        else if (n.id === run.pos && open.has(t)) p.classList.add('open');
        svg.append(p);
      }
      if (!run.pos) for (const id of open) {
        const b = pts[id], p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const ax = startPt.x / 100 * W, bx = b.x / 100 * W;
        p.setAttribute('d', `M${ax},${startPt.y} C${ax},${(startPt.y + b.y) / 2} ${bx},${(startPt.y + b.y) / 2} ${bx},${b.y}`);
        p.classList.add('open');
        svg.append(p);
      }
    };
    const c = charDef(charOf(run));
    const token = h('div.map-token', spr([c.sprite, 'farmer'], 2));
    const here = run.pos ? pts[run.pos] : startPt;
    token.style.left = here.x + '%';
    token.style.top = here.y + 'px';
    board.append(token);
    for (const n of nodes) {
      const p = pts[n.id];
      const isOpen = open.has(n.id);
      const b = h(`button.map-node.${n.type}${isOpen ? '.open' : ''}${run.visited.includes(n.id) ? '.visited' : ''}${run.pos === n.id ? '.here' : ''}`,
        { style: { left: p.x + '%', top: p.y + 'px' }, 'aria-label': E.nodeLabel(n.type), onclick: async () => {
          if (!isOpen || busy) return;
          busy = true;
          el.classList.add('walking');
          await this.walkToken(token, board, run.pos ? pts[run.pos] : startPt, pts[n.id]);
          this.enterNode(n);
        } }, img(NODE_ICON[n.type], 3));
      setTip(b, `<b>${E.nodeLabel(n.type)}</b>${isOpen ? 'Tap to go here.' : ''}`);
      board.append(b);
    }
    const scroll = h('div.map-scroll', board);
    const legend = h('div.map-legend.chip', ...['fight', 'elite', 'villager', 'forage', 'market', 'hearth'].map(t => h('div', img(NODE_ICON[t], 2), E.nodeLabel(t))));
    const tags = [c.name, run.year ? `Harder Year ${run.year}` : null, run.daily ? 'Daily Almanac' : null].filter(Boolean).join(' · ');
    const banner = h('div.map-banner.chip', h('div.map-who.slot', spr([c.portrait, c.sprite, 'farmer'], 2)),
      h('div', { style: { flex: 1, textAlign: 'left', minWidth: 0 } }, h('h2', S.title || ''), h('small.map-tags', tags), h('small', open.size ? 'Choose your path' : '')));
    const el = h('div.screen.map-screen', hud.el, banner, scroll, legend);
    await this.show(el, { scene: { kind: 'map' }, music: this.mapTrack(), view: { destroy: () => {} } });
    requestAnimationFrame(() => {
      place();
      const cur = run.pos ? pts[run.pos] : { y: height };
      scroll.scrollTop = Math.max(0, cur.y - scroll.clientHeight * 0.65);
    });
  },

  // Walk the token along the same curve the path uses. Resolves when it arrives.
  walkToken(token, board, a, b) {
    const W = board.clientWidth || 360;
    const ax = a.x / 100 * W, bx = b.x / 100 * W, my = (a.y + b.y) / 2;
    if (this.settings.reducedMotion) { token.style.left = b.x + '%'; token.style.top = b.y + 'px'; return sleep(120); }
    const dur = 650 / this.settings.speed;
    const t0 = performance.now();
    token.classList.add('walk');
    let lastStep = -1;
    return new Promise(res => {
      let done = false;
      const finish = () => { if (done) return; done = true; token.classList.remove('walk'); token.style.left = b.x + '%'; token.style.top = b.y + 'px'; res(); };
      setTimeout(finish, dur + 400); // rAF is paused in hidden tabs; never strand the player mid-walk
      const tick = now => {
        if (done) return;
        const t = Math.min(1, (now - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        const u = 1 - e;
        // cubic bezier P0=(ax,a.y) P1=(ax,my) P2=(bx,my) P3=(bx,b.y)
        const x = u * u * u * ax + 3 * u * u * e * ax + 3 * u * e * e * bx + e * e * e * bx;
        const y = u * u * u * a.y + 3 * u * u * e * my + 3 * u * e * e * my + e * e * e * b.y;
        token.style.left = (x / W * 100) + '%';
        token.style.top = y + 'px';
        const step = Math.floor(t * 4);
        if (step !== lastStep && step < 4) { lastStep = step; this.audio.sfx('step', { vol: 0.35, pitch: step % 2 ? 2 : 0 }); }
        if (t < 1) requestAnimationFrame(tick);
        else finish();
      };
      requestAnimationFrame(tick);
    });
  },

  enterNode(n) {
    const run = this.run;
    if (run.pos) run.visited.push(run.pos);
    run.pos = n.id;
    run.floorsCleared++;
    this.save();
    const go = {
      fight: () => this.battle('fight'), elite: () => this.battle('elite'), boss: () => this.bossIntro(),
      villager: () => this.villagerEvent(), forage: () => this.forage(), market: () => this.market(), hearth: () => this.hearth(),
    }[n.type];
    go ? go() : this.map();
  },
  afterNode() { this.save(); this.map(); },

  // Boss title card: name, sprite, the season's subtitle. Tap or wait.
  async bossIntro() {
    const group = this.pickEncounter('boss');
    const def = ENEMIES[group[0]] || {};
    const S = SEASONS[E.season(this.run)] || {};
    this.audio.sfx('page_turn');
    this.stinger('bossPhase');
    this.haptic([20, 40, 20]);
    const card = h('div.screen.boss-card',
      h('div.boss-card-inner',
        h('small', 'The keeper of ' + (S.title || 'the season')),
        h('div.boss-card-sprite', spr([def.sprite], 4)),
        h('h1', def.name || 'The Season Keeper'),
        def.flavor ? h('p', def.flavor) : null,
        h('div.more', 'tap to face it ▸')));
    let went = false;
    const go = () => { if (went) return; went = true; this.battle('boss', group); };
    card.addEventListener('click', go);
    await this.show(card, { scene: { kind: 'combat', dusk: true }, music: 'boss', type: 'iris' });
    setTimeout(go, this.settings.reducedMotion ? 1600 : 2600 / this.settings.speed);
  },
};
