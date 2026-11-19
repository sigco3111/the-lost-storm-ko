import assert from 'node:assert/strict';
import { test } from 'node:test';
import { surface } from './parse-surface.ts';
import { ContentError } from './read.ts';

const PLAIN: Readonly<Record<string, unknown>> = { id: 'basalt', color: 'textures/stone.jpg', normal: null, orm: null, metres: 2, tint: '#6a625e', roughness: 0.9, metalness: 0, normalScale: 1, spill: 0 };

void test('a plain surface walks at full pace, neither glows nor burns, and lets walkers in', (): void => {
  const read = surface(PLAIN, 'surfaces[0]');
  assert.equal(read.pace, 1);
  assert.equal(read.glow, null);
  assert.equal(read.heat, null);
  assert.equal(read.blocks, false);
});

void test('a molten surface reads its glow, the skill its heat burns with, and that it keeps walkers out', (): void => {
  const glow = { color: '#ff5414', strength: 1.7, cover: 0.5, cracks: 0.1, scale: 2.6, flow: 0.09, pulse: 0.1 };
  const read = surface({ ...PLAIN, id: 'lava', glow, heat: { skill: 'ground_heat', lifeShare: 0.6 }, blocks: true }, 'surfaces[1]');
  assert.deepEqual(read.glow, { ...glow, lit: 'tint' });
  assert.deepEqual(read.heat, { skill: 'ground_heat', lifeShare: 0.6 });
  assert.equal(read.blocks, true);
});

void test('a glow past full cover, a glow colour that is not one, and a heat that takes nothing are rejected', (): void => {
  const glow = { color: '#ff5414', strength: 1, cover: 0.5, cracks: 0.1, scale: 1, flow: 0, pulse: 0 };
  assert.throws((): unknown => surface({ ...PLAIN, glow: { ...glow, cover: 1.5 } }, 'surfaces[2]'), ContentError);
  assert.throws((): unknown => surface({ ...PLAIN, glow: { ...glow, color: 'orange' } }, 'surfaces[2]'), ContentError);
  assert.throws((): unknown => surface({ ...PLAIN, heat: { skill: 'ground_heat', lifeShare: 0 } }, 'surfaces[2]'), ContentError);
});
