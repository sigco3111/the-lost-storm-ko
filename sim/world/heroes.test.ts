import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, shapeArena } from '../../test/shape-support.ts';
import { findActor } from './combat.ts';
import { actorsOf, findHero, isPrimary } from './heroes.ts';
import { pickFoe } from './monsters.ts';
import type { MonsterState, PlayerState, World } from './types.ts';

function joined(world: World, at: { readonly x: number; readonly z: number }): PlayerState {
  const hero: PlayerState = { ...world.player, id: world.nextId, pos: { x: at.x, z: at.z } };
  world.nextId += 1;
  world.heroes.push(hero);
  return hero;
}

void test('a new world has one hero, and it is the player', (): void => {
  const world: World = shapeArena([]);
  assert.equal(world.heroes.length, 1);
  assert.equal(world.heroes[0], world.player);
  assert.equal(isPrimary(world, world.player), true);
});

void test('every actor lists the heroes before the monsters', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  const second: PlayerState = joined(world, offset(2, 0));
  assert.deepEqual(actorsOf(world).map((actor): number => actor.id), [world.player.id, second.id, ...world.monsters.map((monster: MonsterState): number => monster.id)]);
  assert.ok(actorsOf(world).includes(foe));
});

void test('a second hero is found by id and is not the primary one', (): void => {
  const world: World = shapeArena([]);
  const second: PlayerState = joined(world, offset(2, 0));
  assert.equal(findHero(world, second.id), second);
  assert.equal(findActor(world, second.id), second);
  assert.equal(findHero(world, world.player.id), world.player);
  assert.equal(isPrimary(world, second), false);
});

void test('a monster can hold a second hero as its foe', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  const second: PlayerState = joined(world, offset(0, 6));
  foe.aggro = true;
  foe.foeId = second.id;
  assert.equal(pickFoe(world, foe), second);
});
