import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Soaking } from './soak-look.ts';
import { dripsDue, soakDried, soakedFor, stepSoak } from './soak-look.ts';

void test('a soaked body eases to fully wet, holds it while soaked, and eases back out once dry', (): void => {
  const soaks: Map<number, Soaking> = new Map<number, Soaking>();
  soakedFor(soaks, 7, 1);
  const soaking: Soaking | undefined = soaks.get(7);
  assert.ok(soaking !== undefined);
  const first: number = stepSoak(soaking, 1 / 60);
  assert.ok(first > 0 && first < 1);
  let shown: number = first;
  for (let frame: number = 0; frame < 40; frame += 1) shown = stepSoak(soaking, 1 / 60);
  assert.ok(Math.abs(shown - 1) < 0.02);
  const before: number = shown;
  for (let frame: number = 0; frame < 20; frame += 1) shown = stepSoak(soaking, 1 / 60);
  assert.equal(soaking.left, 0);
  assert.ok(shown < before && shown > 0);
  for (let frame: number = 0; frame < 120; frame += 1) stepSoak(soaking, 1 / 60);
  assert.ok(soakDried(soaking));
});

void test('a second soak keeps the longer time left instead of cutting it short', (): void => {
  const soaks: Map<number, Soaking> = new Map<number, Soaking>();
  soakedFor(soaks, 3, 2);
  soakedFor(soaks, 3, 0.5);
  assert.equal(soaks.get(3)?.left, 2);
  soakedFor(soaks, 3, 3);
  assert.equal(soaks.get(3)?.left, 3);
});

void test('drips fall at their rate on average, a whole drop for each full share of a frame', (): void => {
  assert.equal(dripsDue(9, 1 / 60, 0.99), 0);
  assert.equal(dripsDue(9, 1 / 60, 0.1), 1);
  assert.equal(dripsDue(120, 1 / 60, 0.99), 2);
});
