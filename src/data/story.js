// Bramblewick: story text. The Almanac narrates. Warm, a little funny, wistful about Nana.
// 2.0: CHARACTER_STORY carries Pell's intro and ending (the Farmer keeps INTRO/ENDING);
// VILLAGERS gains the Farmer (a villager on Pell's runs); VILLAGER_LINES holds bee/weed reactions
// the UI can drop in wherever a villager gets a spare line.

export const INTRO = [
  { speaker: 'almanac', text: "Ahem. Is this thing on? Good. I'm the Almanac. Wren's Almanac, if we're being formal, and I would rather we weren't." },
  { speaker: 'almanac', text: "Here's the trouble. The year has stopped. It has been Spring in Bramblewick for so long the daffodils look embarrassed." },
  { speaker: 'almanac', text: "Something grey came up out of the Hollow under the hill. It gets into the critters and makes them mean, and it gets into pages and makes them blank. Four of mine are gone. One per season. I feel drafty." },
  { speaker: 'almanac', text: "Wren left you the farm, three good plots of soil, and a hoe with opinions. Plant things. Whack things. Mend whatever is grumpy. We will get the year turning." },
  { speaker: 'almanac', text: "One rule. Nothing dies here. When you win, the grey comes off and they go home. That was her rule, so it's mine, so now it's yours." },
];

export const SEASONS = {
  spring: {
    title: 'Spring', subtitle: 'The Stuck Season', color: '#7fc26b',
    intro: [
      { speaker: 'almanac', text: "Spring. Again. The same eleven weeks of it, going round like a song nobody can finish." },
      { speaker: 'almanac', text: "The Rootstag has my Spring page. Big fellow, up on the hill, antlers full of roots. He used to let children ride him. Now he mostly glowers." },
      { speaker: 'almanac', text: "Rain helps the garden most this time of year. Turnips are quick. Trust the turnips. And if something grey comes up in a plot you didn't plant, that's a weed. Pull it." },
    ],
    outro: [
      { speaker: 'almanac', text: "There. The page slides back in like it never left and I feel about six ounces heavier. Wonderful." },
      { speaker: 'almanac', text: "Listen. Hear that? Nothing. The daffodils have stopped. Something warmer is coming up the valley road." },
      { speaker: null, text: "The Rootstag walks into the birches. Behind him, for the first time in a year, the blossoms let go." },
    ],
  },
  summer: {
    title: 'Summer', subtitle: 'The Long Noon', color: '#f2b53a',
    intro: [
      { speaker: 'almanac', text: "Summer. Hot. Bright. The kind of light that makes a book want to lie face-down in the grass." },
      { speaker: 'almanac', text: "The Scorchmoth has my Summer page and she has pulled the sun in close, like a blanket. Droughts. Expect droughts. Bring water, or bring something that makes its own." },
      { speaker: 'almanac', text: "Odile has opened the stall again. She says she never closed. She closed." },
    ],
    outro: [
      { speaker: 'almanac', text: "The moth goes up and the heat goes with her and the whole field exhales. I may have exhaled too. Books can, a little." },
      { speaker: 'almanac', text: "Half my pages home. The valley is starting to look like itself. People are leaving their doors open." },
      { speaker: null, text: "That night the first cool wind in a year comes down off the hill, and every window on the lane is lit." },
    ],
  },
  fall: {
    title: 'Fall', subtitle: 'The Harvest That Wasn\'t', color: '#e8873a',
    intro: [
      { speaker: 'almanac', text: "Fall. My favorite, and I say that about every season, and I mean it every time." },
      { speaker: 'almanac', text: "Hollowjack has my Fall page. Wren built him out of straw and a broom handle to guard the field. He guards it still. He has just forgotten who he is guarding it for. His little ones are out sowing grey in every bed they can find." },
      { speaker: 'almanac', text: "Wind and fog this time of year. The fog hides what the critters mean to do. Read them while you can." },
    ],
    outro: [
      { speaker: 'almanac', text: "Hollowjack takes up his post at the field's edge, lantern lit, coat buttoned. He waves. I think he has been wanting to wave for a while." },
      { speaker: 'almanac', text: "One page left. It's under the hill. I would be lying if I said I wasn't nervous, and I promised not to lie to you." },
      { speaker: null, text: "The leaves come down all at once, the way they are supposed to, and the valley goes quiet in the good way." },
    ],
  },
  winter: {
    title: 'Winter', subtitle: 'The Hollow', color: '#8fb9d9',
    intro: [
      { speaker: 'almanac', text: "Winter. The garden will be slow. Frost stops growth cold, and you will need to make your own weather, or your own warmth, or both." },
      { speaker: 'almanac', text: "At the bottom of the Hollow there is still water, and in the water stands a heron made of night. It has my last page. It has had it since she went down there." },
      { speaker: 'almanac', text: "Mossy says it is hers. I did not want to write that down. I have written it down." },
    ],
    outro: [
      { speaker: null, text: "The last page settles in. The Almanac does not say anything for a long moment, which has never happened before." },
    ],
  },
};

export const ENDING = [
  { speaker: 'almanac', text: "It was grief. That's what the Gloam was, underneath the grey. Hers, for the valley she thought she was leaving untended. The valley's, for her. Nobody said it out loud, so it went under the hill and got bigger." },
  { speaker: 'almanac', text: "You said her name. The whole one. I have it written here now, on the Winter page, in her own hand. She must have written it before she went down. She knew someone would need it." },
  { speaker: 'almanac', text: "Underneath the name it says: 'Tend it.' Two words. She never did say what. I think she meant everything." },
  { speaker: null, text: "The heron lifts off over the hill. Where it was standing, the ice on the still water goes, and under the ice, green." },
  { speaker: null, text: "In the morning the year turns. Odile shouts about it from the barge. Rue puts the pot on. Bram tells the anvil. Juniper is already up the hill with Sir Pointy, checking the birches for the stag." },
  { speaker: null, text: "Pell's bees wake. Mossy comes down out of the Hollow for the first time anyone can remember, and sits on the farmhouse step, and does not leave." },
  { speaker: 'almanac', text: "Three plots of soil. A hoe with opinions. A whole year in front of us, and it turns now, and it keeps turning." },
  { speaker: 'almanac', text: "Plant something. She'd want to see what you grow." },
];

// Per-character story. The Farmer uses INTRO/ENDING above. Pell unlocks once the Rootstag is mended,
// so his intro assumes the Farmer has been up the hill already and the year is turning; his ending is
// the heron's, sung.
export const CHARACTER_STORY = {
  pell: {
    intro: [
      { speaker: 'almanac', text: "Pell. Good. Put me down somewhere the bees can't get at my spine, they've had a go before." },
      { speaker: 'almanac', text: "You know the trouble. The year stuck, the Gloam, the pages. The Farmer got the stag down off the hill, bless them, and then went back to the turnips, which is the correct thing to do with a farm." },
      { speaker: 'almanac', text: "But somebody has to walk the whole year round again, or it stops turning, and the hives volunteered you. I heard them. It was unanimous." },
      { speaker: 'almanac', text: "So. You've got a box of bees on your back, a smoker, a veil, and the old songs, or most of them. Bees don't leave a fight once they're in it. Every bloom feeds the hive. The honey pays for the rest." },
      { speaker: 'almanac', text: "Same rule as ever. Nothing dies. When you win, the grey comes off and they go home. You always kept to that, even with the hornets. Especially with the hornets." },
    ],
    ending: [
      { speaker: 'almanac', text: "You sang it. The whole thing, the verse in the middle and all, with the wrong words where the wrong words go. And the heron listened. Nobody's sung to it in years." },
      { speaker: 'almanac', text: "It was grief, under the grey. Hers, and the valley's, and I think a little of yours. Two hives by the birches, once. You never said. You didn't have to." },
      { speaker: null, text: "The stars go out of its wings one at a time, and a grey heron, ordinary and enormous, stands in shallow water and says her name back to you. The whole one. In tune." },
      { speaker: null, text: "The bees come out of the box on their own, in a long gold rope, and settle on its neck like a scarf. It lets them. It lifts off over the hill with a beard of bees and the first light in months on its back." },
      { speaker: null, text: "In the morning the year turns. Rue puts the pot on. Odile rolls a barrel out. Juniper knights three bees and a beetle. The Farmer comes up the lane with a sack of turnips and no idea what to say, and says it anyway." },
      { speaker: null, text: "Mossy comes down out of the Hollow and sits by the hives, and hums, badly, flat, and does not leave." },
      { speaker: 'almanac', text: "Two hives by the birches again. I've written it on the Winter page, under her name, in your hand. It says: 'Tend it.' You already do." },
      { speaker: 'almanac', text: "Sing something. She'd want to hear how it goes." },
    ],
  },
};

export const DEFEAT_LINES = [
  "You wake up in Nana's bed with the quilt tucked to your chin. The Almanac is on the pillow, pretending it wasn't worried.",
  "The grey cracks. Then it's morning and Rue is banging a spoon on a pot outside the window. 'UP.'",
  "You come to on the farmhouse step with a turnip in each hand. No memory of the turnips. They seem pleased to see you.",
  "The Almanac, gently: 'That one had your number. Next time, it won't.' Then, less gently: 'Also you left the gate open.'",
  "Somebody carried you home. The mud on your boots is mixed with something lilac. The critters, it seems, remember the rule too.",
  "Morning. Kettle on. The Almanac has drawn a small, encouraging turnip in the margin of the page you were on.",
  "You dream of the heron. It says her name wrong. You wake up angry, which is a fine way to wake up.",
  "The farm is still here. The plots are still here. The year is still stuck, which means there is still time.",
  "You wake up with bees on the ceiling. Pell's, or yours, or both. They found you and they brought you home and they are not going to discuss it.",
  "There is a Gloamweed in the pot on the sill. Somebody has tied a ribbon round it. Juniper, probably. It looks less sure of itself with the ribbon.",
];

export const VILLAGERS = {
  odile: {
    name: 'Odile', role: 'Keeps the market stall. Ran a river barge for forty years and will tell you about all of them.', sprite: 'vil_odile',
    greeting: [
      "'Wren's kin, is it. Prices are on the crate. Don't haggle, I'm bad at it and I'll win.'",
      "'Back again. Good. The turnips missed you, and I was starting to.'",
      "'There you are. I put a jar aside. Don't tell the others, they'll all want jars.'",
      "'My favorite customer. I said it. Nobody heard, so it doesn't count.'",
    ],
  },
  rue: {
    name: 'Auntie Rue', role: 'Herbalist. Keeps the Hearth fire and the soup pot, both of which have never gone out.', sprite: 'vil_rue',
    greeting: [
      "'Sit. Eat. Talk after, or don't. The fire doesn't mind.'",
      "'Look at you. Grey under the eyes. Sit, I've got the good bowl out.'",
      "'Wren's chair is free. It's always free. Sit in it, she'd want it warm.'",
      "'Family sits by the fire, not by the door. Go on, then.'",
    ],
  },
  bram: {
    name: 'Bram', role: 'Tinker and smith. Fixes anything. Talks to his anvil, which answers, according to Bram.', sprite: 'vil_bram',
    greeting: [
      "'Tools on the bench. Don't touch the hot ones. You'll know.'",
      "'Hand it over. The anvil's been asking after your hoe.'",
      "'Made you a thing. It's in the pile. It's the good pile.'",
      "'Anvil says hello. Anvil doesn't say hello to anybody. Don't let it go to your head.'",
    ],
  },
  juniper: {
    name: 'Juniper', role: 'Nine years old, fearless, knight-in-training. Collects bugs and grudges.', sprite: 'vil_juniper',
    greeting: [
      "'Are you the farmer? You don't look like a farmer. Where's your sword?'",
      "'It's you! Look, Sir Pointy has a new notch. That one's yours.'",
      "'I told everyone you'd come back. Nobody bet against me. They know better now.'",
      "'Squire reporting. Well. Knight reporting. Sir Juniper reporting. What are we mending today?'",
    ],
  },
  pell: {
    name: 'Pell', role: 'Beekeeper. Soft-spoken. Knows the old songs, or most of them.', sprite: 'vil_pell',
    greeting: [
      "'Mind the bees. They're not themselves. None of us are.'",
      "'They hum different when you're around. Calmer. Wren had that too.'",
      "'Sit. I'll do the verse I've got. You do the one you made up. It's growing on me.'",
      "'The hive knows you now. That's forever, I'm afraid. Bees don't forget.'",
    ],
  },
  mossy: {
    name: 'Old Mossy', role: 'Hermit at the edge of the Hollow. Knew Nana. Knows what the Gloam is, and is not in a hurry to say.', sprite: 'vil_mossy',
    greeting: [
      "'...'",
      "'Hm. You again. Sit or don't.'",
      "'Wren's kin. Same walk. Same stubborn.' He moves over on the log.",
      "'Was hoping it'd be you.' He has already poured two cups.",
    ],
  },
  // The Farmer is a villager on Pell's runs (they mended the stag and went back to the turnips).
  farmer: {
    name: 'The Farmer', role: "Wren's kin. Got the stag down off the hill, then went back to the turnips, which is the correct thing to do with a farm.", sprite: 'portrait_farmer',
    greeting: [
      "'Pell! Mind the hoe. It's got opinions.'",
      "'Bees all right? Good. Turnips are all right. Everything's all right, mostly. Take some turnips.'",
      "'Come and see the fourth bed. Don't tell the Almanac.'",
      "'Sing us the one about the heron. I've got the words wrong in the middle, you do it.'",
    ],
  },
};

// Spare lines about the 2.0 things (bees, weeds, scarecrows, the second character). The UI may use them
// as toasts, Hearth/Market extras, or compendium flavor. Keyed by topic, then villager.
export const VILLAGER_LINES = {
  bees: {
    odile: "'Bees on the bunting again. I don't mind. They pay in honey and never haggle.'",
    rue: "'Two of them asleep in the sugar bowl. I've left them. Nobody's stealing sugar with those two on it.'",
    bram: "'One got in the forge. Sat on the anvil. Anvil liked it. I'm not jealous.'",
    juniper: "'I knighted six. They're Sir Buzz, Sir Buzz, Sir Buzz, Sir Buzz, Sir Buzz, and Gerald.'",
    pell: "'They'll follow you now. Not my doing. Nothing to be done about it.'",
    mossy: "'Wren kept two hives, by the birches. Grey got them first. Yours are louder.'",
    farmer: "'They came with the pot. They stay for the fights. I've stopped asking.'",
  },
  weeds: {
    odile: "'Gloamweed's coming up between the crates. I've been pulling it and it's been coming back and we've reached an understanding.'",
    rue: "'Grey weeds in the herb bed. Thorny ones. I boiled one for the pot to see. Don't.'",
    bram: "'I've made a hook for it. Get under the root, twist, out. Works on more than weeds.'",
    juniper: "'The captain's horse is back. GET the horse.'",
    pell: "'They grow where nobody's looked for a while. Same as the grey. Same as most things.'",
    mossy: "'Comes up where the tending stopped. Pull it, and then stand there a minute, so it knows somebody's looking.'",
    farmer: "'Weeds first. Then whatever planted them. Then tea.'",
  },
  scarecrow: {
    bram: "'Built a small one. This one stays small. Hold the arms.'",
    juniper: "'Arms out. Stare at nothing. I do it better than you. Everyone says.'",
    rue: "'It's wearing Wren's coat. I know. I gave it the coat. The coat wanted a job.'",
  },
  pellRun: {
    odile: "'The beekeeper's walking the year. About time somebody who can sing had a go.'",
    rue: "'Pell. Sit. You're thinner than the bees. Eat, then hum.'",
    juniper: "'Do the bees do what you say? Can I have one? Can I have Gerald?'",
    mossy: "'Wren's tune. You've got the words wrong in the middle. Sit.'",
  },
};

export const HEARTH_LINES = [
  "'Rest or cook. Both if you've got the time. Nobody's got the time. Rest or cook.'",
  "'Wren's chair. Sit in it. Don't argue, I've had this fight with her and I won that one too.'",
  "'The pot's been on since your grandmother's grandmother. Don't stir it. Stirring's how it knows you're new.'",
  "'You can upgrade a card by the fire. That's what the fire's for. That and warmth. Mostly warmth.'",
  "'You've got grey on your collar. Sit close. It comes off in the heat, mostly.'",
  "'There's bread. There's always bread. Bread's the one thing the Gloam never got to.'",
  "'Sleep. I'll wake you if the year turns. I'll wake you if it doesn't, too.'",
  "'Every long night, somebody sits in that chair. This year it's you. Good.'",
  "'Eat the crust. It's where the courage is. Wren always ate the crust.'",
  "'The kettle's early. It's always early. It likes to be ready.'",
  "'Two bees asleep in the sugar bowl. Leave them. Nobody's stealing sugar with those two on it.'",
  "'Grey weeds in the herb bed again. I pulled them. I'll pull them tomorrow. That's gardening.'",
  "'Honey cake on the sill. One's yours. Don't touch the third. Nobody knows about the fourth.'",
];

export const MARKET_LINES = [
  "'Prices on the crate. Coin in the tin. No credit, no sob stories, one sob story if it's good.'",
  "'That jar? Don't know what's in it. Bought it off a barge. Good barge, though.'",
  "'Seeds are by the door. Wren's varieties. Don't let the labels fool you, she never labeled anything right.'",
  "'You want a keepsake, you go beat a Thicket. I sell jars and dry goods and opinions.'",
  "'Bram's tools, my prices. Don't tell him the prices.'",
  "'Every coin you spend here goes to the barge fund. There's no barge fund. It goes to soup.'",
  "'I ran a river for forty years. Now I run a stall. Same river, smaller boat.'",
  "'Buy something or hold the bunting, it's coming loose again.'",
  "'You look like you could use a jar of something red. Everybody could. That's why it's red.'",
  "'Come back when you've got coin. Come back when you haven't, too, but bring gossip.'",
  "'Crow had the tin yesterday. Got it back. Most of it. Don't ask about the rest.'",
  "'Bees on the bunting. They pay in honey and never haggle. Best customers I've got. Present company included.'",
  "'Barometer's off the barge. Tap it twice, then believe it. Same as me.'",
];

export const TIPS = [
  "Seeds go in the leftmost empty plot. Plant what you want to bloom first, first.",
  "Rain grows plants by 2, Sun and Wind by 1, Drought and Frost by nothing. Read the badge before you plant.",
  "A trample destroys a plant. A nibble only takes growth off. Both are telegraphed. Harvest early if the intent looks hungry.",
  "Perennials (Blueberry, Mint) bloom and stay. That is a plot spent for the whole fight. Decide if it earns its keep.",
  "Wind adds 2 to every attack, yours and theirs. Cards that hit twice love it. Critters that hit twice also love it.",
  "Frost gives everyone 3 extra Bark whenever they gain Bark. Critters that block will block harder.",
  "Fog hides critter intents. A Fog Lantern or Tin Weathervane turns bad weather into a good turn.",
  "Sturdy is permanent. Every Bark card you play for the rest of the fight gets bigger. Early Sturdy is good Sturdy.",
  "Wilt ticks down each turn, so 5 Wilt does 15 total. Double it with Black Rot before it decays.",
  "Compost cards leave the fight when played. Compost Heap and Old Boot make that a feature.",
  "Keep cards stay in hand between turns. Hold a Harvest Basket until the moment before a trample.",
  "The Sunwasp gets stronger whenever a plant blooms. Sometimes the right garden is a small one.",
  "Hollowjack heals by nibbling your plants. Hit him hard when your plots are empty, and plant right after.",
  "The Nightheron sends a Gloom card into your deck every time a plant blooms. Fewer, bigger blooms.",
  "Villager friendship carries over between years. Bring Mossy tea. Twice.",
  "Nothing dies. Mended critters go home. Hollowjack goes back to guarding the field, which he prefers.",
  "The Hearth heals or upgrades, one per visit. Rue is very firm about this.",
  "A Scarecrow puts Guard on a plot. The next trample knocks the scarecrow down instead of the plant. Nibbles still get through.",
  "Gloamweeds go in your empty plots, right-most first. Fill your plots and there is nowhere for them to grow.",
  "A weed blooms in 3 growth and it hurts. Weeding Hook and Pull Weeds clear the lot; a Brass Bell rings them out before they root.",
  "Bees never leave. Every Bee stings for 1 at the end of your turn, straight through Bark. A long fight is a Bee's favorite fight.",
  "Pell's Honey comes from blooms and goes into cake, mead and wax. It keeps between turns, so save it for the turn that needs it.",
  "Locked weather skips the next roll. Seed the Clouds before a Pumpkin blooms; Deep Frost before a Frostlily.",
  "Some critters steal coin instead of Heart. Mend the thief first if Odile's stall is next on the map.",
  "Season Keepers change their pattern as they lose Heart. The line they say is the warning. Read the new intents before you commit.",
  "Friendship unlocks cards for the reward pools. Bram at tier 2 puts the Heirloom Hoe in the barrel; Pell at tier 3 teaches the whole Old Song.",
  "Mend a Season Keeper and it adds a card to your pools for good. The Rootstag gives up the Raised Bed.",
];
