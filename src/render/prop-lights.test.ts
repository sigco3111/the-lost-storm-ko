import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vector3 } from 'three';
import type { FlameLight, GlowLight } from '../../sim/content/types.ts';
import { PROP_LIGHTS, flamePoint, lightLevel, lightPoint } from './prop-lights.ts';

const FLAME: FlameLight = { form: 'flame', color: '#ffa95a', intensity: 28, distance: 14, height: 0.4, decay: 2, reach: 0.8, lift: 1.6 };
const GLOW: GlowLight = { form: 'glow', color: '#a48ad6', intensity: 10, distance: 7, height: 1.4, decay: 2 };

function largestStep(levels: readonly number[]): number {
  return Math.max(...levels.slice(1).map((level: number, index: number): number => Math.abs(level - (levels[index] ?? level))));
}

function rounded(point: Vector3 | null): readonly number[] | null {
  return point === null ? null : [point.x, point.y, point.z].map((value: number): number => Math.round(value * 1000) / 1000);
}

void test('a flame shows its flame at its height and reach, and lights from above it by its lift', (): void => {
  assert.deepEqual(rounded(flamePoint(FLAME, 10, 1, 20, 0)), [10, 1.4, 20.8]);
  assert.deepEqual(rounded(lightPoint(FLAME, 10, 1, 20, 0)), [10, 3, 20.8]);
  assert.deepEqual(rounded(flamePoint(FLAME, 10, 1, 20, Math.PI / 2)), [10.8, 1.4, 20]);
});

void test('a glow has no flame and lights from straight above its prop', (): void => {
  assert.equal(flamePoint(GLOW, 10, 1, 20, 1.3), null);
  assert.deepEqual(rounded(lightPoint(GLOW, 10, 1, 20, 1.3)), [10, 2.4, 20]);
});

void test('a glow breathes slowly within its depth while a flame flickers deeper and faster', (): void => {
  const samples: readonly number[] = Array.from({ length: 400 }, (_: unknown, index: number): number => index * 0.05);
  const glows: readonly number[] = samples.map((time: number): number => lightLevel('glow', time, 0.3));
  const flames: readonly number[] = samples.map((time: number): number => lightLevel('flame', time, 0.3));
  assert.ok(Math.min(...glows) >= 1 - PROP_LIGHTS.breatheDepth - 1e-9);
  assert.ok(Math.max(...glows) <= 1 + 1e-9);
  assert.ok(Math.max(...flames) - Math.min(...flames) > Math.max(...glows) - Math.min(...glows));
  assert.ok(largestStep(glows) < largestStep(flames) / 5);
});
