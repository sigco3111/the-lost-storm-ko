import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, shapeArena } from '../../test/shape-support.ts';
import type { MonsterState, PlayerState, World } from '../world/types.ts';
import { targetedBy, targetingHero } from './status.ts';

void test('a foe chasing a second hero counts as targeting that hero and not the primary hero', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(-8, 0);
  const apart: PlayerState = shapeArena([]).player;
  const second: PlayerState = { ...apart, id: world.nextId, pos: offset(6, 0), party: 0 };
  world.nextId += 1;
  world.heroes.push(second);
  const foe: MonsterState = dummy(world, offset(4, 0));
  foe.aggro = true;
  assert.equal(targetingHero(world, foe, second), true);
  assert.equal(targetingHero(world, foe, world.player), false);
  assert.equal(targetedBy(world, second), 1);
  assert.equal(targetedBy(world, world.player), 0);
});
