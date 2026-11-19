import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { offset, shapeArena } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { handleCommand } from './player.ts';
import { stepWorld } from './step.ts';
import type { FlaskState, PlayerState, World } from './types.ts';

const WALK = { steps: 120, dt: 1 / 30, reach: 1 } as const;

function joined(world: World, at: Vec2): PlayerState {
  const apart: PlayerState = shapeArena([]).player;
  const hero: PlayerState = { ...apart, id: world.nextId, pos: { x: at.x, z: at.z } };
  world.nextId += 1;
  world.heroes.push(hero);
  return hero;
}

function run(world: World, steps: number): void {
  for (let step: number = 0; step < steps; step += 1) stepWorld(world, [], WALK.dt);
}

void test('a second hero walks where it is told while the primary hero stays put', (): void => {
  const world: World = shapeArena([]);
  const hero: PlayerState = joined(world, offset(-3, 0));
  const primaryAt: Vec2 = { x: world.player.pos.x, z: world.player.pos.z };
  const dest: Vec2 = offset(-3, 5);
  handleCommand(world, hero, { type: 'move', held: false, dest });
  run(world, WALK.steps);
  assert.ok(distance(hero.pos, dest) < WALK.reach, `the second hero stopped ${distance(hero.pos, dest).toFixed(2)} m short`);
  assert.deepEqual(world.player.pos, primaryAt);
});

void test('a second hero drinks its own flask and the primary hero keeps every charge', (): void => {
  const world: World = shapeArena([]);
  const hero: PlayerState = joined(world, offset(-3, 0));
  hero.life = hero.maxLife / 2;
  const own: FlaskState = must(hero.flasks[0], 'the second hero flask');
  const primary: FlaskState = must(world.player.flasks[0], 'the primary flask');
  const before: { readonly own: number; readonly primary: number } = { own: own.charges, primary: primary.charges };
  handleCommand(world, hero, { type: 'flask', slot: 0 });
  run(world, 1);
  assert.ok(own.charges < before.own);
  assert.equal(primary.charges, before.primary);
  assert.ok(hero.life > hero.maxLife / 2);
});

void test('a second hero cannot give the commands only the primary hero gives', (): void => {
  const world: World = shapeArena([]);
  const hero: PlayerState = joined(world, offset(-3, 0));
  const monsters: number = world.monsters.length;
  handleCommand(world, hero, { type: 'spawn', monster: 'test_shambler', count: 2 });
  assert.equal(world.monsters.length, monsters);
});
