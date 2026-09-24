// Guided first fight + one-time Almanac tips. Runs inside the combat view; never blocks play.
//
// Tutorial steps (src/data/tutorial.js TUTORIAL.steps) each wait for a trigger:
//   'start'            the first player turn is ready
//   'intent'           fires right after 'start' (so an intent step follows the welcome step)
//   'turn:<n>'         player turn n is ready
//   'cardPlayed:<id>'  the player finished playing that card ('cardPlayed' = any card)
//   'bloom'            one of your plants bloomed
// A step shows when its trigger fires (skipping earlier steps whose triggers already fired), or,
// if its trigger fired earlier, when the previous bubble is tapped. Tapping the last bubble closes it.
import { h, img, sleep } from './dom.js';

let dataP = null;
const loadData = () => (dataP ||= import('../data/tutorial.js').catch(() => ({})));

// ---------- the Almanac bubble + spotlight ----------
class Bubble {
  constructor() {
    this.spot = h('div.tut-spot');
    this.text = h('div.tut-text');
    this.box = h('div.tut-bubble.chip', { onclick: e => { e.stopPropagation(); this.onTap?.(); } },
      h('div.tut-book', img('almanac', 3)), h('div', this.text, h('div.tut-more', 'tap to close')));
    this.anchor = null; this.raf = 0; this.visible = false;
  }
  show(text, { anchor = null, spotlight = false, onTap = null } = {}) {
    const layer = document.getElementById('overlay') || document.body;
    this.text.textContent = text;
    this.onTap = onTap;
    this.anchor = anchor;
    this.spot.hidden = !(spotlight && anchor);
    if (!this.box.isConnected) layer.append(this.spot, this.box);
    this.box.classList.remove('pop'); void this.box.offsetWidth; this.box.classList.add('pop');
    this.visible = true;
    cancelAnimationFrame(this.raf);
    const follow = () => { this.place(); this.raf = requestAnimationFrame(follow); };
    follow();
  }
  place() {
    const a = typeof this.anchor === 'function' ? this.anchor() : this.anchor;
    const bw = this.box.offsetWidth, bh = this.box.offsetHeight;
    let x = innerWidth / 2 - bw / 2, y = innerHeight * 0.16;
    if (a?.isConnected) {
      const r = a.getBoundingClientRect();
      if (!this.spot.hidden) {
        const pad = 6;
        Object.assign(this.spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      }
      x = r.left + r.width / 2 - bw / 2;
      // low anchors (hand, garden, buttons): float the bubble up into the open sky, clear of the controls
      y = r.top + r.height / 2 > innerHeight * 0.5 ? Math.min(r.top - 14, innerHeight * 0.42) - bh : r.bottom + 14;
    } else this.spot.hidden = true;
    x = Math.max(8, Math.min(innerWidth - bw - 8, x));
    y = Math.max(8, Math.min(innerHeight - bh - 8, y));
    this.box.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  hide() {
    cancelAnimationFrame(this.raf);
    this.box.remove(); this.spot.remove();
    this.visible = false; this.anchor = null; this.onTap = null;
  }
}

function findEl(root, sel) {
  if (!sel) return null;
  try { return root?.querySelector(sel) || document.querySelector(sel); } catch { return null; }
}

// ---------- scripted first fight ----------
export class Tutorial {
  // spec: the TUTORIAL object, or `true` to load it from src/data/tutorial.js
  constructor(game, view, spec) {
    this.game = game; this.view = view;
    this.steps = []; this.idx = -1; this.fired = new Set(); this.bubble = new Bubble();
    this.ready = (spec && typeof spec === 'object' ? Promise.resolve(spec) : loadData().then(m => m.TUTORIAL))
      .then(t => { this.steps = t?.steps || []; this.advance(); });
  }
  get busy() { return this.bubble.visible; }
  trigger(name) {
    const now = [name];
    if (name.startsWith('cardPlayed:')) now.push('cardPlayed');
    for (const n of now) this.fired.add(n);
    // a fresh trigger replaces the current bubble only if it is exactly what the next step waits for
    // (steps in between whose triggers already fired are skipped, so a quick player isn't lectured late)
    let j = this.idx + 1;
    while (j < this.steps.length && !now.includes(this.steps[j].on) && this.fired.has(this.steps[j].on)) j++;
    if (j < this.steps.length && now.includes(this.steps[j].on)) { this.idx = j; this.showStep(this.steps[j]); }
    if (name === 'start') this.fired.add('intent');   // intent explanation follows the welcome, on tap
  }
  // Bubble tapped (or data just loaded): move on to the next step if its trigger already happened.
  advance(dismissed = false) {
    const next = this.steps[this.idx + 1];
    if (next && this.fired.has(next.on)) { this.idx++; this.showStep(next); }
    else if (dismissed) { this.bubble.hide(); this.view.tips?.flush(); }
  }
  showStep(step) {
    const anchor = step.highlight ? () => findEl(this.view.root, step.highlight) : null;
    this.bubble.show(step.text, { anchor, spotlight: !!step.highlight, onTap: () => this.advance(true) });
  }
  destroy() { this.bubble.hide(); this.steps = []; }
}

// ---------- one-time Almanac tips (FIRST_TIPS) ----------
export class Tips {
  constructor(game, view) {
    this.game = game; this.view = view;
    this.queue = []; this.bubble = new Bubble(); this.tips = null; this.hideT = 0;
    loadData().then(m => { this.tips = m.FIRST_TIPS || {}; this.flush(); });
  }
  seen(key) { return !!this.game.meta?.tipsSeen?.includes(key); }
  // Queue a tip once per player ever. anchor: element or () => element to point at.
  want(key, anchor) {
    if (!this.game.meta || this.seen(key) || this.queue.some(q => q.key === key)) return;
    if (this.tips && !this.tips[key]) return;
    this.queue.push({ key, anchor });
    this.flush();
  }
  // Mark a tip seen and hand back its text, for tips shown inline (e.g. inside the choose modal).
  consume(key) {
    const text = this.tips?.[key];
    if (!text || !this.game.meta || this.seen(key)) return null;
    (this.game.meta.tipsSeen ||= []).push(key);
    try { this.game.saveMeta?.(); } catch { /* storage */ }
    this.game.audio?.stinger?.('tip');
    return text;
  }
  async flush() {
    if (!this.tips || this.bubble.visible || this.view.tutorial?.busy || !this.queue.length) return;
    // never talk over a modal (choices, inspect, piles); try again once it closes
    if (document.querySelector('.modal')) { clearTimeout(this.waitT); this.waitT = setTimeout(() => this.flush(), 700); return; }
    const { key, anchor } = this.queue.shift();
    const text = this.tips[key];
    if (!text || this.seen(key)) return this.flush();
    const meta = this.game.meta;
    (meta.tipsSeen ||= []).push(key);
    try { this.game.saveMeta?.(); } catch { /* storage */ }
    this.game.audio?.stinger?.('tip');
    const el = typeof anchor === 'function' ? anchor() : anchor;
    el?.classList?.add('tip-glow');
    const done = () => {
      clearTimeout(this.hideT);
      el?.classList?.remove('tip-glow');
      this.bubble.hide();
      sleep(250).then(() => this.flush());
    };
    this.bubble.show(text, { anchor: el, onTap: done });
    this.hideT = setTimeout(done, 9000);
  }
  destroy() { clearTimeout(this.hideT); clearTimeout(this.waitT); this.queue = []; this.bubble.hide(); document.querySelectorAll('.tip-glow').forEach(e => e.classList.remove('tip-glow')); }
}
