// Bramblewick: villager events. Friendship persists between runs; higher friendship unlocks
// warmer options. Old Mossy's events carry the through-line about the Gloam and Nana Wren;
// the last piece is in story.js ENDING.
// 2.0: optional `characters: ['farmer'|'pell']` (and `pool`, which the engine's pickEvent reads) limits an event to those runs. Pell cannot visit
// himself, so his hives are farmer-only; on Pell's runs the Farmer is a villager (villager: 'farmer').

const f = (ev, id) => ev.getFriendship(id) || 0;
const has = (ev, ks) => (ev.run.keepsakes || []).includes(ks);
const isPell = ev => (ev.run.character || 'farmer') === 'pell';
const seasonOf = ev => ev.run.season || ['spring', 'summer', 'fall', 'winter'][ev.run.seasonIdx || 0];

export const EVENTS = [
  // ------------------------------------------------------------------ Odile
  {
    id: 'odile_barge', villager: 'odile', title: 'Cargo Off the Barge', seasons: ['spring'],
    text: "Odile has three crates on the dock and a look that says she would rather not carry them. 'Wren's things. Came downriver after... well. Came downriver.' She jerks a thumb at the pile. 'Help me haul, or buy the lot. Or stand there. Standing's free.'",
    choices: [
      { label: 'Haul crates', hint: 'Lose 5 Heart. Gain 25 coin. Odile +1.',
        do(ev) { ev.damage(5); ev.gainCoin(25); ev.friendship('odile', 1); return "Your back complains. Odile pays without counting, which for Odile is a hug."; } },
      { label: 'Buy the lot', hint: 'Lose 40 coin. Gain a Keepsake.', cond: ev => ev.run.coin >= 40,
        do(ev) { ev.loseCoin(40); ev.addKeepsake('random'); return "Mostly crockery. At the bottom, wrapped in a tea towel, something that was clearly waiting for you."; } },
      { label: 'Ask what came downriver', hint: 'Odile +1. Gain the Jam Spoon.', cond: ev => f(ev, 'odile') >= 2 && !has(ev, 'jam_spoon'),
        do(ev) { ev.friendship('odile', 1); ev.addKeepsake('jam_spoon'); return "'Her rowboat. Empty. Up near the Hollow.' Odile looks at the water. 'Oars shipped neat. She wasn't in a hurry.' She hands you a spoon from the crate. 'That was hers too. Go on.'"; } },
      { label: 'Stand there', hint: 'Heal 5.',
        do(ev) { ev.heal(5); return "Odile grunts. 'Standing's free.' You feel oddly rested. She may have slipped you a biscuit."; } },
    ],
  },
  {
    id: 'odile_bargain', villager: 'odile', title: 'Odds and Ends',
    text: "A crate of chipped, mismatched, perfectly good things. 'Everything's a bargain if you don't look too close,' Odile says, looking closely at you.",
    choices: [
      { label: 'Swap something', hint: 'Pay 15 coin. Transform a card.', cond: ev => ev.run.coin >= 15 && f(ev, 'odile') < 2,
        async do(ev) { ev.loseCoin(15); await ev.transformCard(); return "She turns it over, sniffs it, and hands you something else entirely. 'Better.' It is, somehow."; } },
      { label: "Friend's rate", hint: 'Free. Transform a card.', cond: ev => f(ev, 'odile') >= 2,
        async do(ev) { await ev.transformCard(); return "'Put your coin away before I get offended.' She swaps it out with the air of someone who has been waiting all week to do this."; } },
      { label: 'Buy a jar', hint: 'Pay 10 coin. Gain a random Preserve.', cond: ev => ev.run.coin >= 10,
        do(ev) { ev.loseCoin(10); ev.addPreserve('random'); return "No label. 'Trust me,' says Odile, who has never once explained what is in a jar."; } },
      { label: 'Just browsing', do() { return "'Browse faster,' she says, and goes back to her crossword."; } },
    ],
  },
  {
    id: 'odile_ice', villager: 'odile', title: 'Ice on the River', seasons: ['winter'],
    text: "The barge is frozen in and Odile is taking it personally. 'Something's under the ice,' she says. 'Grey and clicking. Break it loose and I pay. Push, and I pay less. Or buy a hot drink and watch. Pays nothing, but it's warm.'",
    choices: [
      { label: 'Break it loose', hint: 'Fight a Frostcrab. Gain 40 coin. Odile +1.',
        async do(ev) { await ev.fight(['frostcrab']); ev.gainCoin(40); ev.friendship('odile', 1); return "The ice groans, the crab goes home, and the barge rocks free. Odile pays double and pretends it was the agreed price."; } },
      { label: 'Push', hint: 'Lose 6 Heart. Gain 20 coin.',
        do(ev) { ev.damage(6); ev.gainCoin(20); return "You push. She pushes. The barge does not care about either of you, but it moves."; } },
      { label: 'Hot drink', hint: 'Lose 5 coin. Heal 12.', cond: ev => ev.run.coin >= 5,
        do(ev) { ev.loseCoin(5); ev.heal(12); return "Something with cloves in it. Odile watches the ice and you watch Odile and nobody says anything for a while, which is nice."; } },
    ],
  },
  {
    id: 'odile_glass', villager: 'odile', title: 'The Glass Off the Barge', seasons: ['summer', 'fall'],
    text: "Odile has a brass thing with a dial on the counter and is tapping it. 'Barometer. Off the barge. Tells you tomorrow, if you ask it nice.' She taps it again. 'Buy it, or I'll read it for you once, and you'll have to trust me on what it says.'",
    choices: [
      { label: 'Buy the barometer', hint: 'Lose 25 coin. Gain Barometer.', cond: ev => ev.run.coin >= 25,
        do(ev) { ev.loseCoin(25); ev.addCard('barometer'); return "'Tap it twice. Then believe it.' It is heavier than it looks and right more often than you are."; } },
      { label: 'Ask for fair weather', hint: 'Heal 10.',
        do(ev) { ev.heal(10); return "'Sun,' she says, 'sit in it,' and you do, on the dock, for an hour that nobody charges you for."; } },
      { label: 'Ask for rain', hint: 'Gain 20 coin. Odile +1.',
        do(ev) { ev.gainCoin(20); ev.friendship('odile', 1); return "'Rain. Get the bunting in.' You get the bunting in, and the crates, and the cat. She pays you for the cat."; } },
      { label: 'Ask for wind', hint: 'Transform a card.',
        async do(ev) { await ev.transformCard(); return "'Wind. Everything loose ends up somewhere else.' Something in your deck ends up somewhere else. Better, mostly."; } },
    ],
  },
  {
    id: 'odile_crow', villager: 'odile', title: 'Robbed in Daylight', seasons: ['spring', 'summer'],
    text: "A Greycrow has Odile's coin tin and is making off with it in short, insolent hops. Odile is throwing turnips. 'Well? Standing's free, chasing pays.'",
    choices: [
      { label: 'Chase it down', hint: 'Fight two Greycrows. Gain 35 coin. Odile +1.',
        async do(ev) { await ev.fight(['greycrow', 'greycrow']); ev.gainCoin(35); ev.friendship('odile', 1); return "The crow has a friend. The friend has opinions. You come back with the tin, most of the coin, and a feather Odile pretends not to want."; } },
      { label: 'Cover the loss', hint: 'Lose 20 coin. Odile +2.', cond: ev => ev.run.coin >= 20,
        do(ev) { ev.loseCoin(20); ev.friendship('odile', 2); return "You put coin on the counter. She looks at it a long time. 'Wren did that once.' She does not give it back, but she does not forget it either."; } },
      { label: 'Let it keep the shiny thing', hint: 'Heal 8.',
        do(ev) { ev.heal(8); return "'Fine. FINE.' Odile sits down heavily and pours two cups of something, and you both watch the crow admire itself in the tin lid until it gets bored."; } },
    ],
  },
  {
    id: 'pell_odile_mead', villager: 'odile', title: 'A Barrel in the Dark', characters: ['pell'], pool: 'pell', seasons: ['summer', 'fall'],
    text: "Odile rolls a small barrel out from under the counter with her foot. 'Your honey. My barrel. Nine months in the dark.' She knocks on it. It knocks back, sort of. 'Mead. Sell it, share it, or we drink it here and nobody's the wiser.'",
    choices: [
      { label: 'Sell the barrel', hint: 'Gain 40 coin.',
        do(ev) { ev.gainCoin(40); return "She counts it out in the big coins, which she never does. 'Bring more honey. Bring the good honey.'"; } },
      { label: 'Keep a jug back', hint: 'Gain Mead.',
        do(ev) { ev.addCard('mead'); return "She fills a stoneware jug and stoppers it with wax. 'Not before a fight. Well. Not before a big fight.'"; } },
      { label: 'Drink it here', hint: 'Heal 15. Odile +1.',
        do(ev) { ev.heal(15); ev.friendship('odile', 1); return "Two cups, then three. She tells you about a river in the north that ran gold at sunset, and you tell her the verse about the heron, and neither of you is lying, exactly."; } },
    ],
  },

  // ------------------------------------------------------------------ Auntie Rue
  {
    id: 'rue_soup', villager: 'rue', title: 'Something Simmering',
    text: "Auntie Rue's pot has been on since before you were born and shows no sign of stopping. 'Sit. Eat. You look like a turnip somebody forgot.' She ladles without asking.",
    choices: [
      { label: 'Eat', hint: 'Heal 15.', do(ev) { ev.heal(15); return "It tastes like every good day you have ever had, plus barley."; } },
      { label: 'Ask for the strong stuff', hint: 'Lose 4 Heart. Remove a card from your deck.',
        async do(ev) { ev.damage(4); await ev.removeCard(); return "She reaches for the small pot at the back. It tastes like a bonfire smells. Something in you that was in the way is gone."; } },
      { label: 'Help her chop', hint: 'Rue +1. Heal 8. Upgrade a card.', cond: ev => f(ev, 'rue') >= 2,
        async do(ev) { ev.friendship('rue', 1); ev.heal(8); await ev.upgradeCard(); return "'Smaller. Smaller. There.' Two hours of onions and gossip. You leave better at everything."; } },
      { label: 'Take a jar for the road', hint: 'Gain a random Preserve.',
        do(ev) { ev.addPreserve('random'); return "She presses it into your hands with both of hers. 'Eat it before it eats you.' You assume she is joking."; } },
    ],
  },
  {
    id: 'rue_remedy', villager: 'rue', title: 'A Remedy for the Grey', seasons: ['fall', 'winter'],
    text: "Rue has a bottle the color of pond water. 'For the Gloam,' she says. 'It'll take the grey off you, or it'll take something else. Wren swore by it. Wren swore at it, too.'",
    choices: [
      { label: 'Drink', hint: '60%: gain 8 max Heart. 40%: a Thistle gets into your deck.',
        do(ev) { if (ev.rand() < 0.6) { ev.gainMaxHp(8); return "Awful. Wonderful. You feel like you have been re-potted."; } ev.addCard('thistle'); return "Awful. Just awful. Something prickly takes up residence in your coat pocket and will not leave."; } },
      { label: 'Rub it on the hoe', hint: 'Upgrade a card.',
        async do(ev) { await ev.upgradeCard(); return "The hoe gleams. Rue sniffs. 'Waste of good remedy.' She is smiling, though."; } },
      { label: "Ask what's in it", hint: 'Rue +1. Heal 8.', cond: ev => f(ev, 'rue') >= 1,
        do(ev) { ev.friendship('rue', 1); ev.heal(8); return "'Nettle, rosehip, a lot of patience, and one thing I'm not telling you.' She pours you a cup of the normal tea instead. It helps more."; } },
      { label: 'Politely decline', do() { return "Rue puts the bottle away. 'Wise. Or cowardly. Same thing, mostly.'"; } },
    ],
  },
  {
    id: 'rue_long_night', villager: 'rue', title: 'The Longest Night', seasons: ['winter'],
    text: "Rue's fire is the only light on the lane. She hands you a blanket and says nothing for a long time, which for Rue is a speech. 'Wren sat there,' she says finally. 'Every long night. Right where you're sitting.'",
    choices: [
      { label: 'Stay till morning', hint: 'Heal to full.',
        do(ev) { ev.heal(ev.run.maxHp); return "You sleep in the chair. When you wake there is porridge and a note that says EAT in letters an inch high."; } },
      { label: "Ask about Nana's chair", hint: "Rue +1. Gain Grandmother's Recipe.", cond: ev => f(ev, 'rue') >= 2,
        do(ev) { ev.friendship('rue', 1); ev.addCard('grandmothers_recipe'); return "'She'd bring whatever bloomed that day and we'd cook it. Didn't matter what. Turnip pie, once. Dreadful.' Rue wipes her eyes with the corner of the blanket. 'Here. She'd want you to have the dreadful recipe.'"; } },
      { label: 'Help her bank the fire', hint: 'Rue +1. Gain a random Preserve.',
        do(ev) { ev.friendship('rue', 1); ev.addPreserve('random'); return "Ash over embers, the way she shows you. 'Keeps till morning.' She sends you off with a jar and a look."; } },
    ],
  },
  {
    id: 'rue_honey_cake', villager: 'rue', title: 'Honey Cake Day',
    text: "The whole lane smells of it. Rue has four tins cooling on the sill and is guarding them with a wooden spoon. 'One's for you. One's for Mossy, if he comes down, which he won't. Don't touch the third. Nobody knows about the fourth.'",
    choices: [
      { label: 'Eat yours now', hint: 'Heal 14.',
        do(ev) { ev.heal(14); return "Dense, dark, still warm in the middle. You have to sit down. She lets you."; } },
      { label: 'Ask for the recipe', hint: 'Gain Honey Cake (Pell), or the Honey Pot (Farmer).',
        do(ev) {
          if (isPell(ev)) { ev.addCard('honey_cake'); return "'Your honey, my oven, and don't open the door for forty minutes no matter what you hear.' She writes it on the back of a seed packet, in capitals."; }
          if (!has(ev, 'honey_pot')) { ev.addKeepsake('honey_pot'); return "'You can't bake. Take the pot instead.' It is sticky, it is heavy, and there are two bees asleep in the lid who do not intend to leave."; }
          ev.addPreserve('clover_honey'); return "'You can't bake. Take a jar and stop asking.' The jar is still warm."; } },
      { label: 'Help with the fourth tin', hint: 'Rue +1. Upgrade a card.', cond: ev => f(ev, 'rue') >= 1,
        async do(ev) { ev.friendship('rue', 1); await ev.upgradeCard(); return "The fourth tin is for the heron. She does not say so. She wraps it in a cloth and puts it by the door facing the hill, and she lets you stir the fifth, which nobody knows about either."; } },
    ],
  },

  // ------------------------------------------------------------------ Bram
  {
    id: 'bram_forge', villager: 'bram', title: 'The Anvil Has Opinions',
    text: "Bram is arguing with his anvil about the correct temper for a hoe. The anvil is winning. 'Yours?' he says, holding out a hand without looking up. 'Give it here. I'll make it mean.'",
    choices: [
      { label: 'Fix a tool', hint: 'Pay 20 coin. Upgrade a card.', cond: ev => ev.run.coin >= 20 && f(ev, 'bram') < 2,
        async do(ev) { ev.loseCoin(20); await ev.upgradeCard(); return "Three strikes, a hiss, and it comes back to you wanting a fight."; } },
      { label: "Mates' rates", hint: 'Free. Upgrade a card. Bram +1.', cond: ev => f(ev, 'bram') >= 2,
        async do(ev) { ev.friendship('bram', 1); await ev.upgradeCard(); return "'Don't insult me.' He waves your coin away and does the work slower, which is how you know he cares."; } },
      { label: 'Ask about the anvil', hint: 'Bram +1. Gain Work Gloves.', cond: ev => !has(ev, 'work_gloves'),
        do(ev) { ev.friendship('bram', 1); ev.addKeepsake('work_gloves'); return "'She listens. That's more than most.' He tosses you a pair of gloves. 'Too big. Correct size.'"; } },
      { label: 'Leave him to it', do() { return "You back out quietly. The anvil says something. Bram says 'Well, obviously.'"; } },
    ],
  },
  {
    id: 'bram_scrap', villager: 'bram', title: 'Scrap Pile Sunday', seasons: ['summer', 'fall'],
    text: "'Take what you want,' Bram says, waving at a mound of bent, rusted, brilliant junk. 'Half of it's Wren's. Other half's mine. Mine's better. Hers worked.'",
    choices: [
      { label: 'Dig for a tool', hint: 'Choose an uncommon card.',
        async do(ev) { await ev.cardReward('uncommon'); return "Under a wheelbarrow with no wheel: exactly what you were looking for, and one thing you were not."; } },
      { label: 'Take the scrap', hint: 'Gain 30 coin. A Burr gets in your pocket.',
        do(ev) { ev.gainCoin(30); ev.addCard('burr'); return "Odile buys scrap by the pound. Something small and prickly comes along for the ride."; } },
      { label: 'Ask for the pebbles', hint: 'Gain an upgraded Pocket of Pebbles.',
        do(ev) { ev.addCard('pocket_of_pebbles', true); return "'River ones. She threw them at crows.' He hands you a pocketful, sorted by size. Of course they are."; } },
    ],
  },
  {
    id: 'bram_rust', villager: 'bram', title: 'Rust Never Sleeps', seasons: ['fall', 'winter'],
    text: "Every blade in Bram's shop went grey overnight. He is scrubbing one with a look of personal betrayal. 'Gloam,' he says. 'Gets in the joints. Check your own kit.'",
    choices: [
      { label: 'Scrub your tools', hint: 'Remove a card from your deck.',
        async do(ev) { await ev.removeCard(); return "Elbow grease and something Bram calls 'the vinegar.' One thing you have been carrying does not come back out of the bucket."; } },
      { label: 'Sell him the rusted ones', hint: 'Gain 35 coin. A Gloom gets into your deck.',
        do(ev) { ev.gainCoin(35); ev.addCard('gloom'); return "He pays for the metal. The grey stays with you, tucked somewhere between two cards."; } },
      { label: 'Help him scrub', hint: 'Bram +1. Upgrade a card.', cond: ev => f(ev, 'bram') >= 1,
        async do(ev) { ev.friendship('bram', 1); await ev.upgradeCard(); return "By dusk the shop shines and he has quietly done one of yours as well."; } },
    ],
  },
  {
    id: 'bram_scarecrow', villager: 'bram', title: 'A Man of Straw', seasons: ['spring', 'fall'],
    text: "Bram has a broom handle, a coat, and a turnip with a face drawn on it, and he is not sure about the turnip. 'Wren built the last one. Hollowjack.' He does not look at the hill. 'This one's smaller. This one stays small. Hold the arms.'",
    choices: [
      { label: 'Hold the arms', hint: 'Bram +1. Gain an upgraded Scarecrow.',
        do(ev) { ev.friendship('bram', 1); ev.addCard('scarecrow', true); return "Arms out. Stare at nothing. He nails the hat on with two strokes and steps back. 'Ugly. Good.' It goes in your cart with its head out the side."; } },
      { label: 'Buy the gnome instead', hint: 'Lose 30 coin. Gain the Garden Gnome.', cond: ev => ev.run.coin >= 30 && !has(ev, 'garden_gnome'),
        do(ev) { ev.loseCoin(30); ev.addKeepsake('garden_gnome'); return "It has his eyebrows. He denies this. It goes at the end of the first row and the crows, to their credit, do not come near it."; } },
      { label: 'Wear the hat yourself', hint: 'Gain 5 max Heart.',
        do(ev) { ev.gainMaxHp(5); return "It is too big, it smells of straw, and something about standing very still in it makes you feel like you could take a hit. 'Suits you,' says Bram, meaning it."; } },
    ],
  },

  // ------------------------------------------------------------------ Juniper
  {
    id: 'juniper_bugs', villager: 'juniper', title: 'Knight of the Beetle Jar', seasons: ['spring', 'summer'],
    text: "Juniper has a jar with a beetle in it and a stick with a name. 'This is Sir Pointy,' she says. 'I'm training. Spar me. Or help me catch a bigger one. Or, I dunno. Adults usually just leave.'",
    choices: [
      { label: 'Spar with Sir Pointy', hint: 'Lose 8 Heart. Juniper +2. Gain a Keepsake.',
        do(ev) { ev.damage(8); ev.friendship('juniper', 2); ev.addKeepsake(has(ev, 'lucky_button') ? 'random' : 'lucky_button'); return "She wins. Decisively. Twice. She gives you a button off her coat for being a good sport, and stands very straight."; } },
      { label: 'Catch a bigger one', hint: 'Fight something. Juniper +1. Gain 20 coin.',
        async do(ev) { await ev.fight(seasonOf(ev) === 'summer' ? ['cicada'] : ['burrlet', 'burrlet']); ev.friendship('juniper', 1); ev.gainCoin(20); return "It does not fit in the jar. Juniper is thrilled. She pays you in coins she has clearly been saving for something."; } },
      { label: 'Teach her a stance', hint: 'Juniper +1. Gain Scarecrow Stance.',
        do(ev) { ev.friendship('juniper', 1); ev.addCard('scarecrow_stance'); return "Arms out, stare at nothing. She does it better than you. You keep the stance; she keeps the beetle."; } },
      { label: 'Leave', do() { return "'Told you,' she says to the beetle."; } },
    ],
  },
  {
    id: 'juniper_lost', villager: 'juniper', title: 'Fog on the Lane', seasons: ['fall'],
    text: "Juniper's voice comes out of the fog, small. 'I'm fine! I'm just... fine.' Something with wings laughs at her from the trees.",
    choices: [
      { label: 'Go in after her', hint: 'Fight two Hollowbats. Juniper +2. Gain 6 max Heart.',
        async do(ev) { await ev.fight(['hollowbat', 'hollowbat']); ev.friendship('juniper', 2); ev.gainMaxHp(6); return "She was fine. She was also up a tree. She insists these are the same thing. You walk her home and feel taller."; } },
      { label: 'Call her toward your voice', hint: '50%: Juniper +1, heal 6. 50%: lose 10 Heart.',
        do(ev) { if (ev.rand() < 0.5) { ev.friendship('juniper', 1); ev.heal(6); return "She barrels out of the fog and into your knees. 'I KNEW it was you.'"; } ev.damage(10); return "Something else comes toward your voice first. Juniper arrives a moment later and hits it with Sir Pointy, which helps."; } },
      { label: 'Toss her a lantern', hint: 'Lose 15 coin. Juniper +1. Gain Fog Lantern.', cond: ev => ev.run.coin >= 15,
        do(ev) { ev.loseCoin(15); ev.friendship('juniper', 1); ev.addCard('fog_lantern'); return "She catches it, of course. On the way home she shows you how the light makes the fog step back. 'You keep it. I've got Sir Pointy.'"; } },
    ],
  },
  {
    id: 'juniper_knight', villager: 'juniper', title: 'Dubbing', seasons: ['winter'],
    text: "Juniper kneels in the snow with Sir Pointy across her knees. 'You beat the scarecrow. That makes you the closest thing to a knight round here. So.' She holds out the stick. 'Do it properly.'",
    choices: [
      { label: 'Dub her Sir Juniper', hint: 'Juniper +2. Gain 30 coin, or her Lucky Button if you lack it.',
        do(ev) { ev.friendship('juniper', 2); if (has(ev, 'lucky_button')) ev.gainCoin(30); else ev.addKeepsake('lucky_button'); return "Shoulder, shoulder, head (she flinches). 'Arise.' She arises. She gives you everything in her pockets, which is her whole treasury."; } },
      { label: 'Take her as your squire', hint: 'Gain an upgraded Kite.', cond: ev => f(ev, 'juniper') >= 3,
        do(ev) { ev.addCard('kite', true); return "'Squires carry things.' She carries your kite as far as the gate, flies it once, and hands it back with the string wound properly for the first time in its life."; } },
      { label: "Tell her knights don't kneel in snow", hint: 'Heal 10.',
        do(ev) { ev.heal(10); return "She stands, offended, and drags you to Rue's for cocoa on the grounds that knights also do not freeze."; } },
    ],
  },
  {
    id: 'juniper_weeds', villager: 'juniper', title: 'The Weed War', seasons: ['spring', 'summer'],
    text: "Juniper is knee-deep in Gloamweed behind Rue's, pulling with both hands and narrating. 'This one's the captain. This one's his horse. GET the horse.' The weeds are grey, thorny, and coming up faster than she can pull them.",
    choices: [
      { label: 'Pull weeds with her', hint: 'Lose 4 Heart. Juniper +1. Gain Pull Weeds.',
        do(ev) { ev.damage(4); ev.friendship('juniper', 1); ev.addCard('pull_weeds'); return "Thorns, mud, and a two-hour campaign against the captain's horse. By the end you have the knack and she has a pile as tall as she is. 'We won,' she says. You did."; } },
      { label: 'Lend her the hook', hint: 'Gain Weeding Hook.',
        do(ev) { ev.addCard('weeding_hook'); return "You show her how to get under the root. She shows you how to do it faster. You keep the hook; she keeps the technique, and the captain."; } },
      { label: 'Pay her a coin a weed', hint: 'Lose 12 coin. Juniper +2. Heal 8.', cond: ev => ev.run.coin >= 12,
        do(ev) { ev.loseCoin(12); ev.friendship('juniper', 2); ev.heal(8); return "Nobody has ever actually paid her. She stares at the coins, then at you, then pulls weeds with a ferocity that clears the whole patch while you sit on the wall and eat one of Rue's buns."; } },
    ],
  },
  {
    id: 'pell_juniper_swarm', villager: 'juniper', title: 'The Swarm in the Apple Tree', characters: ['pell'], pool: 'pell', seasons: ['spring', 'summer'],
    text: "Half your hive is hanging off Juniper's apple tree in a lump the size of a bucket, humming. Juniper is underneath with Sir Pointy, holding the line. 'I didn't do anything. They just LIKED it up there. Can I keep them?'",
    choices: [
      { label: 'Climb up and catch them', hint: 'Lose 6 Heart. Gain Catch the Swarm.',
        do(ev) { ev.damage(6); ev.addCard('catch_the_swarm'); return "A sheet, a box, a ladder that Juniper holds with great seriousness, and four stings you will feel tomorrow. The swarm drops into the box like it planned it. It did."; } },
      { label: 'Smoke them down', hint: 'Gain the Bee Brooch, or a random Keepsake if you have it.',
        do(ev) { ev.addKeepsake(has(ev, 'bee_brooch') ? 'random' : 'bee_brooch'); return "Two puffs and they come down slow, in a long golden rope, into the box at the foot of the tree. Juniper finds a tin bee in the grass while you work and pins it on you. 'Medal.'"; } },
      { label: 'Let her keep them', hint: 'Juniper +2. Gain 15 coin.',
        do(ev) { ev.friendship('juniper', 2); ev.gainCoin(15); return "You show her how to build a box and where to stand. She names the queen Sir Buzzington. She pays you for the lesson in coins that were clearly meant for something else, and the hive, when you check a week later, is thriving."; } },
    ],
  },

  // ------------------------------------------------------------------ Pell (the Farmer visits the hives)
  {
    id: 'pell_bees', villager: 'pell', title: 'The Quiet Hive', seasons: ['spring', 'summer'], characters: ['farmer'], pool: 'farmer',
    text: "Pell's hives are usually loud as a church. Today they hum a note you can feel in your teeth. 'Gloam got into the comb,' he says. 'They're frightened. That's worse than angry.'",
    choices: [
      { label: 'Help calm the bees', hint: 'Lose 6 Heart. Pell +1. Choose a rare card.',
        async do(ev) { ev.damage(6); ev.friendship('pell', 1); await ev.cardReward('rare'); return "You get stung four times. The hum drops to a purr. Pell gives you something from the back of the shed without a word."; } },
      { label: 'Sing to them', hint: 'Pell +1. Gain Honeycomb.', cond: ev => f(ev, 'pell') >= 1,
        do(ev) { ev.friendship('pell', 1); ev.addCard('honeycomb'); return "He teaches you the hive song, three notes over and over. The bees settle onto your sleeves like they are listening. He breaks off a comb for you."; } },
      { label: 'Take a jar of honey', hint: 'Gain Clover Honey.',
        do(ev) { ev.addPreserve('clover_honey'); return "'Last of the good stuff.' He does not say what happens when it runs out."; } },
      { label: 'Leave them be', do() { return "You tiptoe away. The hum follows you to the gate and stops there."; } },
    ],
  },
  {
    id: 'pell_song', villager: 'pell', title: 'An Old Song, Badly Remembered', seasons: ['fall'], characters: ['farmer'], pool: 'farmer',
    text: "Pell hums while he works and stops at the same place every time. 'There's a verse about the heron,' he says. 'Wren knew it. I've got the tune and half the words. The other half went somewhere.'",
    choices: [
      { label: 'Hum the missing part', hint: 'Pell +1. Heal 12.',
        do(ev) { ev.friendship('pell', 1); ev.heal(12); return "You make it up. He nods like it was right. Maybe it was. You feel better than a made-up verse should allow."; } },
      { label: 'Ask what the song says', hint: "Pell +1. Gain Wren's Song.", cond: ev => f(ev, 'pell') >= 2,
        do(ev) { ev.friendship('pell', 1); ev.addCard('wrens_song'); return "'It says the heron comes when the valley forgets a name. It says you sing the name back.' He writes the tune on the back of a seed packet. 'That's the half I have.'"; } },
      { label: 'Write it in the Almanac', hint: 'Upgrade a card.',
        async do(ev) { await ev.upgradeCard(); return "The Almanac takes the tune down in a margin and claims it already knew it. It hums it wrong all week."; } },
    ],
  },
  {
    id: 'pell_winter', villager: 'pell', title: 'Bees Asleep', seasons: ['winter'], characters: ['farmer'], pool: 'farmer',
    text: "The hives are wrapped in burlap and quiet. Pell sits beside them like a man at a bedside. 'They'll wake when the year does,' he says. 'If it does.' He holds out the last warm jar.",
    choices: [
      { label: 'Take the jar', hint: 'Gain Clover Honey.', do(ev) { ev.addPreserve('clover_honey'); return "It is still warm from his hands. 'Don't save it,' he says. 'Things saved too long go grey.'"; } },
      { label: 'Sit with him a while', hint: "Pell +1. Gain Pell's Beehive.", cond: ev => f(ev, 'pell') >= 2 && !has(ev, 'beehive'),
        do(ev) { ev.friendship('pell', 1); ev.addKeepsake('beehive'); return "An hour of not much. Then he stands, lifts the smallest hive, and puts it in your arms. 'They like you. Don't tell the others.'"; } },
      { label: 'Tell him the year will turn', hint: 'Pell +1. Heal 10.',
        do(ev) { ev.friendship('pell', 1); ev.heal(10); return "'Wren used to say that.' He pours you a cup of something with honey in it. 'She was usually right.'"; } },
    ],
  },
  {
    id: 'pell_swarm_farm', villager: 'pell', title: 'Visitors in the Turnips', seasons: ['spring', 'summer'], characters: ['farmer'], pool: 'farmer',
    text: "There is a swarm on your gatepost the size of a hat, and Pell is standing under it with his hands in his pockets, looking pleased. 'They chose you. That's rare. I can hive them, or you can keep the pot they came in, or we can leave them and see what they do.'",
    choices: [
      { label: 'Help him hive them', hint: 'Pell +1. Gain Bumblebee.',
        do(ev) { ev.friendship('pell', 1); ev.addCard('bumblebee'); return "Box, sheet, patience. One fat bumblebee refuses the box on principle and follows you back to the house instead. It seems to think it works for you now."; } },
      { label: 'Keep the pot', hint: 'Gain the Honey Pot, or Clover Honey if you have it.',
        do(ev) { if (has(ev, 'honey_pot')) { ev.addPreserve('clover_honey'); return "'Then take a jar for your trouble.' Warm, and gone by supper."; } ev.addKeepsake('honey_pot'); return "Stoneware, sticky, and two bees asleep in the lid who do not intend to leave. Pell says they will follow you into fights. Pell is right."; } },
      { label: 'Leave them and see', hint: '50%: gain 25 coin. 50%: lose 6 Heart.',
        do(ev) { if (ev.rand() < 0.5) { ev.gainCoin(25); return "They stay a week, fill the gatepost with comb, and move on. Odile buys the comb by the pound and asks no questions."; } ev.damage(6); return "They stay a week and take exception to the hoe. You learn something about running in a straight line."; } },
    ],
  },

  // ------------------------------------------------------------------ The Farmer (Pell's runs only)
  {
    id: 'farmer_gate', villager: 'farmer', title: 'The Farm at the Bend', characters: ['pell'], pool: 'pell',
    text: "The Farmer is leaning on the gate of Wren's place, mud to the knees, hoe over one shoulder, looking at you the way people look at a beekeeper: carefully, from the side. 'Pell. The stag's mended and I've got turnips coming out of my ears. Take something. Take anything. Take the turnips.'",
    choices: [
      { label: 'Take the turnips', hint: 'Gain an upgraded Turnip Seeds.',
        do(ev) { ev.addCard('turnip_seeds', true); return "A pocketful, sorted by size, angrier than most. 'Plant them by the hives. They like the company.'"; } },
      { label: 'Borrow the hoe', hint: 'Gain an upgraded Hoe Swing.',
        do(ev) { ev.addCard('hoe_swing', true); return "'Swing from the hips.' You swing from the hips. Something in the hedge yelps and goes home. 'Told you.'"; } },
      { label: 'Trade honey for jam', hint: 'Gain Strawberry Jam. Farmer +1.',
        do(ev) { ev.addPreserve('strawberry_jam'); ev.friendship('farmer', 1); return "A jar for a jar, over the gate, the way it has always been done. Neither of you mentions that the Farmer's jar is bigger."; } },
      { label: 'Wave and walk on', hint: 'Heal 6.',
        do(ev) { ev.heal(6); return "The Farmer waves back with the hoe, which is dangerous, and goes back to the turnips. It is a good thing to see, the place worked again. You feel it in your feet the whole way up the lane."; } },
    ],
  },
  {
    id: 'farmer_plots', villager: 'farmer', title: 'Three Plots and a Fourth', characters: ['pell'], pool: 'pell', seasons: ['summer', 'fall'],
    text: "The Farmer has dug a fourth bed beside Wren's three and is standing over it with the air of someone who has done something slightly illegal. 'Don't tell the Almanac. It gets funny about the number three.' A pause. 'You want it? I can dig another.'",
    choices: [
      { label: 'Take the raised bed', hint: 'Gain Raised Bed.',
        do(ev) { ev.addCard('raised_bed'); return "Four planks, a wheelbarrow of the good dirt, and instructions delivered at length. It comes apart and goes in your cart. The Almanac, when you get back to it, sniffs."; } },
      { label: 'Plant it together', hint: 'Farmer +1. Gain 6 max Heart.',
        do(ev) { ev.friendship('farmer', 1); ev.gainMaxHp(6); return "An afternoon on your knees in Wren's dirt with the bees working the clover behind you. You are not sure what you planted. Something good. You feel it for weeks."; } },
      { label: 'Ask about the Gloam up the hill', hint: 'Farmer +1. Upgrade a card.', cond: ev => f(ev, 'farmer') >= 1,
        async do(ev) { ev.friendship('farmer', 1); await ev.upgradeCard(); return "'Weeds first. Then whatever planted them.' The Farmer shows you the hook, the angle, the twist. It works on more than weeds."; } },
    ],
  },

  // ------------------------------------------------------------------ Old Mossy (the through-line)
  {
    id: 'mossy_edge', villager: 'mossy', title: 'The Hermit at the Hedge', seasons: ['spring'],
    text: "Old Mossy sits where the meadow gives up and the Hollow begins, whittling something he keeps not finishing. He does not look up. 'Wren's kin. Same walk.' A long pause. 'You've got the book that talks. Don't let it lie to you. Books do.'",
    choices: [
      { label: 'Offer him tea', hint: 'Lose 10 coin. Mossy +1.', cond: ev => ev.run.coin >= 10,
        do(ev) { ev.loseCoin(10); ev.friendship('mossy', 1); return "He takes it like it might bite. Then drinks it in one go. 'Hm.' That is, you will learn, very high praise."; } },
      { label: 'Ask about the Gloam', hint: 'Mossy +1.',
        do(ev) { ev.friendship('mossy', 1); return f(ev, 'mossy') >= 2 ? "'It's what's left when nobody remembers to tend a thing. Comes up where the tending stopped.' He looks at the Hollow. 'She tended it. All of it. Then she couldn't.'" : "'Grey,' he says. 'Wet. Gets in.' He goes back to whittling. You get the feeling that was the short version."; } },
      { label: 'Ask about Nana', hint: 'Mossy +1.', cond: ev => f(ev, 'mossy') >= 1,
        do(ev) { ev.friendship('mossy', 1); return "'Not yet.' He does not say it unkindly. 'Mend a few more. Then ask.'"; } },
      { label: 'Leave him be', do() { return "He nods like you passed a test you did not know you were taking."; } },
    ],
  },
  {
    id: 'mossy_hollow', villager: 'mossy', title: 'What the Gloam Is', seasons: ['summer', 'fall'],
    text: "Mossy has a fire going at the Hollow's lip, feeding it dry stalks one at a time. 'You've been mending them,' he says. 'Good. None of it's their fault. Never was.' The fog beyond him moves like it is breathing.",
    choices: [
      { label: 'Ask what it is', hint: 'Mossy +1.',
        do(ev) { ev.friendship('mossy', 1); return "'Forgetting,' he says. 'Plain as that. The valley forgets a thing and the thing goes grey. Wren tended the remembering, for all of us. Then she went into the Hollow, and nobody tended her.'"; } },
      { label: 'Ask what happened to Nana', hint: 'Mossy +1. Gain the Pressed Flower.', cond: ev => f(ev, 'mossy') >= 2 && !has(ev, 'pressed_flower'),
        do(ev) { ev.friendship('mossy', 1); ev.addKeepsake('pressed_flower'); return "'She went down to have a word with it. Took a lantern and a frostlily.' He hands you something flat wrapped in cloth. 'Lily came back up. On its own. Took it a season.' He feeds the fire. 'She's the heron now. Or the heron's her. I stopped being sure which.'"; } },
      { label: 'Sit and feed the fire', hint: 'Heal 15. Remove a card from your deck.',
        async do(ev) { ev.heal(15); await ev.removeCard(); return "'Put something on it you're done with.' You do. It burns clean. He grunts approval and you feel lighter walking back."; } },
      { label: 'Go', do() { return "'Mind the fog,' he says, which from Mossy is a whole conversation."; } },
    ],
  },
  {
    id: 'mossy_winter', villager: 'mossy', title: 'The Last Page', seasons: ['winter'],
    text: "Snow on Mossy's hat and he has not brushed it off. 'The heron's hers,' he says. 'Her grief, more or less. Big bird, big grief. It hurts you by accident. What it wants is to be remembered. Tell it something true.'",
    choices: [
      { label: 'Ask what to say', hint: 'Mossy +1. Gain 10 max Heart. Upgrade two cards.', cond: ev => f(ev, 'mossy') >= 2,
        async do(ev) { ev.friendship('mossy', 1); ev.gainMaxHp(10); await ev.upgradeCard(); await ev.upgradeCard(); return "'Her name. The whole one. Nobody's said it out loud since.' He tells you what it is. You had never heard the middle part. 'Say it slow. Then plant something.'"; } },
      { label: 'Take the thing he has been whittling', hint: 'Mossy +1. Gain 6 max Heart.',
        do(ev) { ev.friendship('mossy', 1); ev.gainMaxHp(6); return "A little wooden wren. Finished, finally. He puts it in your hand and closes your fingers over it. 'Took me a year. Took the year.'"; } },
      { label: 'Say nothing. Sit.', hint: 'Heal 20.',
        do(ev) { ev.heal(20); return "The snow comes down. The Hollow breathes. After a long while he says, 'She'd have liked you,' and that is all, and it is enough."; } },
    ],
  },
  {
    id: 'mossy_weeds', villager: 'mossy', title: 'Where the Tending Stopped', seasons: ['fall', 'winter'],
    text: "Gloamweed, waist high, all along the Hollow's lip, grey and thorny and moving a little when the wind is not. Mossy is cutting it back with a hook older than the valley. 'Comes up where nobody's looked for a while,' he says. 'Burn it, dig it, or leave it. Leaving it's what everybody did.'",
    choices: [
      { label: 'Burn it back', hint: 'Lose 6 Heart. Mossy +1. Remove a card from your deck.',
        async do(ev) { ev.damage(6); ev.friendship('mossy', 1); await ev.removeCard(); return "It burns green and stinks and you get a lungful. Under the ash: bare, good, black earth, waiting. 'Put something on the fire you're done with,' he says, and you do."; } },
      { label: 'Dig it out', hint: 'Gain 25 coin. A Thistle gets into your deck.',
        do(ev) { ev.gainCoin(25); ev.addCard('thistle'); return "Roots like rope. Under them, of all things, a jar of Wren's coin, buried against a bad year. A thistle comes up with it and will not be put down."; } },
      { label: 'Ask why it grows here', hint: 'Mossy +1. Gain the Wax Seal, or heal 12 if you have it.',
        do(ev) { ev.friendship('mossy', 1); if (has(ev, 'wax_seal')) { ev.heal(12); return "'Because nobody comes. Same reason you came.' He gives you the flask, which is worse than the remedy and better for you."; } ev.addKeepsake('wax_seal'); return "'Because nobody comes.' He digs in a pocket and hands you a lump of wax with a bee pressed in it. 'Pell's. Seal a thing and it stays sealed, and the grey works on it slow instead of on you.'"; } },
    ],
  },
  {
    id: 'pell_mossy_verse', villager: 'mossy', title: 'The Verse About the Heron', characters: ['pell'], pool: 'pell', seasons: ['fall', 'winter'],
    text: "Mossy hears you before he sees you. 'That's the tune,' he says, not turning round. 'Wren's tune. You've got the words wrong in the middle.' He has never, in anyone's memory, said this many words in a row. 'Sit. I'll tell you the middle. Then you go and sing it at the bird.'",
    choices: [
      { label: 'Learn the middle', hint: 'Mossy +1. Gain The Old Song.',
        do(ev) { ev.friendship('mossy', 1); ev.addCard('the_old_song'); return "He sings it. Badly, flat, with his eyes shut, and it is the most important thing anyone has given you. The bees, which have been quiet, start up again in the box on your back, in the right key."; } },
      { label: 'Ask about Wren', hint: 'Mossy +1. Upgrade a card.', cond: ev => f(ev, 'mossy') >= 1,
        async do(ev) { ev.friendship('mossy', 1); await ev.upgradeCard(); return "'She kept bees before you did. Two hives, by the birches. Grey got them first.' He looks at your box. 'Yours are louder. Good.'"; } },
      { label: 'Sit and hum it with him', hint: 'Heal 16.',
        do(ev) { ev.heal(16); return "The two of you and the fire and the wrong words in the middle, over and over, until the wrong words are the words and the Hollow has stopped breathing quite so hard."; } },
    ],
  },
];
