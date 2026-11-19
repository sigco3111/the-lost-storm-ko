import type { ZoneExit } from '../../../sim/content/types.ts';
import type { FlaskDef } from '../../../sim/content/flasks.ts';
import type { ActionDef, SlotDefault } from '../../../src/settings/bindings.ts';
import { actionTable } from '../../../src/settings/bindings.ts';
import type { GuideData } from '../data.ts';
import { item, skill, zone } from '../data.ts';
import { bullets, esc, kbd, link, list, note, para, percent, section, seconds, subsection, table, terms } from '../html.ts';
import type { PageBody } from '../layout.ts';

const KEY_NAMES: Readonly<Record<string, string>> = {
  mouse_left: 'Left mouse',
  mouse_right: 'Right mouse',
  Space: 'Space',
  Tab: 'Tab',
  Escape: 'Esc',
  AltLeft: 'Alt',
  AltRight: 'Alt',
};

export function keyName(code: string): string {
  const named: string | undefined = KEY_NAMES[code];
  if (named !== undefined) return named;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function keys(codes: readonly string[]): string {
  const names: string[] = [...new Set(codes.map(keyName))];
  return names.map(kbd).join(' or ');
}

function slotDefaults(data: GuideData): SlotDefault[] {
  return data.content.player.skillBar.map((slot): SlotDefault => ({ name: slot.skill === null ? `Skill slot ${slot.label}` : skill(data, slot.skill).name, bindings: slot.bindings }));
}

export function controlRows(data: GuideData): string[][] {
  const actions: readonly ActionDef[] = actionTable(slotDefaults(data), { flasks: data.content.flasks.length, ladder: true });
  return actions.filter((action: ActionDef): boolean => action.defaults.length > 0).map((action: ActionDef): string[] => [esc(action.label), keys(action.defaults)]);
}

function flask(data: GuideData, resource: FlaskDef['resource']): FlaskDef {
  const found: FlaskDef | undefined = data.content.flasks.find((entry: FlaskDef): boolean => entry.resource === resource);
  if (found === undefined) throw new Error(`no ${resource} flask`);
  return found;
}

function flaskLine(entry: FlaskDef, key: number): string {
  const uses: number = Math.floor(entry.maxCharges / entry.chargesPerUse);
  return `<b>${esc(entry.name)}</b> on ${kbd(String(key))}: ${percent(entry.share)} of your maximum ${entry.resource} over ${seconds(entry.duration)}, and never less than ${entry.amount}. It holds ${entry.maxCharges} charges and each drink uses ${entry.chargesPerUse}, so a full flask is ${uses} drinks. Every kill puts ${entry.chargesPerKill} charges back.`;
}

export function gateLevel(data: GuideData): number {
  const exit: ZoneExit | undefined = zone(data, 'hall_of_time').exits.find((entry: ZoneExit): boolean => entry.to === 'keepers_gate');
  const level: number | undefined = (exit?.requires ?? []).flatMap((condition): number[] => (condition.type === 'level' ? [condition.atLeast] : []))[0];
  if (level === undefined) throw new Error('the Last Gate has no level');
  return level;
}

function questNames(data: GuideData): string[] {
  return [...data.content.quests.values()].map((quest): string => `<b>${esc(quest.name)}</b>`);
}

function hideoutPeople(data: GuideData): string[] {
  return [...data.content.npcs.values()].map((npc): string => esc(npc.name));
}

export function startPage(data: GuideData): PageBody {
  const life: FlaskDef = flask(data, 'life');
  const mana: FlaskDef = flask(data, 'mana');
  const trade = data.content.trade;
  const penalty: string = percent(data.content.player.deathPenalty.xpPercent);
  const gate: number = gateLevel(data);
  return {
    kicker: 'Guide',
    title: 'Getting started',
    lede: 'The keys, your first ten minutes, and the handful of things nobody tells you.',
    description: 'How to start The Lost Storm: controls on desktop and phone, the first ten minutes, flasks, the Hideout, the trader, the auction house, the waypoint and the map.',
    body: [
      section(
        'controls',
        'Controls',
        [
          para('Click the ground to walk there. Click an enemy to attack it, an item to pick it up, a person to talk, and an exit to go through it. Hold the button to keep walking or keep attacking. Hold Shift while you click to attack where you stand without walking. The mouse wheel zooms.'),
          table({ head: ['Action', 'Key'], rows: controlRows(data), caption: 'The keys a new character starts with' }),
          para(`Every key except the left mouse button, Shift and Enter can be changed under ${kbd('Esc')} → Settings → Controls. Most skill slots start empty: a skill you take on the ${link('/guide/tree/', 'Skill Tree')} goes on the first empty one. The Ladder only opens when the game is connected to its server.`),
          subsection(
            'On a phone',
            bullets([
              'Turn the phone sideways.',
              'Drag anywhere on the left of the screen to walk, or tap the ground.',
              'Tap an enemy to attack it. Pinch to zoom.',
              'The skill buttons aim at the nearest enemy in front of you, so you rarely need to aim yourself.',
              'The flask buttons show how many drinks each flask has left.',
              'The buttons along the top open the inventory, the character sheet, the Skill Tree, the map and the menu. The tag button shows the names of everything on the ground, like holding Alt.',
            ]),
          ),
        ].join('\n'),
      ),
      section(
        'first',
        'The first ten minutes',
        [
          para(
            `You wake in ${esc(zone(data, 'between').name)} with nothing in your hands. Read the ${esc(item(data, 'worn_journal').name)}, and a weapon appears: the man finds the ${esc(item(data, 'rusted_blade').name)}, the woman the ${esc(item(data, 'worn_crossbow').name)}. The way out opens once you have both.`,
            `${esc(zone(data, 'hall_of_time').name)} is where the fighting is. It teaches you to roll with ${kbd('Space')}: ${esc(skill(data, 'dodge_roll').description)} Use it. A roll at the right moment saves more life than any flask.`,
            'Enemies come in packs, and their level follows yours, so the Hall of Time stays a fair fight as you grow. Somewhere in it you will find your first moment: a bubble in the air. Step in and it closes around you, and what is inside turns on you. Clear it to get out. If you step out early, it fades and comes back a few seconds later.',
            `Your first moment and the Warden's first lesson each give you a point for the ${link('/guide/tree/', 'Skill Tree')}, on top of the points from each level. Spend them; there is nothing to save them for.`,
            `East of the Hall is ${esc(zone(data, 'hideout').name)}. The way to ${esc(zone(data, 'keepers_gate').name)}, where the boss waits, will not open until level ${gate}.`,
          ),
          para(`Your quests in order: ${list(questNames(data))}. A gold ${kbd('!')} marks the person or the place your current step points to. Talk to a Warden again and they offer to say it again, if you missed what they said.`),
        ].join('\n'),
      ),
      section(
        'flasks',
        'Flasks',
        [
          para('Everyone carries the same two flasks. They never drop, never sit in your bag, and never need replacing.'),
          bullets([flaskLine(life, 1), flaskLine(mana, 2)]),
          para(`A flask does nothing when you are already full, so it never wastes a drink. Each one has ${seconds(life.cooldown)} between drinks. Both fill to the top whenever you reach the Hideout or step on a waypoint.`),
          note('Drink before you need it. The life comes in over a couple of seconds, not all at once.'),
        ].join('\n'),
      ),
      section(
        'hideout',
        'The Hideout',
        [
          para(`${esc(zone(data, 'hideout').name)} is the one safe place. No enemy reaches it. You will find ${list(hideoutPeople(data))} there, a stash with room for ${trade.stashSize} items, and the waypoint. When the game is connected to its server you also see other players and can talk with them: press ${kbd('Enter')} to chat.`),
          para(`When you die you lose ${penalty} of the experience you need for your next level (never a level itself) and come back after a moment, with nothing able to hurt you for ${seconds(data.content.player.respawnInvulnerability)}. You can come back at the last checkpoint you passed or by the fire in the Hideout.`),
        ].join('\n'),
      ),
      section(
        'trader',
        'The trader',
        [
          para(`The Warden Trader always has ${trade.stockSize} items for sale at about your level, mostly common, some magic and now and then a rare. The stock changes every time you come back from another zone, so look again after each trip.`),
          para(`Selling to the trader gives you ${percent(trade.price.sellRatio)} of what the item would cost to buy. Sold something by mistake? The last ${trade.buybackSize} items you sold can be bought back for what you got for them. Items that belong to the story cannot be sold at all.`),
        ].join('\n'),
      ),
      section(
        'auction',
        'The auction house',
        [
          para('The Warden Auctioneer runs the auction house, where players sell to each other. It needs the game to be connected to its server and your character to be saved there.'),
          terms([
            ['Browse', 'Everything for sale, filtered by slot, rarity, level and price.'],
            ['Sell', 'Put up an item from your bag.'],
            ['Mine', 'What you have for sale, and what has sold.'],
            ['History', 'Every sale that has gone through.'],
          ]),
          para('Only things you found in the world can be sold to other players. Goods bought from the trader cannot, and neither can items that belong to the story. The Auctioneer tells you why an item cannot be sold before you try.'),
        ].join('\n'),
      ),
      section(
        'map',
        'Waypoint and map',
        [
          para(`Step on a waypoint and it is yours: it fills your flasks and becomes the place you can come back to. Today the only waypoint is in ${esc(zone(data, 'hideout').name)}.`),
          para(`${kbd('M')} opens the map of every place you have found. ${kbd('Tab')} switches the minimap in the corner to a large one over the whole screen, and clicking the minimap walks you there.`),
          para(`Hold ${kbd('Alt')} to show the name of every item on the ground. Nothing is picked up until you click it.`),
        ].join('\n'),
      ),
      section('next', 'Where to go next', para(`Read ${link('/guide/combat/', 'how combat works')}, then pick a ${link('/guide/builds/', 'build')} and follow its route. The gate opens at level ${gate}, but the boss is easier a level or two later.`)),
    ].join('\n'),
  };
}
