// Bramblewick: the guided first fight and the one-time Almanac tips.
// TUTORIAL runs in the combat UI with a scripted draw order and weather (engine: Combat script option).
// Steps fire on: 'start' | 'cardPlayed:<id>' | 'turn:<n>' | 'bloom' | 'intent'. highlight is a combat UI selector.
// FIRST_TIPS show once per key (meta.tipsSeen) the first time the player meets that mechanic.
//
// The fight, by the numbers: a Moleling (24-30 Heart) opens with Bite 8, so Bark matters on turn 1.
// Turn 1 hand has exactly one Hoe Swing (6), so the mole survives the Rain-turn Turnip bloom (10) and
// every step below fires while it is still standing. Its turn-2 intent is Burrow, which plants a
// Gloamweed: the weed badge gets pointed at before the player ever meets one for real.

export const TUTORIAL = {
  enemies: ['moleling'],
  // Turn 1: one swing, three Mulch, the Turnip. Turn 2: the rest of the swings to finish what the turnip starts.
  drawOrder: ['hoe_swing', 'mulch', 'turnip_seeds', 'mulch', 'mulch', 'hoe_swing', 'hoe_swing', 'hoe_swing', 'hoe_swing', 'mulch'],
  weather: ['sun', 'rain', 'sun'],
  steps: [
    {
      on: 'start',
      text: "A Moleling. Grumpy, grey, and about to come up under something. Your cards are along the bottom and you have 3 Stamina to spend on them each turn. Tap Hoe Swing, then tap the mole.",
      highlight: '.hand .card',
    },
    {
      on: 'intent',
      text: "The badge over a critter is its intent: what it means to do next. A number is damage coming your way. A hoof means it's going for your garden; a thorn means it's planting a weed. Always read it first.",
      highlight: '.intent',
    },
    {
      on: 'cardPlayed:hoe_swing',
      text: "Good swing. Its badge says 8: that bite lands after you end your turn. Play Mulch now. Bark soaks up damage until the start of your next turn, then falls away, so it goes down the turn before the hit.",
      highlight: '.hand .card',
    },
    {
      on: 'cardPlayed:mulch',
      text: "That takes the edge off the bite. Now the part Nana cared about: play Turnip Seeds. Seeds go in the leftmost empty plot.",
      highlight: '.plot',
    },
    {
      on: 'cardPlayed:turnip_seeds',
      text: "Planted. At the start of each of your turns, every plant grows by the weather: Sun 1, Rain 2, Drought nothing. A Turnip needs 2. When your Stamina is spent, end your turn and let the mole have its go.",
      highlight: '.endturn',
    },
    {
      on: 'turn:2',
      text: "Rain. Everything in the garden drinks 2 today. And look at the mole's badge: that thorn means it's about to plant a Gloamweed in an empty plot. Weeds hurt when they bloom. Fill the plot first, or pull the weed after.",
      highlight: '.weather',
    },
    {
      on: 'bloom',
      text: "It bloomed and hit the mole for 10. That's the garden: plant early, keep it safe, let the weather do the heavy lifting. Now finish the mole off. Nobody dies here; it goes home and stops digging.",
      highlight: '.plot',
    },
  ],
};

export const FIRST_TIPS = {
  trampleIntent: "That hoof badge is a trample. Next turn it squashes the plant with the most growth. Harvest early, protect it with Guard, or whack the critter first.",
  weedIntent: "That thorny badge means the critter is planting a Gloamweed in an empty plot. Weeds grow with the weather like anything else and hurt you when they bloom. Uproot them, or fill your plots first so there is nowhere to dig.",
  stealIntent: "That coin badge is a theft. Some critters take coin instead of Heart. Mend them fast; they don't give it back.",
  fog: "Fog hides critter intents. Plan for the worst you've seen them do, or set the weather yourself.",
  drought: "Drought: plants don't grow at all this turn. Cards that grow or set the weather still work. Rain Barrels help.",
  frost: "Frost: plants don't grow, and everyone gains 3 extra Bark whenever they gain Bark. Critters that block will block harder.",
  wind: "Wind: every attack in the valley deals 2 more, yours and theirs. Cards that hit twice love it. Critters that hit twice also love it.",
  firstElite: "A Thicket. Elites have a lot more Heart and open with a signature move. They drop a Keepsake when mended. Bring Bark.",
  firstBoss: "A Season Keeper. It holds one of the Almanac's pages. Bosses change their pattern as they lose Heart; watch for the shift and the speech that comes with it.",
  bossPhase: "The Keeper has changed. Its moves are different from here on. Read the new intents before you commit anything.",
  gloomCard: "A Gloom card. Unplayable and taking up a slot in your hand. Most of them leave when the fight does; some stick around. Compost cards clear space.",
  fullPlots: "Your plots are full, so Seed cards can't be played. Harvest something, or wait for a bloom. A 4th plot is possible with the right card or Keepsake.",
  guard: "Guard is a little scarecrow on a plot. The next trample knocks the scarecrow over instead of the plant. It doesn't stop nibbles.",
  bees: "Bees never leave. At the end of each of your turns, every Bee stings a random critter for 1, straight through Bark. Gain Bees, keep them, let the fight get long.",
  sting: "A sting is 1 damage that ignores Bark. Stings aren't attacks, so Grit, Wind and Soggy don't touch them.",
  honey: "Honey is stored on you between turns. Blooms make it. Pell's cards spend it: cake, mead, poultices. Nothing spends it for you.",
  weatherLock: "Locked weather: the padlock on the badge means the next weather roll is skipped and today's weather holds. Sun, rain and drought can all be locked.",
  fourthPlot: "A fourth plot, this fight only. Seeds still go leftmost. One more thing to protect, one more thing to bloom.",
  keep: "Keep: this card stays in your hand at the end of the turn instead of being discarded. Hold it for the right moment.",
  compost: "Compost: the card leaves the fight when played. It comes back next fight. Some Keepsakes and Charms pay you for it.",
  wilt: "Wilt: loses that much Heart at the start of its turn, then the number drops by 1. 5 Wilt is 15 damage over five turns, through Bark.",
  perennial: "A perennial blooms and stays, planted, for the whole fight. That plot is spent. Decide if it earns its keep.",
  choose: "A choice. The Almanac will wait. Pick the option that fits this turn, not the one that sounds best on paper.",
  steal: "Some critters go for your purse. Coin lost to a theft is gone. Mend the thief first if the stall is next on your map.",
};
