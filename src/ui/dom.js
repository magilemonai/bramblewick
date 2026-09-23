// Tiny DOM helpers, tooltips, toasts, floating text.
import { spriteImg } from '../pixel.js';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const $ = (sel, root = document) => root.querySelector(sel);

// h('div.cls1.cls2', {attrs|on*}, ...children)
export function h(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'tip') setTip(el, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const img = (id, scale = 4, cls = '') => spriteImg(id, scale, cls);

// ---------- tooltips (hover on desktop, press-and-hold / tap on touch) ----------
const tipEl = () => document.getElementById('tip');
let tipTimer = 0;
export function setTip(el, content) { el._tip = content; el.classList.add('has-tip'); }
function tipContent(el) { const c = typeof el._tip === 'function' ? el._tip() : el._tip; return c; }
export function showTip(el, at = null) {
  const t = tipEl(); const c = tipContent(el);
  if (!c) return;
  t.innerHTML = '';
  if (typeof c === 'string') t.innerHTML = c; else t.append(c);
  t.hidden = false;
  const r = el.getBoundingClientRect();
  const tw = t.offsetWidth, th = t.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 6;
  if (y < 6) y = r.bottom + 6;
  if (at) { x = at.x - tw / 2; y = at.y; }
  x = Math.max(6, Math.min(innerWidth - tw - 6, x));
  y = Math.max(6, Math.min(innerHeight - th - 6, y));
  t.style.left = x + 'px'; t.style.top = y + 'px';
  clearTimeout(tipTimer);
}
export function hideTip() { const t = tipEl(); if (t) t.hidden = true; }
export function installTips() {
  let current = null;
  const find = e => e.target.closest?.('.has-tip');
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const el = find(e);
    if (el !== current) { current = el; el ? showTip(el) : hideTip(); }
  });
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    const el = find(e);
    if (el && !el.closest('.card')) { showTip(el); clearTimeout(tipTimer); tipTimer = setTimeout(hideTip, 2600); }
    else hideTip();
  }, true);
  document.addEventListener('scroll', hideTip, true);
}

export function toast(text, ms = 1600) {
  const el = h('div.toast.chip', text);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}
export function banner(text, color) {
  const el = h('div.banner', text);
  if (color) el.style.color = color;
  document.body.append(el);
  setTimeout(() => el.remove(), 1200);
}
export function floatText(x, y, text, cls = '') {
  const el = h('div.float.' + (cls || 'dmg').split(' ').join('.'), text);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  document.body.append(el);
  setTimeout(() => el.remove(), 1050);
}
export function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
}
