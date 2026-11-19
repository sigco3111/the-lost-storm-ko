import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, SHAPE_DT, shapeArena } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { pickFoe, stepMonster } from './monsters.ts';
import type { MonsterState, PlayerState, World } from './types.ts';

const FIELD = { chaseSeconds: 1, wakeMargin: 2 } as const;

function joined(world: World, at: Vec2): PlayerState {
  const apart: PlayerState = shapeArena([]).player;
  const hero: PlayerState = { ...apart, id: world.nextId, pos: { x: at.x, z: at.z }, party: 0 };
  world.nextId += 1;
  world.heroes.push(hero);
  return hero;
}

function hunter(world: World, at: Vec2): MonsterState {
  const monster: MonsterState = dummy(world, at);
  monster.spawnTime = 0;
  monster.aggro = true;
  return monster;
}

function chase(world: World, monster: MonsterState, seconds: number): void {
  for (let step: number = 0; step < Math.round(seconds / SHAPE_DT); step += 1) stepMonster(world, monster, SHAPE_DT);
}

void test('a monster goes after the nearer of two heroes and closes on that one', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(-8, 0);
  const second: PlayerState = joined(world, offset(6, 0));
  const monster: MonsterState = hunter(world, offset(2, 0));
  assert.equal(pickFoe(world, monster), second);
  const before: number = distance(monster.pos, second.pos);
  chase(world, monster, FIELD.chaseSeconds);
  assert.ok(distance(monster.pos, second.pos) < before);
});

void test('a monster wakes on a second hero inside its wake radius while the primary hero stands outside it', (): void => {
  const world: World = shapeArena([]);
  const monster: MonsterState = dummy(world, offset(1, 0));
  monster.spawnTime = 0;
  world.player.pos = { x: monster.pos.x - monster.def.aggroRadius - FIELD.wakeMargin, z: monster.pos.z };
  stepMonster(world, monster, SHAPE_DT);
  assert.equal(monster.aggro, false);
  joined(world, offset(4, 0));
  stepMonster(world, monster, SHAPE_DT);
  assert.equal(monster.aggro, true);
});

void test('a monster whose primary hero has fallen keeps fighting the hero still standing', (): void => {
  const world: World = shapeArena([]);
  const second: PlayerState = joined(world, offset(6, 0));
  const monster: MonsterState = hunter(world, offset(2, 0));
  world.player.alive = false;
  chase(world, monster, SHAPE_DT);
  assert.equal(monster.aggro, true);
  assert.equal(pickFoe(world, monster), second);
});

void test('a monster with no hero left to strike gives up the fight', (): void => {
  const world: World = shapeArena([]);
  const second: PlayerState = joined(world, offset(6, 0));
  const monster: MonsterState = hunter(world, offset(2, 0));
  world.player.alive = false;
  second.alive = false;
  chase(world, monster, SHAPE_DT);
  assert.equal(monster.aggro, false);
  assert.equal(pickFoe(world, monster), null);
});
