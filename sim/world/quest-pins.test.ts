import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, withoutGlitches, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, NpcDef, TalkDef } from '../content/types.ts';
import { questPins } from './quest-pins.ts';
import type { QuestPin } from './quest-pins.ts';
import { stepWorld } from './step.ts';
import type { Command, NpcState, World, WorldEvent } from './types.ts';

const SHIPPED: Content = loadContent();
const DT: number = 1 / 30;
const LIMIT: number = 60;

function atTheFire(content: Content = SHIPPED): World {
  const world: World = withoutGlitches(worldIn(content, 'hideout', 3));
  world.quests = { out_of_the_mist: 1, the_first_taker: 1, to_the_waystation: 1, wardens_lesson: 0 };
  world.events = [];
  return world;
}

function npcOf(world: World, id: string): NpcState {
  return must(world.npcs.find((npc: NpcState): boolean => npc.def.id === id), id);
}

function send(world: World, command: Command): WorldEvent[] {
  return stepWorld(world, [command], DT);
}

function hearAll(world: World, id: string): void {
  const npc: NpcState = npcOf(world, id);
  world.player.pos = { x: npc.pos.x + 1, z: npc.pos.z };
  send(world, { type: 'talk', npcId: npc.id });
  for (let elapsed: number = 0; elapsed < LIMIT && world.dialogue !== null; elapsed += DT) send(world, { type: 'advance' });
}

function pinnedPeople(world: World): string[] {
  return questPins(world).flatMap((pin: QuestPin): string[] => {
    if (pin.kind !== 'npc') return [];
    const npc: NpcState | undefined = world.npcs.find((entry: NpcState): boolean => entry.id === pin.npcId);
    return npc === undefined ? [] : [npc.def.id];
  });
}

void test('at the fire the person the step sends the hero to carries the pin, and loses it once there is nothing new to hear', (): void => {
  const world: World = atTheFire();
  assert.deepEqual(pinnedPeople(world), ['warden_guide']);
  hearAll(world, 'warden_guide');
  assert.deepEqual(pinnedPeople(world), ['warden_guide'], 'the next talk is news, so he keeps it');
  for (let talk: number = 0; talk < 3; talk += 1) hearAll(world, 'warden_guide');
  assert.deepEqual(pinnedPeople(world), []);
});

void test('the pin is hidden while the hero is talking to its bearer', (): void => {
  const world: World = atTheFire();
  const guide: NpcState = npcOf(world, 'warden_guide');
  world.player.pos = { x: guide.pos.x + 1, z: guide.pos.z };
  send(world, { type: 'talk', npcId: guide.id });
  assert.notEqual(world.dialogue, null);
  assert.deepEqual(pinnedPeople(world), []);
});

void test('anyone with a once talk waiting carries the pin, from the data alone', (): void => {
  const trader: NpcDef = must(SHIPPED.npcs.get('warden_trader'), 'the trader');
  const news: TalkDef = { id: 'trader_news', once: true, when: [], lines: trader.talks[0]?.lines ?? [] };
  const content: Content = { ...SHIPPED, npcs: new Map([...SHIPPED.npcs, [trader.id, { ...trader, talks: [news, ...trader.talks] }]]) };
  const world: World = atTheFire(content);
  assert.ok(pinnedPeople(world).includes('warden_trader'));
  assert.ok(!pinnedPeople(atTheFire()).includes('warden_trader'));
});

void test('a step that points at a way out pins that way out, and no one in the zone', (): void => {
  const world: World = withoutGlitches(worldIn(SHIPPED, 'hall_of_time', 3));
  world.quests = { out_of_the_mist: 1, the_first_taker: 1, to_the_waystation: 0 };
  world.flags['warden_met'] = 'yes';
  const toShelter: string = must(world.zone.exits.find((exit): boolean => exit.to === 'hideout'), 'the way to the Hideout').id;
  assert.deepEqual(questPins(world), [{ kind: 'exit', exit: toShelter }]);
});
