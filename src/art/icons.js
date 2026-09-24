// Icons: card art, UI, statuses, intents, weather, map nodes, keepsakes, preserve jars, textures.
// Side-effect module: only calls registerSprites. No DOM.
//
// Authoring convention: 16x16 icons are drawn on a 14x14 canvas and padded by 1px on every side,
// so `outline: true` has room to lay the ink border. Map nodes are drawn 18x18 -> 20x20.
// All icons share one palette (P) so shade ramps stay consistent; a sprite can extend it.
import { registerSprites, PAL } from '../pixel.js';

// ---------------------------------------------------------------------------------------------
// Shared palette. Ramps run dark -> light, lit from the upper-left.
// ---------------------------------------------------------------------------------------------
const P = {
  k: PAL.ink, K: PAL.inkSoft,
  // wood
  w: PAL.woodDark, W: PAL.wood, L: PAL.woodLight, l: '#dcae78',
  // metal / stone
  m: PAL.stoneDark, M: PAL.stone, n: '#c3beb6', N: '#f1ede4',
  // greens
  V: '#2d5a33', g: PAL.leafDark, G: PAL.leaf, h: PAL.leafLight, v: PAL.moss,
  // reds
  R: '#962c33', r: PAL.red, q: '#f07b63', Q: '#ffc0a8',
  // oranges
  O: PAL.rust, o: PAL.orange, A: '#f6b26b',
  // golds / yellows
  Y: '#c47f1f', y: PAL.gold, u: PAL.sun, U: '#fff1a8',
  // parchment / cream
  H: '#b0925a', P: PAL.parchDark, p: PAL.parchment, c: PAL.cream, a: PAL.white,
  // blues / ice
  D: '#2e5c8c', b: PAL.water, B: PAL.skyDeep, s: PAL.sky, i: PAL.ice, f: PAL.frost, S: PAL.snow,
  // purples / gloam
  z: PAL.plum, X: PAL.purple, x: PAL.lilac, E: PAL.gloomDark, e: PAL.gloom, j: PAL.gloomGlow,
  C: '#e4d8ff',
  // pinks
  Z: PAL.berry, T: PAL.rose, t: PAL.pink, F: '#fcd6de',
};

// Pad an authored grid out to `size` with a transparent margin, centred. Throws on ragged rows
// so a typo shows up the moment the module is imported by the sprite-sheet tool.
function pad(rows, size, id) {
  const w = rows[0].length;
  for (const r of rows) if (r.length !== w) throw new Error(`[icons] ${id}: ragged row "${r}" (${r.length} vs ${w})`);
  if (w > size || rows.length > size) throw new Error(`[icons] ${id}: ${w}x${rows.length} exceeds ${size}`);
  const left = Math.floor((size - w) / 2), right = size - w - left;
  const top = Math.floor((size - rows.length) / 2), bottom = size - rows.length - top;
  const blank = '.'.repeat(size);
  return [
    ...Array(top).fill(blank),
    ...rows.map(r => '.'.repeat(left) + r + '.'.repeat(right)),
    ...Array(bottom).fill(blank),
  ];
}

// icon(rows, extraPalette?, opts?) -> 16x16 outlined sprite def
function icon(id, rows, extra = {}, opts = {}) {
  const size = opts.size || 16;
  return { palette: { ...P, ...extra }, outline: opts.outline ?? true, rows: pad(rows, size, id) };
}
// Tiny composer for sprites with diagonals or radial shapes that are painful to type by hand.
function canvas(w, h) {
  const g = [...Array(h)].map(() => Array(w).fill('.'));
  const api = {
    set(x, y, ch) { if (ch !== '.' && x >= 0 && y >= 0 && x < w && y < h) g[y][x] = ch; return api; },
    stamp(x, y, rows) { rows.forEach((r, dy) => [...r].forEach((ch, dx) => api.set(x + dx, y + dy, ch))); return api; },
    each(fn) { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ch = fn(x, y, g[y][x]); if (ch) g[y][x] = ch; } return api; },
    rows() { return g.map(r => r.join('')); },
  };
  return api;
}
// Light from the upper-left: returns -1..1 for a point relative to a centre.
const lit = (dx, dy) => { const r = Math.hypot(dx, dy) || 1; return -(dx + dy) / (r * Math.SQRT2); };
const defs = {};
const add = (group, size = 16) => {
  for (const [id, v] of Object.entries(group)) {
    const [rows, extra, opts] = Array.isArray(v) ? [v, {}, {}] : [v.rows, v.pal || {}, v];
    defs[id] = icon(id, rows, extra, { ...opts, size: opts.size || size });
  }
};

// =============================================================================================
// CARD ART (icon_*)
// =============================================================================================
add({
  icon_hoe: [
    '......mm......',
    '.....mnNm.....',
    '.....LnNNm....',
    '.....LWnNNm...',
    '....LW.mnNMm..',
    '....LW..mnMMm.',
    '...LW....mMMMm',
    '...LW.....mMm.',
    '..LW..........',
    '..LW..........',
    '.LW...........',
    '.LW...........',
    'LW............',
    'w.............',
  ],
  icon_watering_can: [
    '..............',
    '.........DDD..',
    '........D...D.',
    '........D...D.',
    'S.......D...D.',
    'si...sssssssD.',
    '.Bi.sSiiissBD.',
    '..BbssissssBD.',
    '...BbsssssBBD.',
    '....bsssssBBD.',
    '....bBBBBBBBD.',
    '....DbBBBBBDD.',
    '.....DDDDDDD..',
    '..............',
  ],
  icon_scythe: [
    '....nNNNNM....',
    '..nNNMMMMmmL..',
    '.nNMm.....LW..',
    'nMm.......LW..',
    'Mm........LW..',
    'm..........LW.',
    '...........LW.',
    '.........lLLWw',
    '...........LW.',
    '...........LW.',
    '............LW',
    '............LW',
    '............LW',
    '............wW',
  ],
  icon_axe: [
    '......NN......',
    '.....NNnM.....',
    '....NNnnMm.L..',
    '....NnnMMmL...',
    '.....nMMmLW...',
    '......mmLWm...',
    '.......LWmm...',
    '......LW......',
    '.....LW.......',
    '....LW........',
    '...LW.........',
    '..LW..........',
    '.LW...........',
    '.w............',
  ],
  icon_pickaxe: [
    '....nNNNNn....',
    '..nNNnnnnMMm..',
    '.nNm..LW..mMm.',
    'nNm...LW...mMm',
    'Nm....LW....mm',
    'm.....LW.....m',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......wW......',
  ],
  icon_sickle: [
    '.....nNNNn....',
    '...nNNnMMMm...',
    '..nNm....mMm..',
    '.nNm......mMm.',
    '.Nm........Mm.',
    '.Nm........m..',
    '.nM...........',
    '..nM..........',
    '...LW.........',
    '...LW.........',
    '..LLW.........',
    '..LW..........',
    '..LW..........',
    '..ww..........',
  ],
  icon_rake: [
    '.N..N..N..N..N',
    '.n..n..n..n..n',
    'nNNNNNNNNNNNNM',
    'MmmmmmmmmmmmMm',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......wW......',
  ],
  icon_shovel: [
    '.....LLLL.....',
    '.....L..W.....',
    '.....LWWW.....',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '....mnLWMm....',
    '...mNnnnMMm...',
    '...nNnnnMMm...',
    '...nNnnnMMm...',
    '...nNnnnMMm...',
    '....nnnMMm....',
    '......nm......',
  ],
  icon_fishing_rod: [
    '...........Lc.',
    '..........LW.c',
    '.........LW..c',
    '........LW...c',
    '.......LW....c',
    '......LW.....c',
    '.....LW.....ra',
    '....LW......rR',
    '..mnLW........',
    '..nNm.........',
    '..LmW.........',
    '.LW...........',
    'AA............',
    'Oo............',
  ],
  icon_slingshot: [
    '.LL........LL.',
    '.LWr......rLW.',
    '.LW.r....r.LW.',
    '.LW..rmmr..LW.',
    '..LW..mm..LW..',
    '...LW....LW...',
    '....LWWWWLW...',
    '.....LWWWW....',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......LW......',
    '......ww......',
  ],
  icon_straw_hat: [
    '.....uuuuy....',
    '....uUuuuyY...',
    '....uuuyuyY...',
    '....uuyuuyY...',
    '....rrrrrrR...',
    '.uuuqrrrrRRyY.',
    'uUuuuuuuuyyyYY',
    'uuuyuuyuuyyYYY',
    '.YyyyyyyyyyYY.',
    '...YYYYYYYY...',
  ],
  icon_fence: [
    '...L......L...',
    '..LlW....LlW..',
    '..LlW....LlW..',
    'LLLLLLLLLLLLLL',
    'WWWWWWWWWWWWWW',
    'wwLlWwwwwLlWww',
    '..LlW....LlW..',
    '..LlW....LlW..',
    'LLLLLLLLLLLLLL',
    'WWWWWWWWWWWWWW',
    'wwLlWwwwwLlWww',
    '..LlW....LlW..',
    '..LlW....LlW..',
    '..wwW....wwW..',
  ],
  icon_basket: [
    '.....LLLL.....',
    '....L....W....',
    '...L......W...',
    '...L.qrGhGW...',
    '...LqQrrgGGW..',
    '.llllllllllll.',
    '.LLLLLLLLLLLw.',
    '.WLWWLWWLWWWw.',
    '..LLLLLLLLLw..',
    '..WLWWLWWLWw..',
    '..LLLLLLLLLw..',
    '...wwwwwwww...',
  ],
  icon_seed_pouch: [
    '.....p..p.....',
    '....pPppPp....',
    '.....rrrr.....',
    '.....PppP.....',
    '....pcppPP....',
    '...pcpppPPH...',
    '..pcppppPPPH..',
    '..pcppGgPPPH..',
    '..pcpGhGPPPH..',
    '..PpppGPPPPH..',
    '...PPPPPPHH...',
    '....HHHHHH.L..',
    '..........W.L.',
    '...........W..',
  ],
  icon_compost: [
    '......G.......',
    '.....GhG......',
    '....KWGKo.....',
    '...KWWKKKo....',
    '..KWKcKKKKK...',
    '.KWKWoKKGKKK..',
    'KWKKKKKKKhGKKK',
    'LLLLLLLLLLLLLL',
    'WlWWWWWWWWWWWw',
    'wwwwwwwwwwwwww',
    'LLLLLLLLLLLLLL',
    'WlWWWWWWWWWWWw',
    'wwwwwwwwwwwwww',
  ],
  icon_lantern: [
    '......mm......',
    '.....m..m.....',
    '....mnnnMm....',
    '...mnNNnMMm...',
    '...mUuyyyYm...',
    '...mUuuyyYm...',
    '...mUuaUyYm...',
    '...muuUyyYm...',
    '...myyuyYYm...',
    '...myYYYYOm...',
    '...mnnnnMMm...',
    '....mmmmmm....',
  ],
  icon_teacup: [
    '..cccccccccP..',
    '..cWWWLWWWWc..',
    '..accccccPPPcc',
    '..acTtcccPPc.c',
    '..acccccPPPc.c',
    '...acTtcPPPcc.',
    '....cccPPP....',
    '.ppcccccccPPP.',
    '..PPPPPPPPPP..',
  ],
  icon_bread: [
    '.....AAAAA....',
    '...AAuAAAAoo..',
    '..AuAUoAUoAoO.',
    '.AuAUoAUoAUoO.',
    '.AAUoAUoAUooO.',
    '.oAAAAAAAAoOO.',
    '.ooooooooooOO.',
    '..OOOOOOOOOO..',
  ],
  icon_honey: {
    pal: { 1: '#e2a15e', 2: '#b87440', 3: '#8a5230', 4: '#5e3420' },
    rows: [
    '.........lW...',
    '........lW....',
    '...1111lW11...',
    '..2uuuuUuuy2..',
    '..1yuUuyyyY2..',
    '.112y11y1122..',
    '1112y12y11223.',
    '112u1112112233',
    '112y1112122233',
    '1122222222233.',
    '.12222222233..',
    '..333333333...',
    '...4444444....',
  ] },
  icon_feather: [
    '...........ss.',
    '.........ssSsB',
    '........sSSaBB',
    '.......sSSaBBb',
    '......sSSaBBb.',
    '.....sSSaBBb..',
    '....sSSaBBb...',
    '...sSSaBBb....',
    '...sSaBBb.....',
    '....aBb.......',
    '...a..........',
    '..a...........',
    '.P............',
  ],
  icon_acorn: {
    pal: { 1: '#efc27f', 2: '#c98a4b', 3: '#96592f' },
    rows: [
    '......W.......',
    '......Ww......',
    '...LLLLLWW....',
    '..LlLlLLWWw...',
    '.LLlLLLWLWww..',
    '.WLLWLWWWwww..',
    '..wwwwwwwww...',
    '...11222223...',
    '..1122222233..',
    '..1222222233..',
    '...12222233...',
    '....222233....',
    '.....2333.....',
    '......33......',
  ] },
  icon_leaf: [
    '...........hh.',
    '........hhhhG.',
    '......hhhhGGG.',
    '.....hhhhGGGg.',
    '....hhhhGGgGg.',
    '...hhhGGGgGg..',
    '...hhGGGgGgg..',
    '..hhGGgGGgg...',
    '..hGGgGGgg....',
    '..hGgGGgg.....',
    '..GgGggg......',
    '.Wggg.........',
    'W.............',
  ],
  icon_mushroom: [
    '.....rrrrr....',
    '...rqaqrrrrR..',
    '..rqaaqrrrarR.',
    '.rqqqrrrrraaR.',
    '.rqrrraarrrRR.',
    '.rrrrraarrRRR.',
    '..RRRRRRRRRR..',
    '.....cpcP.....',
    '.....cccP.....',
    '.....cacP.....',
    '....ccccPP....',
    '....pPPPPH....',
  ],
  icon_flower: [
    '.....FtT......',
    '....FtttT.....',
    '..FtTtttTFtT..',
    '.FtttuUyTtttT.',
    '.tttTUyyYtttT.',
    '..tTTyyYYTTT..',
    '...FttTTFtT...',
    '..FtttTFtttT..',
    '...tTT..tTT...',
    '......gG......',
    '...hG.gG......',
    '...GgggG......',
    '......gG......',
    '......gg......',
  ],
  icon_sun: [
    '......yy......',
    '......yy......',
    '..yy......yy..',
    '..yy.uuuu.yy..',
    '....uUUuuy....',
    '...uUUuuuyy...',
    'yy.uUuuuuyY.yy',
    'yy.uuuuuyyY.yy',
    '...uuuuyyYY...',
    '....yyyYYY....',
    '..yy.YYYY.yy..',
    '..yy......yy..',
    '......yy......',
    '......yy......',
  ],
  icon_raincloud: [
    '.....SSS......',
    '...SSaaSSi....',
    '..SaaSSSSSii..',
    '.SaSSSSSSSiif.',
    '.SSSSSSSiiiff.',
    '..ffffffffff..',
    '..............',
    '...b....b.....',
    '..bs...bs...b.',
    '..bb...bb..bs.',
    '...........bb.',
    '.....b........',
    '....bs........',
    '....bb........',
  ],
  icon_snowflake: [
    '......i.......',
    '....i.S.i.....',
    '.....iSi......',
    '.i....S....i..',
    '..S...S...S...',
    '...S.iSi.S....',
    'iSSSSSaSSSSSi.',
    '...S.iSi.S....',
    '..S...S...S...',
    '.i....S....i..',
    '.....iSi......',
    '....i.S.i.....',
    '......i.......',
  ],
  icon_wind: [
    '........iii...',
    '.......i...i..',
    '...........i..',
    '.iiiiiiiiii...',
    '..............',
    '.......hG.....',
    '..sssssGhG....',
    '.......gG.....',
    '..............',
    'iiiiiiiiiii...',
    '...........i..',
    '.......i...i..',
    '........iii...',
  ],
  icon_moon: [
    '.....UUUU.....',
    '...UUuuU......',
    '..Uuuu........',
    '.Uuuy.......u.',
    '.Uuy.......uUu',
    'Uuuy........u.',
    'Uuuy..........',
    'Uuuy..........',
    'Uuuyy.........',
    '.uuyyy......Y.',
    '.uyyyyY.....Y.',
    '..yyyyYYYYY...',
    '...YYYYYYY....',
  ],
  icon_star: [
    '......uy......',
    '......uy......',
    '.....uUyy.....',
    '.....uUyy.....',
    'uuuuuUUyyyyyyY',
    '.uuUUUuyyyyyY.',
    '..uuUuuyyyyY..',
    '...uuuyyyyY...',
    '...uuuyyyyY...',
    '..uuuyyyyyYY..',
    '..uuyY..yyYY..',
    '.uyY......YYY.',
    '.yY........YY.',
  ],
  icon_heart: [
    '..qqq....qrr..',
    '.qQqrr..qrrrR.',
    'qQqrrrrrrrrrRR',
    'qqrrrrrrrrrrRR',
    'qrrrrrrrrrrrRR',
    '.rrrrrrrrrrRR.',
    '..rrrrrrrrRR..',
    '...rrrrrrRR...',
    '....rrrrRR....',
    '.....rrRR.....',
    '......RR......',
  ],
  icon_bell: [
    '......YY......',
    '.....Y..Y.....',
    '.....uuyy.....',
    '....uUuyyY....',
    '....uUuyyY....',
    '...uUuuyyyY...',
    '...uUuuyyyY...',
    '..uUuuuyyyyY..',
    '.uuuuuyyyyyYY.',
    '.yyyyyyyyyYYY.',
    '..YYYYYYYYYY..',
    '......OO......',
  ],
  icon_scarecrow: [
    '.....yyyy.....',
    '....yuuyyY....',
    '..yyyyyyyyyY..',
    '....pcppPP....',
    '....pkppkP....',
    '....ppKKPP....',
    'u.GGGGGGGGGG.u',
    'uuGhGGGGGGgGuu',
    '....GGrGGg....',
    '....GhGGGg....',
    '....ggggggg...',
    '......LW......',
    '......LW......',
    '......LW......',
  ],
  icon_bee: [
    '.....ii.ii....',
    '....iSSiSSi...',
    '....iSaiSai...',
    '.....ii.ii....',
    '...uuKuuKuKK..',
    '..uUuKuuKuKkK.',
    '.uUuuKuuKyKaKk',
    'kuuuuKuyKyKKKk',
    '.yyyyKyyKYKKK.',
    '..YYYKYYKYKK..',
  ],
  icon_egg: [
    '......cc......',
    '.....caccp....',
    '....caaccpp...',
    '....caccccp...',
    '...cacccPcpP..',
    '...ccccccppP..',
    '...cPccccppP..',
    '...ccccPcppP..',
    '...pccccppPP..',
    '....ppppPPP...',
    '.....PPPPH....',
  ],
  icon_milk: [
    '.....BBBB.....',
    '.....bbbb.....',
    '.....iSSi.....',
    '.....SaSi.....',
    '....SaSSSi....',
    '...SaSSSSSi...',
    '...SaaSSSSi...',
    '...SsssssSi...',
    '...SsBBBsSi...',
    '...SsBBBsSi...',
    '...SsssssSi...',
    '...SSSSSSSi...',
    '...iiiiiiif...',
  ],
  icon_pie: [
    '....AAAAAA....',
    '..AAuAAZAuAA..',
    '.AuAZAuAZAuAo.',
    '.AAuAuAuAuAoo.',
    'AAAAAAAAAAAAoo',
    'oAAoAAoAAoAAoO',
    '.oOOOOOOOOOOO.',
    '..mnnnnnnnnm..',
  ],
  icon_quilt: [
    'ttttccccssssP.',
    'tFttcpcpsasbP.',
    'ttTtcccpssbbP.',
    'tTTtpcppsbbbP.',
    'ssssyyyyttttP.',
    'sassyuyytFttP.',
    'ssbsyyyYttTtP.',
    'sbbbyYYYtTTtP.',
    'cccchhhhyyyyP.',
    'cpcphGhhyuyYP.',
    'ccppGhhGyyYYP.',
    'pcppGGGGyYYYP.',
    'PPPPPPPPPPPPH.',
  ],
  icon_book: [
    '..gGGGGGGGGGc.',
    '.gGhhhhhhhhGcp',
    '.gGhGGGGGGhGcp',
    '.gGhGyyyyGhGcp',
    '.gGhGyuuyGhGcp',
    '.gGhGyuuyGhGcp',
    '.gGhGyyyyGhGcp',
    '.gGhGGGGGGhGcp',
    '.gGhhhhhhhhGcp',
    '.gGGGGGGGGGGcp',
    '.VggggggggggPp',
    '..cccccccccccP',
    '..PPPPrrPPPPP.',
    '......rR......',
  ],
  icon_gloom: [
    '.....eeee.....',
    '...eejjeee....',
    '..ejjeeeeeE...',
    '.eejeeeeeeeE..',
    '.eeeCxeeCxeE..',
    'eeeeExeeExeeE.',
    'eeeeeeeeeeeeE.',
    'eeeeeEEEEeeeE.',
    '.eeeeeeeeeeE..',
    '.eeEeeEEeeEE..',
    '..E.eE..EeE...',
    '....E....E....',
  ],
  icon_stone: [
    '.....nnnn.....',
    '...nnNNnnMM...',
    '..nNNnnnMMMm..',
    '.nNnnnnMMmMmm.',
    '.nnnnnMMmMmmm.',
    'nnnnMMMMMmmmmm',
    'nMMMMmMMmmmmm.',
    '.MMMMmmmmmmm..',
    '..mmmmmmmmm...',
  ],
  icon_log: [
    '......hG......',
    '.....hGg......',
    '..WWWWWlllll..',
    '.WLLLLllAAAll.',
    'WLWLLWlAlllAl.',
    'WWLWWLlAlAlAl.',
    'WwWWwWlAlllAl.',
    'wwWwwWlAAAAAl.',
    '.wwwwwwlllll..',
  ],
  icon_scroll: [
    '.pccccccccccP.',
    'pcPPPPPPPPPPpP',
    '.pccccccccccP.',
    '..pcKKKKcccP..',
    '..pcccccccpP..',
    '..pcKKKKKcpP..',
    '..pcccccccpP..',
    '..pcKKKcccpP..',
    '..pcccccccpP..',
    '..pcccrrccpP..',
    '.pccccrRcccpP.',
    'pcPPPPPPPPPPpP',
    '.PPHHHHHHHHHP.',
  ],
  icon_flute: [
    'lW............',
    'lWlW..........',
    'lWlWlW........',
    'lWlWlWlW......',
    'rrrrrrrrrrrr..',
    'lWlWlWlWlWlW..',
    'lWlWlWlWlWlW..',
    'lWlWlWlWlW....',
    'lWlWlWlW......',
    'lWlWlW........',
    'lWlW..........',
    'lW............',
  ],
  icon_kite: [
    '........t.....',
    '.......tTr....',
    '......tttrr...',
    '.....ttttrrr..',
    '....tttttrrrr.',
    '.....uuuuyyy..',
    '......uuuyy...',
    '.......uyy....',
    '........y.....',
    '.......K......',
    '.....bK.......',
    '....KbB.......',
    '...K..........',
    '.bK...........',
  ],
  icon_snail: [
    '.....AAAA.....',
    '....AoOOoA....',
    '...AoAAAoOA...',
    '...AOAoAOoO...',
    '...AOAOoOoO..p',
    '...AoOOOoOO.pk',
    '....AoooOO..pp',
    '..cpccccccccpp',
    '.cpppppppppPP.',
  ],
});

// =============================================================================================
// UI (ui_*)
// =============================================================================================
const HEART = defs.icon_heart.rows.slice(1, 15).map(r => r.slice(1, 15)).filter(r => r.trim('.') !== '');
const BARK_SHIELD = [
  '.lllllllllllL.',
  'lLLLLLLLLLLLLW',
  'lLWLLLWLLLWLLW',
  'lLWLLLhGLLWLLW',
  'lLWLLhGGgLWLWW',
  'lLLWLhGgLLLWLW',
  'lLLWLLgLLLLWLW',
  'lLLWLLWLLLLWWw',
  '.LLLWLWLLLWLw.',
  '..LLWLLWLLWw..',
  '...LLWLLWWw...',
  '....LLWWWw....',
  '.....LWWw.....',
  '......Ww......',
];

const coin = canvas(14, 14).each((x, y) => {
  const dx = x - 6.5, dy = y - 6.5, r = Math.hypot(dx, dy), l = lit(dx, dy);
  if (r > 6.9) return null;
  if (r > 5.3) return l > 0.35 ? 'U' : l > -0.35 ? 'u' : 'Y';
  if (r > 4.3) return l > 0.35 ? 'Y' : l < -0.35 ? 'u' : 'y';
  return 'y';
}).stamp(4, 3, [
  '..Ug..',
  '.UGg..',
  '..Gg.',
].map(r => r.padEnd(6, '.'))).stamp(4, 5, [
  '.Uyy..',
  'Uuyyy.',
  'uyyyYY',
  '.yyYY.',
  '..YY..',
]).rows();

// Leaf-sun: a gold core ringed by green leaves (long diagonals) and short gold rays (cardinal).
// Silhouette and colour both differ from the round gold ui_coin.
const stamina = canvas(14, 14).each((x, y) => {
  const dx = x + 0.5 - 7, dy = y + 0.5 - 7, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), l = lit(dx, dy);
  if (r < 3.3) return r < 1.6 && l > 0.2 ? 'U' : l > 0.35 ? 'u' : l > -0.45 ? 'y' : 'Y';
  const k = Math.round(a / (Math.PI / 4)), da = Math.abs(a - k * Math.PI / 4) * r;
  const leaf = k % 2 !== 0;
  const len = leaf ? 9.4 : 6.9, t = Math.max(0, (r - 2.6) / (len - 2.6));
  if (t > 1) return null;
  const w = leaf ? 2.1 * Math.sin(Math.PI * Math.pow(t, 0.75)) + 0.15 : 1.3 * (1 - t) + 0.1;
  if (da > w) return null;
  if (!leaf) return l > 0 ? 'u' : 'y';
  const side = Math.sign(a - k * Math.PI / 4) * (k === 1 || k === -3 ? 1 : -1);
  if (da < 0.45 && t > 0.2 && t < 0.8) return 'G';
  return side > 0 ? (l > -0.2 ? 'h' : 'G') : (l > 0.3 ? 'G' : 'g');
}).rows();

const gear = canvas(14, 14).each((x, y) => {
  const dx = x - 6.5, dy = y - 6.5, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), l = lit(dx, dy);
  const tooth = Math.cos(a * 8) > 0.2;
  if (r < 2.2 || r > 7 || (r > 5.1 && !tooth)) return null;
  if (r < 3.3) return l > 0.3 ? 'm' : l < -0.3 ? 'n' : 'M';
  return l > 0.5 ? 'N' : l > -0.1 ? 'n' : l > -0.6 ? 'M' : 'm';
}).rows();

const SPEAKER = [
  '......m.......',
  '.....mn.......',
  '....mnN.......',
  'nnnmnNN.......',
  'nNNnNNN.......',
  'nNNnNNN.......',
  'nNNnNNN.......',
  'MMMmNNM.......',
  '....mMM.......',
  '.....mM.......',
  '......m.......',
];
const withRight = (base, right) => base.map((r, i) => r.slice(0, 8) + (right[i] || '......'));

add({
  ui_heart: HEART,
  ui_coin: coin,
  ui_stamina: stamina,
  ui_bark: BARK_SHIELD,
  ui_deck: [
    '....PPPPPPPPPP',
    '..ppppppppppPP',
    'ccccccccccpPpP',
    'cGGGGGGGGcpPpP',
    'cGGGhGGGGcpPpP',
    'cGGhhhGGGcpPpP',
    'cGhhGhhGGcpPpP',
    'cGGhhhGGgcpPpP',
    'cGGGhGGGgcpPpP',
    'cGGGGGGggcpPpP',
    'cGGGGGGggcpPH.',
    'cggggggggcpP..',
    'cggggggggcH...',
    'cccccccccc....',
  ],
  ui_discard: canvas(14, 14).stamp(0, 0, [
    '.cccccc.',
    'cppppppP',
    'cpttttpP',
    'cptrrtpP',
    'cpttttpP',
    'cppppppP',
    'cpPPPppP',
    'cppppppP',
    'cpPPpppP',
    '.PPPPPP.',
  ]).stamp(4, 4, ['H', 'H', 'H', 'H', 'H', 'H']).stamp(5, 3, [
    '.ccccccc.',
    'cpppppppP',
    'cpsssshpP',
    'cpsshGGpP',
    'cpshGGGpP',
    'cpGGGgGpP',
    'cpppppppP',
    'cpPPPPppP',
    'cpppppppP',
    'cpPPPpppP',
    '.PPPPPPP.',
  ]).rows(),
  ui_compost: [
    '.......G......',
    '..t...GhG.....',
    '.tTt..GgG.....',
    '..Tt.KWGKo....',
    '...TKWWKKKo...',
    '..KWKcKKKKKK..',
    'nnnnnnnnnnnnnM',
    '.MnMMMMMMMMMm.',
    '.MnMMMMMMMMMm.',
    '.MnnnnnnnnnMm.',
    '.MnMMMMMMMMMm.',
    '..nMMMMMMMMm..',
    '..mmmmmmmmmm..',
  ],
  ui_map: [
    '....cccc......',
    'ppppcccPPPP...',
    'pGhppcccPPPPpp',
    'phGppcrcPPPPpp',
    'ppppccrccPPPsp',
    'ppKppcccPPsspp',
    'pppKpcccPPsbpp',
    'ppppKcccPPPppp',
    'ppppccKcPPPrpr',
    'ppppccccKPPprp',
    'PPPPccccPPPrpr',
    '....ccccPPPPPP',
    '....ccPP......',
  ],
  ui_gear: gear,
  ui_sound_on: withRight(SPEAKER, [
    '......', '..u...', '...u..', '.u..u.', '..u.u.', '..u.u.', '..u.u.', '.u..u.', '...u..', '..u...', '......',
  ]),
  ui_sound_off: withRight(SPEAKER, [
    '......', '......', '......', 'r...r.', '.r.r..', '..r...', '.r.r..', 'r...r.', '......', '......', '......',
  ]),
});

// Clenched fist, knuckles to the viewer, thumb across the front, red cuff. Reads as "hit harder".
const FIST = canvas(14, 14).each((x, y) => {
  const px = x + 0.5, py = y + 0.5;
  const sh = (cx, cy, rx, ry) => {
    const dx = (px - cx) / rx, dy = (py - cy) / ry;
    if (dx * dx + dy * dy > 1) return null;
    const l = -(dx + dy) * 0.75;
    return l > 0.3 ? '1' : l > -0.4 ? '2' : '3';
  };
  if (y >= 11 && x >= 3 && x <= 10) return y === 11 ? 'r' : 'R';
  const t = sh(6.4, 8.9, 4.7, 1.9); if (t) return t;
  for (const cx of [3.3, 5.9, 8.5, 11.1]) { const f = sh(cx, 4.6, 1.5, 2.7); if (f) return f; }
  return sh(7.2, 7.6, 5.8, 4.2);
}).stamp(0, 2, [
  '....4.4.4.....',
  '....4.4.4.....',
  '....4.4.4.....',
  '..............',
  '...4444444....',
]).stamp(10, 8, ['4', '4']).stamp(2, 5, ['.', '.', '.', '.']).rows();

// =============================================================================================
// STATUS (st_*)
// =============================================================================================
add({
  st_bark: BARK_SHIELD,
  st_grit: { pal: { 1: '#f7d3b0', 2: PAL.skin, 3: PAL.skinShade, 4: '#b0765a' }, rows: FIST },
  st_sturdy: [
    '.....nnNn.....',
    '....nNnnMm....',
    '....nnnMMm....',
    '.....mmmm.....',
    '...nnNnnnMm...',
    '..nNNnnnMMMm..',
    '..nnnnnMMMmm..',
    '...mmmmmmmm...',
    '.hGnnNNnnnMMm.',
    'nnNNnnnnnMMMmm',
    'nNnnnnnnMMMMmm',
    'nnnnnMMMMMmmmm',
    '.mmmmmmmmmmmm.',
  ],
  st_dazed: [
    '......u.......',
    '.....uUy......',
    '...xxxyxxx....',
    '.xx.......xx..',
    'x...........u.',
    'x..........uUy',
    '.xx........xy.',
    '..u.xxxxxxx...',
    '.uUy..........',
    '..y...........',
  ],
  st_soggy: [
    '.....s........',
    '.....s........',
    '....sBs.......',
    '....sBB.......',
    '...saBBb......',
    '...sBBBb...s..',
    '..saBBBbb..s..',
    '..sBBBBbb.sBb.',
    '..sBBBBbb.sBb.',
    '..BBBBBbD..b..',
    '...BbbbD......',
    '....DDD.......',
  ],
  st_wilt: [
    '....vvvv......',
    '...vv..vv.....',
    '...v....vv....',
    '...v.....v....',
    '...v....ZTZ...',
    '...v....TtT...',
    '...v....ZTZ...',
    '...v.....Z....',
    '...vv.........',
    '.vv.v.........',
    'v...v.......t.',
    '....v.........',
    '...KKK........',
    '..KKKKK.......',
  ],
  st_thorns: [
    '......hG......',
    '.....hGGg.....',
    '.OO...Gg......',
    '..OOr.Gg......',
    '....rGgg......',
    '......Gg..OO..',
    '......GgrOO...',
    '......Gg......',
    '.OO...Gg......',
    '..OOr.Gg......',
    '....rGgg......',
    '......Gg..OO..',
    '......GgrOO...',
    '......vv......',
  ],
  st_rooted: [
    '....hG.Gh.....',
    '.....gGg......',
    '....LLWWw.....',
    '....LlLWw.....',
    '...LLlLWww....',
    '..LW.LLW.Ww...',
    '.LW..LW...Ww..',
    'LW...LW....W..',
    'W...LW.W....W.',
    '...LW...W.....',
    '...W.....W....',
  ],
  st_power: [
    '......u......',
    '......u......',
    '.....uUy.....',
    '.....uUy.....',
    '....uUUyy....',
    '..uuUUaUyyy..',
    'uuUUUaaaUyyYY',
    '..yyyyUyyYY..',
    '....yyyYY....',
    '.....yyY.....',
    '.....yYY.....',
    '......Y......',
    '......Y......',
  ],
});

// =============================================================================================
// INTENTS (intent_*)  -- shape and colour both differ
// =============================================================================================
const slashes = canvas(14, 14).each((x, y) => {
  const d = x + y, t = x - y;
  for (const [c, L] of [[7, 4], [13, 6], [19, 4]]) {
    const off = (c - 13) * 0; // slashes share the same along-axis centre
    if (Math.abs(t - off) > L) continue;
    if (d === c) return Math.abs(t) > L - 1 ? 'r' : 'q';
    if (d === c + 1 && Math.abs(t) <= L - 1) return 'r';
    if (d === c + 2 && Math.abs(t) <= L - 2.5) return 'R';
  }
  return null;
}).rows();

add({
  intent_attack: slashes,
  intent_block: {
    pal: { 1: '#7fb4de', 2: '#3d78b0', 3: '#2a5585' },
    rows: [
      '.NNNNNNNNNNNn.',
      'NnnnnnnnnnnnnM',
      'Nn1111a1122nMm',
      'Nn1s11a1222nMm',
      'Nn1111a1222nMm',
      'Nnaaaaaaaaa2Mm',
      'Nn1111a2222nMm',
      'Nn1112a2223nMm',
      '.Nn122a223nMm.',
      '..Nn12a23nMm..',
      '...Nn1a3nMm...',
      '....NnanMm....',
      '.....NnMm.....',
      '......Mm......',
    ],
  },
  intent_buff: [
    '......uU......',
    '.....uUUy.....',
    '....uUUuyy....',
    '...uUUuuyyY...',
    '..uUuuuuyyYY..',
    '.uuuuuuuyyyYY.',
    'YYYYuUuyyYYYYY',
    '....uUuyyY....',
    '....uUuyyY....',
    '....uUuyyY....',
    '....uuuyyY....',
    '....uuyyYY....',
    '....YYYYYY....',
  ],
  intent_debuff: [
    '....j.........',
    '....j.........',
    '...jej........',
    '...jee........',
    '..jeeeE.......',
    '..jCeeE...XX..',
    '.jCeeeeE..XX..',
    '.jeeeeeE..XX..',
    '.jeeeeeE.XXXX.',
    '.eeeeeeE..XX..',
    '..eeeeE.......',
    '...EEE........',
  ],
  intent_trample: [
    '...LLLLL......',
    '...LlLLW......',
    '...LlwLW......',
    '...LlLLW......',
    '...LlwLWW.....',
    '...LlLLLWW....',
    '..LlLLLLLLWW..',
    '.LlLLLLLLLLWW.',
    '.wwwwwwwwwwwww',
    '..............',
    'cp.........pc.',
    '.p..........p.',
  ],
  intent_summon: [
    '...AAo..AAo...',
    '..AAooOAooO...',
    '..AoooO.AoooO.',
    '...ooO...ooO..',
    'AAo.........AA',
    'AooO......AooO',
    'AooO.AAoo.AooO',
    '.oO.AAoooO.oO.',
    '...AAooooOO...',
    '..AAoooooooO..',
    '..AooooooooO..',
    '..AoooooooOO..',
    '...ooOOooOO...',
  ],
  intent_mystery: [
    '....xxxxx.....',
    '...xCCxxxX....',
    '..xCxXXXxxX...',
    '..xxX...xxX...',
    '..XX....xxX...',
    '.......xxX....',
    '......xxX.....',
    '.....xxX......',
    '.....xxX......',
    '..............',
    '.....xxX......',
    '.....xXX......',
  ],
  intent_heal: [
    '.ttt...ttT....',
    'tFttT.tttTT...',
    'tFtttttttTT...',
    'ttttttttTTT...',
    '.ttttttttTT...',
    '..tttttttT....',
    '...ttttTT.....',
    '....ttT..hh...',
    '.....T...hG...',
    '.......hhhGGg.',
    '.......hGGGGg.',
    '.........hG...',
    '.........gg...',
  ],
});

// =============================================================================================
// WEATHER (w_*)
// =============================================================================================
add({
  w_sun: defs.icon_sun.rows.slice(1, 15).map(r => r.slice(1, 15)),
  w_rain: [
    '....nnnn......',
    '..nnNNNNn.....',
    '.nNNaaNNNnMM..',
    '.nNaNNNNNNnnMM',
    'nNNNNNNNNNnnnM',
    'MnnnnnnnnnnMMM',
    '.MMMMMMMMMMMM.',
    '..............',
    '...s...s...s..',
    '..b...b...b...',
    '..............',
    '.....s...s....',
    '....b...b.....',
  ],
  w_drought: [
    '......oo......',
    '..o..AuuA..o..',
    '...oAuUuuAo...',
    '....AuuuuyO...',
    'o..AuuuuyyoO.o',
    '...AuuuyyyoO..',
    '....ooooooO...',
    'PPPPPPPPPPPPPP',
    'pPPHKHPPPpPPHP',
    'PPHKPPPpPKKPPH',
    'PpKPPpPPKPPpPH',
    'PPKKPPPKPPPPHH',
    'HPPPKKKPPPPHHH',
    '.HHHHHHHHHHHH.',
  ],
  w_wind: defs.icon_wind.rows.slice(1, 15).map(r => r.slice(1, 15)),
  w_frost: defs.icon_snowflake.rows.slice(1, 15).map(r => r.slice(1, 15)),
  w_fog: [
    '...iiiii......',
    '.iSSSSSSii....',
    '..ffffffff....',
    '.......iiiii..',
    '.....iSSSSSSi.',
    '......fffffff.',
    '.iiiii........',
    'iSSSSSSSii....',
    '.ffffffff.....',
    '........iiiii.',
    '......iSSSSSSi',
    '.......ffffff.',
  ],
});
// =============================================================================================
// MAP NODES (node_*) 20x20, drawn 18x18
// =============================================================================================
const nodeFight = canvas(18, 18);
for (let y = 5; y <= 17; y++) { nodeFight.set(y - 1, y, 'L'); nodeFight.set(y, y, 'W'); } // shovel handle, behind
nodeFight.stamp(0, 0, [
  '.nN...',
  'nNNn..',
  'NNnnM.',
  '.nnMMm',
  '..MMmm',
  '...mm.',
]);
for (let y = 4; y <= 17; y++) { nodeFight.set(16 - y, y, 'L'); nodeFight.set(17 - y, y, 'W'); } // hoe handle, front
nodeFight.stamp(11, 0, [
  '..mm...',
  '.mnNm..',
  '.nNNNm.',
  '..nNNMm',
  '...mNMm',
  '....mMm',
  '.....mm',
]);

// Gloam heart wrapped in a bramble.
// Heart test shared by the elite node and Nana's locket: two lobes plus a wedge to the point.
function inHeart(x, y, cx, top, halfW, h) {
  const r = halfW / 2 + 0.3, ly = top + r;
  if (Math.hypot(x - (cx - halfW / 2), y - ly) <= r || Math.hypot(x - (cx + halfW / 2), y - ly) <= r) return true;
  const t = (y - ly) / (top + h - ly); // 0 at lobe centres -> 1 at the point
  return t >= 0 && t <= 1 && Math.abs(x - cx) <= (halfW + r - 0.4) * (1 - t) + 0.2;
}
const nodeElite = canvas(18, 18).each((x, y) => {
  if (!inHeart(x, y, 8.5, 0.6, 8, 16)) return null;
  const l = lit(x - 8.5, y - 7), core = Math.hypot(x - 8.5, y - 7.5);
  if (core < 1.2) return 'C';
  if (core < 2.5) return 'j';
  if (Math.hypot(x - 4.2, y - 3.6) < 1.3) return 'x';
  return l > 0.35 ? 'X' : l > -0.45 ? 'z' : 'E';
});
for (let x = 0; x < 18; x++) {
  const y = Math.round(15.5 - 0.62 * x);
  nodeElite.set(x, y, 'v').set(x, y + 1, 'g');
  if (x % 4 === 1) nodeElite.set(x, y - 1, 'O').set(x - 1, y - 2, 'O');
  if (x % 4 === 3) nodeElite.set(x, y + 2, 'O').set(x + 1, y + 3, 'O');
}

add({
  node_fight: nodeFight.rows(),
  node_elite: nodeElite.rows(),
  node_forage: [
    '..................',
    '......LLLLLL......',
    '.....L......W.....',
    '....L........W....',
    '....L.rrrr...W....',
    '...L.rqaqrR..hW...',
    '...LrqrrrarRhGGW..',
    '...LZTZcpPGgGg.W..',
    '.lllllllllllllllll',
    '.LLLLLLLLLLLLLLLw.',
    '.WLWWLWWLWWLWWLWw.',
    '..LLLLLLLLLLLLLw..',
    '..WLWWLWWLWWLWWw..',
    '..LLLLLLLLLLLLLw..',
    '...WLWWLWWLWWLw...',
    '....wwwwwwwwww....',
  ].map(r => r.slice(0, 18)),
  node_villager: [
    '..............SS..',
    '.............S....',
    '............mn....',
    '........q...mM....',
    '.......qrr..mM....',
    '......qrrrr.mM....',
    '.....qrrrrrrrM....',
    '....qrrrrrrrrrR...',
    '...qrrrrrrrrrrrR..',
    '..qqrrrrrrrrrrrRR.',
    '...RRRRRRRRRRRRR..',
    '....cccpppppppP...',
    '....cuUcppLWWpP...',
    '....cyYcppLlWpP...',
    '....cccpppLWWpP...',
    '....cpppppLWyWP...',
    '..hGgGhhGGLWWGgGh.',
  ],
  node_market: [
    '..................',
    '...rrccrrccrrcc...',
    '..rrccrrccrrccrr..',
    '.rrccrrccrrccrrcc.',
    'rrccrrccrrccrrccrr',
    'RRPPRRPPRRPPRRPPRR',
    '.Lw............Lw.',
    '.Lw.....G...p..Lw.',
    '.Lw.qr.AoA.pPp.Lw.',
    '.LwqQrrAoooPPPHLw.',
    '.LwrrrRooOOPuyHLw.',
    'llllllllllllllllll',
    'LLLLLLLLLLLLLLLLLw',
    'WWLWWWWWLWWWWWLWWw',
    'LWWWWWWWLWWWWWWWLw',
    'wwwwwwwwwwwwwwwwww',
  ],
  node_hearth: [
    '........y.........',
    '........oo.....y..',
    '.......oyo........',
    '...o...oyyo.......',
    '......oyuyo.......',
    '.....oyuUyoo......',
    '.....oyUUuyo......',
    '....oyuUaUuyo.....',
    '....oyuUUUuyo.....',
    '...oyyuuuuuyyO....',
    '...OyyyuuuyyyO....',
    '..nMWLOOyyOOLWnM..',
    '.nNMmlLWOOWLlWmNM.',
    '.MMmwWWLWWLWWwmMm.',
    '..mm..wwwwww..mm..',
  ],
}, 20);

// Boss: a great gloam orb with one sleepy-grumpy glowing eye and root antlers.
const nodeBoss = canvas(18, 18).each((x, y) => {
  const dx = x - 8.5, dy = y - 11, r = Math.hypot(dx, dy * 1.05), l = lit(dx, dy);
  if (r > 6.6) return null;
  const ex = (x - 8.5) / 3.6, ey = (y - 11) / 2.3, e = ex * ex + ey * ey;
  if (e <= 1) {
    if (y <= 9) return 'E'; // heavy grumpy lid
    const ir = Math.hypot(x - 8.5, y - 11);
    if (ir < 0.8) return 'z';
    if (x === 7 && y === 10) return 'a';
    if (ir < 1.9) return 'j';
    return 'C';
  }
  if (e <= 1.5 && y <= 10) return 'z';
  return l > 0.45 ? 'X' : l > -0.2 ? 'e' : l > -0.6 ? 'z' : 'E';
}).stamp(1, 0, [
  'L...L..',
  'LW..LW.',
  '.LW.LW.',
  '.LWLW..',
  '..LW...',
  '..LWW..',
]).stamp(10, 0, [
  '..W...W',
  '.LW..LW',
  '.LW.LW.',
  '..LWLW.',
  '...LW..',
  '..LLW..',
]).set(4, 17, 'j').set(12, 17, 'j');
add({ node_boss: nodeBoss.rows() }, 20);

// =============================================================================================
// KEEPSAKES (ks_*)
// =============================================================================================
const pocketwatch = canvas(14, 14).each((x, y) => {
  const dx = x - 6.5, dy = y - 8, r = Math.hypot(dx, dy), l = lit(dx, dy);
  if (r > 5.9) return null;
  if (r > 4.7) return l > 0.4 ? 'U' : l > -0.3 ? 'y' : 'Y';
  return l < -0.55 && r > 3.8 ? 'p' : 'c';
}).stamp(5, 0, ['.yy.', 'y..Y', '.uY.']).set(6, 4, 'P').set(10, 8, 'P').set(6, 11, 'P').set(2, 8, 'P')
  .set(6, 6, 'k').set(6, 7, 'k').set(7, 8, 'K').set(8, 8, 'K').set(6, 8, 'r').rows();

const horseshoe = canvas(14, 14).each((x, y) => {
  const dx = x - 6.5, dy = y - 6.5, r = Math.hypot(dx, dy), l = lit(dx, dy);
  const ring = y >= 6 && r >= 2.6 && r <= 6.2;
  const arm = y < 6 && y >= 1 && Math.abs(dx) >= 2.6 && Math.abs(dx) <= (y <= 1 ? 6.4 : 6.1);
  if (!ring && !arm) return null;
  const nail = (y === 3 || y === 6) && Math.abs(Math.abs(dx) - 4.5) < 0.6 || (y === 10 && Math.abs(dx) > 1 && Math.abs(dx) < 3.5 && x % 3 === 0);
  if (nail) return 'm';
  if (arm) return dx < 0 ? (Math.abs(dx) > 5 ? 'N' : 'n') : (Math.abs(dx) > 5 ? 'M' : 'n');
  return l > 0.4 ? 'N' : l > -0.3 ? 'n' : 'M';
}).rows();

const riverStone = canvas(14, 14).each((x, y) => {
  const dx = (x - 6.5) / 6.4, dy = (y - 7.5) / 4.6, r = Math.hypot(dx, dy), l = lit(dx, dy);
  if (r > 1) return null;
  if (Math.abs((x - 6.5) - (y - 7.5) * 0.7 - 1.5) < 0.8) return 'S';
  if (Math.hypot(x - 3.5, y - 5) < 1) return 'a';
  return l > 0.45 ? '1' : l > -0.35 ? '2' : '3';
}).rows();

const compass = canvas(14, 14).each((x, y) => {
  const dx = x - 6.5, dy = y - 7.5, r = Math.hypot(dx, dy), l = lit(dx, dy);
  if (r > 6.1) return null;
  if (r > 4.8) return l > 0.4 ? 'U' : l > -0.3 ? 'y' : 'Y';
  return l > 0.5 && r > 3.6 ? 'a' : 'c';
}).stamp(5, 0, ['.YY.', 'Y..Y']).stamp(5, 3, [
  '.qr.',
  '.qr.',
  '.rR.',
  'qrrR',
  'nYYM',
  'nnMM',
  '.nM.',
  '.nM.',
  '.mm.',
]).rows();

const button = canvas(14, 14).each((x, y) => {
  const dx = x - 6.5, dy = y - 6.5, r = Math.hypot(dx, dy), l = lit(dx, dy);
  if (r > 6.3) return null;
  if (r > 4.9) return l > 0.4 ? '1' : l > -0.3 ? '2' : '3';
  if ((x === 5 || x === 8) && (y === 5 || y === 8)) return 'K';
  if ((x === 6 || x === 7) && (y === 6 || y === 7)) return 'c';
  return l < -0.3 && r > 3.8 ? '1' : l > 0.3 && r > 3.8 ? '3' : '2';
}).rows();

const clover = canvas(14, 14).each((x, y) => {
  for (const [cx, cy] of [[4.2, 3.7], [9, 3.7], [4.2, 8.5], [9, 8.5]]) {
    const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
    if (r <= 2.9) {
      if (x === 6 || x === 7 && y < 6 && y > 1) return null;
      const l = lit(dx, dy);
      return l > 0.4 ? 'h' : l > -0.4 ? 'G' : 'g';
    }
  }
  return null;
}).stamp(5, 5, ['VV.', 'VVV', '.VV']).stamp(8, 10, ['g...', '.g..', '..g.', '...v']).rows();

const locket = canvas(14, 14).each((x, y) => {
  if (!inHeart(x, y, 6.5, 3.3, 5.8, 10.6)) return null;
  const dx = x - 6.5, dy = y - 7.5, l = lit(dx, dy), g = Math.hypot((x - 6.5) / 2.1, (y - 7.3) / 2.4);
  if (g < 1) return g < 0.5 && x < 7 ? 'F' : x + y < 13.5 ? 't' : 'T';
  if (g < 1.45) return 'Y';
  return l > 0.45 ? 'U' : l > -0.25 ? 'u' : l > -0.6 ? 'y' : 'Y';
});
[[6, 2, 'y'], [7, 2, 'Y'], [5, 1, 'y'], [8, 1, 'Y'], [4, 0, 'y'], [9, 0, 'Y']].forEach(([x, y, c]) => locket.set(x, y, c));
locket.stamp(11, 0, ['.a.', 'aUa', '.a.']).stamp(0, 12, ['.U.', 'UaU', '.U.']);

const owlFeather = defs.icon_feather.rows.slice(1, 15).map((r, y) => [...r.slice(1, 15)].map((ch, x) => {
  const vane = { s: 'l', S: 'L', B: 'W', b: 'w' }[ch];
  if (vane) return ((x - y) % 4 + 4) % 4 === 0 ? 'w' : vane;
  return { a: 'c', P: 'W' }[ch] || ch;
}).join(''));

add({
  ks_pocketwatch: pocketwatch,
  ks_horseshoe: horseshoe,
  ks_trowel: [
    '...........nN.',
    '.........nNNNm',
    '........nNNnMm',
    '.......nNnnMm.',
    '......nNnnMm..',
    '.....mNnMMm...',
    '......mMMm....',
    '.....LWmm.....',
    '....LlW.......',
    '...rrR........',
    '..LlWw........',
    '.LlWw.........',
    '.LWw..........',
    '..w...........',
  ],
  ks_scarf: [
    '...rqqqqqqr...',
    '..rq......rR..',
    '..rq......rR..',
    '...rqqqqqrR...',
    '.....qrrR.....',
    '....qrrrRr....',
    '...qrr..rrR...',
    '...cpc..cpP...',
    '...cpc..cpP...',
    '...qrr..rrR...',
    '...qrr..rrR...',
    '...cpc..cpP...',
    '...cpc..cpP...',
    '...r.r..r.R...',
  ],
  ks_kettle: [
    '....wwwww.....',
    '...w.....w....',
    '...w.....w....',
    '...w..K..w....',
    '...sssssss....',
    '..sasBBBBBb.bb',
    '.saBBBBBBBbbb.',
    '.sBBBBBBBBbb..',
    'saBBBBBBBBbD..',
    'sBBBBBBBBbbD..',
    '.bBBBBBBbbDD..',
    '..DDDDDDDDD...',
  ],
  ks_seed_catalog: [
    '.ccccccccccc..',
    'csssssssssssP.',
    'csPPPPPPPPsBP.',
    'csssssssssBBP.',
    'csscccccccsBP.',
    'csscyuycGcsBP.',
    'cssyuoyGhcsBP.',
    'csscyuycGcsBP.',
    'csscGgGGGcsBP.',
    'csscccccccsBP.',
    'cssssssssssBP.',
    'cBBBBBBBBBBBP.',
    '.PPPPPPPPPPPP.',
  ],
  ks_rain_barrel: [
    '...WWWWWWWW...',
    '..WsaassbbbW..',
    '..WbbbbbbbDW..',
    '..mnnnnnnMMm..',
    '.LlLWLlLWLLWw.',
    '.LlLWLlLWLLWw.',
    '.LlLWLlLWLLWw.',
    '.LlLWLlLWLLWw.',
    '.LlLWLlLWLLWw.',
    '..mnnnnnnMMm..',
    '..LlLWLlLWLw..',
    '..LlLWLlLWLw..',
    '...wwwwwwww...',
  ],
  ks_beehive: [
    '.....yyyy..ii.',
    '...yuUuuyyiSi.',
    '..YYYYYYYYYuK.',
    '..yuUuuuyyyYK.',
    '.YYYYYYYYYYYY.',
    '.yuUuuuuuyyyY.',
    '.YYYYYYYYYYYY.',
    'yuUuuuuuuuyyyY',
    'YYYYYYKKYYYYYY',
    'yuuuuKkkKuyyyY',
    'YYYYYKkkKYYYYY',
    'wwwwwwwwwwwwww',
  ],
  ks_old_boot: [
    '......hG......',
    '.....hGg.G....',
    '......gGGh....',
    '....LLLgLL....',
    '....LwwwwW....',
    '....LlLLLW....',
    '....LlLWLW....',
    '....LlLLLW....',
    '....LlLLLWW...',
    '...LlLLLLLWWW.',
    '..LlLLpPLLLLWW',
    '.LlLLLHPLLLLLW',
    '.wwwwwwwwwwwww',
  ],
  ks_pressed_flower: [
    'LLLLLLLLLLLLLW',
    'LlllllllllllWw',
    'LlcccccxxcccWw',
    'LlccxxcxXxccWw',
    'LlcxXxxxxccpWw',
    'LlccxxuxXccpWw',
    'LlcccxxxccppWw',
    'LlccccgcchcpWw',
    'LlcchgGghcppWw',
    'LlccccGgcpppWw',
    'LlcccGgcppppWw',
    'LlWWWWWWWWWWWw',
    'Wwwwwwwwwwwwww',
  ],
  ks_music_box: [
    '...........yY.',
    '...........y.Y',
    '...........y..',
    '.........yyy..',
    '.........yyY..',
    '..............',
    '.lllllllllllL.',
    '.LZZtZZZZZZLW.',
    '.WWWWWWWWWWWW.',
    '.LlyuyyyyyLLWm',
    '.LlLLLLLLLLLWn',
    '.LlLLLLLLLLLWm',
    '.WWWWWWWWWWWw.',
    '..w.......w...',
  ],
  ks_river_stone: { rows: riverStone, pal: { 1: '#b9cbd6', 2: '#8aa2b2', 3: '#5f7788' } },
  ks_compass: compass,
  ks_candle: [
    '......o.......',
    '.....oyo......',
    '.....yUy......',
    '.....yay......',
    '......K.......',
    '....ccppP.....',
    '...cccppP.....',
    '...ccpppP.....',
    '....cpppP.....',
    '....cpppP.....',
    '....cpppP.....',
    '.YyuuuyyyyyY..',
    '..YyyyyyyyYYyY',
    '...YYYYYYYY.Y.',
  ],
  ks_gloves: [
    '......hh......',
    '...hh.hGg.hh..',
    '..hGGghGgghGg.',
    '..hGGghGgghGg.',
    '..hGGGGGGGGGg.',
    'hh.hGGGGGGGGg.',
    'hGghGGGGGGGGg.',
    '.hGGGGhGGGGGg.',
    '..hGGGGGGhGg..',
    '...hGGGGGGGg..',
    '..cccccccccP..',
    '..pPpPpPpPpP..',
    '..ccccccccPP..',
  ],
  ks_wishbone: [
    '......cc......',
    '.....cppP.....',
    '.....cPPP.....',
    '....cp..cP....',
    '....cp..cP....',
    '...cp....cP...',
    '...cp....cP...',
    '..cp......cP..',
    '..cp......cP..',
    '.cp........cP.',
    'ccP........cPP',
    'cPP........PPH',
  ],
  ks_jam_spoon: [
    '.nNNn.........',
    'nNrqrM........',
    'NrqQrrm.......',
    'NrrrrRm.......',
    '.MrRRmm.......',
    '..mmRnM.......',
    '....R.nM......',
    '.......nM.....',
    '........nM....',
    '.........nM...',
    '..........nM..',
    '...........nM.',
    '............mm',
  ],
  ks_owl_feather: owlFeather,
  ks_weathervane: [
    '....rr........',
    '...oAoo.......',
    '..yoAAo....O..',
    '....oAoo..OO..',
    '....oAAAooOo..',
    '.....oooooo...',
    '......nM......',
    'mmmnnnnNnnnnYy',
    '......nM......',
    '......nM......',
    '......nM......',
    '.....nNMm.....',
    '....mmmmmm....',
  ],
  ks_clover: clover,
  ks_lucky_button: { rows: button, pal: { 1: '#9fe0cf', 2: '#4fa898', 3: '#2f756c' } },
  ks_nana_locket: locket.rows(),
});

// =============================================================================================
// PRESERVE JARS (jar_*) -- one base, palette-swapped fills (U/u/y/Y ramp)
// =============================================================================================
add({
  jar_base: [
    '...cpcpcpcp...',
    '..cpPpPpPpPH..',
    '..PHPHPHPHHH..',
    '...LlLLLLLW...',
    '...iaSiiiif...',
    '..iUuuuuuyyf..',
    '.iaUuuuuuyyYf.',
    '.iauuuuuyyyYf.',
    '.iauucccyyyYf.',
    '.iauucPcyyyYf.',
    '.iauucccyyYYf.',
    '.iuuuyyyyYYYf.',
    '..fyyyyyYYYf..',
    '...ffffffff...',
  ],
});
const JAR_FILL = [P.U, P.u, P.y, P.Y];
const jar = ramp => ({ from: 'jar_base', swap: Object.fromEntries(JAR_FILL.map((c, i) => [c, ramp[i]])) });
Object.assign(defs, {
  jar_red: jar(['#ffb0a0', '#f07b63', PAL.red, '#962c33']),
  jar_orange: jar(['#ffd09a', '#f6a55a', PAL.orange, PAL.rust]),
  jar_yellow: jar(JAR_FILL),
  jar_green: jar(['#d6f29a', PAL.leafLight, PAL.leaf, PAL.leafDark]),
  jar_blue: jar(['#d4eefa', '#8fcbe6', PAL.water, '#2e5c8c']),
  jar_purple: jar(['#e4d8ff', PAL.lilac, PAL.purple, PAL.plum]),
  jar_pink: jar(['#fde0e8', '#f7b8c8', PAL.pink, PAL.rose]),
  jar_amber: jar(['#ffd990', '#eda845', '#c7741f', '#8a4a17']),
});

// =============================================================================================
// TEXTURES (tex_*) 32x32, seamless, no outline, low contrast so text sits on them
// =============================================================================================
const T = 32;
const hash = (x, y, s = 0) => {
  let h = (((x % T) + T) % T) * 374761393 + (((y % T) + T) % T) * 668265263 + s * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// Periodic value noise on a grid of `cell` px (T must divide evenly).
const vnoise = (x, y, cell, s) => {
  const n = T / cell, gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const v = (i, j) => hash(((i % n) + n) % n * 97, ((j % n) + n) % n * 57, s);
  const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
};
const texture = (pal, fn) => ({
  palette: pal, rows: [...Array(T)].map((_, y) => [...Array(T)].map((_, x) => fn(x, y)).join('')),
});

defs.tex_wood = texture({ a: '#c4905f', b: '#b98356', c: '#cf9d6b', d: '#9a6843', e: '#ad784d' }, (x, y) => {
  const p = Math.floor(y / 8), r = y % 8;
  const joint = (p * 13 + 5) % T;
  if (r === 7) return 'd';
  if (x === joint) return 'd';
  if (x === (joint + 1) % T) return 'c';
  if (r === 0) return 'c';
  const streak = hash(Math.floor((((x + p * 9) % T)) / 4), r, p + 3);
  if (streak > 0.78) return 'e';
  if (vnoise(x, y, 8, p) > 0.66) return 'b';
  return 'a';
});
defs.tex_parchment = texture({ a: '#f3e2b3', b: '#efddac', c: '#f6e7bf', d: '#e6d19c' }, (x, y) => {
  const h = hash(x, y, 11), n = vnoise(x, y, 8, 5) * 0.7 + vnoise(x, y, 4, 9) * 0.3;
  if (h > 0.965) return 'd';
  if (h < 0.03) return 'c';
  if (n > 0.68) return 'b';
  if (n < 0.26) return 'c';
  return 'a';
});
defs.tex_soil = texture({ a: '#6e4a32', b: '#674530', c: '#7c563b', d: '#8c6a4c', e: '#553724' }, (x, y) => {
  const h = hash(x, y, 21), n = vnoise(x, y, 8, 7) * 0.6 + vnoise(x, y, 4, 3) * 0.4;
  if (h > 0.985) return 'd';
  if (h > 0.9) return 'c';
  if (h < 0.05) return 'e';
  if (n > 0.62) return 'b';
  return 'a';
});
// Cobbles: wrapped Voronoi cells, mortar between, lit from the upper-left.
const cobbleSeeds = [...Array(9)].map((_, i) => [hash(i, 3, 40) * T, hash(i, 7, 41) * T, i]);
defs.tex_stone = texture({ a: '#9d9993', b: '#a6a29b', c: '#95908a', m: '#7b7772', h: '#b2aea6', s: '#8a8680' }, (x, y) => {
  let d1 = 1e9, d2 = 1e9, best = null;
  for (const [sx, sy, i] of cobbleSeeds) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    const dx = x + 0.5 - (sx + ox * T), dy = y + 0.5 - (sy + oy * T), d = Math.hypot(dx, dy);
    if (d < d1) { d2 = d1; d1 = d; best = [dx, dy, i]; } else if (d < d2) d2 = d;
  }
  const edge = d2 - d1;
  if (edge < 1.1) return 'm';
  if (edge < 2.3) return best[0] + best[1] < 0 ? 'h' : 's';
  return 'abc'[best[2] % 3];
});
defs.tex_grass = texture({ a: '#6fae4a', b: '#67a444', c: '#7cba55', d: '#5d9a3e', f: '#fff4d6', y: '#ffd35c' }, (x, y) => {
  const h = hash(x, y, 31), above = hash(x, y + 1, 31), n = vnoise(x, y, 8, 13);
  if (h > 0.996) return hash(x, y, 32) > 0.5 ? 'f' : 'y';
  if (h > 0.88 || above > 0.88) return 'c';
  if (h < 0.07) return 'd';
  return n > 0.58 ? 'b' : 'a';
});

registerSprites(defs);
