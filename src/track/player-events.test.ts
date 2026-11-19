import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content } from '../../test/backend-support.ts';
import { worldIn } from '../../test/support.ts';
import { EVENTS_PROTOCOL, PLAYER_EVENT_KINDS } from '../backend/api.ts';
import type { PlayerEventBody } from '../backend/api.ts';
import type { World, WorldEvent } from '../../sim/world/types.ts';
import { commandEvent, enteredEvent, openedPanels, playerEvent, pulseEvent, worldEvents } from './player-events.ts';

const AT: number = 1_800_000_000_000;

function hideout(): World {
  return worldIn(content, 'hideout', 7);
}

void test('sim events become zone, level, death, boss, quest, skill, flask, waypoint and run events, and the rest are ignored', (): void => {
  const world: World = hideout();
  const events: WorldEvent[] = [
    { type: 'zone_changed', from: 'between', to: 'hideout' },
    { type: 'level_up', level: 4 },
    { type: 'death', actorId: world.player.id, team: 'player', pos: { x: 0, z: 0 }, direction: { x: 0, z: 1 } },
    { type: 'death', actorId: world.player.id + 1, team: 'monster', pos: { x: 0, z: 0 }, direction: { x: 0, z: 1 } },
    { type: 'boss_defeated', monsterId: 3, monster: 'keeper', first: true, yielded: false },
    { type: 'quest_completed', quest: 'the_gate' },
    { type: 'skill_unlocked', skill: 'squall', slot: 2 },
    { type: 'flask_upgraded', flask: 'life_flask', tier: 2 },
    { type: 'waypoint_unlocked', zone: 'under_hall' },
    { type: 'run_ended', zone: 'lava_depths', end: 'cleared' },
    { type: 'aggro', monsterId: 4 },
  ];
  const tracked: PlayerEventBody[] = worldEvents(events, world, AT);
  assert.deepEqual(
    tracked.map((event: PlayerEventBody): string => event.kind),
    ['zone', 'level', 'died', 'boss', 'quest', 'skill', 'flask', 'waypoint', 'run'],
  );
  assert.deepEqual(tracked[0], { kind: 'zone', at: AT, zone: 'hideout', fields: { from: 'between', to: 'hideout' } });
  assert.deepEqual(tracked[2]?.fields, { level: world.player.level });
  assert.deepEqual(tracked[8]?.fields, { run: 'lava_depths', stage: 'cleared' });
});

void test('build and trade commands are tracked, movement is not', (): void => {
  const world: World = hideout();
  assert.deepEqual(commandEvent({ type: 'allocate', node: 'storm_1' }, world, AT)?.fields, { node: 'storm_1' });
  assert.deepEqual(commandEvent({ type: 'slot', slot: 2, skill: null }, world, AT)?.fields, { slot: 2, skill: '' });
  assert.deepEqual(commandEvent({ type: 'trade', action: { type: 'sell', inventoryIndex: 0 } }, world, AT)?.fields, { action: 'sell', service: '' });
  assert.deepEqual(commandEvent({ type: 'teleport', zone: 'under_hall' }, world, AT)?.fields, { waypoint: 'under_hall' });
  assert.equal(commandEvent({ type: 'stop' }, world, AT), null);
  assert.equal(commandEvent({ type: 'equip', inventoryIndex: world.player.inventory.length + 3 }, world, AT), null);
});

void test('only panels that newly opened are reported, a trade panel with its service', (): void => {
  const world: World = hideout();
  world.service = { kind: 'auction', owner: 'auctioneer', anchor: { x: 0, z: 0 } };
  const opened: PlayerEventBody[] = openedPanels(['inventory'], ['inventory', 'trade', 'chart'], world, AT);
  assert.deepEqual(
    opened.map((event: PlayerEventBody): unknown => event.fields),
    [{ panel: 'trade', service: 'auction' }, { panel: 'chart' }],
  );
  assert.deepEqual(openedPanels(['map'], [], world, AT), []);
});

void test('the pulse carries progress, a rounded position and idle seconds', (): void => {
  const world: World = hideout();
  world.player.pos = { x: 3.6, z: -1.2 };
  const pulse: PlayerEventBody = pulseEvent(world, AT, 125_400);
  assert.equal(pulse.kind, 'pulse');
  assert.equal(pulse.fields['x'], 4);
  assert.equal(pulse.fields['z'], -1);
  assert.equal(pulse.fields['idle'], 125);
  assert.equal(pulse.fields['level'], world.player.level);
  assert.equal(enteredEvent(world, AT).fields['hero'], world.player.hero);
});

void test('fields are clipped to the protocol limits, and every kind is on the list', (): void => {
  const world: World = hideout();
  const many: Record<string, string> = {};
  for (let index: number = 0; index < EVENTS_PROTOCOL.maxFields + 4; index += 1) many[`k${index}`] = 'x'.repeat(EVENTS_PROTOCOL.textChars * 2);
  const clipped: PlayerEventBody = playerEvent('panel', world, AT, many);
  assert.equal(Object.keys(clipped.fields).length, EVENTS_PROTOCOL.maxFields);
  assert.equal(String(clipped.fields['k0']).length, EVENTS_PROTOCOL.textChars);
  assert.equal(playerEvent('level', world, AT, { level: Number.NaN }).fields['level'], 0);
  assert.equal(new Set(PLAYER_EVENT_KINDS).size, PLAYER_EVENT_KINDS.length);
});
