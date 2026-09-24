// Bramblewick audio: a composed, generative WebAudio score plus synthesized SFX.
// No audio files, no dependencies. Safe to import in any environment (nothing touches
// window/AudioContext until unlock()).
//
// Music model: each track is hand-written sections (chord line + melody + optional bass line)
// arranged by a form list. A lookahead scheduler renders one bar at a time. Variation between
// passes is rule-based: melody hand-offs between instruments, octave displacement, a guide-tone
// counterline, and chord-aware ornaments (passing tones, upper-neighbour turns, dotted
// anticipations, grace notes). Voicings are chosen per chord by minimal voice motion.

// ---------------------------------------------------------------- utils

const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const mod12 = n => ((n % 12) + 12) % 12;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function pcOf(name) {
  const acc = name.slice(1);
  return mod12(LETTER[name[0]] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0));
}
function noteNum(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('audio: bad note ' + s);
  return 12 * (+m[3] + 1) + LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// ---------------------------------------------------------------- harmony

const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10], dim: [0, 3, 6], sus4: [0, 5, 7], sus2: [0, 2, 7], add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14], '6': [0, 4, 7, 9], '7sus4': [0, 5, 7, 10], m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
};

function parseChord(sym) {
  const [main, slash] = sym.split('/');
  const m = /^([A-G][#b]?)(.*)$/.exec(main);
  if (!m || !QUAL[m[2]]) throw new Error('audio: bad chord ' + sym);
  const q = QUAL[m[2]], root = pcOf(m[1]);
  const pcs = [...new Set(q.map(i => mod12(root + i)))];
  return {
    sym, root, q, pcs,
    bass: slash ? pcOf(slash) : root,
    guide: [mod12(root + q[1]), mod12(root + (q.length > 3 ? q[3] : q[2]))],
  };
}

function parseChords(str, meter) {
  return str.split('|').map((bar, bi) => {
    const toks = bar.trim().split(/\s+/).filter(Boolean).map(t => t.split(':'));
    const used = toks.reduce((s, x) => s + (x.length > 1 ? +x[1] : 0), 0);
    const free = toks.filter(x => x.length < 2).length;
    const each = free ? (meter - used) / free : 0;
    const out = []; let b = 0;
    for (const [sym, d] of toks) {
      const n = d ? +d : each;
      out.push({ c: parseChord(sym), s: b, n });
      b += n;
    }
    if (Math.abs(b - meter) > 1e-6) selfWarn(`chord bar ${bi + 1} sums to ${b}, meter ${meter}: "${bar.trim()}"`);
    return out;
  });
}

function parseLine(str, meter) {
  const notes = [];
  const bars = str.split('|');
  bars.forEach((bar, bi) => {
    let b = 0;
    for (const tok of bar.trim().split(/\s+/).filter(Boolean)) {
      const [p, d] = tok.split(':');
      const dur = +d;
      if (!(dur > 0)) throw new Error('audio: bad token ' + tok);
      if (p !== 'r') notes.push({ m: noteNum(p), start: bi * meter + b, dur });
      b += dur;
    }
    if (Math.abs(b - meter) > 1e-6) selfWarn(`line bar ${bi + 1} sums to ${b}, meter ${meter}: "${bar.trim()}"`);
  });
  return { notes, bars: bars.length };
}

let selfWarnings = null;
function selfWarn(msg) {
  if (selfWarnings) selfWarnings.push(msg);
  else if (typeof console !== 'undefined') console.warn('audio:', msg);
}

// Chord-scale: the track's mode, with any chord tone outside it replacing its semitone
// neighbour (G/F in F major raises Bb to B; C in F minor raises Eb to E).
function chordScale(base, c) {
  const sc = base.slice();
  for (const p of c.pcs) {
    if (sc.includes(p)) continue;
    const i = sc.findIndex(x => (mod12(x - p) === 1 || mod12(p - x) === 1) && !c.pcs.includes(x));
    if (i >= 0) sc[i] = p; else sc.push(p);
  }
  return sc;
}

function scaleStep(m, dir, sc) {
  for (let k = 1; k <= 3; k++) {
    const c = m + dir * k;
    if (sc.includes(mod12(c))) return c;
  }
  return null;
}

// Minimal-motion voicing of the chord's pitch classes inside [lo, hi].
function voiceChord(c, prev, lo, hi) {
  let pcs = c.pcs.slice();
  if (pcs.length > 4) pcs = pcs.filter(p => p !== mod12(c.root + 7));
  const cand = pcs.map(p => {
    const a = [];
    for (let m = lo; m <= hi; m++) if (mod12(m) === p) a.push(m);
    return a;
  });
  const mid = (lo + hi) / 2;
  let best = null, bestCost = Infinity;
  const cur = [];
  const rec = i => {
    if (i === cand.length) {
      const s = cur.slice().sort((a, b) => a - b);
      if (s[s.length - 1] - s[0] > 16) return;
      let cost = 0;
      if (prev) {
        for (const x of s) cost += Math.min(...prev.map(p => Math.abs(p - x)));
        for (const p of prev) cost += Math.min(...s.map(x => Math.abs(p - x)));
      }
      cost += Math.abs((s[0] + s[s.length - 1]) / 2 - mid) * (prev ? 0.35 : 2);
      if (s[1] - s[0] <= 2 && s[0] < 60) cost += 4; // no mud at the bottom
      if (cost < bestCost) { bestCost = cost; best = s; }
      return;
    }
    for (const m of cand[i]) { cur.push(m); rec(i + 1); cur.pop(); }
  };
  rec(0);
  return best || pcs.map(p => lo + mod12(p - lo)).sort((a, b) => a - b);
}

function chordAt(P, beat) {
  const bi = Math.max(0, Math.min(P.bars.length - 1, Math.floor(beat / P.meter + 1e-9)));
  const b = beat - bi * P.meter;
  const segs = P.bars[bi];
  for (const g of segs) if (b >= g.s - 1e-9 && b < g.s + g.n - 1e-9) return g.c;
  return segs[segs.length - 1].c;
}

// Rule-based ornamentation. amt 0..~0.6. Never crosses a chord change with a suspension.
function ornament(notes, amt, rng, P, scale) {
  const src = notes.map(n => ({ ...n }));
  if (!amt) return src;
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const n = src[i], nx = src[i + 1];
    const joined = nx && Math.abs(n.start + n.dur - nx.start) < 1e-6;
    const iv = joined ? nx.m - n.m : 0;
    const r = rng();
    // 1. passing tone through a third
    if (joined && n.dur >= 1 && Math.abs(iv) >= 3 && Math.abs(iv) <= 4 && r < amt) {
      const sc = chordScale(scale, chordAt(P, n.start + n.dur - 0.5));
      const mid = scaleStep(n.m, Math.sign(iv), sc);
      if (mid != null && (mid - n.m) * (nx.m - mid) > 0) {
        out.push({ ...n, dur: n.dur - 0.5 }, { m: mid, start: n.start + n.dur - 0.5, dur: 0.5, orn: 1 });
        continue;
      }
    }
    // 2. upper-neighbour turn at the end of a long note
    if (n.dur >= 2 && r < amt * 0.5) {
      const sc = chordScale(scale, chordAt(P, n.start + n.dur - 1));
      const up = scaleStep(n.m, 1, sc);
      if (up != null && up - n.m <= 2) {
        out.push({ ...n, dur: n.dur - 1 },
          { m: up, start: n.start + n.dur - 1, dur: 0.5, orn: 1 },
          { m: n.m, start: n.start + n.dur - 0.5, dur: 0.5, orn: 1 });
        continue;
      }
    }
    // 3. dotted lilt on two stepwise quarters under one chord
    if (joined && n.dur === 1 && nx.dur === 1 && iv !== 0 && Math.abs(iv) <= 2 &&
        chordAt(P, n.start) === chordAt(P, nx.start) && r > 1 - amt * 0.35) {
      out.push({ ...n, dur: 1.5 });
      src[i + 1] = { ...nx, start: nx.start + 0.5, dur: 0.5 };
      continue;
    }
    // 4. grace note from below into an upward leap
    if (joined && iv >= 5 && n.dur >= 0.5 && r > 1 - amt * 0.3) {
      const g = scaleStep(nx.m, -1, chordScale(scale, chordAt(P, nx.start)));
      if (g != null && g > n.m) {
        out.push({ ...n, dur: n.dur - 0.25 }, { m: g, start: nx.start - 0.25, dur: 0.25, orn: 1 });
        continue;
      }
    }
    out.push(n);
  }
  return out;
}

const warp = (beat, s) => {
  if (!s || s === 0.5) return beat;
  const b = Math.floor(beat), f = beat - b;
  return b + (f < 0.5 ? f * 2 * s : s + (f - 0.5) * 2 * (1 - s));
};

// ---------------------------------------------------------------- the score

const MAJ = [0, 2, 4, 5, 7, 9, 11], MIXO = [0, 2, 4, 5, 7, 9, 10], DOR = [0, 2, 3, 5, 7, 9, 10];
const AEO = [0, 2, 3, 5, 7, 8, 10], LYD = [0, 2, 4, 6, 7, 9, 11];
const sc = (tonic, steps) => steps.map(s => mod12(tonic + s));

// Nana's theme. F major with the Lydian lift (G/F, B natural) in bar 2.
const NANA_CH = 'F | G/F | Bbmaj7 | Csus4:2 C:1 | F/A | Bbmaj7 | Gm7:2 C7:1 | F';
const NANA_MEL = 'A4:1 C5:1 F5:1 | E5:1.5 D5:0.5 B4:1 | C5:1.5 Bb4:0.5 A4:1 | G4:3 | ' +
  'A4:1 C5:1 F5:1 | G5:1.5 F5:0.5 D5:1 | Bb4:1 C5:1 E5:1 | F5:3';

const TRACKS = {
  // Title: the theme as a gentle waltz. Harp oom-pah-pah, pizz bass, soft pad.
  title: {
    bpm: 84, meter: 3, chime: 5, scale: sc(5, MAJ),
    lead: 'flute', acc: 'waltz', accInst: 'harp', bassPat: 'waltz', bassInst: 'pizz', pad: 0.8,
    vlo: 55, vhi: 71, clo: 62, chi: 74, fadeIn: 1.2,
    sections: {
      I: { ch: 'Fmaj7 | G/F | Fmaj7 | G/F' },
      A: { ch: NANA_CH, mel: NANA_MEL },
      // Circle-of-fifths bridge in D minor, rising bass D Bb C A Bb B C.
      B: {
        ch: 'Dm | Gm7/Bb | C7 | Fmaj7/A | Bbmaj7 | G7/B | Csus4:2 C7:1 | C7',
        mel: 'D5:1 F5:1 A5:1 | G5:2 F5:1 | C5:1 E5:1 G5:1 | F5:2 E5:1 | ' +
          'Bb4:1 D5:1 F5:1 | F5:1.5 E5:0.5 D5:1 | C5:2 Bb4:1 | G4:2 r:1',
      },
      V: { ch: 'Fmaj7 | G/F | Bbmaj7 | Csus4:2 C:1' },
    },
    intro: [{ s: 'I', tacet: true }],
    forms: [
      [{ s: 'A', lead: 'box', oct: 1 }, { s: 'A', lead: 'flute', orn: 0.2 }, { s: 'B' },
        { s: 'A', lead: 'box', oct: 1, counter: 'flute' }, { s: 'V' }],
      [{ s: 'A', lead: 'flute', orn: 0.3 }, { s: 'B', lead: 'box', oct: 1, counter: 'flute' },
        { s: 'A', lead: 'flute', dbl: 'box', orn: 0.4 }, { s: 'V' }],
    ],
  },

  // Spring: bright F major/Lydian, kalimba arpeggios, flute, pizz, light shaker.
  spring: {
    bpm: 96, meter: 4, chime: 5, scale: sc(5, MAJ),
    lead: 'flute', acc: 'arp8', accInst: 'kalimba', bassPat: 'half', bassInst: 'pizz', pad: 0.55,
    vlo: 57, vhi: 72, clo: 60, chi: 72,
    perc: { shaker: '..o...x...o...x.' },
    sections: {
      I: { ch: 'F | G/F' },
      A: {
        ch: 'F | G/F | Am7 | Bbmaj7:2 C:2 | F | G/F | Gm7:2 C7:2 | F',
        mel: 'C5:0.5 F5:0.5 G5:0.5 A5:1 G5:0.5 F5:1 | D5:1.5 B4:0.5 D5:1 G5:1 | E5:1.5 C5:0.5 A4:2 | ' +
          'D5:1 F5:1 E5:1.5 D5:0.5 | C5:0.5 F5:0.5 G5:0.5 A5:1 G5:0.5 F5:1 | D5:1.5 B4:0.5 D5:1 G5:0.5 A5:0.5 | ' +
          'Bb5:1 A5:1 G5:1 E5:1 | F5:3 r:1',
      },
      B: {
        ch: 'Bbmaj7 | C | Am7 | Dm7 | Gm7 | C7/E | F/A:2 Bbmaj7:2 | Csus4:2 C:2',
        mel: 'F5:1 D5:0.5 F5:0.5 A5:2 | E5:1 C5:0.5 E5:0.5 G5:2 | A5:1 G5:0.5 E5:0.5 C5:2 | ' +
          'F5:1.5 E5:0.5 D5:1 A5:1 | Bb5:1.5 A5:0.5 G5:1 F5:1 | E5:2 D5:1 C5:1 | C5:1 A4:1 D5:1 F5:1 | G5:2 E5:1 r:1',
      },
      C: { ch: 'F | G/F | Dm7 | Csus4:2 C:2' },
    },
    intro: [{ s: 'I', tacet: true, perc: 0 }],
    forms: [
      [{ s: 'A' }, { s: 'A', lead: 'kalimba', oct: 1, counter: 'ocarina' }, { s: 'B' }, { s: 'A', orn: 0.3 }, { s: 'C', perc: 0.6 }],
      [{ s: 'B', lead: 'kalimba', oct: 1, counter: 'ocarina' }, { s: 'A', orn: 0.35 }, { s: 'B', orn: 0.2 }, { s: 'A', dbl: 'kalimba' }, { s: 'C' }],
    ],
  },

  // Summer: D Mixolydian, lazy swing, ocarina lead, felt-piano comping, walking pizz, shaker.
  summer: {
    level: 0.72,
    bpm: 88, meter: 4, swing: 0.62, chime: 2, scale: sc(2, MIXO),
    lead: 'ocarina', acc: 'comp', accInst: 'piano', bassPat: 'walk', bassInst: 'pizz', pad: 0.4,
    vlo: 54, vhi: 70, clo: 60, chi: 71,
    perc: { shaker: 'o.x.o.x.o.x.o.x.', brush: '....x.......x...' },
    sections: {
      I: { ch: 'D | C/D' },
      A: {
        ch: 'D | C | G/B | D | D | C | Em7:2 Am7:2 | D',
        mel: 'F#5:1 A5:0.5 F#5:0.5 E5:1 D5:1 | E5:1.5 G5:0.5 E5:1 C5:1 | D5:1 B4:0.5 D5:0.5 G5:2 | F#5:1.5 E5:0.5 D5:2 | ' +
          'A4:0.5 D5:0.5 F#5:0.5 A5:1.5 G5:0.5 F#5:0.5 | E5:1 C5:0.5 E5:0.5 G5:1 E5:1 | G5:1 E5:1 C5:1 E5:1 | D5:3 r:1',
      },
      B: {
        ch: 'Gmaj7 | C/G | Bm7 | Em7 | C | G/B | Am7 | D',
        mel: 'B4:1 D5:0.5 F#5:0.5 A5:2 | G5:1 E5:0.5 G5:0.5 C5:2 | F#5:1.5 D5:0.5 B4:1 A4:1 | G4:1 B4:1 D5:1 E5:1 | ' +
          'G5:1.5 E5:0.5 C5:1 D5:1 | B4:2 D5:1 G5:1 | C5:1 E5:1 A5:1 G5:1 | A5:2 F#5:1 r:1',
      },
      V: { ch: 'D | C/D | G/D | D' },
    },
    intro: [{ s: 'I', tacet: true }],
    forms: [
      [{ s: 'A' }, { s: 'A', lead: 'flute', oct: 0, orn: 0.3 }, { s: 'B' }, { s: 'A', orn: 0.4, counter: 'kalimba' }, { s: 'V', perc: 0.7 }],
      [{ s: 'B', lead: 'flute' }, { s: 'A', orn: 0.3 }, { s: 'V' }, { s: 'B', orn: 0.3, counter: 'kalimba' }, { s: 'A', lead: 'flute', orn: 0.4 }],
    ],
  },

  // Fall: A Dorian (F# colour, one borrowed Fmaj7), felt-piano melody over rolling harp.
  fall: {
    level: 1.7,
    bpm: 80, meter: 4, chime: 0, scale: sc(9, DOR),
    lead: 'piano', acc: 'harp8', accInst: 'harp', bassPat: 'half', bassInst: 'pizz', pad: 0.5,
    vlo: 55, vhi: 70, clo: 57, chi: 69, verb: 1.15,
    perc: { brush: '....o.......o...' },
    sections: {
      I: { ch: 'Am7 | D/A' },
      A: {
        ch: 'Am7 | D/A | Cmaj7 | G | Am7 | D | Em7 | Am',
        mel: 'E5:1.5 D5:0.5 C5:1 A4:1 | F#5:2 E5:1 D5:1 | E5:1 G5:1 B5:1.5 A5:0.5 | G5:1.5 F#5:0.5 D5:2 | ' +
          'C5:1.5 B4:0.5 A4:1 E5:1 | F#5:1.5 E5:0.5 D5:1 A4:1 | B4:1 D5:1 G5:1 F#5:1 | C5:1.5 B4:0.5 A4:2',
      },
      B: {
        ch: 'Cmaj7 | Bm7 | Em7 | Am7 | Fmaj7 | G | Dsus4:2 D:2 | Am',
        mel: 'G5:1 E5:1 C5:1 B4:1 | D5:1.5 F#5:0.5 A5:2 | G5:1 F#5:0.5 E5:0.5 B4:2 | C5:1 E5:1 G5:1.5 A5:0.5 | ' +
          'A5:2 G5:1 E5:1 | D5:1.5 B4:0.5 D5:1 E5:1 | G5:1 A5:1 G5:1 F#5:1 | E5:1 C5:1 A4:2',
      },
      V: { ch: 'Am7 | D/A | Fmaj7 | Esus4:2 Em7:2' },
    },
    intro: [{ s: 'I', tacet: true, perc: 0 }],
    forms: [
      [{ s: 'A' }, { s: 'A', lead: 'flute', orn: 0.25 }, { s: 'B' }, { s: 'A', orn: 0.35, counter: 'ocarina' }, { s: 'V', perc: 0 }],
      [{ s: 'B', lead: 'flute' }, { s: 'A', orn: 0.3 }, { s: 'V', perc: 0 }, { s: 'B', orn: 0.3, counter: 'ocarina' }, { s: 'A', lead: 'flute', orn: 0.4 }],
    ],
  },

  // Winter: E Aeolian, celesta over a slow pad, very sparse, lots of reverb and silence.
  winter: {
    level: 1.4,
    bpm: 70, meter: 4, chime: 7, scale: sc(4, AEO),
    lead: 'celesta', acc: 'drops', accInst: 'celesta', bassPat: 'drone', bassInst: 'pad', pad: 1,
    vlo: 55, vhi: 71, clo: 62, chi: 74, blo: 36, bhi: 47, verb: 1.6,
    sections: {
      I: { ch: 'Emadd9 | Cmaj7' },
      A: {
        ch: 'Emadd9 | Cmaj7 | Am7 | Bm7 | Em | Cmaj7 | Am7:2 D:2 | Esus4:2 Em:2',
        mel: 'B5:1.5 F#5:0.5 G5:2 | E5:3 r:1 | C6:1.5 B5:0.5 A5:1 E5:1 | F#5:3 r:1 | ' +
          'G5:1.5 A5:0.5 B5:2 | B5:1 G5:1 E5:2 | A5:1 G5:1 F#5:2 | A5:2 G5:1 r:1',
      },
      B: {
        ch: 'Cmaj7 | G/B | Am7 | Em/G | Cmaj7 | D | Bm7 | Em',
        mel: 'r:1 G5:1 E5:1 B4:1 | D5:3 r:1 | r:1 E5:1 C5:1 A4:1 | B4:3 r:1 | ' +
          'r:1 C5:1 E5:1 G5:1 | F#5:2 A5:2 | F#5:1.5 E5:0.5 D5:2 | E5:3 r:1',
      },
      C: { ch: 'Emadd9 | Cmaj7 | Emadd9 | Cmaj7' },
    },
    intro: [{ s: 'I', tacet: true }],
    forms: [
      [{ s: 'A' }, { s: 'C' }, { s: 'B', lead: 'box' }, { s: 'A', orn: 0.2, counter: 'ocarina', dyn: 0.9 }, { s: 'C' }],
      [{ s: 'B' }, { s: 'A', lead: 'box', orn: 0.2 }, { s: 'C' }, { s: 'B', counter: 'ocarina' }, { s: 'C' }],
    ],
  },

  // Boss: Nana's theme in F minor. bII (Gb/F) replaces the Lydian lift; a 3+3+2 pizz ostinato
  // and taiko drive it. Reed (accordion) lead doubled by flute an octave up on repeats.
  boss: {
    level: 0.64,
    bpm: 126, meter: 4, chime: 8, scale: sc(5, AEO),
    lead: 'reed', acc: 'stab', accInst: 'piano', bassPat: 'ost', bassInst: 'pizz', pad: 0.7,
    vlo: 53, vhi: 68, clo: 60, chi: 72, blo: 36, bhi: 47, fadeIn: 0.6,
    perc: { taiko: 'X..x..x.', shaker: 'o.x.o.x.o.x.o.x.' },
    sections: {
      I: { ch: 'Fm | Fm' },
      A: {
        ch: 'Fm | Gb/F | Dbmaj7 | Csus4:2 C:2 | Fm/Ab | Gm7b5/Bb | Dbmaj7:2 C7:2 | Fm',
        mel: 'Ab4:1 C5:1 F5:2 | Eb5:1.5 Db5:0.5 Bb4:2 | C5:1.5 Bb4:0.5 Ab4:2 | G4:4 | ' +
          'Ab4:1 C5:1 F5:2 | G5:1.5 F5:0.5 Db5:2 | Bb4:1 C5:1 E5:2 | F5:3 r:1',
      },
      B: {
        ch: 'Dbmaj7 | Bbm7 | Gb | C | Fm | Db | Bbm7:2 C7:2 | C7',
        mel: 'Ab4:0.5 C5:0.5 F5:1 Eb5:1 C5:1 | Db5:1.5 C5:0.5 Bb4:2 | Bb4:0.5 Db5:0.5 Gb5:1 F5:1 Db5:1 | E5:2 G5:2 | ' +
          'Ab5:1 G5:0.5 F5:0.5 C5:2 | Db5:1 F5:1 Ab5:2 | F5:1 Db5:1 E5:1 G5:1 | Bb5:2 G5:1 E5:1',
      },
      C: { ch: 'Fm | Gb/F | Fm | C/E' },
    },
    intro: [{ s: 'I', tacet: true }],
    forms: [
      [{ s: 'A' }, { s: 'A', dbl: 'flute', orn: 0.2 }, { s: 'B', dbl: 'flute' }, { s: 'C', tacet: true }, { s: 'A', lead: 'flute', oct: 0, counter: 'reed', orn: 0.3 }],
      [{ s: 'B' }, { s: 'A', dbl: 'flute', orn: 0.3 }, { s: 'C', tacet: true }, { s: 'B', lead: 'flute', counter: 'reed', orn: 0.2 }, { s: 'A', dbl: 'flute' }],
    ],
  },

  // Elite: short tense D-minor loop over a pedal, harmonic-minor A7 and a Neapolitan Eb.
  elite: {
    level: 0.72,
    bpm: 112, meter: 4, chime: 5, scale: sc(2, AEO),
    lead: 'flute', acc: 'stab', accInst: 'harp', bassPat: 'ost', bassInst: 'pizz', pad: 0.6,
    vlo: 53, vhi: 68, clo: 57, chi: 69, blo: 36, bhi: 47, fadeIn: 0.6,
    perc: { taiko: 'X.......x.x.....', tick: '..x...x...x...x.' },
    sections: {
      I: { ch: 'Dm' },
      A: {
        ch: 'Dm | Bb/D | Gm/D | A7/C#',
        mel: 'A4:1.5 Bb4:0.5 A4:2 | D5:1.5 C5:0.5 Bb4:2 | G4:1.5 A4:0.5 Bb4:2 | A4:1 G4:0.5 F4:0.5 E4:2',
      },
      B: {
        ch: 'Gm | Eb | Bb | A',
        mel: 'Bb4:1 D5:1 G5:2 | G5:1.5 F5:0.5 Eb5:2 | D5:1 F5:1 Bb5:2 | A5:2 E5:1 C#5:1',
      },
    },
    intro: [{ s: 'I', tacet: true }],
    forms: [
      [{ s: 'A' }, { s: 'A', oct: 1, counter: 'ocarina' }, { s: 'B' }, { s: 'A', lead: 'reed', dbl: 'flute' }, { s: 'A', tacet: true }],
      [{ s: 'B', lead: 'reed', dbl: 'flute' }, { s: 'A', orn: 0.3 }, { s: 'B', oct: 1 }, { s: 'A', tacet: true }],
    ],
  },

  // Hearth: the theme as a lullaby in Bb (Lydian lift = C/Bb), felt piano over a warm pad.
  hearth: {
    level: 1.35,
    bpm: 62, meter: 3, chime: 10, scale: sc(10, MAJ),
    lead: 'piano', acc: 'broken', accInst: 'piano', bassPat: 'none', bassInst: 'pizz', pad: 0.9,
    vlo: 55, vhi: 70, clo: 58, chi: 70, verb: 1.2,
    sections: {
      A: {
        ch: 'Bbadd9 | C/Bb | Ebmaj7 | Fsus4:2 F:1 | Bb/D | Ebmaj7 | Cm7:2 F7:1 | Bb',
        mel: 'D5:1 F5:1 Bb5:1 | A5:1.5 G5:0.5 E5:1 | F5:1.5 Eb5:0.5 D5:1 | C5:3 | ' +
          'D5:1 F5:1 Bb5:1 | C6:1.5 Bb5:0.5 G5:1 | Eb5:1 F5:1 A5:1 | Bb5:3',
      },
      B: {
        ch: 'Gm7 | Cm7 | F7 | Bbmaj7 | Ebmaj7 | Dm7 | Cm7:2 F7:1 | Bb',
        mel: 'D5:2 Bb4:1 | Eb5:2 C5:1 | A4:1 C5:1 Eb5:1 | D5:3 | G5:2 F5:1 | F5:1 D5:1 A4:1 | Eb5:1 C5:1 A4:1 | Bb4:3',
      },
      V: { ch: 'Bbmaj7 | C/Bb | Bbmaj7 | Fsus4:2 F:1' },
    },
    intro: [{ s: 'V', tacet: true }],
    forms: [
      [{ s: 'A' }, { s: 'B' }, { s: 'A', lead: 'box', dbl: 'piano', dblOct: -1, orn: 0.2 }, { s: 'V' }],
      [{ s: 'B', orn: 0.2 }, { s: 'A', counter: 'ocarina' }, { s: 'V' }, { s: 'A', lead: 'box', orn: 0.3 }, { s: 'V' }],
    ],
  },

  // Market: G major, jaunty oom-pah with a musette-tuned accordion.
  market: {
    level: 2.0,
    bpm: 120, meter: 4, swing: 0.56, chime: 7, scale: sc(7, MAJ),
    lead: 'reed', acc: 'oompah', accInst: 'reed', bassPat: 'oompah', bassInst: 'pizz', pad: 0,
    vlo: 55, vhi: 69, clo: 62, chi: 74,
    perc: { tick: '..x...x...x...x.', shaker: 'o.o.o.o.o.o.o.o.' },
    sections: {
      I: { ch: 'G | D7' },
      A: {
        ch: 'G | C | Am7:2 D7:2 | D/F# | G | C | D7 | G',
        mel: 'D5:0.5 B4:0.5 D5:0.5 G5:0.5 B5:1 A5:0.5 G5:0.5 | E5:1 G5:0.5 E5:0.5 C5:1 r:1 | ' +
          'C5:0.5 E5:0.5 A5:1 F#5:0.5 A5:0.5 C6:1 | A5:1 F#5:1 D5:1 r:1 | ' +
          'D5:0.5 B4:0.5 D5:0.5 G5:0.5 B5:1 A5:0.5 G5:0.5 | E5:1 G5:0.5 E5:0.5 C6:1 B5:1 | ' +
          'A5:0.5 G5:0.5 F#5:0.5 E5:0.5 D5:0.5 C5:0.5 A4:1 | G4:1 B4:0.5 D5:0.5 G5:1 r:1',
      },
      B: {
        ch: 'Em | Am | D7 | G | C | G/B | Am7:2 D7:2 | G',
        mel: 'B4:1.5 E5:0.5 G5:1 B5:1 | A5:1.5 G5:0.5 E5:1 C5:1 | F#5:0.5 G5:0.5 A5:1 C6:1 A5:1 | B5:2 G5:1 r:1 | ' +
          'G5:0.5 E5:0.5 G5:0.5 C6:0.5 G5:2 | D5:0.5 B4:0.5 D5:0.5 G5:0.5 D5:2 | C5:1 E5:1 D5:1 C5:1 | B4:1 G4:1 r:2',
      },
    },
    intro: [{ s: 'I', tacet: true }],
    forms: [
      [{ s: 'A' }, { s: 'A', lead: 'kalimba', oct: 1, orn: 0.3 }, { s: 'B' }, { s: 'A', dbl: 'kalimba', dblOct: 1, orn: 0.3 }],
      [{ s: 'B', lead: 'flute', orn: 0.2 }, { s: 'A', orn: 0.35 }, { s: 'B', dbl: 'kalimba', dblOct: 1 }, { s: 'A', lead: 'flute', orn: 0.4 }],
    ],
  },

  // Event: G Lydian, curious. Celesta questions over tiptoe pizz; phrases end open.
  event: {
    bpm: 92, meter: 4, chime: 7, scale: sc(7, LYD),
    lead: 'celesta', acc: 'tiptoe', accInst: 'harp', bassPat: 'tiptoe', bassInst: 'pizz', pad: 0.45,
    vlo: 55, vhi: 71, clo: 62, chi: 74,
    perc: { tick: '....x.......x..o' },
    sections: {
      A: {
        ch: 'Gmaj7 | A/G | Gmaj7 | A/G | Em7 | F#m7 | Bm7 | A/G',
        mel: 'B4:0.5 D5:0.5 F#5:1 r:0.5 E5:0.5 D5:1 | C#5:0.5 E5:0.5 A5:1 r:1 G5:1 | F#5:1.5 D5:0.5 B4:1 r:1 | ' +
          'A4:0.5 C#5:0.5 E5:0.5 G5:0.5 F#5:2 | G5:1 E5:0.5 B4:0.5 D5:2 | A5:1 F#5:0.5 C#5:0.5 E5:2 | ' +
          'D5:1 F#5:0.5 A5:0.5 B5:1 A5:1 | E5:2 C#5:1 r:1',
      },
      B: { ch: 'Em7 | F#m7 | Gmaj7 | A/G' },
    },
    intro: [{ s: 'B', tacet: true, perc: 0 }],
    forms: [
      [{ s: 'A' }, { s: 'B' }, { s: 'A', lead: 'flute', orn: 0.25 }, { s: 'B' }],
      [{ s: 'A', lead: 'kalimba', oct: 1, orn: 0.2 }, { s: 'B' }, { s: 'A', counter: 'ocarina', orn: 0.3 }, { s: 'B' }],
    ],
  },

  // Victory: a fanfare on the theme's rising arpeggio with the Lydian lift, then the theme as
  // a pastoral musette over an F drone.
  victory: {
    bpm: 76, meter: 3, chime: 5, scale: sc(5, MAJ),
    lead: 'kalimba', acc: 'arp8', accInst: 'harp', bassPat: 'drone', bassInst: 'pad', pad: 0.6,
    vlo: 57, vhi: 72, clo: 62, chi: 74, blo: 36, bhi: 47, fadeIn: 0.03,
    sections: {
      S: {
        meter: 4, bpm: 104, acc: 'strum', bassPat: 'half', bassInst: 'pizz',
        ch: 'F | G/F | F',
        mel: 'C5:0.5 F5:0.5 A5:0.5 C6:0.5 A5:1 F5:1 | G5:1 B5:1 D6:1 B5:1 | C6:1 A5:1 F5:2',
      },
      P: {
        ch: 'F | G/F | Bbmaj7/F | Csus4/F:2 C/F:1 | F | Bbmaj7/F | Gm7/F:2 C7/F:1 | F',
        mel: NANA_MEL,
      },
      Q: {
        ch: 'Bb/F | F | Gm7/F | F | Bb/F | F | G/F | F',
        mel: 'D5:2 C5:1 | A4:3 | Bb4:1 D5:1 G5:1 | F5:3 | D5:2 C5:1 | A4:1 C5:1 F5:1 | E5:1.5 D5:0.5 B4:1 | C5:3',
      },
    },
    intro: [{ s: 'S', lead: 'flute', dbl: 'celesta', dblOct: 0 }],
    forms: [
      [{ s: 'P' }, { s: 'Q', lead: 'flute' }, { s: 'P', lead: 'flute', counter: 'kalimba', orn: 0.25 }, { s: 'Q', lead: 'box', oct: 1 }],
    ],
  },

  // Defeat: a tender plagal-leaning cadence, then an F drone with a far-off music-box echo.
  defeat: {
    level: 1.12,
    bpm: 56, meter: 3, chime: 5, scale: sc(5, MAJ),
    lead: 'piano', acc: 'block', accInst: 'piano', bassPat: 'drone', bassInst: 'pad', pad: 0.8,
    vlo: 53, vhi: 69, clo: 62, chi: 74, blo: 36, bhi: 47, fadeIn: 0.05, verb: 1.4,
    sections: {
      K: { ch: 'Bbmaj7 | Gm7/Bb | Bb/C | Fadd9', mel: 'F5:2 E5:1 | D5:2 C5:1 | Bb4:1.5 A4:0.5 G4:1 | A4:3' },
      D: { ch: 'Fadd9 | Fadd9 | Fadd9 | Fadd9', acc: 'none' },
      E: { ch: 'Fadd9 | Fadd9 | Fadd9 | Fadd9', acc: 'none', mel: 'r:3 | A5:1 C6:1 F6:1 | r:3 | r:3' },
    },
    intro: [{ s: 'K' }],
    forms: [
      [{ s: 'D' }, { s: 'D', pad: 0.7 }, { s: 'E', lead: 'box', dyn: 0.45 }, { s: 'D', pad: 0.8 }, { s: 'D', pad: 0.6 }],
    ],
  },
};

// Parse (and cache) a section with its effective settings.
function prep(def, key) {
  const s = def.sections[key];
  if (!s) throw new Error('audio: missing section ' + key);
  if (s._p) return s._p;
  const meter = s.meter || def.meter;
  const bars = parseChords(s.ch, meter);
  const mel = s.mel ? parseLine(s.mel, meter) : null;
  const bass = s.bass ? parseLine(s.bass, meter) : null;
  if (mel && mel.bars !== bars.length) selfWarn(`section ${key}: melody has ${mel.bars} bars, chords ${bars.length}`);
  // Spans for tied pads (same chord symbol) and drones (same bass pitch class).
  const flat = [];
  bars.forEach((segs, bi) => segs.forEach(g => flat.push({ bi, g })));
  const spans = keyFn => {
    const map = new Map();
    let head = null;
    for (const x of flat) {
      if (head && keyFn(head.g.c) === keyFn(x.g.c)) { head.beats += x.g.n; continue; }
      head = { g: x.g, beats: x.g.n };
      map.set(x.bi + ':' + x.g.s, head);
    }
    for (const [k, v] of map) map.set(k, v.beats);
    return map;
  };
  s._p = {
    key, meter, bars, mel, bass,
    bpm: s.bpm || def.bpm,
    swing: s.swing ?? def.swing ?? 0.5,
    acc: s.acc || def.acc,
    accInst: s.accInst || def.accInst,
    bassPat: s.bassPat || def.bassPat,
    bassInst: s.bassInst || def.bassInst,
    perc: s.perc !== undefined ? s.perc : def.perc,
    vlo: def.vlo || 55, vhi: def.vhi || 71, clo: def.clo || 60, chi: def.chi || 72,
    blo: s.blo || def.blo || 36, bhi: s.bhi || def.bhi || 52,
    padSpans: spans(c => c.sym),
    droneSpans: spans(c => c.bass),
  };
  return s._p;
}

// ---------------------------------------------------------------- audio graph

let ctx = null;
let mix, comp, master, musicVol, musicWetVol, sfxVol, sfxWetVol, sfxIn, sfxInV, reverb;
let noiseBuf = null, pianoWave, fluteWave, ocarinaWave;
let timer = null;
const players = new Set();
let current = null;          // Player
let wantTrack = null;        // requested track name (may be pending before unlock)

const LS_KEY = 'bramblewick.audio';
const settings = { music: 0.7, sfx: 0.8, muted: false };
try {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
  if (raw) {
    const s = JSON.parse(raw);
    if (typeof s.music === 'number') settings.music = clamp01(s.music);
    if (typeof s.sfx === 'number') settings.sfx = clamp01(s.sfx);
    settings.muted = !!s.muted;
  }
} catch (e) { /* storage blocked: use defaults */ }
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}
const curve = v => v * v; // perceptual fader

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  ctx = new AC({ latencyHint: 'interactive' });

  mix = ctx.createGain(); mix.gain.value = 0.9;
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3;
  comp.attack.value = 0.006; comp.release.value = 0.25;
  master = ctx.createGain(); master.gain.value = settings.muted ? 0 : 1;
  mix.connect(comp); comp.connect(master); master.connect(ctx.destination);

  reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(2.8);
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.8;
  reverb.connect(verbOut); verbOut.connect(mix);

  musicVol = ctx.createGain(); musicVol.gain.value = curve(settings.music);
  musicWetVol = ctx.createGain(); musicWetVol.gain.value = curve(settings.music);
  musicVol.connect(mix); musicWetVol.connect(reverb);

  sfxVol = ctx.createGain(); sfxVol.gain.value = curve(settings.sfx);
  sfxWetVol = ctx.createGain(); sfxWetVol.gain.value = curve(settings.sfx) * 0.45;
  sfxVol.connect(mix); sfxWetVol.connect(reverb);
  sfxIn = ctx.createGain(); sfxIn.connect(sfxVol);
  sfxInV = ctx.createGain(); sfxInV.connect(sfxVol); sfxInV.connect(sfxWetVol);

  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  const wave = amps => {
    const re = new Float32Array(amps.length), im = new Float32Array(amps);
    return ctx.createPeriodicWave(re, im);
  };
  pianoWave = wave([0, 1, 0.42, 0.2, 0.1, 0.05, 0.03, 0.015]);
  fluteWave = wave([0, 1, 0.22, 0.07, 0.03]);
  ocarinaWave = wave([0, 1, 0.06, 0.02]);
}

function makeImpulse(sec) {
  const sr = ctx.sampleRate, len = Math.floor(sr * sec);
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * 0.012);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      const k = 0.85 - 0.75 * x; // tail gets darker
      lp += ((Math.random() * 2 - 1) - lp) * k;
      d[i] = i < pre ? 0 : lp * Math.pow(1 - x, 2.6) * (i < pre + sr * 0.05 ? 0.6 + 8 * (i - pre) / sr : 1);
    }
  }
  return buf;
}

// ---------------------------------------------------------------- voice bookkeeping

const MUSIC_CAP = 44;
let mVoices = []; // [start, end]
function claimMusic(t, end, prio) {
  let n = 0;
  for (let i = 0; i < mVoices.length; i++) { const v = mVoices[i]; if (v[0] <= t + 1e-3 && v[1] > t) n++; }
  if (n >= MUSIC_CAP * 1.35) return false;
  if (n >= MUSIC_CAP && prio < 2) return false;
  mVoices.push([t, end]);
  return true;
}
function cleanup(src, nodes) {
  src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* already */ } } };
}
function noiseSrc() {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  return s;
}

// ---------------------------------------------------------------- instruments
// Every voice: gain starts at 0, ramps up, decays with setTargetAtTime (continuous from any
// value), and stops only after ~6 time constants. No audible setValueAtTime jumps.

function partialsVoice(spec) {
  return (t, m, dur, vel, out) => {
    const f = mtof(m);
    const vca = ctx.createGain(); vca.connect(out);
    const nodes = [vca]; let first = null, longest = 0;
    const a = spec.a;
    for (const [ratio, amp, tau] of spec.p) {
      const fr = f * ratio;
      if (fr > 15000) continue;
      const o = ctx.createOscillator(); o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp * vel, t + a);
      g.gain.setTargetAtTime(0, t + a, tau);
      o.connect(g); g.connect(vca); o.start(t);
      nodes.push(o, g);
      if (!first) first = o;
      longest = Math.max(longest, a + tau * 6);
    }
    let end = t + longest;
    if (spec.damp) {
      const off = t + Math.max(dur, 0.12);
      if (off < end) {
        vca.gain.setValueAtTime(1, t);
        vca.gain.setTargetAtTime(0, off, spec.damp);
        end = Math.min(end, off + spec.damp * 6);
      }
    }
    for (const n of nodes) if (n.stop) n.stop(end);
    cleanup(first, nodes);
    return end;
  };
}
const vBox = partialsVoice({ a: 0.002, p: [[1, 1, 0.5], [4, 0.3, 0.09], [9.1, 0.06, 0.025]] });
const vCelesta = partialsVoice({ a: 0.003, damp: 0.35, p: [[1, 1, 0.7], [2, 0.25, 0.28], [4.01, 0.1, 0.07]] });
const vKalimba = partialsVoice({ a: 0.002, p: [[1, 1, 0.36], [5.4, 0.16, 0.035], [2.01, 0.07, 0.1]] });
const vBell = partialsVoice({ a: 0.001, p: [[1, 1, 0.9], [2.76, 0.35, 0.35], [5.4, 0.15, 0.12], [8.93, 0.06, 0.05]] });

// Karplus-Strong harp, pre-rendered per semitone (cached) and retuned with playbackRate.
const ksCache = new Map();
function ksBuf(m) {
  const mi = Math.round(m);
  let e = ksCache.get(mi);
  if (e) return e;
  const sr = ctx.sampleRate, f = mtof(mi);
  const N = Math.max(2, Math.floor(sr / f - 0.5));
  const len = Math.floor(sr * 2.2);
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  let lp = 0, mean = 0;
  for (let i = 0; i < N; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.5; d[i] = lp; mean += lp; }
  mean /= N;
  for (let i = 0; i < N; i++) d[i] -= mean;
  const rho = Math.pow(0.001, 1 / (f * 3.2));
  for (let i = N; i < len; i++) d[i] = rho * 0.5 * (d[i - N] + (i > N ? d[i - N - 1] : 0));
  let pk = 1e-6;
  for (let i = 0; i < N * 2; i++) pk = Math.max(pk, Math.abs(d[i]));
  const k = 0.8 / pk;
  for (let i = 0; i < len; i++) d[i] *= k;
  e = { buf, base: sr / (N + 0.5), len: len / sr };
  if (ksCache.size > 60) ksCache.delete(ksCache.keys().next().value);
  ksCache.set(mi, e);
  return e;
}
function vHarp(t, m, dur, vel, out) {
  const k = ksBuf(m), rate = mtof(m) / k.base;
  const src = ctx.createBufferSource(); src.buffer = k.buf; src.playbackRate.value = rate;
  const g = ctx.createGain();
  const len = k.len / rate;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.003);
  const rel = t + Math.min(len - 0.6, Math.max(dur, 1.0));
  g.gain.setTargetAtTime(0, rel, 0.16);
  const end = Math.min(t + len, rel + 0.16 * 6);
  src.connect(g); g.connect(out);
  src.start(t); src.stop(end);
  cleanup(src, [src, g]);
  return end;
}

function vPiano(t, m, dur, vel, out) {
  const f = mtof(m);
  const o = ctx.createOscillator(); o.setPeriodicWave(pianoWave); o.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.setPeriodicWave(pianoWave); o2.frequency.value = f; o2.detune.value = 3.5;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.2;
  const c0 = Math.min(9000, f * (2.5 + 5 * vel) + 400);
  lp.frequency.setValueAtTime(c0, t);
  lp.frequency.setTargetAtTime(Math.min(c0, f * 1.6 + 300), t + 0.005, 0.3);
  const g = ctx.createGain();
  const tau = Math.max(0.45, Math.min(2.2, 2.2 - (m - 48) * 0.05));
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.6, t + 0.007);
  g.gain.setTargetAtTime(0, t + 0.007, tau);
  const off = t + Math.max(dur, 0.1);
  g.gain.setTargetAtTime(0, off, 0.1);
  const end = Math.min(t + tau * 6, off + 0.6);
  o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
  o.start(t); o2.start(t); o.stop(end); o2.stop(end);
  cleanup(o, [o, o2, lp, g]);
  return end;
}

function vPad(t, m, dur, vel, out) {
  const f = mtof(m);
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = f; o1.detune.value = -8;
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = 7;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
  const att = Math.min(1.1, dur * 0.4);
  lp.frequency.setValueAtTime(f * 1.2 + 150, t);
  lp.frequency.linearRampToValueAtTime(Math.min(f * 3 + 500, 2600), t + att);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + att);
  g.gain.setTargetAtTime(0, t + dur, 0.45);
  const end = t + dur + 0.45 * 6;
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
  o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
  cleanup(o1, [o1, o2, lp, g]);
  return end;
}

function windVoice(t, m, dur, vel, out, wave, breath, vib) {
  const f = mtof(m);
  const o = ctx.createOscillator(); o.setPeriodicWave(wave); o.frequency.value = f;
  const g = ctx.createGain();
  const nodes = [o, g];
  if (dur > 0.45) {
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.8 + Math.random() * 0.8;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + 0.22);
    lg.gain.linearRampToValueAtTime(f * vib, t + Math.min(dur, 0.7));
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t); nodes.push(lfo, lg);
  }
  const a = Math.min(0.045, dur * 0.3);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + a);
  g.gain.setTargetAtTime(vel * 0.82, t + a, 0.15);
  g.gain.setTargetAtTime(0, t + dur, 0.045);
  const end = t + dur + 0.045 * 7;
  o.connect(g); g.connect(out); o.start(t);
  if (breath > 0) {
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(f * 2, 7000); bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t);
    ng.gain.linearRampToValueAtTime(vel * 0.3 * breath, t + 0.015);
    ng.gain.setTargetAtTime(vel * 0.045 * breath, t + 0.015, 0.05);
    ng.gain.setTargetAtTime(0, t + dur, 0.04);
    n.connect(bp); bp.connect(ng); ng.connect(out);
    n.start(t, Math.random() * 1.5); nodes.push(n, bp, ng);
  }
  for (const x of nodes) if (x.stop) x.stop(end);
  cleanup(o, nodes);
  return end;
}
const vFlute = (t, m, d, v, out) => windVoice(t, m, d, v, out, fluteWave, 1, 0.0045);
const vOcarina = (t, m, d, v, out) => windVoice(t, m, d, v, out, ocarinaWave, 0.45, 0.0035);

function vReed(t, m, dur, vel, out) {
  const f = mtof(m);
  const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f; o2.detune.value = 9; // musette beat
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(2600, f * 4 + 400); lp.Q.value = 0.7;
  const g = ctx.createGain();
  const a = Math.min(0.025, dur * 0.3);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + a);
  g.gain.setTargetAtTime(vel * 0.78, t + a, 0.12);
  g.gain.setTargetAtTime(0, t + dur, 0.04);
  const end = t + dur + 0.04 * 7;
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
  o1.start(t); o2.start(t); o1.stop(end); o2.stop(end);
  cleanup(o1, [o1, o2, lp, g]);
  return end;
}

function vPizz(t, m, dur, vel, out) {
  const f = mtof(m);
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.frequency.value = f;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
  lp.frequency.setValueAtTime(Math.min(f * 8, 5000), t);
  lp.frequency.setTargetAtTime(f * 1.5 + 80, t + 0.003, 0.07);
  const g = ctx.createGain();
  const tau = m < 50 ? 0.3 : 0.2;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.004, tau);
  const off = t + Math.max(dur, 0.12);
  g.gain.setTargetAtTime(0, off, 0.06);
  const end = Math.min(t + tau * 6, off + 0.42);
  o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
  o.start(t); o2.start(t); o.stop(end); o2.stop(end);
  cleanup(o, [o, o2, lp, g]);
  return end;
}

function noiseHit(t, out, { type, freq, q = 0.7, a, peak, tau, f2, glide = 0.1, hold = 0 }) {
  const n = noiseSrc();
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + glide);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (hold) g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.setTargetAtTime(0, t + a + hold, tau);
  const end = t + a + hold + tau * 6;
  n.connect(f); f.connect(g); g.connect(out);
  n.start(t, Math.random() * 1.5); n.stop(end);
  cleanup(n, [n, f, g]);
  return end;
}
function toneHit(t, out, { type = 'sine', freq, f2, glide = 0.1, a = 0.003, peak, tau, hold = 0, lp, vib }) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + glide);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (hold) g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.setTargetAtTime(0, t + a + hold, tau);
  const end = t + a + hold + tau * 6;
  const nodes = [o, g];
  let src = o;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); src = f; nodes.push(f); }
  if (vib) {
    const l = ctx.createOscillator(); l.frequency.value = vib[0];
    const lg = ctx.createGain(); lg.gain.value = vib[1];
    l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(end); nodes.push(l, lg);
  }
  src.connect(g); g.connect(out);
  o.start(t); o.stop(end);
  cleanup(o, nodes);
  return end;
}

const vShaker = (t, m, d, v, out) => noiseHit(t, out, { type: 'highpass', freq: 6000, q: 0.5, a: 0.006, peak: v, tau: 0.028 });
const vBrush = (t, m, d, v, out) => noiseHit(t, out, { type: 'bandpass', freq: 2600, q: 0.6, a: 0.02, peak: v, tau: 0.07 });
const vTick = (t, m, d, v, out) => toneHit(t, out, { type: 'triangle', freq: 1250, a: 0.001, peak: v, tau: 0.018 });
function vTaiko(t, m, d, v, out) {
  toneHit(t, out, { freq: 118, f2: 52, glide: 0.18, a: 0.003, peak: v, tau: 0.2 });
  return noiseHit(t, out, { type: 'lowpass', freq: 450, a: 0.002, peak: v * 0.5, tau: 0.035 });
}

const INST = {
  box: { fn: vBox, level: 0.3, send: 0.55, tail: 3, legato: 1 },
  celesta: { fn: vCelesta, level: 0.3, send: 0.5, tail: 2.2, legato: 1 },
  kalimba: { fn: vKalimba, level: 0.34, send: 0.35, tail: 2.2, legato: 1 },
  harp: { fn: vHarp, level: 0.28, send: 0.4, tail: 1.2, legato: 1 },
  piano: { fn: vPiano, level: 0.42, send: 0.3, tail: 0.6, legato: 0.98 },
  pad: { fn: vPad, level: 0.05, send: 0.7, tail: 2.7, legato: 1 },
  flute: { fn: vFlute, level: 0.24, send: 0.35, tail: 0.32, legato: 0.93 },
  ocarina: { fn: vOcarina, level: 0.22, send: 0.35, tail: 0.32, legato: 0.93 },
  reed: { fn: vReed, level: 0.15, send: 0.22, tail: 0.3, legato: 0.86 },
  pizz: { fn: vPizz, level: 0.5, send: 0.12, tail: 0.45, legato: 0.9 },
  shaker: { fn: vShaker, level: 0.09, send: 0.1, tail: 0.2 },
  brush: { fn: vBrush, level: 0.06, send: 0.15, tail: 0.45 },
  taiko: { fn: vTaiko, level: 0.5, send: 0.2, tail: 1.2 },
  tick: { fn: vTick, level: 0.1, send: 0.15, tail: 0.12 },
};

// ---------------------------------------------------------------- the player

const bounce = n => { const s = []; for (let i = 0; i < n; i++) s.push(i); for (let i = n - 2; i > 0; i--) s.push(i); return s; };

class Player {
  constructor(name, def, t0) {
    this.name = name; this.def = def;
    this.dry = ctx.createGain(); this.wet = ctx.createGain();
    this.dry.gain.value = 0; this.wet.gain.value = 0;
    this.dry.connect(musicVol); this.wet.connect(musicWetVol);
    this.ch = new Map();
    this.rng = mulberry32((Math.random() * 4294967296) >>> 0);
    this.queue = (def.intro || []).map(e => ({ ...e, _k: 0, _intro: true }));
    this.loop = 0;
    this.nextBar = t0; this.stopAt = Infinity; this.deadAt = Infinity;
    this.cur = null; this.bar = 0;
    this.prevV = null; this.prevB = null; this.prevC = null;
  }
  fade(to, now, dur) {
    const verb = this.def.verb ?? 1, lvl = to * (this.def.level ?? 1);
    [[this.dry.gain, lvl], [this.wet.gain, lvl * verb]].forEach(([g, v]) => {
      const from = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(from, now);
      g.linearRampToValueAtTime(v, now + dur);
    });
  }
  fadeOut(now, dur) {
    this.fade(0, now, dur);
    this.stopAt = now + dur;
    this.deadAt = now + dur + 6;
  }
  dispose() {
    for (const c of this.ch.values()) { try { c.disconnect(); } catch (e) { /* */ } }
    try { this.dry.disconnect(); this.wet.disconnect(); } catch (e) { /* */ }
  }
  chan(inst) {
    let c = this.ch.get(inst);
    if (c) return c;
    const I = INST[inst], mixv = (this.def.mix && this.def.mix[inst]) ?? 1;
    c = ctx.createGain(); c.gain.value = I.level * mixv;
    const s = ctx.createGain(); s.gain.value = I.send;
    c.connect(this.dry); c.connect(s); s.connect(this.wet);
    this.ch.set(inst, c);
    return c;
  }
  note(inst, t, dur, m, vel, prio) {
    const I = INST[inst];
    if (!I || vel <= 0) return;
    const now = ctx.currentTime;
    if (t < now) t = now;
    if (!claimMusic(t, t + dur + I.tail, prio)) return;
    I.fn(t, m, Math.max(0.05, dur), Math.min(1, vel), this.chan(inst));
  }
  nextEntry() {
    if (!this.queue.length) {
      const forms = this.def.forms;
      const f = forms[this.loop % forms.length];
      const k = this.loop++;
      this.queue = f.map(e => ({ ...e, _k: k }));
    }
    return this.queue.shift();
  }
  begin(e) {
    const def = this.def, P = prep(def, e.s), k = e._k;
    const pick = v => (Array.isArray(v) ? v[k % v.length] : v);
    let notes = [];
    if (P.mel && !e.tacet) {
      const amt = e._intro ? 0 : Math.min(0.6, (pick(e.orn) || 0) + Math.min(k, 4) * 0.06);
      notes = ornament(P.mel.notes, amt, this.rng, P, def.scale);
      const oct = pick(e.oct) || 0;
      if (oct) notes = notes.map(n => ({ ...n, m: n.m + 12 * oct }));
    }
    const byBar = P.bars.map(() => []);
    for (const n of notes) {
      const b = Math.floor(n.start / P.meter + 1e-9);
      if (byBar[b]) byBar[b].push(n);
    }
    this.cur = {
      P, byBar,
      lead: pick(e.lead) || def.lead,
      dyn: pick(e.dyn) ?? 1,
      counter: pick(e.counter) || null,
      dbl: pick(e.dbl) || null,
      dblOct: e.dblOct ?? 1,
      perc: e.perc ?? 1,
      pad: e.pad ?? 1,
      acc: e.acc || P.acc,
    };
    this.bar = 0;
  }
  tick(now, ahead) {
    if (this.nextBar < now) this.nextBar = now + 0.05; // fell behind (tab hidden, ctx suspended): resync
    let guard = 0;
    while (this.nextBar < now + ahead && this.nextBar < this.stopAt && guard++ < 8) this.scheduleBar();
  }
  bassNote(pc) {
    const P = this.cur.P, center = (P.blo + P.bhi) / 2, prev = this.prevB ?? center;
    let best = null, bd = Infinity;
    for (let m = P.blo; m <= P.bhi; m++) {
      if (mod12(m) !== pc) continue;
      const d = Math.abs(m - prev) + 0.3 * Math.abs(m - center);
      if (d < bd) { bd = d; best = m; }
    }
    this.prevB = best;
    return best;
  }
  scheduleBar() {
    if (!this.cur || this.bar >= this.cur.P.bars.length) this.begin(this.nextEntry());
    const C = this.cur, P = C.P, def = this.def, bi = this.bar, T = this.nextBar;
    const spb = 60 / P.bpm, sw = P.swing, meter = P.meter, rng = this.rng;
    const at = b => T + warp(b, sw) * spb;
    const segs = P.bars[bi];
    const hum = () => 0.92 + rng() * 0.16;
    const jit = () => (rng() - 0.5) * 0.01;

    segs.forEach((g, si) => {
      const c = g.c;
      const v = voiceChord(c, this.prevV, P.vlo, P.vhi);
      this.prevV = v;
      const nxSeg = segs[si + 1] || (P.bars[bi + 1] && P.bars[bi + 1][0]) || null;
      const inSeg = b => b >= g.s - 1e-6 && b < g.s + g.n - 1e-6;

      // pad (tied across repeated chords)
      if (def.pad && C.pad) {
        const beats = P.padSpans.get(bi + ':' + g.s);
        if (beats) for (const m of v) this.note('pad', at(g.s), beats * spb + 0.05, m, 0.55 * def.pad * C.pad, 1);
      }

      // accompaniment
      const A = P.accInst;
      const chord = (b, dur, vel, notes = v, roll = 0.009) =>
        notes.forEach((m, i) => this.note(A, at(b) + i * roll + jit(), dur, m, vel * hum(), 0));
      switch (C.acc) {
        case 'waltz':
          for (let b = Math.ceil(g.s - 1e-6); b < g.s + g.n - 1e-6; b++) if (b % meter) chord(b, 0.9 * spb, b % meter === 1 ? 0.3 : 0.24);
          break;
        case 'arp8': case 'harp8': case 'broken': {
          let tones;
          if (C.acc === 'arp8') tones = [...v, v[0] + 12];
          else {
            const low = c.bass === c.root ? c.root : c.bass;
            const lo = C.acc === 'broken' ? 43 : 48;
            tones = [lo + mod12(low - lo), ...v];
            if (C.acc === 'harp8') tones.push(v[0] + 12);
          }
          const seq = bounce(tones.length);
          const ring = C.acc === 'broken' ? 2 : 1.4;
          for (let e8 = 0; e8 < meter * 2; e8++) {
            const b = e8 / 2;
            if (!inSeg(b)) continue;
            const m = tones[seq[e8 % seq.length]];
            this.note(A, at(b) + jit(), ring * spb, m, (e8 % 2 ? 0.2 : 0.28) * hum() * (C.acc === 'broken' ? 0.9 : 1), 0);
          }
          break;
        }
        case 'comp':
          for (const b of (meter === 3 ? [1, 2] : [1, 2.5])) if (inSeg(b)) chord(b, (b % 1 ? 0.9 : 0.45) * spb, b % 1 ? 0.18 : 0.22);
          break;
        case 'oompah':
          for (const b of (meter === 3 ? [1, 2] : [1, 3])) if (inSeg(b)) chord(b, 0.35 * spb, 0.3, v, 0.004);
          break;
        case 'stab':
          for (const b of (meter === 3 ? [0, 1.5] : [0, 1.5, 3])) if (inSeg(b)) chord(b, 0.3 * spb, b === 0 ? 0.26 : 0.18, v, 0.004);
          break;
        case 'tiptoe': {
          const order = [v.length - 1, 1, v.length - 1, 0];
          for (let i = 0; i < meter; i++) {
            const b = i + 0.5;
            if (inSeg(b)) this.note(A, at(b) + jit(), 0.8 * spb, v[order[i % 4]] + 12, 0.16 * hum(), 0);
          }
          break;
        }
        case 'drops': {
          const count = rng() < 0.45 ? 2 : 1;
          const used = new Set();
          for (let i = 0; i < count; i++) {
            const b = g.s + Math.floor(rng() * g.n * 2) / 2;
            if (used.has(b) || rng() < 0.25) continue;
            used.add(b);
            this.note(A, at(b), 1.5 * spb, v[Math.floor(rng() * v.length)] + 12, (0.1 + rng() * 0.08), 0);
          }
          break;
        }
        case 'strum':
          chord(g.s, g.n * spb, 0.26, [...v, v[0] + 12, v[1] + 12], 0.028);
          break;
        case 'block':
          chord(g.s, g.n * spb * 0.95, 0.2, v, 0.012);
          break;
        default: break;
      }

      // bass
      if (!P.bass) this.bassPattern(P.bassPat, g, bi, at, spb, nxSeg, inSeg);

      // guide-tone counterline (3rds and 7ths), avoiding unisons with the melody
      if (C.counter) {
        const mel = C.byBar[bi].find(n => n.start - bi * meter <= g.s + 1e-6 && n.start + n.dur - bi * meter > g.s + 1e-6);
        const prev = this.prevC ?? (P.clo + P.chi) / 2;
        let best = null, bd = Infinity;
        for (let m = P.clo; m <= P.chi; m++) {
          if (!c.guide.includes(mod12(m))) continue;
          if (mel && (m === mel.m || Math.abs(m - mel.m) === 1)) continue;
          const d = Math.abs(m - prev) + (m === prev ? 0.8 : 0);
          if (d < bd) { bd = d; best = m; }
        }
        if (best != null) {
          this.prevC = best;
          this.note(C.counter, at(g.s), g.n * spb * 0.96, best, 0.3 * C.dyn, 1);
        }
      }
    });

    // explicit bass line
    if (P.bass) {
      for (const n of P.bass.notes) {
        if (Math.floor(n.start / meter + 1e-9) !== bi) continue;
        const b = n.start - bi * meter;
        this.note(P.bassInst, at(b), n.dur * spb * 0.9, n.m, 0.55, 2);
      }
    }

    // melody (+ optional doubling)
    const lead = C.lead, LI = INST[lead];
    for (const n of C.byBar[bi]) {
      const b = n.start - bi * meter;
      const d = (warp(b + n.dur, sw) - warp(b, sw)) * spb;
      const onBeat = Math.abs(b - Math.round(b)) < 1e-6;
      let vel = 0.62 * C.dyn * (b < 1e-6 ? 1 : onBeat ? 0.9 : 0.8);
      if (n.orn) vel *= 0.85;
      vel *= 1 + (n.m - 72) * 0.006;
      vel *= 0.92 + 0.12 * Math.sin(Math.PI * (bi + 0.5) / P.bars.length);
      this.note(lead, at(b), d * LI.legato, n.m, vel, 2);
      if (C.dbl) this.note(C.dbl, at(b) + 0.004, d * INST[C.dbl].legato, n.m + 12 * C.dblOct, vel * 0.5, 1);
    }

    // percussion
    if (P.perc && C.perc) {
      for (const inst in P.perc) {
        const pat = P.perc[inst], L = pat.length, step = meter / L;
        for (let i = 0; i < L; i++) {
          const ch = pat[i];
          if (ch === '.') continue;
          if (ch === 'o' && rng() < 0.25) continue;
          const vel = (ch === 'X' ? 1 : ch === 'x' ? 0.6 : 0.3) * C.perc * hum();
          this.note(inst, at(i * step) + jit() * 0.8, 0.1, 60, vel, 0);
        }
      }
    }

    this.nextBar = T + meter * spb;
    this.bar++;
  }
  bassPattern(type, g, bi, at, spb, nxSeg, inSeg) {
    if (!type || type === 'none') return;
    const P = this.cur.P, B = P.bassInst, c = g.c, meter = P.meter;
    const fifthPc = c.bass === c.root ? mod12(c.root + 7) : c.root;
    const near = (pc, ref) => { let best = ref, bd = 99; for (let m = ref - 11; m <= ref + 11; m++) if (mod12(m) === pc && Math.abs(m - ref) < bd && m >= P.blo - 5 && m <= P.bhi + 7) { bd = Math.abs(m - ref); best = m; } return best; };
    const vel = 0.55;
    switch (type) {
      case 'waltz': case 'whole':
        this.note(B, at(g.s), (type === 'waltz' ? Math.min(g.n, 2) : g.n) * spb * 0.95, this.bassNote(c.bass), vel, 2);
        break;
      case 'drone': {
        const beats = P.droneSpans.get(bi + ':' + g.s);
        if (beats) this.note(B, at(g.s), beats * spb + 0.05, this.bassNote(c.bass), 0.6, 2);
        break;
      }
      case 'half': case 'oompah': {
        const r = this.bassNote(c.bass);
        const len = type === 'oompah' ? 0.8 : Math.min(g.n, 2) * 0.9;
        this.note(B, at(g.s), len * spb, r, vel, 2);
        if (meter === 4 && inSeg(g.s + 2) && g.n >= 4) this.note(B, at(g.s + 2), len * spb, near(fifthPc, r), vel * 0.85, 2);
        break;
      }
      case 'walk': {
        const r = this.bassNote(c.bass);
        const third = near(mod12(c.root + c.q[1]), r + 3);
        const fifth = near(fifthPc, r + 6);
        let target = r;
        if (nxSeg) target = near(nxSeg.c.bass, r);
        for (let k = 0; k < g.n; k++) {
          let m;
          if (k === 0) m = r;
          else if (k === g.n - 1 && nxSeg) {
            const dir = Math.sign(target - r) || 1;
            m = scaleStep(target, -dir, chordScale(this.def.scale, c)) ?? target - dir;
          } else m = k === 1 ? (g.n > 2 ? third : fifth) : fifth;
          this.note(B, at(g.s + k), 0.85 * spb, m, vel * (k === 0 ? 1 : 0.8), 2);
        }
        break;
      }
      case 'tiptoe': {
        const r = this.bassNote(c.bass), f = near(fifthPc, r);
        for (let k = 0; k < g.n; k++) this.note(B, at(g.s + k), 0.3 * spb, k % 2 ? f : r, vel * (k % 2 ? 0.7 : 0.9), 2);
        break;
      }
      case 'ost': {
        const r = this.bassNote(c.bass);
        const iv = mod12(fifthPc - c.bass) || 7;
        const off = [0, 0, 12, 0, 0, 12, iv, 12];
        const acc = [1, 0.5, 0.6, 0.9, 0.5, 0.6, 0.85, 0.55];
        for (let e8 = 0; e8 < meter * 2; e8++) {
          const b = e8 / 2;
          if (!inSeg(b)) continue;
          this.note(B, at(b), 0.42 * spb, r + off[e8 % 8], vel * acc[e8 % 8], acc[e8 % 8] > 0.8 ? 2 : 1);
        }
        break;
      }
      default: break;
    }
  }
}

// ---------------------------------------------------------------- scheduler

function tick() {
  if (!ctx) return;
  const now = ctx.currentTime;
  const ahead = typeof document !== 'undefined' && document.hidden ? 1.5 : 0.15;
  for (const p of players) {
    if (now > p.deadAt) { p.dispose(); players.delete(p); continue; }
    try { p.tick(now, ahead); } catch (e) { console.error('audio: player', p.name, e); p.fadeOut(now, 0.3); }
  }
  if (mVoices.length > 64) mVoices = mVoices.filter(v => v[1] > now);
}

function startMusic(name) {
  const now = ctx.currentTime;
  if (current) { current.fadeOut(now, 1.5); current = null; }
  if (name) {
    const def = TRACKS[name];
    const p = new Player(name, def, now + 0.08);
    p.fade(1, now, def.fadeIn ?? 1.2);
    players.add(p);
    current = p;
    tick();
  }
}

// ---------------------------------------------------------------- SFX

function chimeRoot() {
  const pc = current ? current.def.chime : (wantTrack && TRACKS[wantTrack] ? TRACKS[wantTrack].chime : 5);
  return 67 + mod12(pc - 7); // G4..F#5
}
const PENT = [0, 2, 4, 7, 9];
const pent = (base, i) => base + PENT[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);

const SFX_LEN = { mend: 2.4, rain: 1.8, gloom: 1.4, bloom: 1.2, upgrade: 1.4, victory: 1.8, defeat: 1.6, heal: 1.2, shuffle: 0.5, page_turn: 0.5 };
// Mix trims (measured peaks at sfx volume 0.8): mend on top, hits next, chimes below, UI ticks low.
const SFX_GAIN = { bloom: 0.55, grow: 0.5, upgrade: 0.65, victory: 0.7, defeat: 0.7, heal: 0.75, buff: 0.7, card_play: 0.8, hit_heavy: 0.85 };
let sVoices = [];
const lastSfx = {};

const SFX = {
  click(t, r, v) {
    toneHit(t, sfxIn, { type: 'triangle', freq: 1700 * r, f2: 1150 * r, glide: 0.025, a: 0.001, peak: 0.16 * v, tau: 0.012 });
    noiseHit(t, sfxIn, { type: 'highpass', freq: 4000, a: 0.001, peak: 0.04 * v, tau: 0.006 });
  },
  hover(t, r, v) {
    toneHit(t, sfxIn, { freq: 2300 * r, a: 0.004, peak: 0.035 * v, tau: 0.016 });
  },
  card_draw(t, r, v) {
    noiseHit(t, sfxIn, { type: 'bandpass', freq: 2400 * r, f2: 5600 * r, glide: 0.07, q: 1.2, a: 0.006, peak: 0.22 * v, tau: 0.035 });
  },
  card_play(t, r, v) {
    noiseHit(t, sfxInV, { type: 'bandpass', freq: 500 * r, f2: 2600 * r, glide: 0.14, q: 0.9, a: 0.07, peak: 0.16 * v, tau: 0.04 });
    toneHit(t + 0.11, sfxIn, { freq: 190 * r, f2: 85 * r, glide: 0.08, a: 0.003, peak: 0.42 * v, tau: 0.06 });
    noiseHit(t + 0.11, sfxIn, { type: 'lowpass', freq: 900, a: 0.002, peak: 0.14 * v, tau: 0.03 });
  },
  shuffle(t, r, v) {
    for (let i = 0; i < 7; i++) {
      noiseHit(t + i * 0.038 + Math.random() * 0.01, sfxIn, { type: 'bandpass', freq: (2800 + Math.random() * 2200) * r, q: 1.5, a: 0.004, peak: 0.12 * v * (1 - i * 0.06), tau: 0.024 });
    }
  },
  hit(t, r, v) {
    toneHit(t, sfxIn, { type: 'triangle', freq: 240 * r, f2: 115 * r, glide: 0.06, a: 0.002, peak: 0.5 * v, tau: 0.07 });
    noiseHit(t, sfxIn, { type: 'bandpass', freq: 1400 * r, q: 1.6, a: 0.001, peak: 0.34 * v, tau: 0.045 });
    toneHit(t, sfxIn, { type: 'square', freq: 900 * r, f2: 480 * r, glide: 0.03, a: 0.001, peak: 0.07 * v, tau: 0.02, lp: 2200 });
  },
  hit_heavy(t, r, v) {
    toneHit(t, sfxInV, { type: 'triangle', freq: 160 * r, f2: 58 * r, glide: 0.12, a: 0.002, peak: 0.62 * v, tau: 0.13 });
    noiseHit(t, sfxIn, { type: 'bandpass', freq: 950 * r, q: 1.3, a: 0.001, peak: 0.4 * v, tau: 0.08 });
    noiseHit(t, sfxIn, { type: 'lowpass', freq: 320, a: 0.002, peak: 0.4 * v, tau: 0.12 });
    toneHit(t, sfxIn, { type: 'square', freq: 620 * r, f2: 260 * r, glide: 0.05, a: 0.001, peak: 0.08 * v, tau: 0.03, lp: 1800 });
  },
  bark(t, r, v) {
    toneHit(t, sfxIn, { type: 'triangle', freq: 520 * r, f2: 470 * r, glide: 0.05, a: 0.002, peak: 0.3 * v, tau: 0.05 });
    toneHit(t, sfxIn, { freq: 1580 * r, a: 0.001, peak: 0.07 * v, tau: 0.02 });
    noiseHit(t, sfxIn, { type: 'bandpass', freq: 1000 * r, q: 3, a: 0.001, peak: 0.12 * v, tau: 0.02 });
    toneHit(t + 0.075, sfxIn, { type: 'triangle', freq: 640 * r, f2: 600 * r, glide: 0.04, a: 0.002, peak: 0.16 * v, tau: 0.04 });
  },
  plant(t, r, v, ps) {
    noiseHit(t, sfxIn, { type: 'lowpass', freq: 600 * r, a: 0.003, peak: 0.3 * v, tau: 0.045 });
    noiseHit(t + 0.035, sfxIn, { type: 'lowpass', freq: 500 * r, a: 0.003, peak: 0.18 * v, tau: 0.04 });
    const b = chimeRoot() + ps;
    toneHit(t + 0.08, sfxInV, { freq: mtof(pent(b, 0) - 12), f2: mtof(pent(b, 3) - 12), glide: 0.07, a: 0.004, peak: 0.16 * v, tau: 0.07 });
  },
  grow(t, r, v, ps) {
    const b = chimeRoot() + ps;
    vKalimba(t, pent(b, 0), 0.4, 0.3 * v, sfxInV);
    vKalimba(t + 0.07, pent(b, 3), 0.4, 0.3 * v, sfxInV);
    toneHit(t, sfxIn, { type: 'triangle', freq: mtof(pent(b, 0)), f2: mtof(pent(b, 5)), glide: 0.16, a: 0.01, peak: 0.05 * v, tau: 0.08 });
  },
  bloom(t, r, v, ps) {
    const b = chimeRoot() + ps;
    for (let i = 0; i < 7; i++) vCelesta(t + i * 0.045, pent(b, i + 2), 0.3, (0.16 + i * 0.01) * v, sfxInV);
    vBell(t + 0.34, pent(b, 10), 0.8, 0.07 * v, sfxInV);
    vBell(t + 0.4, pent(b, 12), 0.8, 0.05 * v, sfxInV);
  },
  heal(t, r, v, ps) {
    const b = chimeRoot() + ps - 12;
    [0, 2, 3].forEach((d, i) => toneHit(t + i * 0.03, sfxInV, { freq: mtof(pent(b, d)), a: 0.12, hold: 0.1, peak: 0.07 * v, tau: 0.3 }));
    [5, 7, 8].forEach((d, i) => vCelesta(t + 0.12 + i * 0.07, pent(b, d), 0.4, 0.14 * v, sfxInV));
  },
  coin(t, r, v, ps) {
    const b = chimeRoot() + ps;
    const f1 = mtof(b + 19), f2 = mtof(b + 24);
    toneHit(t, sfxInV, { freq: f1, a: 0.002, peak: 0.16 * v, tau: 0.06 });
    toneHit(t + 0.065, sfxInV, { freq: f2, a: 0.002, peak: 0.2 * v, tau: 0.22 });
    toneHit(t + 0.065, sfxInV, { freq: f2 * 3, a: 0.002, peak: 0.03 * v, tau: 0.08 });
  },
  buy(t, r, v, ps) {
    SFX.coin(t, r, v * 0.8, ps);
    SFX.coin(t + 0.11, r, v * 0.7, ps + 2);
    toneHit(t + 0.02, sfxIn, { freq: 140 * r, f2: 90 * r, glide: 0.06, a: 0.003, peak: 0.25 * v, tau: 0.05 });
    noiseHit(t + 0.02, sfxIn, { type: 'bandpass', freq: 3000, q: 1, a: 0.002, peak: 0.08 * v, tau: 0.05 });
  },
  enemy_hurt(t, r, v) {
    toneHit(t, sfxIn, { type: 'triangle', freq: 330 * r, f2: 180 * r, glide: 0.12, a: 0.004, peak: 0.3 * v, tau: 0.08 });
    noiseHit(t, sfxIn, { type: 'bandpass', freq: 700 * r, f2: 300 * r, glide: 0.1, q: 2, a: 0.003, peak: 0.2 * v, tau: 0.06 });
  },
  // The Gloam lifts: a rising maj7/9 celesta arpeggio doubled by harp, a bell bloom, a
  // shimmering octave pair, and a few twinkles, all in the current track's key.
  mend(t, r, v, ps) {
    const b = chimeRoot() + ps;
    noiseHit(t, sfxInV, { type: 'bandpass', freq: 700, f2: 5000, glide: 0.7, q: 1.2, a: 0.3, peak: 0.05 * v, tau: 0.25 });
    const arp = [0, 4, 7, 11, 12, 14, 16, 19, 24];
    arp.forEach((d, i) => {
      const tt = t + i * 0.055;
      vCelesta(tt, b + d, 0.5, (0.15 + i * 0.012) * v, sfxInV);
      if (i % 2 === 0) vHarp(tt, b + d - 12, 0.9, 0.22 * v, sfxInV);
    });
    const te = t + arp.length * 0.055 + 0.03;
    [12, 16, 19, 23].forEach((d, i) => vBell(te + i * 0.014, b + d, 1.2, 0.09 * v, sfxInV));
    toneHit(te, sfxInV, { freq: mtof(b + 24), a: 0.12, hold: 0.2, peak: 0.045 * v, tau: 0.55, vib: [6, 4] });
    toneHit(te, sfxInV, { freq: mtof(b + 31), a: 0.15, hold: 0.2, peak: 0.028 * v, tau: 0.45, vib: [5.3, 6] });
    const tw = [24, 26, 28, 31, 33, 36];
    for (let k = 0; k < 4; k++) vCelesta(te + 0.14 + k * (0.09 + Math.random() * 0.05), b + tw[Math.floor(Math.random() * tw.length)], 0.3, 0.06 * v, sfxInV);
  },
  player_hurt(t, r, v) {
    toneHit(t, sfxIn, { freq: 180 * r, f2: 75 * r, glide: 0.18, a: 0.004, peak: 0.5 * v, tau: 0.11 });
    noiseHit(t, sfxIn, { type: 'lowpass', freq: 420, a: 0.002, peak: 0.3 * v, tau: 0.07 });
    toneHit(t + 0.01, sfxIn, { type: 'triangle', freq: 300 * r, f2: 215 * r, glide: 0.12, a: 0.004, peak: 0.1 * v, tau: 0.09 });
  },
  debuff(t, r, v) {
    toneHit(t, sfxInV, { type: 'triangle', freq: 520 * r, f2: 250 * r, glide: 0.35, a: 0.01, peak: 0.15 * v, tau: 0.16, vib: [13, 18] });
    toneHit(t, sfxIn, { freq: 260 * r, f2: 125 * r, glide: 0.35, a: 0.01, peak: 0.12 * v, tau: 0.16 });
  },
  buff(t, r, v, ps) {
    const b = chimeRoot() + ps;
    toneHit(t, sfxIn, { type: 'triangle', freq: 300 * r, f2: 900 * r, glide: 0.12, a: 0.01, peak: 0.08 * v, tau: 0.07 });
    vKalimba(t + 0.05, pent(b, 3), 0.3, 0.26 * v, sfxInV);
    vKalimba(t + 0.11, pent(b, 5), 0.3, 0.28 * v, sfxInV);
  },
  end_turn(t, r, v) {
    toneHit(t, sfxIn, { type: 'triangle', freq: 330 * r, a: 0.002, peak: 0.22 * v, tau: 0.05 });
    toneHit(t + 0.095, sfxIn, { type: 'triangle', freq: 262 * r, a: 0.002, peak: 0.2 * v, tau: 0.06 });
    noiseHit(t, sfxIn, { type: 'bandpass', freq: 800, q: 2.5, a: 0.001, peak: 0.08 * v, tau: 0.02 });
  },
  turn_start(t, r, v, ps) {
    const b = chimeRoot() + ps;
    vKalimba(t, pent(b, 0), 0.4, 0.2 * v, sfxInV);
    vKalimba(t + 0.012, pent(b, 3), 0.4, 0.16 * v, sfxInV);
    vCelesta(t + 0.09, pent(b, 5), 0.4, 0.12 * v, sfxInV);
  },
  gloom(t, r, v) {
    noiseHit(t, sfxInV, { type: 'bandpass', freq: 150 * r, f2: 480 * r, glide: 0.6, q: 5, a: 0.3, hold: 0.15, peak: 0.35 * v, tau: 0.25 });
    toneHit(t, sfxInV, { freq: 55 * r, f2: 46 * r, glide: 0.8, a: 0.25, hold: 0.1, peak: 0.25 * v, tau: 0.3 });
    toneHit(t + 0.1, sfxInV, { type: 'triangle', freq: 110 * r, f2: 98 * r, glide: 0.6, a: 0.25, peak: 0.05 * v, tau: 0.25, vib: [3.5, 3] });
  },
  rain(t, r, v) {
    noiseHit(t, sfxInV, { type: 'bandpass', freq: 5000, q: 0.4, a: 0.35, hold: 0.5, peak: 0.07 * v, tau: 0.3 });
    for (let i = 0; i < 14; i++) {
      const f = (1600 + Math.random() * 2400) * r;
      toneHit(t + Math.random() * 1.3, sfxIn, { freq: f, f2: f * 0.7, glide: 0.02, a: 0.001, peak: (0.025 + Math.random() * 0.03) * v, tau: 0.012 });
    }
  },
  page_turn(t, r, v) {
    noiseHit(t, sfxIn, { type: 'bandpass', freq: 1800 * r, f2: 4200 * r, glide: 0.18, q: 1, a: 0.06, peak: 0.14 * v, tau: 0.06 });
    noiseHit(t + 0.17, sfxIn, { type: 'bandpass', freq: 3400 * r, q: 1.2, a: 0.004, peak: 0.1 * v, tau: 0.03 });
  },
  upgrade(t, r, v, ps) {
    const b = chimeRoot() + ps;
    const f0 = mtof(b + 12);
    [[1, 0.15, 0.5], [1.52, 0.08, 0.32], [2.44, 0.05, 0.2], [3.9, 0.03, 0.1]].forEach(([k, p, tau]) =>
      toneHit(t, sfxInV, { freq: f0 * k, a: 0.001, peak: p * v, tau }));
    [0, 2, 3, 5].forEach((d, i) => vKalimba(t + 0.12 + i * 0.065, pent(b, d), 0.3, 0.24 * v, sfxInV));
    vBell(t + 0.4, pent(b, 7), 1, 0.08 * v, sfxInV);
  },
  victory(t, r, v, ps) {
    const b = chimeRoot() + ps;
    [0, 2, 3, 5].forEach((d, i) => vCelesta(t + i * 0.09, pent(b, d), 0.4, 0.2 * v, sfxInV));
    const te = t + 0.38;
    [5, 7, 8].forEach((d, i) => vBell(te + i * 0.015, pent(b, d), 1.2, 0.08 * v, sfxInV));
    [0, 2, 3, 5].forEach((d, i) => vHarp(te + i * 0.025, pent(b, d) - 12, 1.2, 0.22 * v, sfxInV));
  },
  defeat(t, r, v, ps) {
    const b = chimeRoot() + ps - 12;
    [7, 4, 2, 0].forEach((d, i) => vPiano(t + i * 0.26, b + d, i === 3 ? 1.2 : 0.3, 0.3 * v, sfxInV));
  },
  error(t, r, v) {
    toneHit(t, sfxIn, { type: 'triangle', freq: 220 * r, f2: 200 * r, glide: 0.06, a: 0.003, peak: 0.2 * v, tau: 0.05, lp: 900 });
    toneHit(t + 0.09, sfxIn, { type: 'triangle', freq: 196 * r, f2: 180 * r, glide: 0.06, a: 0.003, peak: 0.2 * v, tau: 0.06, lp: 900 });
  },
  step(t, r, v) {
    noiseHit(t, sfxIn, { type: 'lowpass', freq: (500 + Math.random() * 300) * r, a: 0.004, peak: 0.12 * v, tau: 0.032 });
    noiseHit(t, sfxIn, { type: 'highpass', freq: 3000, a: 0.002, peak: 0.025 * v, tau: 0.01 });
  },
  open(t, r, v, ps) {
    const b = chimeRoot() + ps;
    noiseHit(t, sfxIn, { type: 'lowpass', freq: 400, a: 0.004, peak: 0.2 * v, tau: 0.07 });
    toneHit(t, sfxIn, { type: 'triangle', freq: 300 * r, f2: 600 * r, glide: 0.15, a: 0.01, peak: 0.07 * v, tau: 0.1 });
    vCelesta(t + 0.1, pent(b, 3), 0.3, 0.13 * v, sfxInV);
    vCelesta(t + 0.16, pent(b, 5), 0.4, 0.13 * v, sfxInV);
  },
};

// ---------------------------------------------------------------- public API

export const audio = {
  unlock() {
    try {
      if (typeof window === 'undefined') return;
      if (!ctx) {
        if (!(window.AudioContext || window.webkitAudioContext)) return;
        build();
        timer = setInterval(tick, 25);
        if (wantTrack) startMusic(wantTrack);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    } catch (e) {
      console.warn('audio: unlock failed', e);
    }
  },

  music(track) {
    const name = track || null;
    if (name && !TRACKS[name]) { console.warn('audio: unknown track', track); return; }
    if (name === wantTrack) return;
    wantTrack = name;
    if (!ctx) return; // started on unlock
    try { startMusic(name); } catch (e) { console.warn('audio: music failed', e); }
  },

  sfx(name, opts = {}) {
    if (!ctx || settings.muted || ctx.state !== 'running') return;
    const fn = SFX[name];
    if (!fn) { console.warn('audio: unknown sfx', name); return; }
    const now = ctx.currentTime;
    if (lastSfx[name] && now - lastSfx[name] < 0.03) return; // same sound in the same frame: once
    lastSfx[name] = now;
    sVoices = sVoices.filter(e => e > now);
    if (sVoices.length >= 12) return;
    sVoices.push(now + (SFX_LEN[name] || 0.4));
    const semis = Number(opts.pitch) || 0;
    const r = Math.pow(2, (semis + (Math.random() * 2 - 1) * 0.3) / 12);
    const v = (opts.vol == null ? 1 : Math.max(0, Number(opts.vol) || 0)) * (SFX_GAIN[name] ?? 1);
    try { fn(now + 0.005, r, v, semis); } catch (e) { console.warn('audio: sfx failed', name, e); }
  },

  setMusicVolume(v) {
    settings.music = clamp01(v);
    save();
    if (ctx) {
      const now = ctx.currentTime;
      musicVol.gain.setTargetAtTime(curve(settings.music), now, 0.03);
      musicWetVol.gain.setTargetAtTime(curve(settings.music), now, 0.03);
    }
  },

  setSfxVolume(v) {
    settings.sfx = clamp01(v);
    save();
    if (ctx) {
      const now = ctx.currentTime;
      sfxVol.gain.setTargetAtTime(curve(settings.sfx), now, 0.03);
      sfxWetVol.gain.setTargetAtTime(curve(settings.sfx) * 0.45, now, 0.03);
    }
  },

  toggleMute() {
    settings.muted = !settings.muted;
    save();
    if (ctx) master.gain.setTargetAtTime(settings.muted ? 0 : 1, ctx.currentTime, 0.04);
    return settings.muted;
  },

  get muted() { return settings.muted; },
  get musicVolume() { return settings.music; },
  get sfxVolume() { return settings.sfx; },
  get track() { return wantTrack; },

  // Dev hooks (not part of the game contract).
  _debug() {
    return { ctx, tap: comp, playing: [...players].map(p => p.name), voices: mVoices.length, tracks: Object.keys(TRACKS), sfx: Object.keys(SFX) };
  },
  _selfTest() { return selfTest(); },
};

// Parse every section and report bar-sum errors, non-chord tones on strong beats, and
// consecutive perfect intervals between the downbeat bass and melody. Runs without audio.
function selfTest() {
  selfWarnings = [];
  const notes = [];
  for (const [tn, def] of Object.entries(TRACKS)) {
    for (const key of Object.keys(def.sections)) {
      let P;
      try { P = prep(def, key); } catch (e) { selfWarnings.push(`${tn}.${key}: ${e.message}`); continue; }
      if (!P.mel) continue;
      let prevIv = null, prevBass = null, prevMel = null;
      P.bars.forEach((segs, bi) => {
        for (const n of P.mel.notes) {
          const b = n.start - bi * P.meter;
          if (b < -1e-6 || b >= P.meter - 1e-6) continue;
          if (Math.abs(b - Math.round(b)) > 1e-6 || n.dur < 1) continue;
          const c = chordAt(P, n.start);
          if (!c.pcs.includes(mod12(n.m))) notes.push(`${tn}.${key} bar ${bi + 1} beat ${b + 1}: ${n.m} over ${c.sym} (non-chord tone)`);
        }
        const down = P.mel.notes.find(n => Math.abs(n.start - bi * P.meter) < 1e-6);
        const bass = segs[0].c.bass;
        if (down) {
          const iv = mod12(down.m - bass);
          if (prevIv != null && iv === prevIv && (iv === 0 || iv === 7) && bass !== prevBass && mod12(down.m) !== prevMel) {
            selfWarnings.push(`${tn}.${key} bars ${bi}-${bi + 1}: consecutive ${iv ? 'fifths' : 'octaves'} bass/melody`);
          }
          prevIv = iv; prevBass = bass; prevMel = mod12(down.m);
        } else { prevIv = null; }
      });
    }
    for (const e of [...(def.intro || []), ...def.forms.flat()]) {
      if (!def.sections[e.s]) selfWarnings.push(`${tn}: form references missing section ${e.s}`);
      for (const k of ['lead', 'counter', 'dbl']) if (e[k] && !INST[e[k]]) selfWarnings.push(`${tn}: unknown instrument ${e[k]}`);
    }
  }
  const out = { errors: selfWarnings, nonChordTones: notes };
  selfWarnings = null;
  return out;
}
