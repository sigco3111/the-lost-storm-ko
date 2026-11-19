import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offset, shapeArena } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { stepWorld } from './step.ts';
import type { Command, PlayerState, World } from './types.ts';

const WALK = { steps: 120, dt: 1 / 30, reach: 1, unknown: 99999 } as const;

function joined(world: World, at: Vec2, skills: readonly string[] = []): PlayerState {
  const apart: PlayerState = shapeArena(skills).player;
  const hero: PlayerState = { ...apart, id: world.nextId, pos: { x: at.x, z: at.z } };
  world.nextId += 1;
  world.heroes.push(hero);
  return hero;
}

function walk(world: World, first: readonly Command[]): void {
  stepWorld(world, first, WALK.dt);
  for (let step: number = 1; step < WALK.steps; step += 1) stepWorld(world, [], WALK.dt);
}

function here(hero: PlayerState): Vec2 {
  return { x: hero.pos.x, z: hero.pos.z };
}

void test('a move that names the second hero moves that hero and leaves the primary where it stood', (): void => {
  const world: World = shapeArena([]);
  const second: PlayerState = joined(world, offset(-3, 0));
  const primaryAt: Vec2 = here(world.player);
  const dest: Vec2 = offset(-3, 5);
  walk(world, [{ type: 'move', held: false, dest, by: second.id }]);
  assert.ok(distance(second.pos, dest) < WALK.reach);
  assert.deepEqual(world.player.pos, primaryAt);
});

void test('a move that names no hero moves the primary hero as before', (): void => {
  const world: World = shapeArena([]);
  const second: PlayerState = joined(world, offset(-3, 0));
  const secondAt: Vec2 = here(second);
  const dest: Vec2 = offset(3, 5);
  walk(world, [{ type: 'move', held: false, dest }]);
  assert.ok(distance(world.player.pos, dest) < WALK.reach);
  assert.deepEqual(second.pos, secondAt);
});

void test('a command for a hero who is not in the world changes nothing', (): void => {
  const world: World = shapeArena([]);
  const primaryAt: Vec2 = here(world.player);
  walk(world, [{ type: 'move', held: false, dest: offset(3, 5), by: WALK.unknown }]);
  assert.deepEqual(world.player.pos, primaryAt);
});

void test('a skill that names the second hero starts that hero swinging', (): void => {
  const world: World = shapeArena([]);
  const second: PlayerState = joined(world, offset(-3, 0), ['cleave']);
  stepWorld(world, [{ type: 'skill', slot: 0, aim: offset(-3, 2), targetId: null, by: second.id }], WALK.dt);
  assert.notEqual(second.action, null);
  assert.equal(world.player.action, null);
});
