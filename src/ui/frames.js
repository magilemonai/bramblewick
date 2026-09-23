// 9-slice pixel frames for CSS border-image. Each frame is 12x12 with 4px slices.
import { registerSprites, spriteURL, PAL } from '../pixel.js';

const ROWS = [
  '..oooooooo..',
  '.ollllllllo.',
  'olmmmmmmmmdo',
  'olmffffffmdo',
  'olmffffffmdo',
  'olmffffffmdo',
  'olmffffffmdo',
  'olmffffffmdo',
  'olmffffffmdo',
  'odmmmmmmmmdo',
  '.oddddddddo.',
  '..oooooooo..',
];
const INSET = [
  '..oooooooo..',
  '.oddddddddo.',
  'odffffffffmo',
  'odffffffffmo',
  'odffffffffmo',
  'odffffffffmo',
  'odffffffffmo',
  'odffffffffmo',
  'odffffffffmo',
  'odffffffffmo',
  '.ommmmmmmmo.',
  '..oooooooo..',
];

const F = {
  panel: { o: PAL.ink, l: PAL.woodLight, m: PAL.wood, d: PAL.woodDark, f: '#f7e6bb' },
  wood: { o: PAL.ink, l: '#c99466', m: PAL.wood, d: PAL.woodDark, f: '#9b6743' },
  green: { o: PAL.ink, l: PAL.leafLight, m: PAL.leaf, d: PAL.leafDark, f: '#5f9e3f' },
  gold: { o: PAL.ink, l: '#ffe79a', m: PAL.gold, d: '#b07a1e', f: '#e9a834' },
  red: { o: PAL.ink, l: '#f08a6a', m: PAL.rust, d: '#7a3322', f: '#c65a36' },
  dark: { o: PAL.ink, l: '#6b5a7e', m: '#4a3d5a', d: '#2c2438', f: '#3a3048' },
  card_tool: { o: PAL.ink, l: '#f0946b', m: PAL.rust, d: '#7a3322', f: '#fbf0d2' },
  card_tend: { o: PAL.ink, l: PAL.leafLight, m: PAL.leaf, d: PAL.leafDark, f: '#fbf0d2' },
  card_seed: { o: PAL.ink, l: PAL.woodLight, m: '#8f6a3e', d: PAL.woodDark, f: '#f5e6bd' },
  card_charm: { o: PAL.ink, l: '#ffe79a', m: PAL.gold, d: '#a86f16', f: '#fff6d8' },
  card_gloom: { o: PAL.ink, l: PAL.gloomGlow, m: PAL.gloom, d: PAL.gloomDark, f: '#ddd6e6' },
  slot: { o: PAL.ink, l: PAL.woodLight, m: '#c9a46a', d: '#7a5236', f: '#e5cc93' },
  soil: { o: PAL.ink, l: '#a07048', m: '#6e4a2e', d: '#3e2a1a', f: '#6b4630' },
};

export function installFrames() {
  const defs = {};
  for (const [name, pal] of Object.entries(F)) {
    const inset = name === 'slot' || name === 'soil';
    defs['frame_' + name] = { palette: pal, rows: inset ? INSET : ROWS };
  }
  registerSprites(defs);
  const root = document.documentElement.style;
  // x3 for panels/buttons (slice 12), x2 for cards and small chips (slice 8): pre-scaled so nothing resamples.
  for (const name of Object.keys(F)) {
    const css = name.replace('_', '-');
    root.setProperty(`--f-${css}`, `url(${spriteURL('frame_' + name, 3)})`);
    root.setProperty(`--f2-${css}`, `url(${spriteURL('frame_' + name, 2)})`);
  }
}
