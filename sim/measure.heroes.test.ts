import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offset, shapeArena, shapeSkill } from '../test/shape-support.ts';
import type { Measurement, Meter } from './measure.ts';
import { createMeter, readMeter } from './measure.ts';
import type { World, WorldEvent } from './world/types.ts';

const RIVAL = { id: 9001, sourceId: 9002, amount: 5 } as const;

function struck(targetId: number, sourceId: number = RIVAL.sourceId, killed: boolean = false): WorldEvent {
  return { type: 'damage', targetId, sourceId, targetTeam: 'player', amount: RIVAL.amount, crit: false, killed, pos: offset(0, 0), direction: { x: 1, z: 0 }, skill: shapeSkill('cleave'), burn: false };
}

function taken(world: World, meter: Meter, event: WorldEvent): Measurement[] {
  return readMeter(world, meter, [event]).filter((measurement: Measurement): boolean => measurement.kind === 'hit' && measurement.taken);
}

void test('a blow on another hero is not measured as a hit the primary hero took, and a blow on the primary is', (): void => {
  const world: World = shapeArena([]);
  const meter: Meter = createMeter(world, []);
  assert.deepEqual(taken(world, meter, struck(RIVAL.id)), []);
  assert.equal(taken(world, meter, struck(world.player.id)).length, 1);
});

void test('a killing blow the primary hero lands on another hero is neither a hit on a foe nor a kill', (): void => {
  const world: World = shapeArena([]);
  const meter: Meter = createMeter(world, []);
  const measured: Measurement[] = readMeter(world, meter, [struck(RIVAL.id, world.player.id, true)]);
  assert.deepEqual(measured.filter((measurement: Measurement): boolean => measurement.kind === 'hit' || measurement.kind === 'kill'), []);
});
