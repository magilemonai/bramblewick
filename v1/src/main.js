// Bramblewick: boot + game flow + screens.
import { spriteURL, hasSprite } from './pixel.js';
import { installFrames } from './ui/frames.js';
import { h, img, sleep, toast, banner, installTips, hideTip, setTip } from './ui/dom.js';
import { renderCard, cardName } from './ui/cardview.js';
import { Hud } from './ui/hud.js';
import { CombatView } from './ui/combatview.js';
import { Combat, keepsakeMods } from './engine/combat.js';
import { FLOORS, COLS, nodeLabel } from './engine/map.js';
import { newRun, runRng, nextSeasonMap, season, saveRun, loadRun, clearRun, loadMeta, saveMeta, SEASON_ORDER, uid } from './engine/state.js';
import { CARDS, STARTER_DECK } from './data/cards.js';
import { ENEMIES, ENCOUNTERS } from './data/enemies.js';
import { KEEPSAKES, STARTER_KEEPSAKE } from './data/keepsakes.js';
import { PRESERVES } from './data/preserves.js';
import { EVENTS } from './data/events.js';
import { INTRO, SEASONS, ENDING, DEFEAT_LINES, VILLAGERS, HEARTH_LINES, MARKET_LINES, TIPS } from './data/story.js';

const ART = ['./art/chars_a.js', './art/chars_b.js', './art/plants.js', './art/icons.js'];
const NODE_ICON = { fight: 'node_fight', elite: 'node_elite', forage: 'node_forage', villager: 'node_villager', market: 'node_market', hearth: 'node_hearth', boss: 'node_boss' };
const DEFEAT = Symbol('defeat');

const silentAudio = { unlock() {}, music() {}, sfx() {}, setMusicVolume() {}, setSfxVolume() {}, toggleMute() { return true; }, muted: true };

class Game {
  constructor() {
    this.app = document.getElementById('app');
    this.meta = loadMeta();
    this.run = null;
    this.audio = silentAudio;
    this.scenery = null;
  }

  async boot() {
    await Promise.all(ART.map(p => import(p).catch(err => console.warn('art module missing', p, err.message))));
    installFrames();
    for (const t of ['soil', 'parchment', 'wood', 'grass']) if (hasSprite('tex_' + t)) document.documentElement.style.setProperty('--tex-' + t, `url(${spriteURL('tex_' + t, 2)})`);
    try { this.audio = (await import('./audio.js')).audio; } catch (err) { console.warn('audio missing', err.message); }
    try {
      const { Scenery } = await import('./art/scenery.js');
      this.scenery = new Scenery(document.getElementById('scenery'));
      this.scenery.start();
    } catch (err) { console.warn('scenery missing', err); }
    installTips();
    const unlock = () => { this.audio.unlock(); };
    addEventListener('pointerdown', unlock, { once: false, passive: true });
    document.addEventListener('click', e => { if (e.target.closest('button')) this.audio.sfx('click'); }, true);
    document.getElementById('boot').classList.add('gone');
    this.title();
  }

  scene(opts) { this.scenery?.setScene({ season: this.run ? season(this.run) : 'spring', weather: 'sun', dusk: false, ...opts }); }
  show(el) {
    hideTip();
    this.view?.destroy?.();
    this.view = null;
    this.app.innerHTML = '';
    this.app.append(el);
  }
  save() { if (this.run) saveRun(this.run); }
  rng() { return runRng(this.run); }
  setSeasonColor() { document.documentElement.style.setProperty('--season', SEASONS[season(this.run)]?.color || '#6fae4a'); }

  // ================= TITLE =================
  title() {
    this.run = null;
    this.scene({ kind: 'title', season: 'spring' });
    this.audio.music('title');
    const saved = loadRun();
    const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    const menu = h('div.menu',
      saved ? h('button.btn.gold', { onclick: () => this.continueRun(saved) }, `Continue (${SEASONS[SEASON_ORDER[saved.seasonIdx]]?.title || ''})`) : null,
      h('button.btn.green', { onclick: () => (saved ? this.confirm('Start a new year? Your current one will be lost.', () => this.newGame()) : this.newGame()) }, 'Begin a New Year'),
      h('button.btn', { onclick: () => this.howTo() }, 'How the Garden Works'),
    );
    const m = this.meta;
    const rec = m.runs ? h('div.records', `Years begun: ${m.runs} · Years completed: ${m.wins}${m.bestSeason >= 0 ? ` · Furthest: ${SEASONS[SEASON_ORDER[m.bestSeason]]?.title}` : ''}`) : null;
    const snd = h('button.icon-btn.corner', { onclick: () => { const muted = this.audio.toggleMute(); snd.firstChild.replaceWith(img(muted ? 'ui_sound_off' : 'ui_sound_on', 2)); } }, img(this.audio.muted ? 'ui_sound_off' : 'ui_sound_on', 2));
    this.show(h('div.screen.title',
      snd,
      h('div.logo', h('h1', 'Bramblewick'), h('p', 'a deckbuilding year in the valley')),
      h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%' } }, menu, rec),
      tip ? h('div.tip.panel', img('almanac', 3), h('div', tip)) : null,
    ));
  }

  howTo() {
    this.story([
      { speaker: 'almanac', text: 'Cards cost Stamina. You get 3 each turn and draw 5 cards. Tools hit, Tend cards protect, Charms stay with you all fight.' },
      { speaker: 'almanac', text: 'Seed cards plant into your 3 garden plots. Each turn the weather grows them. Rain grows fast; drought and frost stall.' },
      { speaker: 'almanac', text: 'When a plant is fully grown it Blooms, and its effect goes off by itself. Plan ahead: a turnip planted now is a wallop later.' },
      { speaker: 'almanac', text: 'Watch the little icons over each critter. That is what it will do next. Some will trample your garden. Rude, but honest.' },
      { speaker: 'almanac', text: 'Bark blocks damage until your next turn. Drag a card onto a critter, or tap it and then tap the critter. Off you go.' },
    ], () => this.title());
  }

  confirm(text, yes) {
    const m = h('div.modal', h('div.sheet.panel', h('p', text), h('div.choices',
      h('button.btn.green', { onclick: () => { m.remove(); yes(); } }, 'Yes'),
      h('button.btn', { onclick: () => m.remove() }, 'Never mind'))));
    document.getElementById('overlay').append(m);
  }

  settings() {
    const close = () => m.remove();
    const vol = (label, key, fn) => {
      const cur = this.audio[key];
      const input = h('input', { type: 'range', min: 0, max: 100, value: Math.round((typeof cur === 'number' ? cur : 0.7) * 100), style: { width: '100%' } });
      input.addEventListener('input', () => fn(input.value / 100));
      return h('label', { style: { display: 'block', margin: '8px 0' } }, label, input);
    };
    const m = h('div.modal', h('div.sheet.panel',
      h('h2', 'Settings'),
      vol('Music', 'musicVolume', v => this.audio.setMusicVolume(v)),
      vol('Sound effects', 'sfxVolume', v => this.audio.setSfxVolume(v)),
      h('div.choices',
        h('button.btn', { onclick: () => { this.audio.toggleMute(); toast(this.audio.muted ? 'Sound off' : 'Sound on'); } }, 'Toggle sound'),
        this.run ? h('button.btn', { onclick: () => { close(); this.save(); this.title(); } }, 'Save & return to title') : null,
        this.run ? h('button.btn.red', { onclick: () => { close(); this.confirm('Abandon this year? This run ends and cannot be continued.', () => { this.recordEnd(false); clearRun(); this.title(); }); } }, 'Abandon this year') : null,
        h('button.btn.green', { onclick: close }, 'Back'))));
    document.getElementById('overlay').append(m);
  }

  // ================= STORY =================
  story(slides, done, { dim = true } = {}) {
    let i = 0;
    const portrait = h('div.portrait');
    const who = h('div.who');
    const text = h('div.text');
    const more = h('div.more', 'tap ▸');
    const box = h('div.dialog.panel', portrait, h('div', { style: { flex: 1 } }, who, text, more));
    const el = h('div.screen.story', { style: dim ? {} : { background: 'none' } }, box);
    let typing = null;
    const render = () => {
      const s = slides[i];
      const sp = s.speaker;
      const spriteId = sp === 'almanac' ? 'almanac' : VILLAGERS[sp]?.sprite;
      portrait.innerHTML = '';
      portrait.style.display = spriteId ? '' : 'none';
      if (spriteId) portrait.append(img(spriteId, 3));
      who.textContent = sp === 'almanac' ? 'The Almanac' : VILLAGERS[sp]?.name || '';
      who.style.display = who.textContent ? '' : 'none';
      const full = s.text;
      let n = 0;
      clearInterval(typing);
      text.textContent = '';
      typing = setInterval(() => {
        n += 2;
        text.textContent = full.slice(0, n);
        if (n >= full.length) { clearInterval(typing); typing = null; }
      }, 18);
      text.dataset.full = full;
      more.textContent = i < slides.length - 1 ? 'tap ▸' : 'tap to continue ▸';
    };
    el.addEventListener('click', () => {
      if (typing) { clearInterval(typing); typing = null; text.textContent = text.dataset.full; return; }
      i++;
      this.audio.sfx('page_turn', { vol: 0.5 });
      if (i >= slides.length) { done(); return; }
      render();
    });
    if (!slides.length) { done(); return; }
    render();
    this.show(el);
  }

  // ================= RUN FLOW =================
  newGame() {
    clearRun();
    this.run = newRun({ starterDeck: STARTER_DECK, starterKeepsake: STARTER_KEEPSAKE });
    this.run.seasonFights = 0;
    this.applyKeepsakeGain(STARTER_KEEPSAKE, true);
    this.meta.runs++;
    saveMeta(this.meta);
    this.save();
    this.scene({ kind: 'title', season: 'spring', dusk: true });
    this.story(INTRO, () => this.seasonIntro());
  }
  continueRun(saved) {
    this.run = saved;
    this.setSeasonColor();
    this.audio.music(season(this.run));
    this.map();
  }
  seasonIntro() {
    const s = season(this.run);
    const S = SEASONS[s] || { title: s, subtitle: '', intro: [] };
    this.setSeasonColor();
    this.scene({ kind: 'map' });
    this.audio.music(s);
    this.audio.sfx('page_turn');
    const card = h('div.screen', h('div.season-card', h('div', h('h2', S.title), h('p', S.subtitle || ''))));
    this.show(card);
    setTimeout(() => this.story(S.intro || [], () => this.map(), { dim: false }), 2200);
  }

  // ================= MAP =================
  reachable() {
    const { map, pos } = this.run;
    if (!pos) return map.starts.map(c => `0,${c}`).filter(id => map.nodes[id]);
    return map.nodes[pos]?.next || [];
  }
  map() {
    const run = this.run;
    this.scene({ kind: 'map' });
    this.audio.music(season(run));
    this.save();
    const hud = new Hud(this);
    const S = SEASONS[season(run)] || {};
    const open = new Set(this.reachable());
    const rowH = 76, pad = 70;
    const height = (FLOORS + 1) * rowH + pad * 2;
    const board = h('div.map-board', { style: { height: height + 'px' } });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    board.append(svg);
    const pos = n => {
      const x = n.type === 'boss' ? 50 : 8 + (n.col / (COLS - 1)) * 84 + jitter(n.id, 3);
      const y = height - pad - n.row * rowH + (n.type === 'boss' ? -20 : jitter(n.id + 'y', 10));
      return { x, y };
    };
    const nodes = Object.values(run.map.nodes);
    const pts = Object.fromEntries(nodes.map(n => [n.id, pos(n)]));
    const place = () => {
      svg.innerHTML = '';
      const W = board.clientWidth || 360;
      svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
      for (const n of nodes) for (const t of n.next) {
        const a = pts[n.id], b = pts[t];
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const ax = a.x / 100 * W, bx = b.x / 100 * W;
        p.setAttribute('d', `M${ax},${a.y} C${ax},${(a.y + b.y) / 2} ${bx},${(a.y + b.y) / 2} ${bx},${b.y}`);
        const done = run.visited.includes(n.id) && (run.visited.includes(t) || run.pos === t);
        if (done) p.classList.add('done');
        svg.append(p);
      }
    };
    for (const n of nodes) {
      const p = pts[n.id];
      const isOpen = open.has(n.id);
      const b = h(`button.map-node.${n.type}${isOpen ? '.open' : ''}${run.visited.includes(n.id) ? '.visited' : ''}${run.pos === n.id ? '.here' : ''}`,
        { style: { left: p.x + '%', top: p.y + 'px' }, onclick: () => isOpen && this.enterNode(n) }, img(NODE_ICON[n.type], 3));
      setTip(b, `<b>${nodeLabel(n.type)}</b>${isOpen ? 'Tap to go here.' : ''}`);
      board.append(b);
    }
    const scroll = h('div.map-scroll', board);
    const legend = h('div.map-legend.chip', ...['fight', 'elite', 'villager', 'forage', 'market', 'hearth'].map(t => h('div', img(NODE_ICON[t], 2), nodeLabel(t))));
    const banner = h('div.map-banner.chip', img('almanac', 2), h('div', { style: { flex: 1, textAlign: 'left' } }, h('h2', S.title || ''), h('small', open.size ? 'Choose your path' : '')));
    const el = h('div.screen.map-screen', hud.el, banner, scroll, legend);
    this.show(el);
    requestAnimationFrame(() => {
      place();
      const cur = run.pos ? pts[run.pos] : { y: height };
      scroll.scrollTop = Math.max(0, cur.y - scroll.clientHeight * 0.65);
    });
    this.view = { destroy: () => {} };
  }
  enterNode(n) {
    const run = this.run;
    if (run.pos) run.visited.push(run.pos);
    run.pos = n.id;
    run.floorsCleared++;
    this.audio.sfx('step');
    this.save();
    const go = {
      fight: () => this.battle('fight'), elite: () => this.battle('elite'), boss: () => this.battle('boss'),
      villager: () => this.villagerEvent(), forage: () => this.forage(), market: () => this.market(), hearth: () => this.hearth(),
    }[n.type];
    go ? go() : this.map();
  }
  afterNode() {
    this.save();
    this.map();
  }

  // ================= COMBAT =================
  pickEncounter(kind) {
    const s = season(this.run);
    const E = ENCOUNTERS[s] || {};
    const rng = this.rng();
    let pool;
    if (kind === 'boss') pool = E.boss;
    else if (kind === 'elite') pool = E.elite;
    else pool = (this.run.seasonFights || 0) < 2 && E.easy?.length ? E.easy : E.normal || E.easy;
    const valid = (pool || []).filter(g => g.every(id => ENEMIES[id]));
    if (!valid.length) {
      const any = Object.keys(ENEMIES).filter(id => ENEMIES[id].season === s && ENEMIES[id].tier === (kind === 'fight' ? 'normal' : kind));
      return [any[0] || Object.keys(ENEMIES)[0]];
    }
    return rng.pick(valid);
  }
  async battle(kind, group, { fromEvent = false } = {}) {
    const run = this.run;
    group = group || this.pickEncounter(kind);
    if (kind === 'fight' || kind === 'elite') run.seasonFights = (run.seasonFights || 0) + 1;
    run.stats.fights++;
    const combat = new Combat(run, group, { kind });
    const hud = new Hud(this, { hpSource: () => combat.player });
    const view = new CombatView(this, combat, { hud });
    this.show(view.root);
    this.view = view;
    this.scene({ kind: 'combat', weather: 'sun', dusk: kind === 'boss' });
    this.audio.music(kind === 'boss' ? 'boss' : kind === 'elite' ? 'elite' : season(run));
    if (kind === 'boss') banner(ENEMIES[group[0]]?.name || 'Boss', '#ffd9a0');
    await sleep(kind === 'boss' ? 900 : 250);
    view.sync();
    const result = await combat.start();
    view.sync();
    if (result === 'defeat') {
      await sleep(900);
      if (fromEvent) throw DEFEAT;
      this.defeat();
      return 'defeat';
    }
    this.audio.sfx('victory');
    banner('All mended!', '#e4d4ff');
    this.scenery?.burst(innerWidth / 2, innerHeight * 0.35, 'sparkle', 30);
    await sleep(1300);
    if (fromEvent) return 'victory';
    await this.rewards(kind);
    if (kind === 'boss') this.seasonEnd();
    else this.afterNode();
    return 'victory';
  }

  // ================= REWARDS =================
  rollRarity(kind) {
    const r = this.rng()();
    if (kind === 'boss') return 'rare';
    if (kind === 'elite') return r < 0.1 ? 'rare' : r < 0.5 ? 'uncommon' : 'common';
    return r < 0.04 ? 'rare' : r < 0.4 ? 'uncommon' : 'common';
  }
  cardChoices(kind, n = 3, rarityOverride = null, filter = null) {
    const rng = this.rng();
    const s = season(this.run);
    const out = [];
    for (let k = 0; k < n + keepsakeMods(this.run).extraCardChoice; k++) {
      const rar = rarityOverride || this.rollRarity(kind);
      let pool = Object.entries(CARDS).filter(([id, d]) => d.rarity === rar && !out.includes(id) && (!filter || filter(d)));
      if (!pool.length) pool = Object.entries(CARDS).filter(([id, d]) => ['common', 'uncommon', 'rare'].includes(d.rarity) && !out.includes(id) && (!filter || filter(d)));
      if (!pool.length) break;
      const weights = Object.fromEntries(pool.map(([id, d]) => [id, !d.season ? 2 : d.season === s ? 4 : 1]));
      out.push(rng.weighted(weights));
    }
    return out.map(id => ({ id, u: false, uid: uid() }));
  }
  async chooseCard(title, choices, { skip = true } = {}) {
    return new Promise(res => {
      const row = h('div.card-row');
      const m = h('div.modal', h('h2', title), h('div.scroll', row),
        skip ? h('button.btn', { onclick: () => { m.remove(); res(null); } }, 'Skip') : null);
      for (const inst of choices) {
        const c = renderCard(inst, { className: 'big' });
        c.addEventListener('click', () => { m.remove(); this.audio.sfx('page_turn'); res(inst); });
        row.append(c);
      }
      document.getElementById('overlay').append(m);
    });
  }
  addCardToDeck(inst) {
    this.run.deck.push({ id: inst.id, u: !!inst.u, uid: uid() });
    toast(`${cardName(inst)} added to your deck`);
  }
  async rewards(kind) {
    const run = this.run;
    const rng = this.rng();
    this.scene({ kind: 'victory' });
    const items = [];
    const coin = kind === 'boss' ? rng.int(90, 110) : kind === 'elite' ? rng.int(25, 35) : rng.int(10, 20);
    items.push({ icon: 'ui_coin', label: `${coin} coin`, take: () => { run.coin += coin; this.audio.sfx('coin'); } });
    const choices = this.cardChoices(kind, 3, kind === 'boss' ? 'rare' : null);
    items.push({ icon: 'icon_seed_pouch', label: 'Choose a card', keep: true, take: async () => {
      const pick = await this.chooseCard('Choose a card for your deck', choices);
      if (pick) { this.addCardToDeck(pick); return true; }
      return false;
    } });
    if (kind !== 'boss' && rng() < (kind === 'elite' ? 0.6 : 0.4) && run.preserves.includes(null)) {
      const pid = rng.pick(Object.keys(PRESERVES));
      items.push({ icon: PRESERVES[pid].jar, label: PRESERVES[pid].name, tip: PRESERVES[pid].desc, take: () => this.gainPreserve(pid) });
    }
    if (kind === 'elite') {
      const kid = this.randomKeepsake(['common', 'uncommon', 'rare']);
      if (kid) items.push({ icon: KEEPSAKES[kid].icon, label: KEEPSAKES[kid].name, tip: KEEPSAKES[kid].desc, take: () => this.gainKeepsake(kid) });
    }
    if (kind === 'boss' && run.seasonIdx < 3) {
      const opts = [];
      for (let k = 0; k < 3; k++) { const id = this.randomKeepsake(['boss', 'rare'], opts); if (id) opts.push(id); }
      if (opts.length) items.push({ icon: 'ks_nana_locket', label: 'Choose a keepsake', keep: true, take: () => this.chooseKeepsake(opts) });
    }
    await new Promise(res => {
      const list = h('div.reward-list');
      for (const it of items) {
        const b = h('button.btn', img(it.icon, 2), h('span', it.label, it.tip ? h('small', { style: { display: 'block', fontSize: '12px', fontWeight: 400 } }, it.tip) : null));
        b.addEventListener('click', async () => {
          const r = await it.take();
          if (!it.keep || r) { b.remove(); this.hudRefresh?.(); }
          hud.update();
        });
        list.append(b);
      }
      const hud = new Hud(this);
      this.show(h('div.screen', hud.el, h('div.center', h('div.sheet.panel', h('h2', kind === 'boss' ? 'The season keeper is mended' : 'The critters trundle home'), list,
        h('div.choices', h('button.btn.green', { onclick: res }, 'Continue'))))));
    });
  }
  randomKeepsake(rarities, exclude = []) {
    const own = new Set([...this.run.keepsakes, ...exclude]);
    const pool = Object.entries(KEEPSAKES).filter(([id, d]) => rarities.includes(d.rarity) && !own.has(id)).map(([id]) => id);
    return pool.length ? this.rng().pick(pool) : null;
  }
  async chooseKeepsake(opts) {
    return new Promise(res => {
      const row = h('div.row');
      const m = h('div.modal', h('h2', 'Choose one keepsake'), h('div.sheet.panel', row), h('button.btn', { onclick: () => { m.remove(); res(false); } }, 'Skip'));
      for (const id of opts) {
        const d = KEEPSAKES[id];
        const b = h('button.btn', { style: { width: '100%', display: 'flex', gap: '10px', alignItems: 'center', textAlign: 'left' }, onclick: () => { m.remove(); this.gainKeepsake(id); res(true); } },
          img(d.icon, 3), h('span', d.name, h('small', { style: { display: 'block', fontSize: '12px', fontWeight: 400 } }, d.desc)));
        row.append(b);
      }
      document.getElementById('overlay').append(m);
    });
  }
  applyKeepsakeGain(id, silent = false) {
    const d = KEEPSAKES[id];
    if (!d) return;
    if (d.mods?.maxHp) { this.run.maxHp += d.mods.maxHp; this.run.hp += Math.max(0, d.mods.maxHp); }
    try { d.pickup?.(this.evApi()); } catch (err) { console.error('pickup', id, err); }
    if (!silent) { this.audio.sfx('buy'); toast(`Keepsake: ${d.name}`); }
  }
  gainKeepsake(id) {
    if (!KEEPSAKES[id] || this.run.keepsakes.includes(id)) return;
    this.run.keepsakes.push(id);
    this.applyKeepsakeGain(id);
  }
  gainPreserve(id) {
    const i = this.run.preserves.indexOf(null);
    if (i < 0 || !PRESERVES[id]) { toast('Your jar shelf is full'); return false; }
    this.run.preserves[i] = id;
    this.audio.sfx('open');
    return true;
  }
  jarModal(slot, onUse) {
    const id = this.run.preserves[slot];
    const d = PRESERVES[id];
    if (!d) return;
    const m = h('div.modal', h('div.sheet.panel',
      h('div.event-head', h('div.portrait.slot', img(d.jar, 3)), h('div', h('h2', d.name), h('p', d.desc))),
      h('div.choices',
        onUse ? h('button.btn.green', { onclick: () => { m.remove(); onUse(); } }, 'Open the jar') : null,
        h('button.btn', { onclick: () => { m.remove(); this.run.preserves[slot] = null; this.view?.hud?.update?.(); this.view?.sync?.(); toast('Tossed it'); } }, 'Toss it'),
        h('button.btn', { onclick: () => m.remove() }, 'Keep it'))));
    document.getElementById('overlay').append(m);
  }

  // ================= DECK / PICKERS =================
  showPile(title, list, sorted = false) {
    const items = sorted ? [...list].sort((a, b) => (CARDS[a.id]?.name || '').localeCompare(CARDS[b.id]?.name || '')) : list;
    const row = h('div.card-row');
    for (const inst of items) row.append(renderCard(inst));
    const m = h('div.modal', h('h2', `${title} (${list.length})`), h('div.scroll', row), h('button.btn.green', { onclick: () => m.remove() }, 'Close'));
    if (!items.length) row.append(h('p', { style: { color: '#fff4d6' } }, 'Nothing here.'));
    document.getElementById('overlay').append(m);
  }
  pickFromDeck(title, filter = () => true, preview = null) {
    return new Promise(res => {
      const row = h('div.card-row');
      const cards = this.run.deck.filter(filter);
      const m = h('div.modal', h('h2', title), h('div.scroll', row), h('button.btn', { onclick: () => { m.remove(); res(null); } }, 'Cancel'));
      if (!cards.length) row.append(h('p', { style: { color: '#fff4d6' } }, 'No cards qualify.'));
      for (const inst of cards) {
        const c = renderCard(inst);
        c.addEventListener('click', () => {
          if (!preview) { m.remove(); res(inst); return; }
          const after = preview(inst);
          const cm = h('div.modal', h('h2', 'Like this?'), h('div.card-row', renderCard(inst, { className: 'big' }), renderCard(after, { className: 'big' })),
            h('div.row', h('button.btn.green', { onclick: () => { cm.remove(); m.remove(); res(inst); } }, 'Yes'), h('button.btn', { onclick: () => cm.remove() }, 'Back')));
          document.getElementById('overlay').append(cm);
        });
        row.append(c);
      }
      document.getElementById('overlay').append(m);
    });
  }
  async upgradeCard() {
    const inst = await this.pickFromDeck('Cook up an upgrade', i => !i.u && CARDS[i.id] && CARDS[i.id].type !== 'gloom', i => ({ ...i, u: true }));
    if (!inst) return false;
    inst.u = true;
    this.audio.sfx('upgrade');
    toast(`${cardName(inst)}!`);
    return true;
  }
  async removeCard(title = 'Remove a card from your deck') {
    const inst = await this.pickFromDeck(title);
    if (!inst) return false;
    this.run.deck.splice(this.run.deck.indexOf(inst), 1);
    toast(`${cardName(inst)} removed`);
    return true;
  }
  async transformCard() {
    const inst = await this.pickFromDeck('Transform a card');
    if (!inst) return false;
    const d = CARDS[inst.id];
    const rar = ['common', 'uncommon', 'rare'].includes(d?.rarity) ? d.rarity : 'common';
    const [nc] = this.cardChoices('fight', 1, rar, x => x !== d);
    const i = this.run.deck.indexOf(inst);
    if (nc) this.run.deck[i] = { id: nc.id, u: false, uid: uid() };
    toast(`${cardName(inst)} became ${cardName(nc)}`);
    return true;
  }

  // ================= EVENTS =================
  evApi() {
    const g = this, run = this.run;
    const rng = this.rng();
    return {
      run,
      gainCoin: n => { run.coin += n; g.audio.sfx('coin'); },
      loseCoin: n => { run.coin = Math.max(0, run.coin - n); },
      heal: n => { run.hp = Math.min(run.maxHp, run.hp + n); g.audio.sfx('heal'); },
      damage: n => { run.hp = Math.max(1, run.hp - n); g.audio.sfx('player_hurt'); g.scenery?.shake(5); },
      gainMaxHp: n => { run.maxHp += n; run.hp = Math.max(1, Math.min(run.maxHp, run.hp + Math.max(0, n))); },
      addCard: (id, u = false) => { if (CARDS[id]) g.addCardToDeck({ id, u }); },
      removeCard: () => g.removeCard(),
      upgradeCard: () => g.upgradeCard(),
      transformCard: () => g.transformCard(),
      cardReward: async rarity => { const pick = await g.chooseCard('Choose a card', g.cardChoices('fight', 3, rarity || null)); if (pick) g.addCardToDeck(pick); return !!pick; },
      addKeepsake: id => { const k = id === 'random' || !id ? g.randomKeepsake(['common', 'uncommon', 'rare']) : id; if (k) g.gainKeepsake(k); },
      addPreserve: id => g.gainPreserve(id === 'random' || !id ? rng.pick(Object.keys(PRESERVES)) : id),
      friendship: (v, n) => { g.meta.friendship[v] = Math.max(0, (g.meta.friendship[v] || 0) + n); saveMeta(g.meta); if (n > 0) toast(`${VILLAGERS[v]?.name || v} likes you a little more`); },
      getFriendship: v => g.meta.friendship[v] || 0,
      fight: async groupOrId => g.battle('fight', Array.isArray(groupOrId) ? groupOrId : [groupOrId], { fromEvent: true }),
      rand: () => rng(),
    };
  }
  pickEvent() {
    const s = season(this.run);
    const seen = new Set(this.run.seenEvents);
    let pool = EVENTS.filter(e => !seen.has(e.id) && (!e.seasons || e.seasons.includes(s)));
    if (!pool.length) pool = EVENTS.filter(e => !e.seasons || e.seasons.includes(s));
    if (!pool.length) pool = EVENTS;
    const ev = this.rng().pick(pool);
    this.run.seenEvents.push(ev.id);
    return ev;
  }
  villagerEvent() { this.runEvent(this.pickEvent()); }
  runEvent(ev) {
    this.scene({ kind: 'event' });
    this.audio.music('event');
    const api = this.evApi();
    const vil = VILLAGERS[ev.villager];
    const f = api.getFriendship(ev.villager);
    const hud = new Hud(this);
    const hearts = vil ? h('div.hearts', '♥'.repeat(Math.min(5, f)) + '♡'.repeat(Math.max(0, 5 - Math.min(5, f)))) : null;
    const body = h('div');
    const text = typeof ev.text === 'function' ? ev.text(api) : ev.text;
    body.append(...String(text).split(/\n\n+/).map(p => h('p', p)));
    const choices = h('div.choices');
    for (const ch of ev.choices) {
      let ok = true;
      try { ok = !ch.cond || ch.cond(api); } catch { ok = false; }
      const b = h('button.btn' + (ok ? '' : ''), { disabled: !ok }, ch.label, ch.hint ? h('small', ch.hint) : null);
      b.addEventListener('click', async () => {
        choices.querySelectorAll('button').forEach(x => (x.disabled = true));
        let result = '';
        try { result = await ch.do(api); } catch (err) {
          if (err === DEFEAT) { this.defeat(); return; }
          console.error('event', ev.id, err);
        }
        if (this.view?.c) { /* returned from an event fight: rebuild event screen */ this.show(el); this.scene({ kind: 'event' }); this.audio.music('event'); }
        hud.update();
        choices.innerHTML = '';
        if (result) body.append(h('p', { style: { fontStyle: 'italic' } }, result));
        choices.append(h('button.btn.green', { onclick: () => this.afterNode() }, 'Continue'));
      });
      choices.append(b);
    }
    const portrait = vil ? h('div.portrait.slot', img(vil.sprite, 3)) : h('div.portrait.slot', img('almanac', 3));
    const el = h('div.screen', hud.el, h('div.center', h('div.sheet.panel',
      h('div.event-head', portrait, h('div', h('h2', ev.title), vil ? h('div', { style: { fontSize: '14px', color: '#8a5a3b' } }, `${vil.name} · ${vil.role || ''}`) : null, hearts)),
      body, choices)));
    this.show(el);
  }
  forage() {
    const rng = this.rng();
    const finds = [
      { label: 'Mushrooms under a mossy log', hint: 'Heal 10 Heart', do: ev => { ev.heal(10); return 'Earthy, buttery, only slightly suspicious. You feel better.'; } },
      { label: 'Something glinting in the creek', hint: 'Gain 30-45 coin', do: ev => { const n = 30 + Math.floor(ev.rand() * 16); ev.gainCoin(n); return `Coins! ${n} of them, and one very offended crayfish.`; } },
      { label: 'A torn seed packet', hint: 'Choose a Seed card', do: async () => { const pick = await this.chooseCard('Seeds!', this.cardChoices('fight', 3, null, d => d.type === 'seed')); if (pick) this.addCardToDeck(pick); return pick ? 'You pocket the seeds.' : 'You leave the packet for the sparrows.'; } },
      { label: 'A jar left on a fencepost', hint: 'Gain a random Preserve', do: ev => { ev.addPreserve('random'); return 'A note says "for whoever needs it". That\'s you.'; } },
      { label: 'A quiet spot to sharpen your tools', hint: 'Upgrade a card', do: async ev => { const ok = await ev.upgradeCard(); return ok ? 'Sharp as a new moon.' : 'You sit a while instead.'; } },
      { label: 'An old compost heap', hint: 'Remove a card from your deck', do: async ev => { const ok = await ev.removeCard(); return ok ? 'Back to the earth it goes.' : 'Smells too strong. You move on.'; } },
    ];
    rng.shuffle(finds);
    this.runEvent({ id: 'forage', title: 'Foraging', text: 'The path dips into a little hollow full of ferns. The Almanac rustles: "Three things worth a look. We have time for one."', choices: finds.slice(0, 3) });
  }

  // ================= MARKET =================
  market() {
    const run = this.run;
    const rng = this.rng();
    this.scene({ kind: 'market' });
    this.audio.music('market');
    const mods = keepsakeMods(run);
    const disc = p => Math.round(p * (1 - (mods.shopDiscount > 1 ? mods.shopDiscount / 100 : mods.shopDiscount || 0)));
    const hud = new Hud(this);
    const cards = [
      ...this.cardChoices('fight', 2, 'common'), ...this.cardChoices('fight', 2, 'uncommon'), ...this.cardChoices('fight', 1, 'rare'),
    ].map(inst => ({ inst, price: disc({ common: rng.int(45, 55), uncommon: rng.int(70, 82), rare: rng.int(140, 160) }[CARDS[inst.id].rarity] || 60) }));
    const ks = [];
    for (let k = 0; k < 2; k++) { const id = this.randomKeepsake(['common', 'uncommon', 'rare'], ks); if (id) ks.push(id); }
    const keeps = ks.map(id => ({ id, price: disc({ common: rng.int(140, 160), uncommon: rng.int(190, 220), rare: rng.int(250, 290) }[KEEPSAKES[id].rarity] || 180) }));
    const jars = rng.shuffle(Object.keys(PRESERVES)).slice(0, 3).map(id => ({ id, price: disc(rng.int(48, 72)) }));
    const priceTag = p => h('div.price' + (run.coin < p ? '.poor' : ''), img('ui_coin', 2), p);
    const refresh = () => { hud.update(); el.querySelectorAll('.price').forEach(t => t.classList.toggle('poor', run.coin < +t.lastChild.textContent)); };
    const buy = (price, fn, node) => {
      if (run.coin < price) { this.audio.sfx('error'); toast("Odile shakes her head. \"Coin first, friend.\""); return; }
      if (fn() === false) return;
      run.coin -= price;
      this.audio.sfx('buy');
      node.classList.add('sold');
      refresh();
      this.save();
    };
    const cardShelf = h('div.shelf', cards.map(({ inst, price }) => {
      const node = h('div.priced', renderCard(inst), priceTag(price));
      node.addEventListener('click', () => buy(price, () => this.addCardToDeck(inst), node));
      return node;
    }));
    const trinkets = h('div.shelf',
      ...keeps.map(({ id, price }) => {
        const d = KEEPSAKES[id];
        const node = h('div.trinket', h('div.slot', img(d.icon, 3)), priceTag(price));
        setTip(node, `<b>${d.name}</b>${d.desc}`);
        node.addEventListener('click', () => buy(price, () => this.gainKeepsake(id), node));
        return node;
      }),
      ...jars.map(({ id, price }) => {
        const d = PRESERVES[id];
        const node = h('div.trinket', h('div.slot', img(d.jar, 3)), priceTag(price));
        setTip(node, `<b>${d.name}</b>${d.desc}`);
        node.addEventListener('click', () => buy(price, () => this.gainPreserve(id), node));
        return node;
      }),
      (() => {
        const node = h('div.trinket', h('div.slot', img('ui_compost', 3)), priceTag(disc(run.removeCost)));
        setTip(node, '<b>Compost service</b>Odile takes a card off your hands. For a fee.');
        node.addEventListener('click', async () => {
          const price = disc(run.removeCost);
          if (run.coin < price) { this.audio.sfx('error'); toast('Not enough coin'); return; }
          if (await this.removeCard('Which card goes on the heap?')) { run.coin -= price; run.removeCost += 25; node.classList.add('sold'); refresh(); this.save(); this.audio.sfx('buy'); }
        });
        return node;
      })(),
    );
    const vil = VILLAGERS.odile;
    const line = MARKET_LINES[Math.floor(Math.random() * MARKET_LINES.length)] || '';
    const el = h('div.screen', hud.el, h('div.center', { style: { justifyContent: 'flex-start', overflowY: 'auto' } },
      h('div.sheet.panel', h('div.event-head', h('div.portrait.slot', img(vil?.sprite || 'vil_odile', 3)), h('div', h('h2', "Odile's Stall"), h('p', { style: { margin: 0, fontSize: '14px' } }, line)))),
      h('div.market-grid', cardShelf, trinkets),
      h('button.btn.green', { onclick: () => this.afterNode() }, 'Leave the stall')));
    this.show(el);
  }

  // ================= HEARTH =================
  hearth() {
    const run = this.run;
    this.scene({ kind: 'hearth' });
    this.audio.music('hearth');
    const hud = new Hud(this);
    const mods = keepsakeMods(run);
    const rest = Math.round(run.maxHp * 0.3) + (mods.restHeal || 0);
    const vil = VILLAGERS.rue;
    const line = HEARTH_LINES[Math.floor(Math.random() * HEARTH_LINES.length)] || '';
    const done = msg => { if (msg) toast(msg, 2000); setTimeout(() => this.afterNode(), 700); };
    const opts = h('div.hearth-opts',
      h('button.btn.green', { onclick: () => { run.hp = Math.min(run.maxHp, run.hp + rest); this.audio.sfx('heal'); hud.update(); done(`You nap by the fire. +${rest} Heart`); } },
        img('icon_quilt', 3), h('span', 'Nap by the fire', h('small', `Heal ${rest} Heart`))),
      h('button.btn', { onclick: async () => { if (await this.upgradeCard()) done(); } },
        img('icon_pie', 3), h('span', 'Cook with Rue', h('small', 'Upgrade a card'))),
      h('button.btn', { onclick: () => { const n = Math.round(run.maxHp * 0.15); run.hp = Math.min(run.maxHp, run.hp + n); this.evApi().friendship('rue', 1); hud.update(); done(`Tea and gossip. +${n} Heart`); } },
        img('icon_teacup', 3), h('span', 'Sit with Auntie Rue', h('small', 'Heal a little and get to know her'))),
    );
    this.show(h('div.screen', hud.el, h('div.center', h('div.sheet.panel',
      h('div.event-head', h('div.portrait.slot', img(vil?.sprite || 'vil_rue', 3)), h('div', h('h2', "Rue's Hearth"), h('p', { style: { margin: 0, fontSize: '14px' } }, line))),
      opts))));
  }

  // ================= SEASON END / ENDINGS =================
  seasonEnd() {
    const run = this.run;
    const s = season(run);
    this.meta.bestSeason = Math.max(this.meta.bestSeason, run.seasonIdx);
    saveMeta(this.meta);
    this.scene({ kind: 'victory' });
    this.audio.music('victory');
    const outro = SEASONS[s]?.outro || [];
    this.story(outro, () => {
      if (run.seasonIdx >= 3) { this.ending(); return; }
      run.seasonIdx++;
      run.seasonFights = 0;
      run.hp = run.maxHp;
      nextSeasonMap(run);
      this.save();
      this.seasonIntro();
    }, { dim: false });
  }
  ending() {
    this.recordEnd(true);
    clearRun();
    this.scene({ kind: 'victory', season: 'spring' });
    this.audio.music('victory');
    this.story(ENDING, () => this.summary(true), { dim: false });
  }
  defeat() {
    this.recordEnd(false);
    clearRun();
    this.scene({ kind: 'defeat' });
    this.audio.music('defeat');
    this.audio.sfx('defeat');
    const line = DEFEAT_LINES[Math.floor(Math.random() * DEFEAT_LINES.length)] || 'You wake up at the farm.';
    this.story([{ speaker: 'almanac', text: line }], () => this.summary(false));
  }
  recordEnd(won) {
    if (!this.run) return;
    this.meta.bestSeason = Math.max(this.meta.bestSeason, this.run.seasonIdx);
    if (won) this.meta.wins++;
    saveMeta(this.meta);
  }
  summary(won) {
    const run = this.run;
    const st = run.stats;
    const mins = Math.round((Date.now() - st.started) / 60000);
    this.show(h('div.screen', h('div.center', h('div.sheet.panel',
      h('h2', won ? 'The year turns' : 'Rest now'),
      h('p', won ? 'Bramblewick wakes up. The kettle is on. Somewhere, a turnip is proud of you.' : `You made it to ${SEASONS[season(run)]?.title}. The valley will wait for you.`),
      h('div.stats',
        h('span', 'Critters mended'), h('b', st.mended),
        h('span', 'Plants bloomed'), h('b', st.blooms),
        h('span', 'Cards played'), h('b', st.cardsPlayed),
        h('span', 'Gloam cracked'), h('b', st.damage),
        h('span', 'Deck size'), h('b', run.deck.length),
        h('span', 'Time in the valley'), h('b', `${mins} min`)),
      h('div.choices', h('button.btn.green', { onclick: () => this.title() }, 'Back to the farmhouse'))))));
  }
}

function jitter(s, amt) { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return ((x % 1000) / 1000 - 0.5) * 2 * amt; }

const game = new Game();
window.__game = game; // handy for debugging
game.boot().catch(err => {
  console.error(err);
  document.getElementById('boot').textContent = 'Something went wrong: ' + err.message;
});
