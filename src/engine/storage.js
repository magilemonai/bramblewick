// Guarded localStorage access (private mode, node, quota errors all degrade to no-ops).
function ls() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } }
export function store(k, v) { try { ls()?.setItem(k, JSON.stringify(v)); } catch { /* private mode / quota */ } }
export function load(k) { try { const v = ls()?.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
export function drop(k) { try { ls()?.removeItem(k); } catch { /* noop */ } }
