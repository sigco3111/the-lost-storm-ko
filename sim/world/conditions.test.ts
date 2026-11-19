import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Condition } from '../content/types.ts';
import { holds } from './conditions.ts';
import { createWorld } from './create.ts';
import type { World } from './types.ts';

void test('a level condition holds from its level up, and its not holds below it', (): void => {
  const world: World = createWorld(loadContent(), { seed: 1, save: null });
  const reached: Condition = { type: 'level', atLeast: 8, not: false };
  const below: Condition = { ...reached, not: true };
  world.player.level = 7;
  assert.equal(holds(world, reached), false);
  assert.equal(holds(world, below), true);
  world.player.level = 8;
  assert.equal(holds(world, reached), true);
  assert.equal(holds(world, below), false);
  world.player.level = 15;
  assert.equal(holds(world, reached), true);
});

void test('a visited condition holds once the hero has stood in that zone, and its not holds until then', (): void => {
  const world: World = createWorld(loadContent(), { seed: 1, save: null });
  const been: Condition = { type: 'visited', zone: 'hideout', not: false };
  const never: Condition = { ...been, not: true };
  assert.equal(holds(world, been), false);
  assert.equal(holds(world, never), true);
  world.visited.push('hideout');
  assert.equal(holds(world, been), true);
  assert.equal(holds(world, never), false);
});

void test('a defeated condition holds once the boss\'s first defeat is recorded, and never for a monster whose defeat nothing records', (): void => {
  const world: World = createWorld(loadContent(), { seed: 1, save: null });
  const beaten: Condition = { type: 'defeated', monster: 'timekeeper_gatekeeper', not: false };
  const standing: Condition = { ...beaten, not: true };
  assert.equal(holds(world, beaten), false);
  assert.equal(holds(world, standing), true);
  world.flags['keeper_defeated'] = 'defeated';
  assert.equal(holds(world, beaten), true);
  assert.equal(holds(world, standing), false);
  assert.equal(holds(world, { type: 'defeated', monster: 'no_such_monster', not: false }), false);
});
