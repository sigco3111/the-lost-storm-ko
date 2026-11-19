import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offset, shapeArena, shapeSkill } from '../test/shape-support.ts';
import { hotGround } from './bot-ground.ts';
import { placeArea } from './world/areas.ts';
import { offenceOf } from './world/combat.ts';
import type { PlayerState, World } from './world/types.ts';

const DUEL = { rival: 1 } as const;

void test('ground the primary hero burns is hot for a rival hero standing in it and not for the primary', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(0, 0);
  const apart: PlayerState = shapeArena([]).player;
  const rival: PlayerState = { ...apart, id: world.nextId, pos: offset(0, 0), party: DUEL.rival };
  world.nextId += 1;
  world.heroes.push(rival);
  const fire = shapeSkill('test_squall');
  assert.ok(placeArea(world, offenceOf(world.player), fire, world.player.pos) !== null);
  assert.equal(hotGround(world, world.player.pos, world.player), false);
  assert.equal(hotGround(world, rival.pos, rival), true);
});
