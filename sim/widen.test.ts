import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content, Delivery, SkillDef } from './content/types.ts';
import { must } from '../test/support.ts';
import { widened, widenedSkill, widerWave } from './widen.ts';

const content: Content = loadContent();

function skill(id: string): SkillDef {
  return must(content.skills.get(id), id);
}

void test('widening grows a projectile like every other shape with a size, and leaves its range and count alone', (): void => {
  const bolt: Delivery = skill('quarrel_heave').delivery;
  assert.ok(bolt.type === 'projectile');
  const wide: Delivery = widened(bolt, 1.5);
  assert.ok(wide.type === 'projectile');
  assert.equal(wide.radius, bolt.radius * 1.5);
  assert.equal(wide.range, bolt.range);
  assert.equal(wide.count, bolt.count);
  assert.equal(wide.pierce, bolt.pierce);
});

void test('widening a skill widens the crest of its wave by the same share, and a skill with no wave keeps its look', (): void => {
  const ghost: SkillDef = skill('ghost_wave');
  const wave = must(ghost.vfx.wave, 'ghost wave look');
  const wide: SkillDef = widenedSkill(ghost, 1.2);
  assert.ok(wide.delivery.type === 'projectile' && ghost.delivery.type === 'projectile');
  assert.ok(Math.abs(wide.delivery.radius - ghost.delivery.radius * 1.2) < 1e-9);
  assert.ok(Math.abs(must(wide.vfx.wave, 'wider wave').halfWidth - wave.halfWidth * 1.2) < 1e-9);
  const bolt: SkillDef = skill('quarrel');
  assert.equal(widenedSkill(bolt, 1.3).vfx, bolt.vfx);
  assert.equal(widerWave(ghost.vfx, 1), ghost.vfx);
});

void test('a scale of one returns the very same skill', (): void => {
  const bolt: SkillDef = skill('quarrel_heave');
  assert.equal(widenedSkill(bolt, 1), bolt);
});
