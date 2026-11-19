import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OUTPOST_CONTENT } from '../../test/road-support.ts';
import { armed, must, worldIn } from '../../test/support.ts';
import type { SkillDef } from '../content/types.ts';
import { applyHit, COMBAT, corpseFling, offenceOf } from './combat.ts';
import type { MonsterState, World } from './types.ts';

function thrallIn(world: World): MonsterState {
  return must(world.monsters.find((monster: MonsterState): boolean => monster.def.id === 'mended'), 'thrall');
}

function knockOf(monster: MonsterState): number {
  return Math.hypot(monster.knock.x, monster.knock.z);
}

void test('a corpse is flung further the more the killing blow overkills it, up to a ceiling', (): void => {
  assert.equal(corpseFling(0, 100), COMBAT.flingBase);
  assert.ok(corpseFling(50, 100) > corpseFling(10, 100));
  assert.equal(corpseFling(100000, 100), COMBAT.flingMost);
  assert.equal(corpseFling(-5, 100), COMBAT.flingBase);
  assert.equal(corpseFling(50, 0), COMBAT.flingBase);
});

void test('a killing blow knocks the corpse along the hit direction, harder on overkill', (): void => {
  const cleave: SkillDef = must(OUTPOST_CONTENT.skills.get('cleave'), 'cleave');
  const barely: World = armed(worldIn(OUTPOST_CONTENT, 'outpost', 8));
  const crushed: World = armed(worldIn(OUTPOST_CONTENT, 'outpost', 8));
  const near: MonsterState = thrallIn(barely);
  const far: MonsterState = thrallIn(crushed);
  near.life = 1;
  far.life = 1;
  far.maxLife = 1;
  applyHit(barely, offenceOf(barely.player), near, cleave, { x: 0, z: -1 });
  applyHit(crushed, offenceOf(crushed.player), far, cleave, { x: 0, z: -1 });
  assert.equal(near.alive, false);
  assert.equal(far.alive, false);
  assert.ok(near.knock.z < 0 && far.knock.z < 0);
  assert.ok(Math.abs(near.knock.x) < 1e-9 && Math.abs(far.knock.x) < 1e-9);
  assert.ok(knockOf(far) > knockOf(near));
});
