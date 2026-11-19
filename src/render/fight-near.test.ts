import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';
import { must, worldIn } from '../../test/support.ts';
import { FIGHT_NEAR, fightNear } from './fight-near.ts';

const content: Content = loadContent();

function withOneMonster(): { readonly world: World; readonly monster: MonsterState } {
  const world: World = worldIn(content, 'hall_of_time', 1);
  const monster: MonsterState = must(world.monsters[0], 'a monster in the hall');
  world.monsters = [monster];
  monster.alive = true;
  monster.aggro = false;
  monster.pos = { x: world.player.pos.x + FIGHT_NEAR.reach / 2, z: world.player.pos.z };
  return { world, monster };
}

void test('a monster that has noticed the hero close by is a fight', (): void => {
  const { world, monster } = withOneMonster();
  assert.equal(fightNear(world), false);
  monster.aggro = true;
  assert.equal(fightNear(world), true);
});

void test('a far, dead or unnoticing monster is no fight, and neither is anything once the hero is down', (): void => {
  const { world, monster } = withOneMonster();
  monster.aggro = true;
  monster.pos = { x: world.player.pos.x + FIGHT_NEAR.reach * 2, z: world.player.pos.z };
  assert.equal(fightNear(world), false);
  monster.pos = { x: world.player.pos.x + 1, z: world.player.pos.z };
  monster.alive = false;
  assert.equal(fightNear(world), false);
  monster.alive = true;
  world.player.alive = false;
  assert.equal(fightNear(world), false);
});
