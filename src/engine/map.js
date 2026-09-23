// Branching season map: 12 floors + boss. Nodes: { id, row, col, type, next:[ids] }.
export const FLOORS = 12;
export const COLS = 7;

export function generateMap(rng) {
  const nodes = new Map(); // key "r,c"
  const edges = new Set(); // "r,c>r2,c2"
  const key = (r, c) => `${r},${c}`;
  const get = (r, c) => {
    const k = key(r, c);
    if (!nodes.has(k)) nodes.set(k, { id: k, row: r, col: c, type: null, next: [] });
    return nodes.get(k);
  };

  const starts = [];
  for (let p = 0; p < 6; p++) {
    let c = p < 2 ? [1, 5][p] : rng.int(0, COLS - 1);
    if (p === 1 && starts[0] === c) c = (c + 3) % COLS;
    starts.push(c);
    get(0, c);
    for (let r = 0; r < FLOORS - 1; r++) {
      let d = rng.int(-1, 1);
      let nc = Math.min(COLS - 1, Math.max(0, c + d));
      d = nc - c;
      // avoid crossing an existing diagonal
      if (d !== 0 && edges.has(`${key(r, nc)}>${key(r + 1, c)}`)) { nc = c; d = 0; }
      const e = `${key(r, c)}>${key(r + 1, nc)}`;
      if (!edges.has(e)) { edges.add(e); get(r, c).next.push(key(r + 1, nc)); }
      get(r + 1, nc);
      c = nc;
    }
    const last = get(FLOORS - 1, c);
    if (!last.next.includes('boss')) last.next.push('boss');
  }
  const boss = { id: 'boss', row: FLOORS, col: 3, type: 'boss', next: [] };

  // assign types
  const parents = new Map();
  for (const n of nodes.values()) for (const t of n.next) {
    if (!parents.has(t)) parents.set(t, []);
    parents.get(t).push(n);
  }
  const sorted = [...nodes.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  for (const n of sorted) {
    if (n.row === 0) { n.type = 'fight'; continue; }
    if (n.row === FLOORS - 1) { n.type = 'hearth'; continue; }
    if (n.row === 6) { n.type = rng() < 0.5 ? 'forage' : 'market'; continue; }
    const weights = { fight: 44, villager: 22, forage: 8, hearth: 10, market: 6, elite: 10 };
    if (n.row < 4) { weights.elite = 0; weights.hearth = 0; }
    if (n.row === FLOORS - 2) weights.hearth = 0;
    if (n.row < 2) weights.market = 0;
    const ptypes = (parents.get(n.id) || []).map(p => p.type);
    for (const t of ['elite', 'hearth', 'market', 'forage']) if (ptypes.includes(t)) weights[t] = 0;
    n.type = rng.weighted(weights);
  }
  return { nodes: Object.fromEntries([...nodes.entries(), ['boss', boss]]), starts: [...new Set(starts)] };
}

export function nodeLabel(type) {
  return {
    fight: 'Skirmish', elite: 'Thicket', forage: 'Forage', villager: 'Villager',
    market: "Odile's Stall", hearth: "Rue's Hearth", boss: 'The Season Keeper',
  }[type] || type;
}
