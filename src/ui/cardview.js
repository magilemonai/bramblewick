// Card rendering + keyword glossary.
import { CARDS } from '../data/cards.js';
import { PLANTS } from '../data/plants.js';
import { h, img, hideTip } from './dom.js';
import { cardKeywords, baseCost } from '../engine/combat.js';

export const GLOSSARY = {
  Bark: 'Blocks damage. Falls away at the start of your next turn.',
  Grit: 'Attacks deal extra damage per stack.',
  Sturdy: 'Gain extra Bark whenever you gain Bark.',
  Dazed: 'Deals 25% less attack damage. Wears off by 1 each turn.',
  Soggy: 'Takes 50% more attack damage. Wears off by 1 each turn.',
  Wilt: 'Loses that much HP at the start of its turn, then Wilt drops by 1.',
  Thorns: 'Attackers take damage for each hit.',
  Rooted: "Can't gain Stamina from cards this turn.",
  Compost: 'Removed from this fight once played.',
  Early: 'Always in your opening hand.',
  Keep: "Stays in your hand at the end of the turn.",
  Fleeting: "If it's still in your hand at the end of the turn, it's removed from this fight.",
  Unplayable: "Can't be played.",
  Plant: 'Put a plant in your leftmost empty plot. It grows at the start of each turn.',
  Bloom: "When a plant finishes growing, it blooms: its effect fires and it leaves the plot.",
  Perennial: 'Blooms, then starts growing again instead of leaving.',
  Harvest: 'Make a plant bloom right now, ripe or not.',
  Grow: 'Add growth to plants.',
  Stamina: 'Spend it to play cards. Refills to 3 each turn.',
  Gloam: 'Clogs your deck. Grey, sticky, a little sad.',
  Guard: 'A scarecrow on a plot. A trample knocks down one Guard instead of the plant.',
  Gloamweed: 'A weed critters plant in your plots. It grows like a plant, and when it blooms it hurts you.',
  Uproot: 'Pull a plant out of its plot. It does not bloom.',
  Bees: 'At the end of your turn, each Bee stings a random critter for 1. Stings ignore Bark.',
  Sting: 'A Bee sting: 1 damage to a random critter, ignoring Bark.',
  Lock: 'Locked weather stays put: the next weather roll is skipped.',
};
const KW_RE = new RegExp(`\\b(${Object.keys(GLOSSARY).join('|')})(s|ed|ing)?\\b`, 'g');
const TYPE_LABEL = { tool: 'Tool', tend: 'Tend', seed: 'Seed', charm: 'Charm', gloom: 'Gloam' };

export function descText(inst) {
  const d = CARDS[inst.id];
  if (!d) return '???';
  try { return typeof d.desc === 'function' ? d.desc(!!inst.u) : d.desc || ''; } catch { return ''; }
}
export function descHTML(inst) {
  let t = descText(inst).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const kws = cardKeywords(inst).map(k => k[0].toUpperCase() + k.slice(1));
  const missing = kws.filter(k => !new RegExp(`\\b${k}\\b`).test(t));
  if (missing.length) t += (t ? ' ' : '') + missing.join('. ') + '.';
  t = t.replace(KW_RE, m => `<span class="kw">${m}</span>`);
  t = t.replace(/(?<![\w#])(\d+)(?![\w])/g, `<span class="n${inst.u ? ' up' : ''}">$1</span>`);
  return t;
}
export function glossaryFor(inst) {
  const text = descText(inst) + ' ' + cardKeywords(inst).join(' ');
  const found = new Set();
  for (const k of Object.keys(GLOSSARY)) if (new RegExp(`\\b${k}(s|es|ed|ing|th)?\\b`, 'i').test(text)) found.add(k);
  return [...found];
}

function descSize(inst) {
  const n = descText(inst).length + cardKeywords(inst).join(' ').length;
  return n > 110 ? '.xxlong' : n > 80 ? '.xlong' : n > 55 ? '.long' : '';
}

export function cardName(inst) {
  const d = CARDS[inst.id];
  return (d?.name || inst.id) + (inst.u ? '+' : '');
}

export function renderCard(inst, { cost, className = '' } = {}) {
  const d = CARDS[inst.id] || { name: inst.id, type: 'gloom', cost: null, art: 'icon_gloom' };
  const bc = baseCost(inst);
  const shown = cost ?? bc;
  const el = h(`div.card.${d.type || 'tool'}${inst.u ? '.u' : ''}${className ? '.' + className.split(' ').join('.') : ''}`,
    shown != null ? h('div.cost' + (cost != null && bc != null && cost < bc ? '.cheaper' : ''), img('ui_stamina', 2), h('b', shown)) : null,
    h('div.name' + (cardName(inst).length > 15 ? '.longname' : ''), cardName(inst)),
    h('div.art', img(d.art || 'icon_seed_pouch', 4)),
    h('div.kind', TYPE_LABEL[d.type] || ''),
    h('div.desc' + descSize(inst), h('span', { html: descHTML(inst) })),
    d.rarity && !['starter', 'special'].includes(d.rarity) ? h('div.rarity.' + d.rarity) : null,
  );
  el.dataset.uid = inst.uid || '';
  return el;
}

// Tooltip body for a card: glossary + plant details + flavor.
export function cardTip(inst) {
  const d = CARDS[inst.id];
  const box = h('div');
  box.append(h('b', cardName(inst)));
  if (d?.flavor) box.append(h('div', { style: { fontStyle: 'italic', color: '#8a5a3b', marginBottom: '4px' } }, d.flavor));
  for (const k of glossaryFor(inst)) box.append(h('div', { style: { marginTop: '3px' } }, h('span', { style: { fontWeight: 700 } }, k + ': '), GLOSSARY[k]));
  return box;
}

export function plantTip(p) {
  const def = PLANTS[p.id];
  const box = h('div', h('b', (def?.name || p.id) + (p.u ? '+' : '')));
  box.append(h('div', `Growth ${p.growth}/${p.growTime}${def?.perennial ? ' · Perennial' : ''}`));
  try { box.append(h('div', { style: { marginTop: '3px' } }, def.desc(!!p.u))); } catch { /* */ }
  return box;
}

// Which plant a seed card grows (explicit `plant` field, else a plant name in its text).
function plantFor(inst) {
  const d = CARDS[inst.id];
  if (!d || d.type !== 'seed') return null;
  if (d.plant && PLANTS[d.plant]) return d.plant;
  const text = descText(inst).toLowerCase();
  return Object.keys(PLANTS).find(id => text.includes((PLANTS[id].name || id).toLowerCase())) || null;
}

// Full-screen inspect: the card large, its upgraded version beside it, glossary, flavor, plant.
// Tap anywhere or press Esc to close. Returns the modal element (already appended).
export function inspectCard(inst, { cost, onClose } = {}) {
  hideTip();
  document.querySelector('.modal.inspect')?.remove();
  const d = CARDS[inst.id];
  const pair = h('div.inspect-pair', h('div.inspect-col', renderCard(inst, { cost, className: 'huge' }), inst.u ? h('small', 'Upgraded') : null));
  if (!inst.u && d && d.type !== 'gloom') {
    pair.append(h('div.inspect-arrow', '▸'), h('div.inspect-col', renderCard({ ...inst, u: true }, { className: 'huge' }), h('small', 'Upgraded')));
  }
  const info = h('div.inspect-info.chip');
  if (d?.flavor) info.append(h('div.flavor', d.flavor));
  const pid = plantFor(inst);
  if (pid) {
    const pd = PLANTS[pid];
    let t = '';
    try { t = pd.desc(!!inst.u); } catch { /* */ }
    info.append(h('div.gl', img(`plant_${pid}_3`, 2), h('span', h('b', pd.name + ': '), /grow/i.test(t) ? t : `Grows in ${pd.growTime}. ${t}`)));
  }
  for (const k of glossaryFor(inst)) info.append(h('div.gl', h('span', h('b', k + ': '), GLOSSARY[k])));
  const close = () => { m.remove(); removeEventListener('keydown', onKey, true); onClose?.(); };
  const onKey = e => { if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(); } };
  const m = h('div.modal.inspect', { onclick: close, oncontextmenu: e => { e.preventDefault(); close(); } },
    pair, info.childNodes.length ? info : null, h('div.inspect-hint', 'Tap anywhere to close'));
  addEventListener('keydown', onKey, true);
  (document.getElementById('overlay') || document.body).append(m);
  return m;
}

// Long-press (touch) or right-click (desktop) opens inspect. Sets el._lpFired so a click handler
// can ignore the release that ends a long-press. Use for cards outside the hand (grids, piles).
export function attachInspect(el, getInst, opts = {}) {
  let t = 0, sx = 0, sy = 0;
  const open = () => { el._lpFired = true; inspectCard(getInst(), opts); };
  el.addEventListener('contextmenu', e => { e.preventDefault(); if (!document.querySelector('.modal.inspect')) open(); });
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    el._lpFired = false; sx = e.clientX; sy = e.clientY;
    clearTimeout(t); t = setTimeout(open, 450);
  });
  el.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) clearTimeout(t); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => clearTimeout(t));
  el.addEventListener('click', e => { if (el._lpFired) { el._lpFired = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}
