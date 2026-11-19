import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { SkillDef } from '../content/types.ts';
import { placeArea } from './areas.ts';
import { applyHit, offenceOf } from './combat.ts';
import type { MonsterState, World } from './types.ts';
import { dealtScale } from './weaken.ts';

const squall: SkillDef = must(ARENA_CONTENT.skills.get('squall'), 'squall');

function umbra(weaken: number): SkillDef {
  if (squall.delivery.type !== 'area') throw new Error('squall is an area');
  return { ...squall, id: 'test_umbra', delivery: { ...squall.delivery, radius: 5, duration: 8, weaken, anchor: 'caster' }, damage: { ...squall.damage, weaponPercent: 0, flatMin: 0, flatMax: 0 } };
}

function shade(weaken: number): { world: World; near: MonsterState; far: MonsterState } {
  const world: World = arena(3);
  const near: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 2, z: ARENA_CENTRE.z });
  const far: MonsterState = place(world, 'test_shambler', { x: ARENA_CENTRE.x + 14, z: ARENA_CENTRE.z });
  placeArea(world, offenceOf(world.player), umbra(weaken), world.player.pos);
  return { world, near, far };
}

void test('an enemy inside an area that weakens deals that share less, one outside or on its own side deals full', (): void => {
  const { world, near, far } = shade(0.15);
  assert.ok(Math.abs(dealtScale(world, near) - 0.85) < 1e-9);
  assert.equal(dealtScale(world, far), 1);
  assert.equal(dealtScale(world, world.player), 1);
  assert.equal(dealtScale(shade(0).world, near), 1);
});

void test('a blow from a weakened enemy lands lighter on the hero', (): void => {
  const strike: SkillDef = { ...must(ARENA_CONTENT.skills.get('cleave'), 'cleave'), damage: { type: 'physical', weaponPercent: 0, flatMin: 100, flatMax: 100 } };
  const weak = shade(0.5);
  const full = shade(0);
  weak.world.player.invulnerable = 0;
  full.world.player.invulnerable = 0;
  const before: number = weak.world.player.life;
  applyHit(weak.world, offenceOf(weak.near), weak.world.player, strike, { x: 1, z: 0 });
  applyHit(full.world, offenceOf(full.near), full.world.player, strike, { x: 1, z: 0 });
  const lost: number = before - weak.world.player.life;
  const fullLost: number = before - full.world.player.life;
  assert.ok(fullLost > 0);
  assert.ok(Math.abs(lost - fullLost * 0.5) <= 1, `${lost} vs ${fullLost}`);
});
