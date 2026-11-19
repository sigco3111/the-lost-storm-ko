import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, SHAPE_DT, shapeArena } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { separateActors } from './movement.ts';
import type { MonsterState, PlayerState, World } from './types.ts';

const PRESS = { overlap: 0.1, step: 0.1, far: 10 } as const;

function joined(world: World, at: Vec2): PlayerState {
  const apart: PlayerState = shapeArena([]).player;
  const hero: PlayerState = { ...apart, id: world.nextId, pos: { x: at.x, z: at.z }, party: 0, motion: 'still' };
  world.nextId += 1;
  world.heroes.push(hero);
  return hero;
}

void test('a hero striding into another hero is held off instead of standing in the same place', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(0, 0);
  const second: PlayerState = joined(world, offset(0, 0));
  second.pos = { x: world.player.pos.x + world.player.radius + second.radius - PRESS.overlap, z: world.player.pos.z };
  world.player.motion = 'stride';
  const before: number = distance(world.player.pos, second.pos);
  separateActors(world, SHAPE_DT, new Map([[world.player, { x: PRESS.step, z: 0 }]]));
  assert.ok(distance(world.player.pos, second.pos) > before);
});

void test('a monster striding into a second hero is held off by that hero as by the primary', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(-PRESS.far, 0);
  const second: PlayerState = joined(world, offset(0, 0));
  const monster: MonsterState = dummy(world, offset(0, 0));
  monster.pos = { x: second.pos.x - second.radius - monster.radius + PRESS.overlap, z: second.pos.z };
  monster.motion = 'stride';
  const before: number = distance(monster.pos, second.pos);
  separateActors(world, SHAPE_DT, new Map([[monster, { x: PRESS.step, z: 0 }]]));
  assert.ok(distance(monster.pos, second.pos) > before);
});
