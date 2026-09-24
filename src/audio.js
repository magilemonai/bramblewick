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
  maj9: [0, 4, 7, 11, 14], m6: [0, 3, 7, 9], dim7: [0, 3, 6, 9],
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
      // 'E5:1.5:a' marks an intended appoggiatura (the checker verifies it resolves by step).
      const [p, d, flag] = tok.split(':');
      const dur = +d;
      if (!(dur > 0)) throw new Error('audio: bad token ' + tok);
      if (p !== 'r') notes.push({ m: noteNum(p), start: bi * meter + b, dur, ...(flag === 'a' ? { app: 1 } : {}) });
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

// Rule-based ornamentation. amt 0..ORN_MAX. Never crosses a chord change with a suspension.
// Density cap: at most one ornament per bar and never in two bars running. Cadence notes stay
// clean: a section's last note, a phrase's last note (bars 4, 8), anything held a full bar,
// anything followed by a rest, and marked appoggiaturas are never touched or displaced.
const ORN_MAX = 0.45;
function ornament(notes, amt, rng, P, scale) {
  const src = notes.map(n => ({ ...n }));
  amt = Math.min(ORN_MAX, amt || 0);
  if (!amt) return src;
  const meter = P.meter, last = src.length - 1;
  const barOf = n => Math.floor(n.start / meter + 1e-9);
  const held = i => {
    const n = src[i], nx = src[i + 1];
    if (!n || i === last || n.app || n.dur >= meter - 1e-6) return true;
    if (nx.start - (n.start + n.dur) > 1e-6) return true; // followed by a rest
    return barOf(n) % 4 === 3 && barOf(nx) !== barOf(n);  // last note of a 4-bar phrase
  };
  const used = new Set();
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const n = src[i], nx = src[i + 1], bar = barOf(n);
    if (held(i) || used.has(bar) || used.has(bar - 1)) { out.push(n); continue; }
    const joined = nx && Math.abs(n.start + n.dur - nx.start) < 1e-6;
    const iv = joined ? nx.m - n.m : 0;
    const r = rng();
    const fire = (...ns) => { out.push(...ns); used.add(bar); };
    // 1. passing tone through a third
    if (joined && n.dur >= 1 && Math.abs(iv) >= 3 && Math.abs(iv) <= 4 && r < amt) {
      const sc = chordScale(scale, chordAt(P, n.start + n.dur - 0.5));
      const mid = scaleStep(n.m, Math.sign(iv), sc);
      if (mid != null && (mid - n.m) * (nx.m - mid) > 0) {
        fire({ ...n, dur: n.dur - 0.5 }, { m: mid, start: n.start + n.dur - 0.5, dur: 0.5, orn: 1 });
        continue;
      }
    }
    // 2. upper-neighbour turn at the end of a long (but not cadential) note
    if (n.dur >= 2 && r < amt * 0.5) {
      const sc = chordScale(scale, chordAt(P, n.start + n.dur - 1));
      const up = scaleStep(n.m, 1, sc);
      if (up != null && up - n.m <= 2) {
        fire({ ...n, dur: n.dur - 1 },
          { m: up, start: n.start + n.dur - 1, dur: 0.5, orn: 1 },
          { m: n.m, start: n.start + n.dur - 0.5, dur: 0.5, orn: 1 });
        continue;
      }
    }
    // 3. dotted lilt on two stepwise quarters under one chord (never displaces a cadence note)
    if (joined && n.dur === 1 && nx.dur === 1 && iv !== 0 && Math.abs(iv) <= 2 && !held(i + 1) &&
        chordAt(P, n.start) === chordAt(P, nx.start) && r > 1 - amt * 0.35) {
      fire({ ...n, dur: 1.5 });
      src[i + 1] = { ...nx, start: nx.start + 0.5, dur: 0.5 };
      continue;
    }
    // 4. grace note from below into an upward leap
    if (joined && iv >= 5 && n.dur >= 0.5 && r > 1 - amt * 0.3) {
      const g = scaleStep(nx.m, -1, chordScale(scale, chordAt(P, nx.start)));
      if (g != null && g > n.m) {
        fire({ ...n, dur: n.dur - 0.25 }, { m: g, start: nx.start - 0.25, dur: 0.25, orn: 1 });
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
// ':a' marks the written appoggiaturas (E over G/F, C and G over Bbmaj7).
const NANA_MEL = 'A4:1 C5:1 F5:1 | E5:1.5:a D5:0.5 B4:1 | C5:1.5:a Bb4:0.5 A4:1 | G4:3 | ' +
  'A4:1 C5:1 F5:1 | G5:1.5:a F5:0.5 D5:1 | Bb4:1 C5:1 E5:1 | F5:3';

// Lead-vs-accompaniment trims (velocity multipliers by role), from offline renders
// (audio._measure): lead RMS was 1.5-8 dB under the rest of the band in 1.0. Targets: lead about
// +1 dB over the rest in melodic tracks, about -1 dB in the percussive boss/elite loops. The
// correction is split between lead and rest so overall loudness barely moves.
const bal = (lead, rest) => ({ lead, acc: rest, bass: rest, pad: rest, perc: rest, layer: rest });

const TRACKS = {
  // Title: the theme as a gentle waltz. Harp oom-pah-pah, pizz bass, soft pad.
  title: {
    bal: bal(1.34, 0.75),
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
    bal: bal(1.34, 0.75),
    // Adaptive layers (audio.intensity): see LAYER_WIN.
    adapt: {
      drive: { inst: 'harp', pat: 'pulse8', vel: 0.22 }, pedal: { inst: 'pizz', pat: 'X.o.x.o.', pitch: 'bass', vel: 0.4 },
      padx: 1, perc: { tick: '..x...x...x...x.', brush: '....x.......x...' }, cm: 'ocarina',
    },
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
          'F5:1.5 E5:0.5 D5:1 A5:1 | Bb5:1.5 A5:0.5 G5:1 F5:1 | E5:2 D5:1:a C5:1 | C5:1 A4:1 D5:1 F5:1 | G5:2 E5:1 r:1',
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
    bal: bal(1.52, 0.66),
    // Adaptive layers (audio.intensity): see LAYER_WIN.
    adapt: {
      drive: { inst: 'kalimba', pat: 'pulse8', vel: 0.16 }, pedal: { inst: 'pad', pat: 'drone', pitch: 'tonic', vel: 0.5 },
      padx: 1, perc: { tick: '..x...x...x...x.', taiko: 'x.........x.....' }, cm: 'flute',
    },
    level: 0.72,
    bpm: 88, meter: 4, swing: 0.62, chime: 2, scale: sc(2, MIXO),
    lead: 'ocarina', acc: 'comp', accInst: 'piano', bassPat: 'walk', bassInst: 'pizz', pad: 0.4,
    vlo: 54, vhi: 70, clo: 60, chi: 71,
    perc: { shaker: 'o.x.o.x.o.x.o.x.', brush: '....x.......x...' },
    sections: {
      I: { ch: 'D | C/D' },
      A: {
        ch: 'D | C | G/B | D | D | C | Em7:2 Am7:2 | D',
        mel: 'F#5:1 A5:0.5 F#5:0.5 E5:1:a D5:1 | E5:1.5 G5:0.5 E5:1 C5:1 | D5:1 B4:0.5 D5:0.5 G5:2 | F#5:1.5 E5:0.5 D5:2 | ' +
          'A4:0.5 D5:0.5 F#5:0.5 A5:1.5 G5:0.5 F#5:0.5 | E5:1 C5:0.5 E5:0.5 G5:1 E5:1 | G5:1 E5:1 C5:1 E5:1 | D5:3 r:1',
      },
      B: {
        ch: 'Gmaj7 | C/G | Bm7 | Em7 | C | G/B | Am7 | D',
        mel: 'B4:1 D5:0.5 F#5:0.5 A5:2:a | G5:1 E5:0.5 G5:0.5 C5:2 | F#5:1.5 D5:0.5 B4:1 A4:1 | G4:1 B4:1 D5:1 E5:1 | ' +
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
    bal: bal(1.15, 0.87),
    // Adaptive layers (audio.intensity): see LAYER_WIN.
    adapt: {
      drive: { inst: 'pizz', pat: 'pulse8', vel: 0.26 }, pedal: { inst: 'timp', pat: 'X.......x.......', pitch: 'bass', vel: 0.5 },
      padx: 1, perc: { brush: '..o...o...o...o.', taiko: 'x...............' }, cm: 'ocarina',
    },
    level: 1.7,
    bpm: 80, meter: 4, chime: 0, scale: sc(9, DOR),
    lead: 'piano', acc: 'harp8', accInst: 'harp', bassPat: 'half', bassInst: 'pizz', pad: 0.5,
    vlo: 55, vhi: 70, clo: 57, chi: 69, verb: 1.15,
    perc: { brush: '....o.......o...' },
    sections: {
      I: { ch: 'Am7 | D/A' },
      A: {
        ch: 'Am7 | D/A | Cmaj7 | G | Am7 | D | Em7 | Am',
        mel: 'E5:1.5 D5:0.5 C5:1 A4:1 | F#5:2 E5:1:a D5:1 | E5:1 G5:1 B5:1.5 A5:0.5 | G5:1.5 F#5:0.5 D5:2 | ' +
          'C5:1.5 B4:0.5 A4:1 E5:1 | F#5:1.5 E5:0.5 D5:1 A4:1 | B4:1 D5:1 G5:1 F#5:1 | C5:1.5 B4:0.5 A4:2',
      },
      B: {
        ch: 'Cmaj7 | Bm7 | Em7 | Am7 | Fmaj7 | G | Dsus4:2 D:2 | Am',
        mel: 'G5:1 E5:1 C5:1 B4:1 | D5:1.5 F#5:0.5 A5:2 | G5:1 F#5:0.5 E5:0.5 B4:2 | C5:1 E5:1 G5:1.5 A5:0.5 | ' +
          'A5:2 G5:1:a F5:1 | D5:1.5 B4:0.5 D5:1 E5:1 | G5:1 A5:1 G5:1:a F#5:1 | E5:1 C5:1 A4:2',
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
  // Melody-free stretches (2.0): one 2-bar breath (H, ~7s) mid-pass and one 4-bar snowfall (C,
  // ~14s) at the seam, so no silence outlasts a player's turn and a 3-6 minute fight hears the
  // tune come back every ~40s. 1.0 had two 4-bar C sections per pass, which read as the music
  // stopping. Under rising intensity the drive layer keeps moving through them.
  winter: {
    // Adaptive layers (audio.intensity): see LAYER_WIN.
    adapt: {
      drive: { inst: 'celesta', pat: 'cycle8', vel: 0.13 }, pedal: { inst: 'timp', pat: 'Xx......Xx......', pitch: 'tonic', vel: 0.45 },
      padx: 1, perc: { tick: '......x.......x.', shaker: '..o...o...o...o.' }, cm: 'box',
    },
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
      H: { ch: 'Emadd9 | Cmaj7' },
    },
    intro: [{ s: 'I', tacet: true }],
    forms: [
      [{ s: 'A' }, { s: 'H' }, { s: 'B', lead: 'box' }, { s: 'A', orn: 0.2, counter: 'ocarina', dyn: 0.9 }, { s: 'C' }],
      [{ s: 'B' }, { s: 'A', lead: 'box', orn: 0.2 }, { s: 'H' }, { s: 'B', counter: 'ocarina' }, { s: 'C' }],
    ],
  },

  // Boss: Nana's theme in F minor, a 3+3+2 pizz ostinato and taiko under it. Reed (accordion)
  // lead doubled by flute an octave up on repeats.
  // Bar 2 (2.0 revision): the Lydian lift G/F becomes Gm7b5/F, a ii-half-diminished 4/2 over the
  // tonic pedal. Same root motion as Nana's bar (G over F), mode-mixed to half-diminished: the
  // tritone G-Db and the 9th over the pedal keep the tension. 1.0 had Gb/F, whose minor 9th
  // F-Gb over the pedal is the Phrygian 'something is under the water' semitone; that read as
  // horror, and a cosy game's boss should be sad and dangerous, never nasty. The Neapolitan
  // survives in B, where it is functional (bII to V) and not grinding against a pedal.
  boss: {
    bal: bal(1.53, 0.65),
    // Adaptive layers (audio.intensity): see LAYER_WIN.
    adapt: {
      drive: { inst: 'harp', pat: 'pulse8', vel: 0.24 }, pedal: { inst: 'timp', pat: 'X..x..x.', pitch: 'tonic', vel: 0.55 },
      padx: 1, perc: { tick: 'x.x.x.x.x.x.x.x.', taiko: '....x.......x.xx' }, cm: 'flute',
    },
    level: 0.64,
    bpm: 126, meter: 4, chime: 8, scale: sc(5, AEO),
    lead: 'reed', acc: 'stab', accInst: 'piano', bassPat: 'ost', bassInst: 'pizz', pad: 0.7,
    vlo: 53, vhi: 68, clo: 60, chi: 72, blo: 36, bhi: 47, fadeIn: 0.6,
    perc: { taiko: 'X..x..x.', shaker: 'o.x.o.x.o.x.o.x.' },
    sections: {
      I: { ch: 'Fm | Fm' },
      A: {
        ch: 'Fm | Gm7b5/F | Dbmaj7 | Csus4:2 C:2 | Fm/Ab | Gm7b5/Bb | Dbmaj7:2 C7:2 | Fm',
        mel: 'Ab4:1 C5:1 F5:2 | Eb5:1.5:a Db5:0.5 Bb4:2 | C5:1.5 Bb4:0.5 Ab4:2 | G4:4 | ' +
          'Ab4:1 C5:1 F5:2 | G5:1.5 F5:0.5 Db5:2 | Bb4:1:a C5:1 E5:2 | F5:3 r:1',
      },
      B: {
        ch: 'Dbmaj7 | Bbm7 | Gb | C | Fm | Db | Bbm7:2 C7:2 | C7',
        mel: 'Ab4:0.5 C5:0.5 F5:1 Eb5:1:a Db5:0.5 C5:0.5 | Db5:1.5 C5:0.5 Bb4:2 | Bb4:0.5 Db5:0.5 Gb5:1 F5:0.5 Gb5:0.5 Db5:1 | E5:2 G5:2 | ' +
          'Ab5:1 G5:0.5 F5:0.5 C5:2 | Db5:1 F5:1 Ab5:2 | F5:1 Db5:1 E5:1 G5:1 | Bb5:2 G5:1 E5:1',
      },
      C: { ch: 'Fm | Gm7b5/F | Fm | C/E' },
    },
    intro: [{ s: 'I', tacet: true }],
    forms: [
      [{ s: 'A' }, { s: 'A', dbl: 'flute', orn: 0.2 }, { s: 'B', dbl: 'flute' }, { s: 'C', tacet: true }, { s: 'A', lead: 'flute', oct: 0, counter: 'reed', orn: 0.3 }],
      [{ s: 'B' }, { s: 'A', dbl: 'flute', orn: 0.3 }, { s: 'C', tacet: true }, { s: 'B', lead: 'flute', counter: 'reed', orn: 0.2 }, { s: 'A', dbl: 'flute' }],
    ],
  },

  // Elite: short tense D-minor loop over a pedal, harmonic-minor A7 and a Neapolitan Eb.
  elite: {
    bal: bal(1.47, 0.68),
    // Adaptive layers (audio.intensity): see LAYER_WIN.
    adapt: {
      drive: { inst: 'harp', pat: 'pulse8', vel: 0.22 }, pedal: { inst: 'timp', pat: 'X.......x...x...', pitch: 'tonic', vel: 0.5 },
      padx: 1, perc: { shaker: 'o.x.o.x.o.x.o.x.', taiko: '....x.......x.x.' }, cm: 'reed',
    },
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

  // Hearth: Nana's theme developed as a lullaby in Bb, felt piano over a warm pad. The head is
  // inverted (the rising arpeggio now falls, F D A), the Lydian lift (C/Bb) answers with a rising
  // arpeggio, bar 4 sighs through a 4-3 suspension, and bar 5 is reharmonized to vi7. On repeats
  // an alto line (ocarina) hums long notes against it in contrary motion.
  hearth: {
    bal: bal(1.13, 0.89),
    level: 1.35,
    bpm: 62, meter: 3, chime: 10, scale: sc(10, MAJ),
    lead: 'piano', acc: 'broken', accInst: 'piano', bassPat: 'none', bassInst: 'pizz', pad: 0.9,
    vlo: 55, vhi: 70, clo: 58, chi: 70, verb: 1.2,
    sections: {
      A: {
        ch: 'Bbmaj7 | C/Bb | Ebmaj7 | Fsus4:2 F:1 | Gm7 | Ebmaj7 | Cm7:2 F7:1 | Bb',
        mel: 'F5:1.5 D5:0.5 A4:1 | C5:1.5 E5:0.5 G5:1 | Bb5:2 G5:1 | Bb4:2 A4:1 | ' +
          'D5:1.5 Bb4:0.5 G4:1 | Eb5:1.5 G5:0.5 Bb5:1 | G5:1 F5:1 Eb5:1 | D5:3',
        cm: 'D4:3 | E4:3 | G4:3 | F4:3 | F4:2 D4:1 | G4:3 | G4:2 A4:1 | Bb4:3',
      },
      B: {
        ch: 'Gm7 | Cm7 | F7 | Bbmaj7 | Ebmaj7 | Dm7 | Cm7:2 F7:1 | Bb',
        mel: 'D5:2 Bb4:1 | Eb5:2 C5:1 | A4:1 C5:1 Eb5:1 | D5:3 | G5:2 F5:1 | F5:1 D5:1 A4:1 | Eb5:1 C5:1 A4:1 | Bb4:3',
      },
      V: { ch: 'Bbmaj7 | C/Bb | Bbmaj7 | Fsus4:2 F:1' },
    },
    intro: [{ s: 'V', tacet: true }],
    forms: [
      [{ s: 'A' }, { s: 'B' }, { s: 'A', cm: 'ocarina', orn: 0.2 }, { s: 'V' }],
      [{ s: 'B', orn: 0.2 }, { s: 'A', lead: 'box', dbl: 'piano', dblOct: -1, cm: 'ocarina' }, { s: 'V' }, { s: 'A', orn: 0.3 }, { s: 'V' }],
    ],
  },

  // Market: G major, jaunty oom-pah with a musette-tuned accordion.
  market: {
    bal: bal(1.32, 0.76),
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
    bal: bal(1.43, 0.7),
    bpm: 92, meter: 4, chime: 7, scale: sc(7, LYD),
    lead: 'celesta', acc: 'tiptoe', accInst: 'harp', bassPat: 'tiptoe', bassInst: 'pizz', pad: 0.45,
    vlo: 55, vhi: 71, clo: 62, chi: 74,
    perc: { tick: '....x.......x..o' },
    sections: {
      A: {
        ch: 'Gmaj7 | A/G | Gmaj7 | A/G | Em7 | F#m7 | Bm7 | A/G',
        mel: 'B4:0.5 D5:0.5 F#5:1 r:0.5 E5:0.5 D5:1 | C#5:0.5 E5:0.5 A5:1 r:1 G5:1 | F#5:1.5 D5:0.5 B4:1 r:1 | ' +
          'A4:0.5 C#5:0.5 E5:0.5 G5:0.5 F#5:2:a | G5:1 E5:0.5 B4:0.5 D5:2 | A5:1 F#5:0.5 C#5:0.5 E5:2 | ' +
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

  // Victory: a fanfare on the theme's rising arpeggio with the Lydian lift, then the theme
  // developed. P and R put Nana's tune in rhythmic augmentation (each bar spread over two) and
  // reharmonize it: the arrival on F becomes Dm7, E-D is heard over Am7, the lift (G/F) is held
  // a whole bar, and the last cadence goes through the borrowed minor iv6 (Bbm6/Db) so its
  // Db-G tritone resolves outward onto F. Over it a new descant moves in quarters, contrary to
  // the slow tune. Q is a contrasting pastoral answer.
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
        ch: 'F | Dm7 | Am7 | G/F | Bbadd9 | Dm7 | Gm7:2 C7:1 | C7sus4:2 C7:1',
        mel: 'A4:2 C5:1 | F5:3 | E5:2 D5:1 | B4:3 | C5:2 Bb4:1 | A4:3 | G4:2 Bb4:1 | G4:3',
        cm: 'C6:1 Bb5:1 A5:1 | D6:1 C6:1 A5:1 | C6:1 A5:1 B5:1 | D6:1 B5:1 G5:1 | ' +
          'D6:1 Bb5:1 G5:1 | A5:1 G5:1 F5:1 | Bb5:1 A5:1 G5:1 | F5:2 E5:1',
      },
      R: {
        ch: 'F/A | Bbmaj7 | Gm7 | Dm7/F | Gm7 | C7 | Bbm6/Db | F',
        mel: 'A4:2 C5:1 | F5:3 | G5:2 F5:1 | D5:3 | Bb4:2 C5:1 | E5:3 | F5:2 Db5:1 | C5:3',
        cm: 'C6:1 Bb5:1 A5:1 | Bb5:2 A5:1 | D6:2 Bb5:1 | A5:2 C6:1 | ' +
          'Bb5:1 A5:1 G5:1 | C6:1 Bb5:1 G5:1 | Bb5:2 G5:1 | A5:3',
      },
      Q: {
        ch: 'Bb/F | F | Gm7/F | F | Bb/F | F | G/F | F',
        mel: 'D5:2 C5:1 | A4:3 | Bb4:1 D5:1 G5:1 | F5:3 | D5:2 C5:1 | A4:1 C5:1 F5:1 | E5:1.5:a D5:0.5 B4:1 | C5:3',
      },
    },
    intro: [{ s: 'S', lead: 'flute', dbl: 'celesta', dblOct: 0 }],
    forms: [
      [{ s: 'P', lead: 'flute', cm: 'kalimba' }, { s: 'R', lead: 'flute', cm: 'kalimba' }, { s: 'Q', lead: 'flute' },
        { s: 'P', lead: 'ocarina', cm: 'celesta', dyn: 0.9 }, { s: 'R', lead: 'ocarina', cm: 'celesta', dyn: 0.9 },
        { s: 'Q', lead: 'box', oct: 1 }],
    ],
  },

  // Defeat: a tender plagal-leaning cadence, then an F drone with a far-off music-box echo.
  // Timing (2.0): the screen is up ~20-40s, so the echo of Nana's head arrives at ~16s (1.0 made
  // you wait 39s for it), the drone thins from ~26s, and only a long stay hears the second echo
  // (the lift, E D B over the drone) at ~42s.
  defeat: {
    level: 1.12,
    bpm: 56, meter: 3, chime: 5, scale: sc(5, MAJ),
    lead: 'piano', acc: 'block', accInst: 'piano', bassPat: 'drone', bassInst: 'pad', pad: 0.8,
    vlo: 53, vhi: 69, clo: 62, chi: 74, blo: 36, bhi: 47, fadeIn: 0.05, verb: 1.4,
    sections: {
      K: { ch: 'Bbmaj7 | Gm7/Bb | Bb/C | Fadd9', mel: 'F5:2 E5:1 | D5:2 C5:1 | Bb4:1.5 A4:0.5 G4:1 | A4:3' },
      D: { ch: 'Fadd9 | Fadd9 | Fadd9 | Fadd9', acc: 'none' },
      E: { ch: 'Fadd9 | Fadd9 | Fadd9 | Fadd9', acc: 'none', mel: 'r:3 | A5:1 C6:1 F6:1 | r:3 | r:3' },
      F: { ch: 'Fadd9 | G/F | Fadd9 | Fadd9', acc: 'none', mel: 'r:3 | E6:1.5:a D6:0.5 B5:1 | C6:3 | r:3' },
    },
    intro: [{ s: 'K' }],
    forms: [
      [{ s: 'E', lead: 'box', dyn: 0.45 }, { s: 'D', pad: 0.75 }, { s: 'F', lead: 'box', dyn: 0.4 }, { s: 'D', pad: 0.6 }, { s: 'D', pad: 0.5 }],
    ],
  },

  // Select: dawn on the porch. Harp breaks softly over a drone; a flute remembers the first half
  // of Nana's theme and stops short on the lift, then a hum answers with Pell's opening (in F,
  // over his bVII-over-tonic 'old song' chord, Eb/F). Nothing cadences: the tune waits for you.
  select: {
    bal: bal(0.83, 1.2),
    level: 1.3,
    bpm: 72, meter: 4, chime: 5, scale: sc(5, MAJ), verb: 1.3,
    lead: 'flute', acc: 'broken', accInst: 'harp', bassPat: 'drone', bassInst: 'pad', pad: 0.55,
    vlo: 55, vhi: 70, clo: 60, chi: 72, blo: 36, bhi: 47, fadeIn: 2,
    sections: {
      I: { ch: 'Fmaj7 | Bbmaj7/F' },
      N: { ch: 'Fmaj7 | G/F | Bbmaj7 | Csus4', mel: 'A4:1 C5:1 F5:2 | E5:1.5:a D5:0.5 B4:2 | A4:4 | r:4' },
      L: { ch: 'Dm7 | Bb/F | Eb/F | Fsus2', mel: 'C5:1 A4:1 C5:1 D5:1 | F5:2 D5:1 Bb4:1 | G4:3 r:1 | r:4' },
      W: { ch: 'Fmaj7 | Bbmaj7/F | Fmaj7 | Csus4', acc: 'drops', accInst: 'celesta' },
    },
    intro: [{ s: 'I', tacet: true }],
    forms: [
      [{ s: 'N' }, { s: 'L', lead: 'hum' }, { s: 'W' }, { s: 'N', lead: 'box', oct: 1, dyn: 0.8 },
        { s: 'L', lead: 'hum', counter: 'flute' }, { s: 'W' }],
    ],
  },

  // Pell's theme (his map screens): Eb major, a hummed folk tune with a lazy lilt. Bar 4 is the
  // 'old song' colour, Db/Eb (bVII over the tonic). The bees live in the harp ('buzz'): on the
  // off-beats a four-note turn hovers around one chord tone, then flies to another chord tone
  // on the next off-beat. Figures, never a literal buzz.
  pell: {
    bal: bal(1.28, 0.78),
    level: 1.1,
    bpm: 88, meter: 4, swing: 0.58, chime: 3, scale: sc(3, MAJ),
    lead: 'hum', acc: 'buzz', accInst: 'harp', bassPat: 'half', bassInst: 'pizz', pad: 0.5,
    vlo: 55, vhi: 70, clo: 58, chi: 70,
    perc: { brush: '....o.......o...' },
    sections: {
      I: { ch: 'Eb | Db/Eb' },
      A: {
        ch: 'Eb | Ab/Eb | Eb | Db/Eb | Cm7 | Ab6 | Fm7:2 Bb7:2 | Eb',
        mel: 'Bb4:1.5 G4:0.5 Bb4:1 C5:1 | Eb5:2 C5:1 Ab4:1 | Bb4:1 G4:0.5 Ab4:0.5 Bb4:1 G4:1 | F4:3 r:1 | ' +
          'G4:1 C5:0.5 D5:0.5 Eb5:1 G5:1 | F5:1.5 Eb5:0.5 C5:2 | Ab4:1 C5:1 D5:1 F5:1 | Eb5:3 r:1',
      },
      B: {
        ch: 'Cm | Ab | Eb/G | Bb | Cm | Ab | Fm7 | Bbsus4:2 Bb7:2',
        mel: 'Eb5:1 D5:0.5 C5:0.5 G4:2 | C5:1 Bb4:0.5 Ab4:0.5 Eb4:2 | G4:1 Bb4:1 Eb5:1 G5:1 | F5:3 r:1 | ' +
          'C5:1 Eb5:1 G5:1.5 F5:0.5 | Eb5:1 D5:0.5 C5:0.5 Ab4:2 | Ab4:1 C5:1 Eb5:1 F5:1 | Eb5:2 D5:1 r:1',
      },
    },
    intro: [{ s: 'I', tacet: true }],
    forms: [
      [{ s: 'A' }, { s: 'A', lead: 'ocarina', counter: 'hum', orn: 0.2 }, { s: 'B', lead: 'kalimba', oct: 1 },
        { s: 'A', dbl: 'ocarina', orn: 0.25 }, { s: 'I', tacet: true }],
      [{ s: 'B' }, { s: 'A', lead: 'ocarina', orn: 0.25 }, { s: 'B', lead: 'hum', counter: 'kalimba' },
        { s: 'A', dbl: 'kalimba', dblOct: 1 }, { s: 'I', tacet: true }],
    ],
  },

  // Tutorial: G major, gentle and sparse; kalimba over one soft harp chord per harmony. A (8) +
  // B (4) ends on D7 (melody on the 7th, C, falling to A's D) so every pass re-enters seamlessly.
  tutorial: {
    bal: bal(1.58, 0.63),
    level: 1.25,
    bpm: 84, meter: 4, chime: 7, scale: sc(7, MAJ),
    lead: 'kalimba', acc: 'block', accInst: 'harp', bassPat: 'half', bassInst: 'pizz', pad: 0.45,
    vlo: 55, vhi: 69, clo: 60, chi: 72,
    sections: {
      A: {
        ch: 'G | Em7 | Cmaj7 | D | G/B | C | Am7:2 D7:2 | G',
        mel: 'D5:2 B4:1 G4:1 | r:1 G4:1 B4:2 | E5:2 C5:1 B4:1 | A4:3 r:1 | ' +
          'D5:2 B4:1 D5:1 | E5:1 G5:1 E5:2 | C5:2 A4:1 F#4:1 | G4:3 r:1',
      },
      B: { ch: 'Em7 | Cmaj7 | Am7 | D7sus4:2 D7:2', mel: 'B4:2 G4:2 | E4:4 | r:2 E5:1 D5:1 | C5:3 r:1' },
    },
    intro: [],
    forms: [
      [{ s: 'A' }, { s: 'B' }, { s: 'A', lead: 'celesta', oct: 1, dyn: 0.85 }, { s: 'B', lead: 'ocarina' }],
      [{ s: 'A', lead: 'ocarina', orn: 0.2 }, { s: 'B', tacet: true }, { s: 'A', counter: 'celesta' }, { s: 'B' }],
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
  const cm = s.cm ? parseLine(s.cm, meter) : null; // written counterline (played when a form entry sets cm)
  if (mel && mel.bars !== bars.length) selfWarn(`section ${key}: melody has ${mel.bars} bars, chords ${bars.length}`);
  if (cm && cm.bars !== bars.length) selfWarn(`section ${key}: counterline has ${cm.bars} bars, chords ${bars.length}`);
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
    key, meter, bars, mel, bass, cm,
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


// ---------------------------------------------------------------- villager motifs
// 2-4 bars each, written in C major or A minor and transposed at play time to the current track's
// tonic (or its relative major/minor, so the pitch collection matches the ducked score).
const MOTIFS = {
  // Odile: gruff barge captain. Low musette accordion with its own left-hand chords, a shanty
  // lilt, and a bVII (Bb/C) swagger over the tonic.
  odile: {
    mode: 'major', bpm: 100, meter: 3, level: 0.95,
    lead: 'reed', acc: 'waltz', accInst: 'reed', bassPat: 'waltz', bassInst: 'pizz', pad: 0,
    vlo: 50, vhi: 62, blo: 31, bhi: 43,
    ch: 'C | Bb/C | F/C:2 G7:1 | C',
    mel: 'G4:1.5 E4:0.5 C4:1 | D4:1 F4:1 Bb4:1 | A4:1.5 G4:0.5 F4:0.5 D4:0.5 | C4:2 r:1',
  },
  // Auntie Rue: warm and plain. Ocarina over harp, closing on the minor-iv 'amen' (Fm/C).
  rue: {
    mode: 'major', bpm: 76, meter: 3, level: 1.6,
    lead: 'ocarina', acc: 'broken', accInst: 'harp', bassPat: 'none', bassInst: 'pizz', pad: 0.5,
    vlo: 55, vhi: 67,
    ch: 'C | F/C | Am7:2 Dm7:1 | Fm/C:2 C:1',
    mel: 'E5:1 G5:1 C6:1 | A5:2 F5:1 | E5:1 C5:1 F5:1 | C5:3',
  },
  // Bram: sturdy four-square tune in felt piano with a pizz shadow an octave down. He talks to
  // his anvil and it answers: a ting after the first phrase, ting-ting-TING at the end.
  bram: {
    mode: 'major', bpm: 108, meter: 4, level: 0.75,
    lead: 'piano', dbl: 'pizz', dblOct: -1, acc: 'none', accInst: 'harp', bassPat: 'half', bassInst: 'pizz', pad: 0.3,
    vlo: 55, vhi: 67,
    ch: 'C | F:2 G:2 | C/E:2 F:2 | G:2 C:2',
    mel: 'C4:1 E4:1 G4:1 r:1 | A4:1 F4:1 G4:1 D4:1 | G4:1 E4:1 A4:1 C5:1 | B4:1 D5:1 C5:2',
    cm: 'r:3 C6:1 | r:4 | r:4 | r:2 G5:0.5 G5:0.5 C6:1', cmInst: 'anvil',
  },
  // Juniper: fearless kid, would-be knight. Tin whistle with a dotted call-to-arms, a bold leap
  // up to the top C, snare-ish ticks.
  juniper: {
    mode: 'major', bpm: 132, meter: 4, level: 0.9,
    lead: 'whistle', acc: 'stab', accInst: 'harp', bassPat: 'half', bassInst: 'pizz', pad: 0,
    vlo: 55, vhi: 67, perc: { tick: 'x.x.x.x.x.x.xxx.' },
    ch: 'C | G/B | Am:2 F:2 | G:2 C/E:2',
    mel: 'G4:0.75 G4:0.25 C5:1 E5:0.75 C5:0.25 G5:1 | A5:0.5 G5:0.5 D5:1 B4:2 | ' +
      'C5:0.5 D5:0.5 E5:1 A5:1 F5:1 | G5:1.5 A5:0.25 B5:0.25 C6:2',
  },
  // Pell: his theme's opening, hummed, with the harp bees.
  pell: {
    mode: 'major', bpm: 84, meter: 4, swing: 0.58, level: 1.1,
    lead: 'hum', acc: 'buzz', accInst: 'harp', bassPat: 'half', bassInst: 'pizz', pad: 0.4,
    vlo: 55, vhi: 67,
    ch: 'C | F/C | C | Bb/C',
    mel: 'G4:1.5 E4:0.5 G4:1 A4:1 | C5:2 A4:1 F4:1 | G4:1 E4:0.5 F4:0.5 G4:1 E4:1 | D4:3 r:1',
  },
  // Old Mossy: knew Nana. A low bassoon over a drone, in Nana's exact rhythm with her contour
  // turned modal: the head rises a major third and a fourth (C E A), the Lydian lift becomes the
  // Dorian F#, and it ends open on the dominant. He knows what the Gloam is and isn't saying.
  mossy: {
    mode: 'minor', bpm: 60, meter: 3, level: 1.7,
    lead: 'bassoon', acc: 'none', accInst: 'harp', bassPat: 'drone', bassInst: 'pad', pad: 0.6,
    vlo: 57, vhi: 69, blo: 33, bhi: 45,
    ch: 'Am | D/A | Fmaj7/A | Esus4:2 E:1',
    mel: 'C4:1 E4:1 A4:1 | G4:1.5:a F#4:0.5 D4:1 | C4:1.5 B3:0.5 A3:1 | B3:3',
  },
};

// ---------------------------------------------------------------- audio graph

let ctx = null;
let mix, comp, master, musicVol, musicWetVol, sfxVol, sfxWetVol, sfxIn, sfxInV, reverb;
let duckD, duckW;            // music-only duck (score); stingers and motifs bypass it
let stVol, stWet, stIn;      // stinger/motif bus: follows the music volume, never ducked
let noiseBuf = null, pianoWave, fluteWave, ocarinaWave;
let intensityTarget = 0;     // audio.intensity(); players read it at each bar line
let measureRole = null;      // dev: render only one role ('lead') or all but one ('!lead')
const duckState = { depth: 0, until: 0 };
let timer = null;
const players = new Set();
let current = null;          // Player
let wantTrack = null;        // requested track name (may be pending before unlock)

// 2.0 writes only bramblewick2.* keys. 1.0's key is read once as a fallback, never written.
const LS_KEY = 'bramblewick2.audio', LS_KEY_V1 = 'bramblewick.audio';
const settings = { music: 0.7, sfx: 0.8, muted: false };
try {
  const raw = typeof localStorage !== 'undefined' ? (localStorage.getItem(LS_KEY) ?? localStorage.getItem(LS_KEY_V1)) : null;
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

function build(ac) {
  if (ac) ctx = ac;
  else {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
  }

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
  duckD = ctx.createGain(); duckW = ctx.createGain();
  musicVol.connect(duckD); duckD.connect(mix); musicWetVol.connect(duckW); duckW.connect(reverb);
  duckState.depth = 0; duckState.until = 0;

  stVol = ctx.createGain(); stVol.gain.value = curve(settings.music);
  stWet = ctx.createGain(); stWet.gain.value = curve(settings.music);
  stVol.connect(mix); stWet.connect(reverb);
  stIn = ctx.createGain(); stIn.connect(stVol);
  const stSend = ctx.createGain(); stSend.gain.value = 0.45; stIn.connect(stSend); stSend.connect(stWet);

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
const vAnvilP = partialsVoice({ a: 0.001, p: [[1, 1, 0.4], [2.76, 0.55, 0.25], [5.4, 0.3, 0.1], [8.93, 0.18, 0.05]] });
const vTimpP = partialsVoice({ a: 0.004, p: [[1, 1, 0.55], [1.5, 0.3, 0.3], [1.98, 0.18, 0.2], [2.44, 0.07, 0.12]] });

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
const vWhistle = (t, m, d, v, out) => windVoice(t, m, d, v, out, ocarinaWave, 0.9, 0.006);

// Hummed voice ('mm'): triangle body plus a little saw through a low nasal lowpass, slow onset,
// late gentle vibrato. Pell's instrument.
function vHum(t, m, dur, vel, out) {
  const f = mtof(m);
  const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = 4;
  const g2 = ctx.createGain(); g2.gain.value = 0.32;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(1500, f * 2.2 + 250); lp.Q.value = 0.9;
  const g = ctx.createGain();
  const nodes = [o1, o2, g2, lp, g];
  if (dur > 0.4) {
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5 + Math.random() * 0.5;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + 0.25);
    lg.gain.linearRampToValueAtTime(f * 0.004, t + Math.min(dur, 0.8));
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    lfo.start(t); nodes.push(lfo, lg);
  }
  const a = Math.min(0.09, dur * 0.35);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + a);
  g.gain.setTargetAtTime(vel * 0.85, t + a, 0.2);
  g.gain.setTargetAtTime(0, t + dur, 0.07);
  const end = t + dur + 0.07 * 7;
  o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(out);
  o1.start(t); o2.start(t);
  for (const x of nodes) if (x.stop) x.stop(end);
  cleanup(o1, nodes);
  return end;
}

// Low double reed (bassoon-ish): saw through a fixed ~500 Hz formant plus a lowpass body.
function vBassoon(t, m, dur, vel, out) {
  const f = mtof(m);
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(1600, f * 5); lp.Q.value = 0.5;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 1.4;
  const bg = ctx.createGain(); bg.gain.value = 0.9;
  const g = ctx.createGain();
  const a = Math.min(0.035, dur * 0.3);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + a);
  g.gain.setTargetAtTime(vel * 0.8, t + a, 0.15);
  g.gain.setTargetAtTime(0, t + dur, 0.05);
  const end = t + dur + 0.05 * 7;
  o.connect(lp); o.connect(bp); bp.connect(bg); lp.connect(g); bg.connect(g); g.connect(out);
  o.start(t); o.stop(end);
  cleanup(o, [o, lp, bp, bg, g]);
  return end;
}

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
function vAnvil(t, m, d, v, out) {
  noiseHit(t, out, { type: 'highpass', freq: 5000, a: 0.001, peak: v * 0.35, tau: 0.008 });
  return vAnvilP(t, m, d, v, out);
}
function vTimp(t, m, d, v, out) {
  noiseHit(t, out, { type: 'lowpass', freq: 380, a: 0.002, peak: v * 0.4, tau: 0.03 });
  return vTimpP(t, m, d, v, out);
}
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
  hum: { fn: vHum, level: 0.26, send: 0.35, tail: 0.5, legato: 0.97 },
  whistle: { fn: vWhistle, level: 0.2, send: 0.3, tail: 0.32, legato: 0.9 },
  bassoon: { fn: vBassoon, level: 0.16, send: 0.3, tail: 0.35, legato: 0.92 },
  timp: { fn: vTimp, level: 0.5, send: 0.3, tail: 3.4 },
  anvil: { fn: vAnvil, level: 0.14, send: 0.35, tail: 2.4, legato: 1 },
  bell: { fn: vBell, level: 0.16, send: 0.5, tail: 5.4, legato: 1 },
};

// ---------------------------------------------------------------- the player

const bounce = n => { const s = []; for (let i = 0; i < n; i++) s.push(i); for (let i = n - 2; i > 0; i--) s.push(i); return s; };

// Adaptive layers (audio.intensity). Each layer fades in across its own intensity window, so
// rising intensity adds, in order: rhythmic drive, percussion, a bass pedal/ostinato, a fuller
// pad, and last a countermelody. Levels move only at bar lines, by at most LAYER_STEP per bar
// (a full fade takes two bars), with a linear ramp across each bar. Tempo never changes.
const LAYER_WIN = { drive: [0.15, 0.45], perc: [0.3, 0.65], pedal: [0.4, 0.7], padx: [0.55, 0.85], cm: [0.72, 1] };
const LAYER_STEP = 0.5;
// Pedal pattern characters: X/x root (accent/soft), O/o octave up, F/f fifth up.
const PCH = { X: [0, 1], x: [0, 0.65], O: [12, 0.9], o: [12, 0.6], F: [7, 0.85], f: [7, 0.55] };

class Player {
  constructor(name, def, t0, opts = {}) {
    this.name = name; this.def = def;
    this.dry = ctx.createGain(); this.wet = ctx.createGain();
    this.dry.gain.value = 0; this.wet.gain.value = 0;
    this.dry.connect(opts.dry || musicVol); this.wet.connect(opts.wet || musicWetVol);
    this.ch = new Map();
    this.lay = def.adapt ? new Map() : null;
    this.rng = mulberry32((Math.random() * 4294967296) >>> 0);
    this.queue = (def.intro || []).map(e => ({ ...e, _k: 0, _intro: true }));
    this.loop = 0;
    this.nextBar = t0; this.stopAt = Infinity; this.deadAt = Infinity;
    this.cur = null; this.bar = 0;
    this.prevV = null; this.prevB = null; this.prevC = null; this.prevLC = null;
    this.hist = []; // recently scheduled bars, for chordNow()
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
    if (this.lay) for (const L of this.lay.values()) { try { L.dry.disconnect(); L.wet.disconnect(); } catch (e) { /* */ } }
    try { this.dry.disconnect(); this.wet.disconnect(); } catch (e) { /* */ }
  }
  layer(name) {
    let L = this.lay.get(name);
    if (L) return L;
    const d = ctx.createGain(), w = ctx.createGain();
    d.gain.value = 0; w.gain.value = 0;
    d.connect(this.dry); w.connect(this.wet);
    L = { dry: d, wet: w, from: 0, cur: 0 };
    this.lay.set(name, L);
    return L;
  }
  layerLive(name) {
    const L = this.lay && this.lay.get(name);
    return !!L && (L.from > 1e-4 || L.cur > 1e-4);
  }
  updateLayers(T, barDur) {
    const A = this.def.adapt, I = intensityTarget;
    for (const name in LAYER_WIN) {
      if (!A[name]) continue;
      const L = this.layer(name);
      const [a, b] = LAYER_WIN[name];
      const want = clamp01((I - a) / (b - a));
      const from = L.cur;
      const to = from + Math.max(-LAYER_STEP, Math.min(LAYER_STEP, want - from));
      L.from = from; L.cur = to;
      if (from < 1e-4 && to < 1e-4) continue;
      for (const g of [L.dry.gain, L.wet.gain]) {
        g.setValueAtTime(from, T);
        g.linearRampToValueAtTime(to, T + barDur);
      }
    }
  }
  chan(inst, layer) {
    const key = layer ? layer + '/' + inst : inst;
    let c = this.ch.get(key);
    if (c) return c;
    const I = INST[inst], mixv = (this.def.mix && this.def.mix[inst]) ?? 1;
    const L = layer ? this.layer(layer) : null;
    c = ctx.createGain(); c.gain.value = I.level * mixv;
    const s = ctx.createGain(); s.gain.value = I.send;
    c.connect(L ? L.dry : this.dry); c.connect(s); s.connect(L ? L.wet : this.wet);
    this.ch.set(key, c);
    return c;
  }
  // role: lead | cm | acc | bass | pad | perc | layer (balance trims in def.bal, dev solo)
  note(inst, t, dur, m, vel, prio, role = 'acc', layer = null) {
    const I = INST[inst];
    if (!I || vel <= 0) return;
    if (measureRole) {
      const neg = measureRole[0] === '!', r = neg ? measureRole.slice(1) : measureRole;
      if ((role === r) === neg) return;
    }
    const trim = (this.def.bal && this.def.bal[role]) ?? 1;
    const now = ctx.currentTime;
    if (t < now) t = now;
    if (!claimMusic(t, t + dur + I.tail, prio)) return;
    I.fn(t, m, Math.max(0.05, dur), Math.min(1, vel) * trim, this.chan(inst, layer));
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
      const amt = e._intro ? 0 : (pick(e.orn) || 0) + Math.min(k, 4) * 0.05;
      notes = ornament(P.mel.notes, amt, this.rng, P, def.scale);
      const oct = pick(e.oct) || 0;
      if (oct) notes = notes.map(n => ({ ...n, m: n.m + 12 * oct }));
    }
    const split = list => {
      const byBar = P.bars.map(() => []);
      for (const n of list) {
        const b = Math.floor(n.start / P.meter + 1e-9);
        if (byBar[b]) byBar[b].push(n);
      }
      return byBar;
    };
    const cmInst = P.cm && !e.tacet ? pick(e.cm) || null : null;
    this.cur = {
      P, byBar: split(notes),
      lead: pick(e.lead) || def.lead,
      dyn: pick(e.dyn) ?? 1,
      counter: pick(e.counter) || null,
      cmInst: cmInst && INST[cmInst] ? cmInst : null,
      cmByBar: cmInst ? split(P.cm.notes.map(n => ({ ...n, m: n.m + 12 * (e.cmOct || 0) }))) : null,
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
  // The chord sounding at context time t (for stingers), or null.
  chordNow(t) {
    for (let i = this.hist.length - 1; i >= 0; i--) {
      const h = this.hist[i];
      if (t >= h.T - 0.02 && t < h.end) return chordAt(h.P, h.bi * h.P.meter + Math.min(h.P.meter - 1e-3, Math.max(0, (t - h.T) / h.spb)));
    }
    return null;
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
  // Guide tone (3rd or 7th) nearest the previous one, avoiding unisons/semitones with the melody.
  guideTone(c, g, bi, key) {
    const C = this.cur, P = C.P, meter = P.meter;
    const mel = C.byBar[bi].find(n => n.start - bi * meter <= g.s + 1e-6 && n.start + n.dur - bi * meter > g.s + 1e-6);
    const prev = this[key] ?? (P.clo + P.chi) / 2;
    let best = null, bd = Infinity;
    for (let m = P.clo; m <= P.chi; m++) {
      if (!c.guide.includes(mod12(m))) continue;
      if (mel && (m === mel.m || Math.abs(m - mel.m) === 1)) continue;
      const d = Math.abs(m - prev) + (m === prev ? 0.8 : 0);
      if (d < bd) { bd = d; best = m; }
    }
    if (best != null) this[key] = best;
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

    this.hist.push({ T, end: T + meter * spb, P, bi, spb });
    if (this.hist.length > 6) this.hist.shift();
    if (this.lay) this.updateLayers(T, meter * spb);

    segs.forEach((g, si) => {
      const c = g.c;
      const v = voiceChord(c, this.prevV, P.vlo, P.vhi);
      this.prevV = v;
      const nxSeg = segs[si + 1] || (P.bars[bi + 1] && P.bars[bi + 1][0]) || null;
      const inSeg = b => b >= g.s - 1e-6 && b < g.s + g.n - 1e-6;

      // pad (tied across repeated chords)
      if (def.pad && C.pad) {
        const beats = P.padSpans.get(bi + ':' + g.s);
        if (beats) for (const m of v) this.note('pad', at(g.s), beats * spb + 0.05, m, 0.55 * def.pad * C.pad, 1, 'pad');
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
        case 'buzz': {
          // On-beats: a soft low chord. Off-beats: a four-note turn (tone, upper neighbour, tone,
          // lower neighbour) hovering on one chord tone; each off-beat visits a different one.
          const scl = chordScale(def.scale, c);
          for (let b = Math.ceil(g.s - 1e-6); b < g.s + g.n - 1e-6; b++) {
            if (b % 2 === 0) { chord(b, 1.6 * spb, 0.15, v.slice(0, 3), 0.02); continue; }
            let m = v[(b + bi * 2) % v.length];
            if (m < 64) m += 12;
            const upN = scaleStep(m, 1, scl) ?? m + 2, dn = scaleStep(m, -1, scl) ?? m - 1;
            [m, upN, m, dn].forEach((x, i) => this.note(A, at(b + i * 0.25) + jit() * 0.3, 0.35 * spb, x, (0.13 - i * 0.012) * hum(), 0));
          }
          break;
        }
        default: break;
      }

      // bass
      if (!P.bass) this.bassPattern(P.bassPat, g, bi, at, spb, nxSeg, inSeg);

      // guide-tone counterline (3rds and 7ths), avoiding unisons with the melody
      if (C.counter) {
        const best = this.guideTone(c, g, bi, 'prevC');
        if (best != null) this.note(C.counter, at(g.s), g.n * spb * 0.96, best, 0.3 * C.dyn, 1, 'cm');
      }

      if (this.lay) this.layerSeg(g, bi, v, at, spb, inSeg, hum, jit);
    });

    // explicit bass line
    if (P.bass) {
      for (const n of P.bass.notes) {
        if (Math.floor(n.start / meter + 1e-9) !== bi) continue;
        const b = n.start - bi * meter;
        this.note(P.bassInst, at(b), n.dur * spb * 0.9, n.m, 0.55, 2, 'bass');
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
      this.note(lead, at(b), d * LI.legato, n.m, vel, 2, 'lead');
      if (C.dbl) this.note(C.dbl, at(b) + 0.004, d * INST[C.dbl].legato, n.m + 12 * C.dblOct, vel * 0.5, 1, 'lead');
    }

    // written counterline
    if (C.cmInst) {
      const CI = INST[C.cmInst];
      for (const n of C.cmByBar[bi]) {
        const b = n.start - bi * meter;
        const d = (warp(b + n.dur, sw) - warp(b, sw)) * spb;
        const vel = 0.42 * C.dyn * (b < 1e-6 ? 1 : 0.88);
        this.note(C.cmInst, at(b), d * (CI.legato ?? 1), n.m, vel, 1, 'cm');
      }
    }

    // percussion
    if (P.perc && C.perc) this.percPass(P.perc, C.perc, at, null);
    if (this.lay && def.adapt.perc && this.layerLive('perc')) this.percPass(def.adapt.perc, 1, at, 'perc');

    this.nextBar = T + meter * spb;
    this.bar++;
  }
  percPass(pats, level, at, layer) {
    const meter = this.cur.P.meter, rng = this.rng;
    for (const inst in pats) {
      const pat = pats[inst], L = pat.length, step = meter / L;
      for (let i = 0; i < L; i++) {
        const ch = pat[i];
        if (ch === '.') continue;
        if (ch === 'o' && rng() < 0.25) continue;
        const vel = (ch === 'X' ? 1 : ch === 'x' ? 0.6 : 0.3) * level * (0.92 + rng() * 0.16);
        this.note(inst, at(i * step) + (rng() - 0.5) * 0.008, 0.1, 60, vel, 0, layer ? 'layer' : 'perc', layer);
      }
    }
  }
  // Adaptive layers for one chord segment (drive, pedal, padx, cm). Levels come from the layer
  // gains; the notes here play at full layer velocity.
  layerSeg(g, bi, v, at, spb, inSeg, hum, jit) {
    const A = this.def.adapt, C = this.cur, P = C.P, meter = P.meter, c = g.c;
    if (A.drive && this.layerLive('drive')) {
      const { inst, pat, vel = 0.2 } = A.drive;
      const top = v.slice(-2);
      for (let e8 = 0; e8 < meter * 2; e8++) {
        const b = e8 / 2;
        if (!inSeg(b)) continue;
        const m = pat === 'cycle8' ? v[(e8 + bi * 3) % v.length] + 12 : top[e8 % 2];
        const acc = e8 === 0 ? 1 : e8 % 2 ? 0.62 : 0.8;
        this.note(inst, at(b) + jit(), 0.45 * spb, m, vel * acc * hum(), 0, 'layer', 'drive');
      }
    }
    if (A.pedal && this.layerLive('pedal')) {
      const { inst, pat, pitch = 'bass', vel = 0.45 } = A.pedal;
      const tonic = this.def.scale[0];
      // A tonic pedal gives way to the chord's bass only where it would sit a minor 9th under a
      // chord tone (the grinding semitone this score avoids).
      const pc = pitch === 'tonic' && !c.pcs.includes(mod12(tonic + 1)) ? tonic : c.bass;
      const lo = inst === 'timp' ? 38 : inst === 'pad' ? 43 : P.blo;
      const r = lo + mod12(pc - lo);
      if (pat === 'drone') {
        if (g.s === 0 && bi % 2 === 0) {
          const bars = Math.min(2, P.bars.length - bi);
          this.note(inst, at(0), bars * meter * spb + 0.4, r, vel, 1, 'layer', 'pedal');
        }
      } else {
        const L = pat.length, step = meter / L;
        for (let i = 0; i < L; i++) {
          const ch = pat[i], b = i * step;
          if (ch === '.' || !inSeg(b)) continue;
          const [off, a] = PCH[ch] || [0, 0.6];
          this.note(inst, at(b) + jit() * 0.5, Math.max(step, 0.5) * spb * 0.9, r + off, vel * a * hum(), 2, 'layer', 'pedal');
        }
      }
    }
    if (A.padx && this.def.pad && this.layerLive('padx')) {
      const beats = P.padSpans.get(bi + ':' + g.s);
      if (beats) {
        const low = 43 + mod12(c.root - 43);
        let hi = v[v.length - 1] + 1;
        while (mod12(hi) !== c.root) hi++;
        this.note('pad', at(g.s), beats * spb + 0.05, low, 0.5, 1, 'layer', 'padx');
        this.note('pad', at(g.s), beats * spb + 0.05, hi, 0.3, 1, 'layer', 'padx');
      }
    }
    if (A.cm && !C.counter && !C.cmInst && this.layerLive('cm')) {
      const m = this.guideTone(c, g, bi, 'prevLC');
      if (m != null) this.note(A.cm, at(g.s), g.n * spb * 0.96, m, 0.32, 1, 'layer', 'cm');
    }
  }
  bassPattern(type, g, bi, at, spb, nxSeg, inSeg) {
    if (!type || type === 'none') return;
    const P = this.cur.P, B = P.bassInst, c = g.c, meter = P.meter;
    const fifthPc = c.bass === c.root ? mod12(c.root + 7) : c.root;
    const near = (pc, ref) => { let best = ref, bd = 99; for (let m = ref - 11; m <= ref + 11; m++) if (mod12(m) === pc && Math.abs(m - ref) < bd && m >= P.blo - 5 && m <= P.bhi + 7) { bd = Math.abs(m - ref); best = m; } return best; };
    const vel = 0.55;
    switch (type) {
      case 'waltz': case 'whole':
        this.note(B, at(g.s), (type === 'waltz' ? Math.min(g.n, 2) : g.n) * spb * 0.95, this.bassNote(c.bass), vel, 2, 'bass');
        break;
      case 'drone': {
        const beats = P.droneSpans.get(bi + ':' + g.s);
        if (beats) this.note(B, at(g.s), beats * spb + 0.05, this.bassNote(c.bass), 0.6, 2, 'bass');
        break;
      }
      case 'half': case 'oompah': {
        const r = this.bassNote(c.bass);
        const len = type === 'oompah' ? 0.8 : Math.min(g.n, 2) * 0.9;
        this.note(B, at(g.s), len * spb, r, vel, 2, 'bass');
        if (meter === 4 && inSeg(g.s + 2) && g.n >= 4) this.note(B, at(g.s + 2), len * spb, near(fifthPc, r), vel * 0.85, 2, 'bass');
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
          this.note(B, at(g.s + k), 0.85 * spb, m, vel * (k === 0 ? 1 : 0.8), 2, 'bass');
        }
        break;
      }
      case 'tiptoe': {
        const r = this.bassNote(c.bass), f = near(fifthPc, r);
        for (let k = 0; k < g.n; k++) this.note(B, at(g.s + k), 0.3 * spb, k % 2 ? f : r, vel * (k % 2 ? 0.7 : 0.9), 2, 'bass');
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
          this.note(B, at(b), 0.42 * spb, r + off[e8 % 8], vel * acc[e8 % 8], acc[e8 % 8] > 0.8 ? 2 : 1, 'bass');
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

// ---------------------------------------------------------------- duck, stingers, motifs

// Duck the score (not SFX, stingers or motifs). Overlapping ducks keep the deeper depth and the
// later end. 60 ms down, hold, 0.5 s back up.
function duckMusic(amount, ms) {
  const now = ctx.currentTime;
  let depth = clamp01(amount), until = now + 0.06 + Math.max(0, Number(ms) || 0) / 1000;
  if (duckState.until > now) { depth = Math.max(depth, duckState.depth); until = Math.max(until, duckState.until); }
  duckState.depth = depth; duckState.until = until;
  for (const g of [duckD.gain, duckW.gain]) {
    const v = g.value;
    g.cancelScheduledValues(now);
    g.setValueAtTime(v, now);
    g.linearRampToValueAtTime(1 - depth, now + 0.06);
    g.setValueAtTime(1 - depth, until);
    g.linearRampToValueAtTime(1, until + 0.5);
  }
}

// The key and chord under the playhead: tonic, major/minor, scale, the pentatonic root the SFX
// use (def.chime), and the sounding chord (or the tonic triad).
function keyInfo() {
  const p = current;
  const def = p ? p.def : (wantTrack && TRACKS[wantTrack]) || TRACKS.title;
  const tonic = def.scale[0];
  const major = def.scale.includes(mod12(tonic + 4));
  let chord = p && ctx ? p.chordNow(ctx.currentTime) : null;
  if (!chord) chord = { root: tonic, bass: tonic, pcs: [tonic, mod12(tonic + (major ? 4 : 3)), mod12(tonic + 7)] };
  return { tonic, major, scale: def.scale, chime: def.chime ?? tonic, chord };
}
const upTo = (pc, lo) => lo + mod12(pc - lo);            // lowest pitch >= lo with class pc
const nextAbove = (m, pcs) => { let x = m + 1; while (!pcs.includes(mod12(x))) x++; return x; };
// Stingers sit ~2-4 dB over the score's peaks (measured against spring at music volume 0.7).
const STINGER_GAIN = { bloom: 0.42, bossPhase: 0.55, unlock: 0.45, daily: 0.4, tip: 0.32 };
let stGain = 1;
const stPlay = (inst, t, m, dur, vel) => INST[inst].fn(t, m, dur, vel * stGain * INST[inst].level, stIn);

// Each returns its length in seconds (the duck holds that long).
const STINGERS = {
  // A flourish straight up the sounding chord, harp under celesta, capped by a bell.
  bloom(t, K) {
    const pcs = K.chord.pcs.slice(0, 4);
    let m = 65;
    const tones = [];
    for (let i = 0; i < 6; i++) { m = nextAbove(m, pcs); tones.push(m); }
    tones.forEach((n, i) => {
      stPlay('celesta', t + i * 0.055, n, 0.4, 0.75 + i * 0.04);
      if (i % 2 === 0) stPlay('harp', t + i * 0.055, n - 12, 0.9, 0.7);
    });
    stPlay('bell', t + 0.35, tones[5] + 12, 1, 0.5);
    return 0.9;
  },
  // Nana's head (3-5-8) in the key's own mode, reed and flute in octaves, over a timpani stroke,
  // a taiko, and a swelling tonic chord; a second stroke under the held top note.
  bossPhase(t, K) {
    const tonic = K.tonic, third = mod12(tonic + (K.major ? 4 : 3));
    const b = upTo(tonic, 57);
    stPlay('taiko', t, 60, 0.3, 1);
    stPlay('timp', t, upTo(tonic, 38), 1.4, 1);
    stPlay('pizz', t, upTo(tonic, 36), 0.5, 0.9);
    [upTo(tonic, 50), upTo(third, 55), upTo(mod12(tonic + 7), 55)].forEach(m => stPlay('pad', t, m, 1.9, 0.9));
    const line = [[upTo(third, b), 0.17], [upTo(mod12(tonic + 7), b), 0.17], [b + 12, 1.1]];
    let tt = t + 0.12;
    for (const [m, len] of line) {
      stPlay('reed', tt, m, len, 0.85);
      stPlay('flute', tt, m + 12, len, 0.6);
      tt += len;
    }
    stPlay('timp', t + 0.46, upTo(tonic, 38), 1.2, 0.8);
    stPlay('taiko', t + 0.46, 60, 0.3, 0.7);
    return 1.9;
  },
  // Unlock: Nana's head in the tonic major (or the relative major), then her Lydian lift (II over
  // a I drone) opening onto a bell chord of the tonic.
  unlock(t, K) {
    const T = K.major ? K.tonic : mod12(K.tonic + 3);
    const b = upTo(T, 60);
    stPlay('pad', t, b - 12, 2.2, 0.8);
    stPlay('pizz', t, upTo(T, 36), 0.6, 0.8);
    [4, 7, 12].forEach((iv, i) => {
      stPlay('celesta', t + i * 0.13, b + iv, 0.5, 0.9);
      stPlay('harp', t + i * 0.13, b + iv - 12, 1, 0.7);
    });
    const t2 = t + 0.5;
    [2, 6, 9, 14].forEach((iv, i) => stPlay('box', t2 + i * 0.03, b + 12 + iv, 0.9, 0.55));
    const t3 = t + 1.05;
    [0, 4, 7, 12].forEach((iv, i) => {
      stPlay('bell', t3 + i * 0.015, b + 12 + iv, 1.4, 0.55);
      stPlay('harp', t3 + i * 0.03, b + iv, 1.4, 0.6);
    });
    stPlay('pizz', t3, upTo(T, 36), 0.6, 0.8);
    return 2.1;
  },
  // Daily: two clock bells (5 then 1) and a kalimba run up the key's pentatonic.
  daily(t, K) {
    const b = upTo(K.chime, 67);
    stPlay('bell', t, b + 7, 0.9, 0.55);
    stPlay('bell', t + 0.26, b, 1.1, 0.55);
    [0, 2, 4, 7, 9, 12].forEach((iv, i) => stPlay('kalimba', t + 0.55 + i * 0.07, b + 12 + iv, 0.4, 0.55 + i * 0.05));
    stPlay('harp', t + 0.55, b - 12, 1.2, 0.6);
    return 1.3;
  },
  // Tip: a soft two-note celesta 'ding-dong', 5 then 3, over the root on harp.
  tip(t, K) {
    const b = upTo(K.chime, 67);
    stPlay('celesta', t, b + 19, 0.5, 0.6);
    stPlay('celesta', t + 0.17, b + 16, 0.9, 0.55);
    stPlay('harp', t + 0.17, b, 1, 0.45);
    return 0.7;
  },
};
const STINGER_DUCK = { bloom: 0.22, bossPhase: 0.55, unlock: 0.45, daily: 0.3, tip: 0.15 };
const lastStinger = {};

function transposeP(P, k) {
  if (!k) return P;
  const tc = c => ({ ...c, sym: c.sym + '@' + k, root: mod12(c.root + k), pcs: c.pcs.map(p => mod12(p + k)),
    bass: mod12(c.bass + k), guide: c.guide.map(p => mod12(p + k)) });
  const tl = L => L && { ...L, notes: L.notes.map(n => ({ ...n, m: n.m + k })) };
  return { ...P, bars: P.bars.map(segs => segs.map(g => ({ ...g, c: tc(g.c) }))), mel: tl(P.mel), cm: tl(P.cm), bass: tl(P.bass) };
}

const motifCache = new Map();
function motifDef(id, k) {
  const key = id + ':' + k;
  if (motifCache.has(key)) return motifCache.get(key);
  const M = MOTIFS[id], minor = M.mode === 'minor', wt = minor ? 9 : 0;
  const def = {
    level: M.level ?? 1, bpm: M.bpm, meter: M.meter, swing: M.swing, verb: 1,
    scale: sc(wt + k, minor ? AEO : MAJ), chime: mod12(k),
    lead: M.lead, acc: M.acc, accInst: M.accInst, bassPat: M.bassPat, bassInst: M.bassInst, pad: M.pad, perc: M.perc,
    vlo: M.vlo, vhi: M.vhi, clo: 60, chi: 72, blo: M.blo, bhi: M.bhi,
    sections: { M: { ch: M.ch, mel: M.mel, cm: M.cm } },
    intro: [], forms: [[{ s: 'M', cm: M.cmInst, dbl: M.dbl, dblOct: M.dblOct }]],
  };
  const P = prep(def, 'M');
  def.sections.M._p = transposeP(P, k);
  motifCache.set(key, def);
  return def;
}
let motifPlayer = null;
function playMotif(id) {
  const K = keyInfo(), M = MOTIFS[id], minor = M.mode === 'minor';
  // Major motifs sit on the tonic of a major track or the relative major of a minor one, and
  // vice versa, so the motif shares the score's pitch collection.
  const target = minor ? (K.major ? mod12(K.tonic - 3) : K.tonic) : (K.major ? K.tonic : mod12(K.tonic + 3));
  let k = mod12(target - (minor ? 9 : 0));
  if (k > 6) k -= 12;
  const def = motifDef(id, k);
  const now = ctx.currentTime, t0 = now + 0.06;
  if (motifPlayer && players.has(motifPlayer)) motifPlayer.fadeOut(now, 0.2);
  const p = new Player('motif:' + id, def, t0, { dry: stVol, wet: stWet });
  p.fade(1, now, 0.02);
  const len = def.sections.M._p.bars.length * def.meter * 60 / def.bpm;
  p.stopAt = t0 + len - 0.02; p.deadAt = t0 + len + 5;
  players.add(p);
  motifPlayer = p;
  duckMusic(0.55, (len + 0.25) * 1000);
  tick();
  return len;
}

// ---------------------------------------------------------------- SFX

function chimeRoot() {
  const pc = current ? current.def.chime : (wantTrack && TRACKS[wantTrack] ? TRACKS[wantTrack].chime : 5);
  return 67 + mod12(pc - 7); // G4..F#5
}
const PENT = [0, 2, 4, 7, 9];
const pent = (base, i) => base + PENT[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5);

const SFX_LEN = { mend: 2.4, rain: 1.8, gloom: 1.4, bloom: 1.2, upgrade: 1.4, victory: 1.8, defeat: 1.6, heal: 1.2, shuffle: 0.5, page_turn: 0.5,
  uproot: 0.6, weed: 0.8, steal: 0.5, lock: 0.5, tipchime: 0.9 };
// Mix trims (measured peaks at sfx volume 0.8): mend on top, hits next, chimes below, UI ticks low.
const SFX_GAIN = { bloom: 0.55, grow: 0.5, upgrade: 0.65, victory: 0.7, defeat: 0.7, heal: 0.75, buff: 0.7, card_play: 0.8, hit_heavy: 0.85,
  sting: 1.4, weed: 2, steal: 1.6 };
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

  // ---- 2.0
  // A tiny bee sting: a 70 ms wing-buzz (saw, fast amplitude flutter) diving in, then a needle tick.
  sting(t, r, v) {
    toneHit(t, sfxIn, { type: 'sawtooth', freq: 820 * r, f2: 560 * r, glide: 0.07, a: 0.006, peak: 0.07 * v, tau: 0.03, lp: 2600, vib: [38, 60] });
    toneHit(t + 0.07, sfxIn, { type: 'triangle', freq: 2900 * r, f2: 2200 * r, glide: 0.02, a: 0.001, peak: 0.11 * v, tau: 0.012 });
    noiseHit(t + 0.07, sfxIn, { type: 'highpass', freq: 5000, a: 0.001, peak: 0.07 * v, tau: 0.006 });
  },
  // Wooden scarecrow knock: two hollow wood-block raps (the second a little lower) and a dry
  // straw rustle.
  guard(t, r, v) {
    [[0, 1], [0.085, 0.84]].forEach(([dt, k]) => {
      toneHit(t + dt, sfxIn, { freq: 740 * r * k, f2: 700 * r * k, glide: 0.02, a: 0.001, peak: 0.26 * v, tau: 0.03 });
      toneHit(t + dt, sfxIn, { type: 'triangle', freq: 1190 * r * k, a: 0.001, peak: 0.08 * v, tau: 0.016 });
      noiseHit(t + dt, sfxIn, { type: 'bandpass', freq: 1500 * r * k, q: 4, a: 0.001, peak: 0.16 * v, tau: 0.012 });
    });
    noiseHit(t + 0.03, sfxIn, { type: 'highpass', freq: 3500, a: 0.03, peak: 0.03 * v, tau: 0.07 });
  },
  // Earthy pull and pop: a gritty low tearing that rises, then the root lets go.
  uproot(t, r, v) {
    noiseHit(t, sfxIn, { type: 'lowpass', freq: 180 * r, f2: 900 * r, glide: 0.26, q: 2, a: 0.18, peak: 0.26 * v, tau: 0.03 });
    for (let i = 0; i < 6; i++) {
      noiseHit(t + 0.03 + i * 0.035 + Math.random() * 0.012, sfxIn, { type: 'bandpass', freq: (350 + i * 90) * r, q: 3, a: 0.001, peak: 0.08 * v, tau: 0.01 });
    }
    toneHit(t + 0.25, sfxIn, { freq: 420 * r, f2: 140 * r, glide: 0.06, a: 0.001, peak: 0.36 * v, tau: 0.045 });
    noiseHit(t + 0.25, sfxIn, { type: 'bandpass', freq: 1800 * r, q: 1.4, a: 0.001, peak: 0.14 * v, tau: 0.012 });
    noiseHit(t + 0.29, sfxIn, { type: 'lowpass', freq: 700, a: 0.003, peak: 0.08 * v, tau: 0.05 });
  },
  // A sly low creak: a slow pulse-train (door-hinge grain) through a sliding resonant band, and
  // a quiet triangle sliding down a semitone underneath.
  weed(t, r, v) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(34 * r, t); o.frequency.linearRampToValueAtTime(22 * r, t + 0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7;
    bp.frequency.setValueAtTime(620 * r, t); bp.frequency.exponentialRampToValueAtTime(330 * r, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.08);
    g.gain.setTargetAtTime(0, t + 0.42, 0.06);
    o.connect(bp); bp.connect(g); g.connect(sfxInV);
    o.start(t); o.stop(t + 0.85); cleanup(o, [o, bp, g]);
    toneHit(t + 0.05, sfxInV, { type: 'triangle', freq: 116.5 * r, f2: 110 * r, glide: 0.4, a: 0.08, hold: 0.2, peak: 0.07 * v, tau: 0.1 });
  },
  // Coin snatch: a bright coin tick bent downward, then a quick whoosh away.
  steal(t, r, v, ps) {
    const f = mtof(chimeRoot() + ps + 24);
    toneHit(t, sfxInV, { freq: f, f2: f * 0.84, glide: 0.08, a: 0.002, peak: 0.16 * v, tau: 0.05 });
    toneHit(t, sfxIn, { freq: f * 3, a: 0.002, peak: 0.025 * v, tau: 0.03 });
    noiseHit(t + 0.05, sfxIn, { type: 'bandpass', freq: 4200 * r, f2: 900 * r, glide: 0.16, q: 1.4, a: 0.03, peak: 0.13 * v, tau: 0.04 });
  },
  // Weather-vane lock: a short ratchet, a firm latch click, a small metallic ring.
  lock(t, r, v) {
    for (let i = 0; i < 3; i++) noiseHit(t + i * 0.035, sfxIn, { type: 'bandpass', freq: 3100 * r, q: 6, a: 0.001, peak: 0.08 * v, tau: 0.006 });
    const tc = t + 0.12;
    toneHit(tc, sfxIn, { type: 'triangle', freq: 1850 * r, a: 0.001, peak: 0.16 * v, tau: 0.01 });
    toneHit(tc, sfxIn, { freq: 210 * r, f2: 170 * r, glide: 0.03, a: 0.001, peak: 0.2 * v, tau: 0.03 });
    [[2150, 0.035, 0.16], [3720, 0.02, 0.1]].forEach(([fq, p, tau]) => toneHit(tc, sfxInV, { freq: fq * r, a: 0.001, peak: p * v, tau }));
  },
  // A soft single page: lighter and shorter than page_turn, with a felt tick as it settles.
  choose(t, r, v) {
    noiseHit(t, sfxIn, { type: 'bandpass', freq: 2200 * r, f2: 3800 * r, glide: 0.1, q: 0.9, a: 0.04, peak: 0.09 * v, tau: 0.04 });
    toneHit(t + 0.1, sfxIn, { type: 'triangle', freq: 900 * r, f2: 700 * r, glide: 0.02, a: 0.002, peak: 0.06 * v, tau: 0.02 });
  },
  // Tip chime: a small glassy pair in key (the 3rd rising to the 5th), lighter than 'open'.
  tipchime(t, r, v, ps) {
    const b = chimeRoot() + ps + 12;
    vCelesta(t, pent(b, 2), 0.4, 0.11 * v, sfxInV);
    vCelesta(t + 0.11, pent(b, 3), 0.6, 0.12 * v, sfxInV);
    toneHit(t + 0.11, sfxInV, { freq: mtof(pent(b, 3) + 12), a: 0.004, peak: 0.02 * v, tau: 0.25 });
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

  // music(null) stops. Switching to a different track resets intensity to 0 (a new fight starts
  // calm); call intensity() after music().
  music(track) {
    const name = track || null;
    if (name && !TRACKS[name]) { console.warn('audio: unknown track', track); return; }
    if (name === wantTrack) return;
    wantTrack = name;
    intensityTarget = 0;
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
      for (const g of [musicVol, musicWetVol, stVol, stWet]) g.gain.setTargetAtTime(curve(settings.music), now, 0.03);
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

  // 0 = the written arrangement, 1 = everything (low heart, boss phase 2+). Combat tracks only
  // (season tracks, elite, boss); other tracks ignore it. Takes effect at the next bar line and
  // moves each layer at most half its range per bar.
  intensity(v) { intensityTarget = clamp01(v); },

  // A short musical sting in the current key over a small music duck.
  // 'bloom' | 'bossPhase' | 'unlock' | 'daily' | 'tip'
  stinger(name) {
    const fn = STINGERS[name];
    if (!fn) { console.warn('audio: unknown stinger', name); return; }
    if (!ctx || settings.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (lastStinger[name] && now - lastStinger[name] < 0.15) return;
    lastStinger[name] = now;
    try {
      stGain = STINGER_GAIN[name] ?? 0.45;
      const len = fn(now + 0.01, keyInfo());
      duckMusic(STINGER_DUCK[name] ?? 0.3, len * 1000);
    } catch (e) { console.warn('audio: stinger failed', name, e); }
  },

  // A villager's 2-4 bar phrase (odile, rue, bram, juniper, pell, mossy) in the current key,
  // over a deeper duck. A new motif cuts off the previous one.
  motif(villagerId) {
    if (!MOTIFS[villagerId]) { console.warn('audio: unknown motif', villagerId); return; }
    if (!ctx || settings.muted || ctx.state !== 'running') return;
    try { playMotif(villagerId); } catch (e) { console.warn('audio: motif failed', villagerId, e); }
  },

  // Lower the score by amount (0..1) for ms, then recover over 0.5 s. SFX are not ducked.
  duck(amount = 0.4, ms = 600) {
    if (!ctx) return;
    try { duckMusic(amount, ms); } catch (e) { console.warn('audio: duck failed', e); }
  },

  get intensityLevel() { return intensityTarget; },
  get muted() { return settings.muted; },
  get musicVolume() { return settings.music; },
  get sfxVolume() { return settings.sfx; },
  get track() { return wantTrack; },

  // Dev hooks (not part of the game contract).
  _debug() {
    const layers = {};
    if (current && current.lay) for (const [k, L] of current.lay) layers[k] = +L.cur.toFixed(2);
    return {
      ctx, tap: comp, playing: [...players].map(p => p.name), voices: mVoices.length,
      tracks: Object.keys(TRACKS), sfx: Object.keys(SFX), stingers: Object.keys(STINGERS), motifs: Object.keys(MOTIFS),
      intensity: intensityTarget, layers, duck: duckD ? +duckD.gain.value.toFixed(2) : 1,
    };
  },
  _selfTest() { return selfTest(); },
  // Offline render of a track (dev): { dB } of the whole mix or one role ('lead', '!lead', ...).
  _measure(track, opts) { return measure(track, opts); },
};

// Score checker (runs without audio), over every track section and every villager motif:
//  - parse errors: bar sums, line lengths, unknown sections/instruments in forms and layers
//  - strong-beat non-chord tones: a melody or written-counterline note of a beat or longer that
//    starts on beat 1 (and beat 3 in 4/4) outside its chord. A marked appoggiatura (':a') passes
//    only if it resolves by step, straight away, to a chord tone.
//  - consecutive perfect fifths/octaves (similar or contrary, both voices moving): bass against
//    melody and against the counterline at every chord change; melody against counterline at
//    every beat.
const NN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = m => NN[mod12(m)] + (Math.floor(m / 12) - 1);
function selfTest() {
  selfWarnings = [];
  const nct = [], par = [];
  const units = [];
  for (const [tn, def] of Object.entries(TRACKS)) for (const key of Object.keys(def.sections)) units.push([`${tn}.${key}`, def, key]);
  for (const [id, M] of Object.entries(MOTIFS)) {
    units.push([`motif.${id}`, { meter: M.meter, bpm: M.bpm, sections: { M: { ch: M.ch, mel: M.mel, cm: M.cm } } }, 'M']);
  }
  for (const [name, def, key] of units) {
    let P;
    try { P = prep(def, key); } catch (e) { selfWarnings.push(`${name}: ${e.message}`); continue; }
    const strong = P.meter === 4 ? [0, 2] : [0];
    for (const [label, line] of [['melody', P.mel], ['counter', P.cm]]) {
      if (!line) continue;
      const ns = line.notes;
      ns.forEach((n, i) => {
        const bi = Math.floor(n.start / P.meter + 1e-9), b = n.start - bi * P.meter;
        if (!strong.some(s => Math.abs(b - s) < 1e-6) || n.dur < 1 - 1e-6) return;
        const c = chordAt(P, n.start);
        if (c.pcs.includes(mod12(n.m))) return;
        const nx = ns[i + 1];
        const ok = n.app && nx && Math.abs(nx.m - n.m) <= 2 && Math.abs(nx.start - (n.start + n.dur)) < 1e-6 &&
          chordAt(P, nx.start).pcs.includes(mod12(nx.m));
        if (ok) return;
        nct.push(`${name} ${label} bar ${bi + 1} beat ${b + 1}: ${nm(n.m)} over ${c.sym}` +
          (n.app ? ' (marked appoggiatura does not resolve by step to a chord tone)' : ''));
      });
    }
    const sounding = (line, t) => line && line.notes.find(n => n.start <= t + 1e-6 && n.start + n.dur > t + 1e-6);
    const changes = [], beats = [];
    P.bars.forEach((segs, bi) => {
      segs.forEach(g => changes.push({ t: bi * P.meter + g.s, c: g.c, bi }));
      for (let k = 0; k < P.meter; k++) beats.push({ t: bi * P.meter + k, bi });
    });
    const voice = (v, p) => v === 'bass' ? { m: p.c.bass, pc: true } : sounding(v === 'melody' ? P.mel : P.cm, p.t);
    for (const [a, b, pts] of [['bass', 'melody', changes], ['bass', 'counter', changes], ['melody', 'counter', beats]]) {
      if ((a === 'counter' || b === 'counter') && !P.cm) continue;
      if (b === 'melody' && !P.mel) continue;
      let prev = null;
      for (const p of pts) {
        const va = voice(a, p), vb = voice(b, p);
        if (!va || !vb) { prev = null; continue; }
        const iv = mod12(vb.m - va.m);
        if (prev && (iv === 0 || iv === 7) && iv === prev.iv) {
          const aMoved = va.pc ? mod12(va.m) !== mod12(prev.a) : va.m !== prev.a;
          if (aMoved && vb.m !== prev.b) par.push(`${name} bar ${p.bi + 1}: consecutive ${iv ? 'fifths' : 'octaves'} ${a}/${b}`);
        }
        prev = { iv, a: va.m, b: vb.m };
      }
    }
  }
  const instOk = (where, i) => { if (i && typeof i === 'string' && !INST[i]) selfWarnings.push(`${where}: unknown instrument ${i}`); };
  for (const [tn, def] of Object.entries(TRACKS)) {
    for (const e of [...(def.intro || []), ...def.forms.flat()]) {
      if (!def.sections[e.s]) selfWarnings.push(`${tn}: form references missing section ${e.s}`);
      for (const k of ['lead', 'counter', 'dbl', 'cm']) instOk(tn, e[k]);
      if (e.cm && def.sections[e.s] && !def.sections[e.s].cm) selfWarnings.push(`${tn}: entry ${e.s} asks for a counterline the section lacks`);
    }
    for (const k of ['lead', 'accInst', 'bassInst']) instOk(tn, def[k]);
    if (def.adapt) {
      for (const k of ['drive', 'pedal']) if (def.adapt[k]) instOk(`${tn}.adapt.${k}`, def.adapt[k].inst);
      instOk(`${tn}.adapt.cm`, def.adapt.cm);
      for (const i in def.adapt.perc || {}) instOk(`${tn}.adapt.perc`, i);
    }
  }
  for (const [id, M] of Object.entries(MOTIFS)) for (const k of ['lead', 'accInst', 'bassInst', 'cmInst', 'dbl']) instOk(`motif.${id}`, M[k]);
  const out = { errors: selfWarnings, strongBeatNCT: nct, parallels: par, nonChordTones: nct };
  selfWarnings = null;
  return out;
}

// Offline render of one track (dev tool for mix balance). role: null = everything, 'lead' =
// only that role, '!lead' = everything else. Returns RMS and peak in dBFS (compressor bypassed,
// music volume at unity).
async function measure(name, { secs = 20, role = null, intensity = 0, sr = 22050, skip = 2 } = {}) {
  const def = TRACKS[name];
  if (!def) throw new Error('audio: unknown track ' + name);
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new OAC(2, Math.ceil(sr * secs), sr);
  const saved = { ctx, mix, comp, master, musicVol, musicWetVol, sfxVol, sfxWetVol, sfxIn, sfxInV, reverb, duckD, duckW,
    stVol, stWet, stIn, noiseBuf, pianoWave, fluteWave, ocarinaWave, mVoices, measureRole, intensityTarget };
  let job;
  try {
    build(off);
    master.gain.value = 1; comp.ratio.value = 1; comp.threshold.value = 0;
    musicVol.gain.value = 1; musicWetVol.gain.value = 1;
    mVoices = []; measureRole = role; intensityTarget = clamp01(intensity);
    const p = new Player(name, def, 0.02);
    p.fade(1, 0, 0.01);
    while (p.nextBar < secs) p.scheduleBar();
    job = off.startRendering();
  } finally {
    ({ ctx, mix, comp, master, musicVol, musicWetVol, sfxVol, sfxWetVol, sfxIn, sfxInV, reverb, duckD, duckW,
      stVol, stWet, stIn, noiseBuf, pianoWave, fluteWave, ocarinaWave, mVoices, measureRole, intensityTarget } = saved);
  }
  const buf = await job;
  let ss = 0, n = 0, pk = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = Math.floor(skip * sr); i < d.length; i++) { ss += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); n++; }
  }
  const db = x => +(20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);
  return { track: name, role, intensity, rms: db(Math.sqrt(ss / Math.max(1, n))), peak: db(pk) };
}
