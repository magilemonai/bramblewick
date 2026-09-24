// Villager events, foraging, Odile's market, Rue's hearth. Villager scenes play the villager's motif.
import { h, img, toast, setTip } from '../dom.js';
import { Hud } from '../hud.js';
import * as CV from '../cardview.js';

const { renderCard, cardName } = CV;
import { KEEPSAKES } from '../../data/keepsakes.js';
import { PRESERVES } from '../../data/preserves.js';
import { EVENTS } from '../../data/events.js';
import { VILLAGERS, HEARTH_LINES, MARKET_LINES } from '../../data/story.js';
import { E, tierOf, markSeen } from './deps.js';
import { DEFEAT } from './combat.js';

export const EventScreens = {
  // The event ctx (also the keepsake pickup() API): engine/runapi.js rules with this UI's pickers,
  // fights and feedback plugged in.
  evApi() {
    const g = this;
    return E.makeRunApi(this.run, {
      meta: this.meta,
      pickers: {
        chooseCard: (title, insts, o) => g.chooseCard(title, g.offer(insts), o),
        pickDeckCard: (title, filter, preview) => g.pickFromDeck(title, filter, preview),
      },
      fight: group => g.battle('fight', group, { fromEvent: true }),
      notify: (kind, d) => g.runNotify(kind, d || {}),
    });
  },
  runNotify(kind, d) {
    const cn = inst => cardName(inst);
    switch (kind) {
      case 'coin': if (d.n > 0) this.audio.sfx('coin'); break;
      case 'heal': this.audio.sfx('heal'); break;
      case 'damage': this.audio.sfx('player_hurt'); this.scenery?.shake?.(5); this.haptic(30); break;
      case 'maxHp': if (d.n > 0) this.audio.sfx('heal'); break;
      case 'addCard': markSeen(this.meta, 'cards', d.inst.id); this.saveMeta(); toast(`${cn(d.inst)} added to your deck`); break;
      case 'removeCard': toast(`${cn(d.inst)} removed`); break;
      case 'upgradeCard': this.audio.sfx('upgrade'); toast(`${cn(d.inst)}!`); break;
      case 'transformCard': if (d.to) markSeen(this.meta, 'cards', d.to); toast(`${cn(d.from)} became ${d.to ? cn({ id: d.to }) : 'compost'}`); break;
      case 'keepsake': markSeen(this.meta, 'keepsakes', d.id); this.saveMeta(); this.audio.sfx('buy'); toast(`Keepsake: ${KEEPSAKES[d.id]?.name || d.id}`); break;
      case 'preserve': if (d.ok) this.audio.sfx('open'); else toast('Your jar shelf is full'); break;
      case 'friendship': {
        const f = this.meta.friendship[d.villager] || 0;
        this.saveMeta();
        if (d.n > 0) toast(`${VILLAGERS[d.villager]?.name || d.villager} likes you a little more`);
        if (tierOf(f) > tierOf(Math.max(0, f - d.n))) { this.motif(d.villager); this.stinger('unlock'); }
        break;
      }
      default: break;
    }
  },

  pickEvent() { return E.pickEvent(this.run) || EVENTS[0]; },
  villagerEvent() { this.runEvent(this.pickEvent()); },

  runEvent(ev) {
    const api = this.evApi();
    const vil = VILLAGERS[ev.villager];
    const f = api.getFriendship(ev.villager);
    const hud = new Hud(this);
    const hearts = vil ? heartsEl(f) : null;
    const body = h('div');
    const text = typeof ev.text === 'function' ? ev.text(api) : ev.text;
    body.append(...String(text).split(/\n\n+/).map(p => h('p', p)));
    const choices = h('div.choices');
    let el;
    for (const ch of ev.choices) {
      let ok = true;
      try { ok = !ch.cond || ch.cond(api); } catch { ok = false; }
      const b = h('button.btn', { disabled: !ok }, ch.label, ch.hint ? h('small', ch.hint) : null);
      b.addEventListener('click', async () => {
        choices.querySelectorAll('button').forEach(x => (x.disabled = true));
        let result = '';
        try { result = await ch.do(api); } catch (err) {
          if (err === DEFEAT) { this.defeat(); return; }
          console.error('event', ev.id, err);
        }
        if (this.app.firstChild !== el) { await this.show(el, { scene: { kind: 'event' }, music: 'event' }); }
        hud.update();
        choices.innerHTML = '';
        if (result) body.append(h('p', { style: { fontStyle: 'italic' } }, result));
        choices.append(h('button.btn.green', { onclick: () => this.afterNode() }, 'Continue'));
        this.save();
      });
      choices.append(b);
    }
    const portrait = h('div.portrait.slot', img(vil?.sprite || 'almanac', 3));
    el = h('div.screen', hud.el, h('div.center', h('div.sheet.panel',
      h('div.event-head', portrait, h('div', h('h2', ev.title), vil ? h('div', { style: { fontSize: '14px', color: '#8a5a3b' } }, `${vil.name} · ${vil.role || ''}`) : null, hearts)),
      body, choices)));
    this.show(el, { scene: { kind: 'event' }, music: 'event' }).then(() => { if (vil) this.motif(ev.villager); });
  },

  forage() {
    const rng = this.rng();
    const finds = [
      { label: 'Mushrooms under a mossy log', hint: 'Heal 10 Heart', do: ev => { ev.heal(10); return 'Earthy, buttery, only slightly suspicious. You feel better.'; } },
      { label: 'Something glinting in the creek', hint: 'Gain 30-45 coin', do: ev => { const n = 30 + Math.floor(ev.rand() * 16); ev.gainCoin(n); return `Coins! ${n} of them, and one very offended crayfish.`; } },
      { label: 'A torn seed packet', hint: 'Choose a Seed card', do: async () => { const pick = await this.chooseCard('Seeds!', this.cardChoices('fight', 3, null, d => d.type === 'seed')); if (pick) this.addCardToDeck(pick); return pick ? 'You pocket the seeds.' : 'You leave the packet for the sparrows.'; } },
      { label: 'A jar left on a fencepost', hint: 'Gain a random Preserve', do: ev => { ev.addPreserve('random'); return 'A note says "for whoever needs it". That\'s you.'; } },
      { label: 'A quiet spot to sharpen your tools', hint: 'Upgrade a card', do: async ev => { const ok = await ev.upgradeCard(); return ok ? 'Sharp as a new moon.' : 'You sit a while instead.'; } },
      { label: 'An old compost heap', hint: 'Remove a card from your deck', do: async ev => { const ok = await ev.removeCard(); return ok ? 'Back to the earth it goes.' : 'Smells too strong. You move on.'; } },
    ];
    rng.shuffle(finds);
    this.runEvent({ id: 'forage', title: 'Foraging', text: 'The path dips into a little hollow full of ferns. The Almanac rustles: "Three things worth a look. We have time for one."', choices: finds.slice(0, 3) });
  },

  market() {
    const run = this.run;
    const hud = new Hud(this);
    const inv = E.shopInventory(run);
    this.offer(inv.cards.map(c => c.inst));
    const cards = inv.cards, keeps = inv.keepsakes, jars = inv.preserves;
    const priceTag = p => h('div.price' + (run.coin < p ? '.poor' : ''), img('ui_coin', 2), p);
    let el;
    const refresh = () => { hud.update(); el.querySelectorAll('.price').forEach(t => t.classList.toggle('poor', run.coin < +t.lastChild.textContent)); };
    const buy = (price, fn, node) => {
      if (node.classList.contains('sold')) return;
      if (run.coin < price) { this.audio.sfx('error'); toast('Odile shakes her head. "Coin first, friend."'); return; }
      if (fn() === false) return;
      run.coin -= price;
      this.audio.sfx('buy');
      node.classList.add('sold');
      refresh();
      this.save();
    };
    const cardShelf = h('div.shelf', cards.map(({ inst, price }) => {
      const cardEl = renderCard(inst);
      CV.attachInspect?.(cardEl, () => inst);
      const node = h('div.priced', cardEl, priceTag(price));
      node.addEventListener('click', () => buy(price, () => this.addCardToDeck(inst), node));
      return node;
    }));
    const trinkets = h('div.shelf',
      ...keeps.map(({ id, price }) => {
        const d = KEEPSAKES[id];
        const node = h('div.trinket', h('div.slot', img(d.icon, 3)), priceTag(price));
        setTip(node, `<b>${d.name}</b>${d.desc}`);
        node.addEventListener('click', () => buy(price, () => this.gainKeepsake(id), node));
        return node;
      }),
      ...jars.map(({ id, price }) => {
        const d = PRESERVES[id];
        const node = h('div.trinket', h('div.slot', img(d.jar, 3)), priceTag(price));
        setTip(node, `<b>${d.name}</b>${d.desc}`);
        node.addEventListener('click', () => buy(price, () => this.gainPreserve(id), node));
        return node;
      }),
      (() => {
        const node = h('div.trinket', h('div.slot', img('ui_compost', 3)), priceTag(inv.removePrice));
        setTip(node, '<b>Compost service</b>Odile takes a card off your hands. For a fee.');
        node.addEventListener('click', async () => {
          if (node.classList.contains('sold')) return;
          const price = inv.removePrice;
          if (run.coin < price) { this.audio.sfx('error'); toast('Not enough coin'); return; }
          if (await this.removeCard('Which card goes on the heap?')) { run.coin -= price; run.removeCost += 25; node.classList.add('sold'); refresh(); this.save(); this.audio.sfx('buy'); }
        });
        return node;
      })(),
    );
    const vil = VILLAGERS.odile;
    const line = MARKET_LINES[Math.floor(Math.random() * MARKET_LINES.length)] || '';
    el = h('div.screen', hud.el, h('div.center', { style: { justifyContent: 'flex-start', overflowY: 'auto' } },
      h('div.sheet.panel', h('div.event-head', h('div.portrait.slot', img(vil?.sprite || 'vil_odile', 3)), h('div', h('h2', "Odile's Stall"), heartsEl(this.meta.friendship.odile || 0), h('p', { style: { margin: 0, fontSize: '14px' } }, line)))),
      h('div.market-grid', cardShelf, trinkets),
      h('button.btn.green', { onclick: () => this.afterNode() }, 'Leave the stall')));
    this.show(el, { scene: { kind: 'market' }, music: 'market' }).then(() => this.motif('odile'));
  },

  hearth() {
    const run = this.run;
    const hud = new Hud(this);
    const rest = E.restAmount(run);
    const vil = VILLAGERS.rue;
    const line = HEARTH_LINES[Math.floor(Math.random() * HEARTH_LINES.length)] || '';
    let chosen = false;
    const done = msg => { if (msg) toast(msg, 2000); this.save(); setTimeout(() => this.afterNode(), 700); };
    const once = fn => async () => { if (chosen) return; chosen = true; if ((await fn()) === false) chosen = false; };
    const opts = h('div.hearth-opts',
      h('button.btn.green', { onclick: once(() => { run.hp = Math.min(run.maxHp, run.hp + rest); this.audio.sfx('heal'); hud.update(); done(`You nap by the fire. +${rest} Heart`); }) },
        img('icon_quilt', 3), h('span', 'Nap by the fire', h('small', `Heal ${rest} Heart`))),
      h('button.btn', { onclick: once(async () => { if (await this.upgradeCard()) { done(); return true; } return false; }) },
        img('icon_pie', 3), h('span', 'Cook with Rue', h('small', 'Upgrade a card'))),
      h('button.btn', { onclick: once(() => { const n = Math.round(run.maxHp * 0.15); run.hp = Math.min(run.maxHp, run.hp + n); this.evApi().friendship('rue', 1); hud.update(); done(`Tea and gossip. +${n} Heart`); }) },
        img('icon_teacup', 3), h('span', 'Sit with Auntie Rue', h('small', 'Heal a little and get to know her'))),
    );
    this.show(h('div.screen', hud.el, h('div.center', h('div.sheet.panel',
      h('div.event-head', h('div.portrait.slot', img(vil?.sprite || 'vil_rue', 3)), h('div', h('h2', "Rue's Hearth"), heartsEl(this.meta.friendship.rue || 0), h('p', { style: { margin: 0, fontSize: '14px' } }, line))),
      opts))), { scene: { kind: 'hearth' }, music: 'hearth' }).then(() => this.motif('rue'));
  },
};

export function heartsEl(f) {
  const t = tierOf(f);
  return h('div.hearts', { 'aria-label': `Friendship ${f}` }, '♥'.repeat(t) + '♡'.repeat(3 - t), h('small', ` ${f}`));
}
function safe(fn, dflt) { try { return fn(); } catch { return dflt; } }
