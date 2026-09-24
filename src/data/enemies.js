// Bramblewick: critters. Nobody dies here; they get mended and go home.
// Every enemy's next(e) returns a move key. Patterns are telegraphed and readable:
// most normals cycle a short list, elites open with a signature move, bosses have phases
// keyed off e.self.hp: the move that starts a phase calls e.phase(n, line) so the UI can flash it,
// and next() reads e.self.phase from then on.
// 2.0 verbs: e.plantWeed(n) (a Gloamweed into the right-most empty plot), e.stealCoin(n), e.phase(n, text).

const cycle = (list, e, offset = 0) => list[(e.turn - 1 + offset) % list.length];
// Index into a phase sequence, counted from the first time `marker` was used.
const sinceFirst = (e, marker) => {
  const i = e.history.indexOf(marker);
  return i < 0 ? -1 : e.history.length - i - 1;
};
const hpFrac = e => e.self.hp / Math.max(1, e.self.maxHp);
const allies = e => (e.allies || []).length;
const phase = e => e.self.phase || 1;

export const ENEMIES = {
  // ================================================================ SPRING
  gloamslug: {
    name: 'Gloamslug', sprite: 'en_gloamslug', season: 'spring', tier: 'normal', hp: [18, 22],
    flavor: 'Leaves a trail of grey forgetting. Very slowly.',
    mendText: 'The slug sighs, shines, and slides off toward the cabbages.',
    moves: {
      slime: { intent: 'debuff', label: 'Slime', run: e => e.apply('player', 'soggy', 1) },
      chomp: { intent: 'attack', label: 'Chomp', dmg: 7, run: e => e.attack(7) },
      nibble: { intent: 'trample', label: 'Nibble', alt: 'attack', dmg: 3, run: async e => { e.nibble(1); await e.attack(3); } },
    },
    next(e) { return cycle(['slime', 'chomp', 'nibble'], e); },
  },
  burrlet: {
    name: 'Burrlet', sprite: 'en_burrlet', season: 'spring', tier: 'normal', hp: [12, 16],
    flavor: 'A seed pod with legs and a bad attitude. Travels in bunches.',
    mendText: 'The burrlet pops open, sneezes fluff everywhere, and rolls off giggling.',
    moves: {
      prick: { intent: 'attack', label: 'Prick', dmg: 4, run: e => e.attack(4) },
      cling: { intent: 'debuff', label: 'Cling', run: e => e.addGloom('burr', 1, 'discard') },
      curl: { intent: 'block', label: 'Curl Up', run: e => e.bark(5) },
    },
    next(e) { return cycle(['prick', 'cling', 'prick', 'curl'], e); },
  },
  greycrow: {
    name: 'Greycrow', sprite: 'en_greycrow', season: 'spring', tier: 'normal', hp: [20, 26],
    flavor: 'Steals seeds, shiny things, and the last word.',
    mendText: 'The crow shakes out black feathers, says something rude and fond, and flaps home. It keeps the coin.',
    moves: {
      caw: { intent: 'buff', label: 'Caw', run: e => e.apply('self', 'grit', 1) },
      peck: { intent: 'attack', label: 'Peck', dmg: 6, run: e => e.attack(6) },
      snatch: { intent: 'steal', label: 'Snatch', alt: 'attack', dmg: 3, run: async e => { e.stealCoin(5); await e.attack(3); } },
      peck_seeds: { intent: 'trample', label: 'Peck Seeds', alt: 'attack', dmg: 3, run: async e => { e.nibble(2); await e.attack(3); } },
      swoop: { intent: 'attack', label: 'Swoop', dmg: 4, times: 2, run: e => e.attack(4, 2) },
    },
    next(e) { return e.turn === 1 ? 'caw' : cycle(['peck', 'snatch', 'peck_seeds', 'swoop'], e, -1); },
  },
  moleling: {
    name: 'Moleling', sprite: 'en_moleling', season: 'spring', tier: 'normal', hp: [24, 30],
    flavor: 'Comes up under your best plot. Always your best plot.',
    mendText: 'The moleling blinks at the daylight, apologizes to the turnips, and burrows home.',
    moves: {
      bite: { intent: 'attack', label: 'Bite', dmg: 8, run: e => e.attack(8) },
      burrow: { intent: 'block', label: 'Burrow', alt: 'weed', run: e => { e.bark(7); e.plantWeed(1); } },
      upheave: { intent: 'trample', label: 'Upheave', alt: 'attack', dmg: 5, run: async e => { e.trample(1); await e.attack(5); } },
    },
    next(e) { return cycle(['bite', 'burrow', 'upheave'], e); },
  },
  mudpup: {
    name: 'Mudpup', sprite: 'en_mudpup', season: 'spring', tier: 'normal', hp: [22, 26],
    flavor: 'A puppy made of creek mud. Wants to dig. Wants to dig in your plots, specifically.',
    mendText: 'The mud slides off and underneath is a small brown dog, who shakes, sprays everybody, and trots home wagging.',
    moves: {
      dig: { intent: 'weed', label: 'Dig', alt: 'attack', dmg: 3, run: async e => { e.plantWeed(1); await e.attack(3); } },
      splash: { intent: 'attack', label: 'Splash', dmg: 6, run: e => e.attack(6) },
      roll: { intent: 'block', label: 'Roll Over', run: e => e.bark(7) },
    },
    next(e) { return cycle(['dig', 'splash', 'roll', 'splash'], e); },
  },
  bramblehog: {
    name: 'Bramblehog', sprite: 'en_bramblehog', season: 'spring', tier: 'elite', hp: [64, 72],
    flavor: 'A hedgehog the size of a wheelbarrow, wearing the hedge.',
    mendText: 'The brambles fall away. Underneath is a very ordinary hedgehog who would like a saucer of milk, please.',
    powers: { thorns: 2 },
    moves: {
      curl: { intent: 'block', label: 'Curl', alt: 'buff', run: e => { e.bark(12); e.apply('self', 'thorns', 1); } },
      rush: { intent: 'attack', label: 'Rush', dmg: 11, run: e => e.attack(11) },
      quills: { intent: 'attack', label: 'Quills', dmg: 4, times: 3, run: e => e.attack(4, 3) },
      trundle: { intent: 'trample', label: 'Trundle', alt: 'attack', dmg: 7, run: async e => { e.trample(1); await e.attack(7); } },
    },
    next(e) {
      if (e.turn === 1) { e.say('Hmph.'); return 'curl'; }
      return cycle(['rush', 'quills', 'trundle', 'curl'], e, -1);
    },
  },
  rookmother: {
    name: 'Rookmother', sprite: 'en_rookmother', season: 'spring', tier: 'elite', hp: [78, 88],
    flavor: 'Every crow in the valley is one of hers. She keeps count. She keeps everything.',
    mendText: 'The grey lifts and she is a big, tired rook with a nest full of buttons. She caws once and every crow in the birches answers. Then they all go home together.',
    powers: { mothers_grief: 1 },
    moves: {
      brood: { intent: 'summon', label: 'Brood', run: e => { e.summon('greycrow'); e.say('Come, love. Come see what it has.'); } },
      glean: { intent: 'steal', label: 'Glean', alt: 'attack', dmg: 5, run: async e => { e.stealCoin(8); await e.attack(5); } },
      peck: { intent: 'attack', label: 'Peck', dmg: 11, run: e => e.attack(11) },
      wings: { intent: 'attack', label: 'Wings', dmg: 6, times: 2, run: e => e.attack(6, 2) },
      nest: { intent: 'block', label: 'Nest', alt: 'weed', run: e => { e.bark(12); e.plantWeed(1); } },
    },
    next(e) {
      if (e.turn === 1) return 'brood';
      const m = cycle(['glean', 'peck', 'wings', 'brood', 'nest', 'peck'], e, -1);
      return m === 'brood' && allies(e) >= 3 ? 'peck' : m;
    },
  },
  rootstag: {
    name: 'The Rootstag', sprite: 'boss_rootstag', season: 'spring', tier: 'boss', hp: [126, 126],
    flavor: 'Antlers of tangled root. It has been standing on the hill so long the hill grew around it.',
    mendText: 'The grey sheds from its antlers like old bark. It looks at you as if trying to place your face, bows once, and walks into the birches. The Spring page flutters down behind it.',
    moves: {
      bellow: { intent: 'buff', label: 'Bellow', run: e => { e.apply('self', 'grit', 1); e.say('You planted on MY hill.'); } },
      gore: { intent: 'attack', label: 'Gore', dmg: 13, run: e => e.attack(13) },
      roots_rise: { intent: 'trample', label: 'Roots Rise', alt: 'weed', run: e => { e.trample(1); e.plantWeed(1); e.say('The roots remember. Do you?'); } },
      stampede: { intent: 'attack', label: 'Stampede', dmg: 8, times: 2, run: e => e.attack(8, 2) },
      root_wall: { intent: 'block', label: 'Root Wall', alt: 'buff', run: e => { e.phase(2, 'Enough. ENOUGH.'); e.bark(16); e.apply('self', 'thorns', 1); } },
      tangle: { intent: 'debuff', label: 'Tangle', alt: 'trample', run: e => { e.apply('player', 'rooted', 1); e.nibble(2); } },
    },
    next(e) {
      if (phase(e) < 2) {
        if (hpFrac(e) <= 0.5) return 'root_wall';
        return cycle(['bellow', 'gore', 'roots_rise', 'gore', 'stampede', 'roots_rise'], e);
      }
      const k = sinceFirst(e, 'root_wall');
      return ['stampede', 'tangle', 'gore', 'roots_rise'][Math.max(0, k) % 4];
    },
  },

  // ================================================================ SUMMER
  sunwasp: {
    name: 'Sunwasp', sprite: 'en_sunwasp', season: 'summer', tier: 'normal', hp: [24, 30],
    flavor: 'Loves flowers. Loves them a bit too much.',
    mendText: 'The wasp does one grateful loop around your garden and zips off to bother Pell.',
    powers: { pollen_greed: 1 },
    moves: {
      sting: { intent: 'attack', label: 'Sting', dmg: 7, run: e => e.attack(7) },
      buzz: { intent: 'debuff', label: 'Buzz', alt: 'attack', dmg: 3, run: async e => { e.apply('player', 'dazed', 1); await e.attack(3); } },
      hover: { intent: 'block', label: 'Hover', run: e => e.bark(8) },
    },
    next(e) { return cycle(['sting', 'buzz', 'sting', 'hover'], e); },
  },
  dusttoad: {
    name: 'Dusttoad', sprite: 'en_dusttoad', season: 'summer', tier: 'normal', hp: [38, 44],
    flavor: 'Drinks the rain before it lands.',
    mendText: 'The toad burps a small cloud, looks embarrassed, and hops toward the creek.',
    moves: {
      dry_croak: { intent: 'debuff', label: 'Dry Croak', run: e => e.setWeather('drought') },
      tongue_lash: { intent: 'attack', label: 'Tongue Lash', dmg: 9, run: e => e.attack(9) },
      sit: { intent: 'block', label: 'Sit', run: e => e.bark(12) },
      belly_flop: { intent: 'trample', label: 'Belly Flop', alt: 'attack', dmg: 7, run: async e => { e.trample(1); await e.attack(7); } },
    },
    next(e) { return e.turn === 1 ? 'dry_croak' : cycle(['tongue_lash', 'sit', 'belly_flop', 'dry_croak'], e, -1); },
  },
  brassbeetle: {
    name: 'Brassbeetle', sprite: 'en_brassbeetle', season: 'summer', tier: 'normal', hp: [32, 38],
    flavor: 'Polished to a mirror. Vain, and armored about it.',
    mendText: 'The beetle admires itself in your hoe blade for a while, then trundles home.',
    powers: { sturdy: 1 },
    moves: {
      shell: { intent: 'block', label: 'Shell', run: e => e.bark(9) },
      ram: { intent: 'attack', label: 'Ram', dmg: 9, run: e => e.attack(9) },
      burnish: { intent: 'buff', label: 'Burnish', run: e => e.apply('self', 'grit', 2) },
    },
    next(e) { return cycle(['shell', 'ram', 'burnish', 'ram'], e); },
  },
  emberfly: {
    name: 'Emberfly', sprite: 'en_emberfly', season: 'summer', tier: 'normal', hp: [20, 26],
    flavor: 'A firefly that took the name literally.',
    mendText: 'The emberfly cools to a soft gold, blinks twice, and drifts up into the dusk.',
    moves: {
      dart: { intent: 'attack', label: 'Dart', dmg: 4, times: 2, run: e => e.attack(4, 2) },
      singe: { intent: 'attack', label: 'Singe', alt: 'debuff', dmg: 4, run: async e => { await e.attack(4); e.addGloom('gloom', 1, 'discard'); } },
      flare: { intent: 'attack', label: 'Flare', alt: 'trample', dmg: 7, run: async e => { await e.attack(7); e.nibble(1); } },
    },
    next(e) { return cycle(['dart', 'flare', 'singe'], e); },
  },
  cicada: {
    name: 'Cicada', sprite: 'en_cicada', season: 'summer', tier: 'normal', hp: [28, 34],
    flavor: 'Seventeen years underground and it has a lot to say about all of them.',
    mendText: 'The cicada goes quiet, which is somehow louder. It climbs the nearest tree and starts again, in tune this time.',
    powers: { sun_drunk: 2 },
    moves: {
      shrill: { intent: 'debuff', label: 'Shrill', alt: 'attack', dmg: 3, run: async e => { e.apply('player', 'dazed', 1); await e.attack(3); } },
      drone: { intent: 'attack', label: 'Drone', dmg: 6, run: e => e.attack(6) },
      chorus: { intent: 'buff', label: 'Chorus', run: e => e.apply('allies', 'grit', 1) },
      molt: { intent: 'heal', label: 'Molt', alt: 'block', run: e => { e.heal(6); e.bark(6); } },
    },
    next(e) { return cycle(['shrill', 'drone', 'chorus', 'drone', 'molt'], e); },
  },
  sandmantis: {
    name: 'Sandmantis', sprite: 'en_sandmantis', season: 'summer', tier: 'elite', hp: [96, 106],
    flavor: 'Waits. Waits. Waits. Then your garden is gone.',
    mendText: 'The mantis folds its blades, bows with alarming grace, and stalks off into the tall grass.',
    moves: {
      poise: { intent: 'buff', label: 'Poise', run: e => { e.apply('self', 'grit', 2); e.say('...'); } },
      scissor: { intent: 'attack', label: 'Scissor', dmg: 15, run: e => e.attack(15) },
      raze: { intent: 'trample', label: 'Raze', alt: 'attack', dmg: 10, run: async e => { e.trample(2); await e.attack(10); } },
      sand_veil: { intent: 'block', label: 'Sand Veil', alt: 'debuff', run: e => { e.bark(14); e.setWeather('drought'); } },
    },
    next(e) { return e.turn === 1 ? 'poise' : cycle(['scissor', 'raze', 'sand_veil', 'scissor', 'poise'], e, -1); },
  },
  hornetknight: {
    name: 'Hornet Knight', sprite: 'en_hornetknight', season: 'summer', tier: 'elite', hp: [100, 112],
    flavor: 'Armored, mounted on nothing, and entirely convinced. Raids hives for a living and calls it a quest.',
    mendText: 'The visor comes up and it is just a hornet, large and very embarrassed. It salutes with the wrong leg and buzzes off to apologize to Pell.',
    powers: { honey_thief: 4 },
    moves: {
      lance: { intent: 'attack', label: 'Lance', dmg: 15, run: e => e.attack(15) },
      joust: { intent: 'attack', label: 'Joust', dmg: 8, times: 2, run: e => e.attack(8, 2) },
      rally: { intent: 'buff', label: 'Rally', run: e => { e.apply('self', 'grit', 2); e.say('For the comb!'); } },
      plunder: { intent: 'steal', label: 'Plunder', alt: 'attack', dmg: 6, run: async e => { e.stealCoin(12); await e.attack(6); } },
      shield: { intent: 'block', label: 'Shield', alt: 'buff', run: e => { e.bark(14); e.apply('self', 'thorns', 1); } },
    },
    next(e) { return e.turn === 1 ? 'rally' : cycle(['lance', 'plunder', 'joust', 'shield', 'lance', 'rally'], e, -1); },
  },
  scorchmoth: {
    name: 'The Scorchmoth', sprite: 'boss_scorchmoth', season: 'summer', tier: 'boss', hp: [150, 150],
    flavor: 'Queen of the long noon. Her wings have eyes, and the eyes are suns.',
    mendText: 'The suns on her wings dim to soft lantern-gold. She fans them once, cooling the whole field, and rises toward the real sun like she has finally found it. The Summer page drifts down, warm.',
    moves: {
      sun_eye: { intent: 'debuff', label: 'Sun-Eye', run: e => { e.setWeather('drought'); e.say('Little gardener. Everything dries.'); } },
      wing_beat: { intent: 'attack', label: 'Wing Beat', dmg: 8, times: 2, run: e => e.attack(8, 2) },
      scale_dust: { intent: 'debuff', label: 'Scale Dust', run: e => { e.addGloom('gloom', 1, 'discard'); e.apply('player', 'dazed', 2); } },
      brood: { intent: 'summon', label: 'Brood', run: e => { e.summon('emberfly'); e.say('Come, small ones.'); } },
      gather_light: { intent: 'block', label: 'Gather Light', run: e => { e.phase(2, 'Bring me the sun. I want to hold it.'); e.bark(20); } },
      solar_flare: { intent: 'attack', label: 'Solar Flare', dmg: 20, run: e => e.attack(20) },
      scorch_earth: { intent: 'trample', label: 'Scorch the Earth', alt: 'weed', run: async e => { e.trample(2); e.plantWeed(1); await e.attack(4); e.say('Nothing grows in the noon.'); }, dmg: 4 },
    },
    next(e) {
      if (phase(e) < 2) {
        if (hpFrac(e) <= 0.6) return 'gather_light';
        const m = cycle(['wing_beat', 'sun_eye', 'brood', 'wing_beat', 'scale_dust', 'wing_beat'], e);
        return m === 'brood' && allies(e) >= 2 ? 'scale_dust' : m;
      }
      const k = sinceFirst(e, 'gather_light');
      return ['solar_flare', 'scorch_earth', 'wing_beat', 'sun_eye', 'solar_flare', 'gather_light'][Math.max(0, k) % 6];
    },
  },

  // ================================================================ FALL
  gourdling: {
    name: 'Gourdling', sprite: 'en_gourdling', season: 'fall', tier: 'normal', hp: [32, 38],
    flavor: 'A pumpkin that got up and left the patch. Jealous of yours.',
    mendText: 'The gourdling settles back onto its vine with a contented creak and goes orange all over.',
    moves: {
      bonk: { intent: 'attack', label: 'Bonk', dmg: 8, run: e => e.attack(8) },
      roll: { intent: 'trample', label: 'Roll', alt: 'attack', dmg: 5, run: async e => { e.trample(1); await e.attack(5); } },
      seed_spit: { intent: 'attack', label: 'Seed Spit', dmg: 4, times: 2, run: e => e.attack(4, 2) },
      sow: { intent: 'weed', label: 'Sow Gloam', run: e => e.plantWeed(1) },
      hide: { intent: 'block', label: 'Hide', run: e => e.bark(10) },
    },
    next(e) { return cycle(['bonk', 'roll', 'seed_spit', 'sow', 'hide'], e); },
  },
  sporecap: {
    name: 'Sporecap', sprite: 'en_sporecap', season: 'fall', tier: 'normal', hp: [40, 46],
    flavor: 'The longer it stands there, the worse your deck smells.',
    mendText: 'The sporecap shakes off its grey and turns a cheerful red with white spots. It waddles off. Do not eat it.',
    powers: { sporing: 1 },
    moves: {
      puff: { intent: 'debuff', label: 'Puff', alt: 'attack', dmg: 4, run: async e => { e.apply('player', 'dazed', 2); await e.attack(4); } },
      thump: { intent: 'attack', label: 'Thump', dmg: 10, run: e => e.attack(10) },
      spores: { intent: 'debuff', label: 'Spores', run: e => e.addGloom('mildew', 2, 'discard') },
      root: { intent: 'block', label: 'Root', run: e => e.bark(12) },
    },
    next(e) { return cycle(['puff', 'thump', 'spores', 'thump', 'root'], e); },
  },
  hollowbat: {
    name: 'Hollowbat', sprite: 'en_hollowbat', season: 'fall', tier: 'normal', hp: [40, 46],
    flavor: 'Brings its own fog. Considerate, in a way.',
    mendText: 'The bat hangs upside down from your hoe for a moment, chirps thanks, and flutters back to the barn.',
    moves: {
      screech: { intent: 'debuff', label: 'Screech', alt: 'attack', dmg: 6, run: async e => { e.setWeather('fog'); await e.attack(6); } },
      drain: { intent: 'attack', label: 'Drain', alt: 'heal', dmg: 7, run: async e => { await e.attack(7); e.heal(7); } },
      bite: { intent: 'attack', label: 'Bite', dmg: 8, run: e => e.attack(8) },
      flutter: { intent: 'block', label: 'Flutter', run: e => e.bark(8) },
    },
    next(e) { return cycle(['screech', 'drain', 'bite', 'drain', 'flutter'], e); },
  },
  leafling: {
    name: 'Leafling', sprite: 'en_leafling', season: 'fall', tier: 'normal', hp: [40, 46],
    flavor: 'A leaf pile that jumped first.',
    mendText: 'The leafling scatters into a thousand ordinary leaves, all of them faintly pleased with themselves.',
    moves: {
      rustle: { intent: 'attack', label: 'Rustle', dmg: 8, run: e => e.attack(8) },
      leaf_storm: { intent: 'attack', label: 'Leaf Storm', alt: 'debuff', dmg: 5, times: 2, run: async e => { e.setWeather('wind'); await e.attack(5, 2); } },
      smother: { intent: 'trample', label: 'Smother', run: e => { e.trample(1); e.nibble(2); } },
      pile_up: { intent: 'block', label: 'Pile Up', run: e => e.bark(15) },
    },
    next(e) { return cycle(['rustle', 'leaf_storm', 'smother', 'pile_up'], e); },
  },
  strawling: {
    name: 'Strawling', sprite: 'en_strawling', season: 'fall', tier: 'normal', hp: [36, 42],
    flavor: "One of Hollowjack's. Stuffed with straw, a rusty nail, and a wrong idea about what a garden is for.",
    mendText: 'The straw settles, the nail falls out, and the strawling props itself up at the edge of the field to keep the crows off. Properly, this time.',
    powers: { weed_tender: 1 },
    moves: {
      sow: { intent: 'weed', label: 'Sow Gloam', alt: 'debuff', run: e => e.plantWeed(1) },
      jab: { intent: 'attack', label: 'Straw Jab', dmg: 8, run: e => e.attack(8) },
      scatter: { intent: 'trample', label: 'Scatter', alt: 'attack', dmg: 4, run: async e => { e.nibble(1); await e.attack(4); } },
      stuff: { intent: 'block', label: 'Stuff', run: e => e.bark(10) },
    },
    next(e) { return cycle(['sow', 'jab', 'scatter', 'stuff', 'jab'], e); },
  },
  mothowl: {
    name: 'Mothowl', sprite: 'en_mothowl', season: 'fall', tier: 'elite', hp: [125, 135],
    flavor: 'It watches. It has always been watching. It would like you to know that.',
    mendText: 'The mothowl blinks its enormous eyes, ruffles to twice its size, and glides off into a moon that was not there a moment ago.',
    moves: {
      stare: { intent: 'debuff', label: 'Stare', run: e => { e.apply('player', 'rooted', 1); e.apply('player', 'dazed', 1); e.say('Who.'); } },
      talons: { intent: 'attack', label: 'Talons', dmg: 9, times: 2, run: e => e.attack(9, 2) },
      wingbeat: { intent: 'attack', label: 'Wingbeat', alt: 'debuff', dmg: 15, run: async e => { e.setWeather('wind'); await e.attack(15); } },
      shadow: { intent: 'block', label: 'Shadow', alt: 'debuff', run: e => { e.bark(18); e.setWeather('fog'); } },
      hoot: { intent: 'summon', label: 'Hoot', run: e => e.summon('hollowbat') },
    },
    next(e) {
      if (e.turn === 1) return 'stare';
      const m = cycle(['talons', 'wingbeat', 'shadow', 'talons', 'stare', 'hoot'], e, -1);
      return m === 'hoot' && allies(e) >= 2 ? 'talons' : m;
    },
  },
  rustboar: {
    name: 'Rustboar', sprite: 'en_rustboar', season: 'fall', tier: 'elite', hp: [120, 132],
    flavor: 'Tusks like ploughshares, hide like an old gate. It has turned over half the valley looking for something it buried.',
    mendText: 'The rust flakes off in sheets and a big, mild pig looks up at you, thoroughly pleased to have found whatever it was. It was an acorn. It shows you.',
    powers: { thorns: 1 },
    moves: {
      snort: { intent: 'buff', label: 'Snort', run: e => { e.apply('self', 'grit', 2); e.say('Hrmf.'); } },
      charge: { intent: 'attack', label: 'Charge', dmg: 16, run: e => e.attack(16) },
      tusks: { intent: 'attack', label: 'Tusks', dmg: 6, times: 2, run: e => e.attack(6, 2) },
      root_up: { intent: 'trample', label: 'Root Up', alt: 'weed', run: e => { e.trample(1); e.plantWeed(1); } },
      wallow: { intent: 'block', label: 'Wallow', run: e => e.bark(15) },
    },
    next(e) { return e.turn === 1 ? 'snort' : cycle(['charge', 'root_up', 'tusks', 'wallow', 'charge', 'snort'], e, -1); },
  },
  hollowjack: {
    name: 'Hollowjack', sprite: 'boss_hollowjack', season: 'fall', tier: 'boss', hp: [240, 240],
    flavor: 'A harvest scarecrow with a lantern for a head. Nana built it to guard the field. It still is.',
    mendText: 'The lantern flickers and settles to a warm, steady candle-glow. Hollowjack straightens its hat, takes up its post at the edge of the field, and waves you on. The Fall page is tucked in its coat pocket.',
    moves: {
      reap: { intent: 'attack', label: 'Reap', dmg: 15, run: e => e.attack(15) },
      crow_call: { intent: 'summon', label: 'Crow Call', run: e => { e.summon('greycrow'); e.say('Mine. All of it.'); } },
      rot_field: { intent: 'trample', label: 'Rot the Field', alt: 'weed', run: e => { e.trample(1); e.plantWeed(1); e.apply('player', 'wilt', 2); } },
      lantern_glare: { intent: 'debuff', label: 'Lantern Glare', alt: 'attack', dmg: 7, run: async e => { e.apply('player', 'dazed', 2); await e.attack(7); } },
      harvest: { intent: 'heal', label: 'Harvest', alt: 'trample', run: e => { if ((e.self.phase || 1) < 2) e.phase(2, 'Nothing grows here now. Nothing but me.'); e.nibble(2); e.heal(12); } },
      kindle: { intent: 'block', label: 'Kindle', alt: 'buff', run: e => { e.phase(3, 'She stuffed me with straw and an old song. Then she stopped coming.'); e.bark(20); e.apply('self', 'thorns', 2); } },
      bonfire: { intent: 'attack', label: 'Bonfire', dmg: 24, run: e => { e.say('I was built to guard. Now I guard the grey.'); return e.attack(24); } },
    },
    next(e) {
      const f = hpFrac(e);
      const p = phase(e);
      if (p < 2) {
        if (f <= 0.66) return 'harvest';
        const m = cycle(['reap', 'rot_field', 'crow_call', 'lantern_glare', 'reap', 'rot_field'], e);
        return m === 'crow_call' && allies(e) >= 3 ? 'reap' : m;
      }
      if (p < 3) {
        if (f <= 0.33) return 'kindle';
        const k = sinceFirst(e, 'harvest');
        return ['reap', 'rot_field', 'lantern_glare', 'reap', 'harvest'][Math.max(0, k) % 5];
      }
      const k = sinceFirst(e, 'kindle');
      return ['bonfire', 'reap', 'harvest', 'kindle'][Math.max(0, k) % 4];
    },
  },

  // ================================================================ WINTER
  snowhare: {
    name: 'Snowhare', sprite: 'en_snowhare', season: 'winter', tier: 'normal', hp: [50, 56],
    flavor: 'Fast, hungry, and very interested in your frostlilies.',
    mendText: 'The hare thumps once, ears up, and bounds off across the snow in a straight line toward Rue\'s kitchen garden.',
    moves: {
      kick: { intent: 'attack', label: 'Kick', dmg: 7, times: 2, run: e => e.attack(7, 2) },
      nibble: { intent: 'trample', label: 'Nibble', alt: 'attack', dmg: 6, run: async e => { e.nibble(2); await e.attack(6); } },
      dash: { intent: 'block', label: 'Dash', run: e => e.bark(12) },
      thump: { intent: 'buff', label: 'Thump', run: e => e.apply('self', 'grit', 2) },
    },
    next(e) { return cycle(['kick', 'nibble', 'dash', 'kick', 'thump'], e); },
  },
  icewisp: {
    name: 'Icewisp', sprite: 'en_icewisp', season: 'winter', tier: 'normal', hp: [52, 58],
    flavor: 'A cold little light that wants you to follow it. Don\'t.',
    mendText: 'The wisp warms from blue to candle-orange, bobs a thank-you, and floats off to light somebody\'s window.',
    powers: { frostbound: 6 },
    moves: {
      chill: { intent: 'block', label: 'Chill', alt: 'debuff', run: e => { e.setWeather('frost'); e.bark(10); } },
      flicker: { intent: 'attack', label: 'Flicker', dmg: 9, run: e => e.attack(9) },
      fade: { intent: 'debuff', label: 'Fade', run: e => { e.setWeather('fog'); e.apply('player', 'dazed', 1); } },
      freeze: { intent: 'attack', label: 'Freeze', dmg: 12, run: e => e.attack(12) },
    },
    next(e) { return cycle(['chill', 'flicker', 'fade', 'freeze'], e); },
  },
  frostcrab: {
    name: 'Frostcrab', sprite: 'en_frostcrab', season: 'winter', tier: 'normal', hp: [62, 70],
    flavor: 'Lives under the river ice. Objects to being disturbed.',
    mendText: 'The crab clacks its claws in what might be applause and sidles back under the ice.',
    powers: { sturdy: 3, thorns: 1 },
    moves: {
      pinch: { intent: 'attack', label: 'Pinch', dmg: 11, run: e => e.attack(11) },
      shell: { intent: 'block', label: 'Shell', run: e => e.bark(12) },
      scuttle: { intent: 'trample', label: 'Scuttle', alt: 'attack', dmg: 6, run: async e => { e.trample(1); await e.attack(6); } },
      brace: { intent: 'buff', label: 'Brace', run: e => e.apply('self', 'thorns', 2) },
    },
    next(e) { return cycle(['shell', 'pinch', 'scuttle', 'pinch', 'brace', 'pinch'], e); },
  },
  snowmite: {
    name: 'Snowmite', sprite: 'en_snowmite', season: 'winter', tier: 'normal', hp: [48, 54],
    flavor: 'Where there is one, there are more. Where there are more, there are more.',
    mendText: 'The snowmite shivers, fluffs up white, and skitters off to join a drift.',
    moves: {
      bite: { intent: 'attack', label: 'Bite', dmg: 7, run: e => e.attack(7) },
      burrow: { intent: 'block', label: 'Burrow', alt: 'trample', run: e => { e.bark(6); e.nibble(1); } },
      multiply: { intent: 'summon', label: 'Multiply', run: e => e.summon('snowmite') },
    },
    next(e) {
      const m = cycle(['bite', 'burrow', 'multiply'], e);
      return m === 'multiply' && allies(e) >= 2 ? 'bite' : m;
    },
  },
  frostmoth: {
    name: 'Frostmoth', sprite: 'en_frostmoth', season: 'winter', tier: 'normal', hp: [46, 52],
    flavor: 'Pale wings, dusted white. Comes to the window on the coldest nights and asks, politely, to be let in. Don\'t.',
    mendText: 'The frost on its wings melts to plain brown moth. It bumps the lantern twice out of habit and flutters off toward Rue\'s kitchen, where the light is.',
    powers: { frostbound: 4 },
    moves: {
      frost_dust: { intent: 'debuff', label: 'Frost Dust', run: e => { e.setWeather('frost'); e.apply('player', 'dazed', 1); } },
      flutter: { intent: 'attack', label: 'Flutter', dmg: 6, times: 2, run: e => e.attack(6, 2) },
      glimmer: { intent: 'attack', label: 'Glimmer', alt: 'debuff', dmg: 5, run: async e => { await e.attack(5); e.addGloom('gloom', 1, 'discard'); } },
      cocoon: { intent: 'block', label: 'Cocoon', run: e => e.bark(10) },
    },
    next(e) { return cycle(['frost_dust', 'flutter', 'glimmer', 'flutter', 'cocoon'], e); },
  },
  gloamwolf: {
    name: 'Gloamwolf', sprite: 'en_gloamwolf', season: 'winter', tier: 'elite', hp: [165, 175],
    flavor: 'It has forgotten its pack. It thinks that means it never had one.',
    mendText: 'The wolf\'s eyes go from lilac to amber. It lifts its head and howls, and far off, something howls back. It goes to find them.',
    moves: {
      howl: { intent: 'buff', label: 'Howl', run: e => { e.apply('self', 'grit', 2); e.say('Nobody is coming.'); } },
      bite: { intent: 'attack', label: 'Bite', alt: 'debuff', dmg: 14, run: async e => { await e.attack(14); e.apply('player', 'wilt', 2); } },
      lunge: { intent: 'attack', label: 'Lunge', dmg: 10, times: 2, run: e => e.attack(10, 2) },
      circle: { intent: 'block', label: 'Circle', alt: 'debuff', run: e => { e.bark(14); e.setWeather('fog'); } },
      savage: { intent: 'trample', label: 'Savage', alt: 'attack', dmg: 12, run: async e => { e.trample(2); await e.attack(12); } },
    },
    next(e) { return e.turn === 1 ? 'howl' : cycle(['bite', 'lunge', 'circle', 'savage', 'howl'], e, -1); },
  },
  snowbear: {
    name: 'Snowbear', sprite: 'en_snowbear', season: 'winter', tier: 'elite', hp: [160, 174],
    flavor: 'Woke up early, grey to the ears, and went looking for whoever is responsible. Has decided that is you.',
    mendText: 'The grey melts out of its fur and it is a bear, brown and enormous and blinking. It yawns, pats you on the head hard enough to sit you down, and wanders off to finish sleeping.',
    powers: { sturdy: 3 },
    moves: {
      roar: { intent: 'buff', label: 'Roar', alt: 'debuff', run: e => { if (hpFrac(e) <= 0.5 && (e.self.phase || 1) < 2) e.phase(2, 'AWAKE now. Properly.'); e.apply('self', 'grit', 2); e.apply('player', 'dazed', 1); } },
      maul: { intent: 'attack', label: 'Maul', dmg: 18, run: e => e.attack(18) },
      swipe: { intent: 'attack', label: 'Swipe', dmg: 9, times: 2, run: e => e.attack(9, 2) },
      hibernate: { intent: 'heal', label: 'Doze', alt: 'block', run: e => { e.heal(12); e.bark(12); } },
      raid: { intent: 'steal', label: 'Raid the Pantry', alt: 'trample', run: e => { e.stealCoin(12); e.trample(1); } },
      stomp: { intent: 'trample', label: 'Stomp', alt: 'attack', dmg: 8, run: async e => { e.trample(2); await e.attack(8); } },
    },
    next(e) {
      if (e.turn === 1) return 'roar';
      if (phase(e) < 2) {
        if (hpFrac(e) <= 0.5) return 'roar';
        return cycle(['swipe', 'raid', 'maul', 'hibernate', 'stomp', 'swipe'], e, -1);
      }
      const k = sinceFirst(e, 'roar');
      return ['maul', 'stomp', 'swipe', 'maul', 'hibernate'][Math.max(0, k) % 5];
    },
  },
  nightheron: {
    name: 'The Nightheron', sprite: 'boss_nightheron', season: 'winter', tier: 'boss', hp: [320, 320],
    flavor: 'A heron made of night and starlight, standing in the still water at the bottom of the Hollow. The heart of the Gloam.',
    mendText: 'The stars in its wings go out one by one, and what is left is a grey heron, ordinary and enormous, standing in shallow water. It looks at you a long time. Then it says her name, the whole one, and lifts off over the hill toward the first light in months. The Winter page is warm in your hands.',
    powers: { long_shadow: 1 },
    moves: {
      still_water: { intent: 'block', label: 'Still Water', run: e => { e.bark(20); e.say('Do you know what I am? Neither do I. She did.'); } },
      spear: { intent: 'attack', label: 'Spear', dmg: 18, run: e => e.attack(18) },
      long_night: { intent: 'debuff', label: 'Long Night', run: e => { e.setWeather('fog'); e.addGloom('gloom', 2, 'discard'); } },
      wade: { intent: 'trample', label: 'Wade', alt: 'attack', dmg: 8, run: async e => { e.trample(1); await e.attack(8); } },
      star_fall: { intent: 'attack', label: 'Star-fall', dmg: 7, times: 3, run: e => e.attack(7, 3) },
      cold_stare: { intent: 'debuff', label: 'Cold Stare', run: e => { e.phase(2, 'Every winter someone stops remembering. This year it was me.'); e.apply('player', 'rooted', 1); e.apply('player', 'dazed', 2); } },
      forgetting: { intent: 'trample', label: 'Forgetting', alt: 'weed', run: e => { e.nibble(3); e.plantWeed(1); e.say('What was it called. The little round one. What was it called.'); } },
      unfold: { intent: 'block', label: 'Unfold', alt: 'buff', run: e => { e.phase(3, 'Look at me. Somebody look at me.'); e.bark(30); e.apply('self', 'thorns', 3); } },
      hollow_opens: { intent: 'attack', label: 'The Hollow Opens', dmg: 34, run: e => { e.say('I don\'t want to be forgotten.'); return e.attack(34); } },
    },
    next(e) {
      const f = hpFrac(e);
      const p = phase(e);
      if (p < 2) {
        if (f <= 0.7) return 'cold_stare';
        return cycle(['still_water', 'spear', 'long_night', 'wade', 'spear', 'long_night'], e);
      }
      if (p < 3) {
        if (f <= 0.4) return 'unfold';
        const k = sinceFirst(e, 'cold_stare');
        return ['star_fall', 'forgetting', 'spear', 'star_fall', 'wade', 'forgetting'][Math.max(0, k) % 6];
      }
      const k = sinceFirst(e, 'unfold');
      return ['hollow_opens', 'wade', 'spear', 'unfold'][Math.max(0, k) % 4];
    },
  },
};

export const ENCOUNTERS = {
  spring: {
    easy: [['gloamslug'], ['burrlet', 'burrlet'], ['greycrow'], ['mudpup']],
    normal: [['gloamslug', 'burrlet'], ['moleling'], ['greycrow', 'burrlet', 'burrlet'], ['moleling', 'gloamslug'], ['greycrow', 'greycrow'], ['mudpup', 'burrlet'], ['mudpup', 'moleling']],
    elite: [['bramblehog'], ['rookmother']],
    boss: [['rootstag']],
  },
  summer: {
    easy: [['sunwasp'], ['emberfly', 'emberfly'], ['dusttoad'], ['cicada']],
    normal: [['brassbeetle'], ['sunwasp', 'emberfly'], ['dusttoad', 'brassbeetle'], ['dusttoad', 'emberfly'], ['sunwasp', 'sunwasp'], ['cicada', 'sunwasp'], ['cicada', 'cicada'], ['cicada', 'emberfly']],
    elite: [['sandmantis'], ['hornetknight']],
    boss: [['scorchmoth']],
  },
  fall: {
    easy: [['gourdling'], ['hollowbat'], ['leafling'], ['strawling']],
    normal: [['sporecap'], ['gourdling', 'gourdling'], ['hollowbat', 'sporecap'], ['leafling', 'gourdling'], ['hollowbat', 'hollowbat'], ['strawling', 'gourdling'], ['strawling', 'strawling']],
    elite: [['mothowl'], ['rustboar']],
    boss: [['hollowjack']],
  },
  winter: {
    easy: [['snowhare'], ['icewisp'], ['snowmite', 'snowmite'], ['frostmoth']],
    normal: [['frostcrab'], ['snowhare', 'icewisp'], ['frostcrab', 'snowmite'], ['snowmite', 'snowmite', 'snowmite'], ['icewisp', 'icewisp'], ['frostmoth', 'snowhare'], ['frostmoth', 'frostmoth']],
    elite: [['gloamwolf'], ['snowbear']],
    boss: [['nightheron']],
  },
};
