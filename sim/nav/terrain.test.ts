import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadWorld, roadZone } from '../../test/road-support.ts';
import type { ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { stepWorld } from '../world/step.ts';
import type { World } from '../world/types.ts';
import { lineWalkable } from './grid.ts';
import { findPath } from './path.ts';
import type { TerrainBuild } from './terrain.ts';
import { buildTerrain, heightAt, heightJump, rampAt, surfacesMeet, TERRAIN } from './terrain.ts';

const SIZE = 4;
const STAIR: ZoneDef = roadZone({
  id: 'stair_test',
  cellSize: SIZE,
  floorHeight: 0.5,
  tiles: ['wwwwww', 'wwwwww', 'wwwwww', 'wwwwww'],
  terrain: { rise: 1, groundStep: 0.6, levels: ['000/22', '000/22', '000222', '000222'], cliff: 'road_firm', rough: null, blends: [], cliffs: [] },
  playerStart: { x: 6, z: 12 },
});
const CLIFF_X = 3 * SIZE;
const STAIR_DEPTH = 2 * SIZE;

void test('a terrace stands at its level times the rise, above the zone floor', (): void => {
  assert.equal(heightAt(STAIR, 2, 10), 0.5);
  assert.equal(heightAt(STAIR, 22, 10), 2.5);
});

void test('a ramp climbs evenly from the level before it to the level after it', (): void => {
  assert.equal(heightAt(STAIR, CLIFF_X, 2), 0.5);
  assert.equal(heightAt(STAIR, CLIFF_X + SIZE / 2, 2), 1.5);
  assert.equal(heightAt(STAIR, CLIFF_X + SIZE * 0.75, 6), 2);
  assert.equal(rampAt(STAIR, 3, 0), true);
  assert.equal(rampAt(STAIR, 3, 2), false);
});

void test('the largest step on the ground between two points is small up a stair, the full drop across a ledge, and nothing without terrain', (): void => {
  assert.ok(heightJump(STAIR, { x: 2, z: 2 }, { x: 22, z: 2 }) <= TERRAIN.slope * TERRAIN.probe);
  assert.equal(heightJump(STAIR, { x: 10, z: 13 }, { x: 14, z: 13 }), 2);
  assert.equal(heightJump(roadZone({ id: 'flat_jump_test' }), { x: 2, z: 2 }, { x: 20, z: 2 }), 0);
});

void test('tiles join where their surfaces meet and nowhere else', (): void => {
  assert.equal(surfacesMeet(STAIR, 1, 2, 1, 0), true);
  assert.equal(surfacesMeet(STAIR, 2, 2, 1, 0), false);
  assert.equal(surfacesMeet(STAIR, 2, 0, 1, 0), true);
  assert.equal(surfacesMeet(STAIR, 3, 0, 1, 0), true);
  assert.equal(surfacesMeet(STAIR, 3, 0, 0, 1), true);
  assert.equal(surfacesMeet(STAIR, 3, 1, 0, 1), false);
  assert.equal(surfacesMeet(STAIR, 2, 1, 1, 1), false);
});

void test('a ramp that does not run between two different levels is refused, as are levels that do not match the tiles', (): void => {
  const flat: TerrainBuild = buildTerrain({ rise: 1, groundStep: 0.6, levels: ['0/0'], cliff: 'road_firm', rough: null, blends: [], cliffs: [] }, ['www'], SIZE);
  assert.equal(flat.ok, false);
  const short: TerrainBuild = buildTerrain({ rise: 1, groundStep: 0.6, levels: ['00'], cliff: 'road_firm', rough: null, blends: [], cliffs: [] }, ['www'], SIZE);
  assert.equal(short.ok, false);
  const odd: TerrainBuild = buildTerrain({ rise: 1, groundStep: 0.6, levels: ['0?0'], cliff: 'road_firm', rough: null, blends: [], cliffs: [] }, ['www'], SIZE);
  assert.equal(odd.ok, false);
});

void test('a path between two terraces goes by the stair, and no straight line crosses the drop', (): void => {
  const world: World = roadWorld(STAIR);
  const from: Vec2 = { x: 6, z: 12 };
  const to: Vec2 = { x: 20, z: 12 };
  assert.equal(lineWalkable(world.grid, from, to), false);
  const path: Vec2[] = findPath(world.grid, from, to);
  assert.ok(path.length > 0);
  const crossing: Vec2[] = path.filter((point: Vec2): boolean => point.x > CLIFF_X - 1 && point.x < CLIFF_X + SIZE + 1);
  assert.ok(crossing.length > 0);
  assert.ok(crossing.every((point: Vec2): boolean => point.z < STAIR_DEPTH), JSON.stringify(crossing));
});

void test('a hero sent across the drop walks round by the stair and never steps off the edge', (): void => {
  const world: World = roadWorld(STAIR);
  world.player.pos = { x: 6, z: 13 };
  stepWorld(world, [{ type: 'move', held: false, dest: { x: 20, z: 13 } }], 1 / 30);
  let crossedBelow: boolean = false;
  for (let step: number = 0; step < 30 * 12; step += 1) {
    stepWorld(world, [], 1 / 30);
    const { x, z } = world.player.pos;
    if (x > CLIFF_X - 0.2 && x < CLIFF_X + 0.2 && z >= STAIR_DEPTH) crossedBelow = true;
  }
  assert.equal(crossedBelow, false);
  assert.ok(Math.hypot(world.player.pos.x - 20, world.player.pos.z - 13) < 1.5, `ended at ${world.player.pos.x}, ${world.player.pos.z}`);
});
