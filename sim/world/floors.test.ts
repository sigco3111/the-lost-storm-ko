import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadZone } from '../../test/road-support.ts';
import { cast, damageTo, dummy, run, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import { place } from '../../test/arena-support.ts';
import type { SkillDef, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable, nearestWalkable } from '../nav/grid.ts';
import { heightAt } from '../nav/terrain.ts';
import { canReach, sameFloor } from './floors.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';

const SIZE = 4;
const CLIFF_X = 3 * SIZE;
const STAIR: ZoneDef = roadZone({
  id: 'floors_test',
  cellSize: SIZE,
  floorHeight: 0.5,
  tiles: ['wwwwww', 'wwwwww', 'wwwwww', 'wwwwww'],
  terrain: { rise: 1, groundStep: 0.6, levels: ['000/22', '000/22', '000222', '000222'], cliff: 'road_firm', rough: null, blends: [], cliffs: [] },
  playerStart: { x: 6, z: 12 },
});
const LOW: Vec2 = { x: CLIFF_X - 1.5, z: 13 };
const HIGH: Vec2 = { x: CLIFF_X + 1.5, z: 13 };
const RAMP_FOOT: Vec2 = { x: CLIFF_X - 1.5, z: 4 };
const RAMP_UP: Vec2 = { x: CLIFF_X + 1, z: 4 };

const BOLT: SkillDef = { ...shapeSkill('test_brander'), id: 'test_floor_bolt', brand: null, delivery: { type: 'projectile', speed: 20, radius: 0.4, range: 10, pierce: 0, count: 1, spreadDegrees: 0, interval: 0 } };
const SKILLS: readonly SkillDef[] = [shapeSkill('test_squall'), shapeSkill('test_brander'), shapeSkill('test_fork'), shapeSkill('test_wire'), BOLT];

function stairWorld(): World {
  const world: World = shapeArena(['test_squall', 'test_brander', 'test_fork', 'test_wire']);
  world.player.skills = [...SKILLS];
  enterZone(world, STAIR, { type: 'start' });
  world.monsters = [];
  world.events = [];
  world.player.mana = world.player.stats.maxMana;
  return world;
}

function standAt(world: World, at: Vec2): MonsterState {
  const target: MonsterState = dummy(world, at);
  assert.ok(Math.abs(heightAt(world.zone, target.pos.x, target.pos.z) - heightAt(world.zone, at.x, at.z)) < 0.01, `stands at ${target.pos.x}, ${target.pos.z}`);
  return target;
}

function hero(world: World, at: Vec2): void {
  world.player.pos = { x: at.x, z: at.z };
  world.player.path = [];
}

void test('two points share a floor when the ground between them never jumps more than a step, so a stair joins and a ledge parts', (): void => {
  const world: World = stairWorld();
  assert.equal(sameFloor(world, RAMP_FOOT, RAMP_UP), true);
  assert.equal(sameFloor(world, { x: 2, z: 2 }, { x: 22, z: 2 }), true);
  assert.equal(sameFloor(world, LOW, HIGH), false);
  assert.equal(canReach(world, LOW, HIGH), false);
  assert.equal(canReach(world, LOW, { x: 2, z: 13 }), true);
});

void test('an area on the floor below a ledge strikes those beside it and never those standing on the terrace above', (): void => {
  const world: World = stairWorld();
  hero(world, { x: 4, z: 13 });
  const below: MonsterState = standAt(world, { x: CLIFF_X - 2, z: 11 });
  const above: MonsterState = standAt(world, { x: CLIFF_X + 1, z: 13 });
  const events: WorldEvent[] = [...cast(world, 0, { x: CLIFF_X - 1, z: 13 }), ...run(world, 1.2)];
  assert.ok(damageTo(events, below.id).length > 0);
  assert.deepEqual(damageTo(events, above.id), []);
});

void test('an area at the foot of a stair still strikes the one standing a few treads up it', (): void => {
  const world: World = stairWorld();
  hero(world, { x: 4, z: 4 });
  const up: MonsterState = standAt(world, RAMP_UP);
  const events: WorldEvent[] = [...cast(world, 0, RAMP_FOOT), ...run(world, 1.2)];
  assert.ok(damageTo(events, up.id).length > 0);
});

void test('a swing at the edge of a ledge misses the one standing above it, and lands on the one up the stair', (): void => {
  const ledge: World = stairWorld();
  hero(ledge, LOW);
  const above: MonsterState = standAt(ledge, HIGH);
  const missed: WorldEvent[] = [...cast(ledge, 1, HIGH), ...run(ledge, 0.5)];
  assert.deepEqual(damageTo(missed, above.id), []);
  const stair: World = stairWorld();
  hero(stair, RAMP_FOOT);
  const up: MonsterState = standAt(stair, RAMP_UP);
  const landed: WorldEvent[] = [...cast(stair, 1, RAMP_UP), ...run(stair, 0.5)];
  assert.ok(damageTo(landed, up.id).length > 0);
});

void test('a chain never jumps up or down a ledge', (): void => {
  const world: World = stairWorld();
  hero(world, { x: 4, z: 13 });
  const above: MonsterState = standAt(world, HIGH);
  const events: WorldEvent[] = [...cast(world, 2, HIGH), ...run(world, 0.5)];
  assert.deepEqual(damageTo(events, above.id), []);
});

void test('a beam ends where the floor drops or rises away, and a shot stops there too', (): void => {
  const beamWorld: World = stairWorld();
  hero(beamWorld, { x: 4, z: 13 });
  const beamEvents: WorldEvent[] = [...cast(beamWorld, 3, { x: 20, z: 13 }), ...run(beamWorld, 0.3)];
  const beam: WorldEvent | undefined = beamEvents.find((event: WorldEvent): boolean => event.type === 'beam');
  assert.ok(beam !== undefined && beam.type === 'beam');
  assert.ok(beam.to.x <= CLIFF_X + 0.5, `beam reached ${beam.to.x}`);
  const shotWorld: World = stairWorld();
  hero(shotWorld, { x: 4, z: 13 });
  const above: MonsterState = standAt(shotWorld, HIGH);
  const shotEvents: WorldEvent[] = [...cast(shotWorld, 4, HIGH), ...run(shotWorld, 1)];
  assert.deepEqual(damageTo(shotEvents, above.id), []);
  const end: WorldEvent | undefined = shotEvents.find((event: WorldEvent): boolean => event.type === 'projectile_end');
  assert.ok(end !== undefined && end.type === 'projectile_end');
  assert.ok(end.pos.x <= CLIFF_X + 0.5, `shot ended at ${end.pos.x}`);
});

void test('a monster on the terrace above never strikes across the ledge; it goes round by the stair', (): void => {
  const world: World = stairWorld();
  hero(world, LOW);
  const above: MonsterState = place(world, 'test_shambler', HIGH);
  const events: WorldEvent[] = run(world, 1);
  assert.deepEqual(damageTo(events, world.player.id), []);
  assert.ok(above.pos.z < 13 - 0.5 || above.path.length > 0, `stayed at ${above.pos.x}, ${above.pos.z}`);
});

void test('the hero asked to strike someone on the terrace above walks toward the stair instead of swinging at the ledge', (): void => {
  const world: World = stairWorld();
  hero(world, LOW);
  const above: MonsterState = standAt(world, HIGH);
  const events: WorldEvent[] = stepWorld(world, [{ type: 'skill', slot: 1, aim: above.pos, targetId: above.id }], 1 / 60);
  assert.equal(events.some((event: WorldEvent): boolean => event.type === 'damage'), false);
  assert.equal(world.player.action, null);
});

void test('one put back on walkable ground stays on its own floor, never set down on the terrace across the ledge', (): void => {
  const world: World = stairWorld();
  const edge: Vec2 = { x: CLIFF_X + 0.05, z: 13 };
  assert.equal(isWalkable(world.grid, edge.x, edge.z), false);
  const kept: Vec2 | null = nearestWalkable(world.grid, edge, 4, (at: Vec2): boolean => sameFloor(world, edge, at));
  assert.ok(kept !== null);
  assert.ok(kept.x > CLIFF_X, `put down at ${kept.x}, ${kept.z}`);
});
