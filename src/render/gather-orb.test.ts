import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { VfxGather } from '../../sim/content/vfx-types.ts';
import { must } from '../../test/support.ts';
import { curveAt, curvePeak, dustOwed } from './gather-orb.ts';

void test('a gather curve passes through its samples and eases between them', (): void => {
  const curve: readonly number[] = [0, 0.4, 1];
  assert.equal(curveAt(curve, 0), 0);
  assert.equal(curveAt(curve, 0.5), 0.4);
  assert.equal(curveAt(curve, 1), 1);
  assert.equal(curveAt(curve, 0.25), 0.2);
  assert.ok(curveAt(curve, 0.05) < 0.4 * 0.1);
  assert.ok(curveAt(curve, 0.45) > 0.4 * 0.9);
});

void test('a gather curve holds its ends outside the windup', (): void => {
  assert.equal(curveAt([0.2, 0.9], -1), 0.2);
  assert.ok(Math.abs(curveAt([0.2, 0.9], 2) - 0.9) < 1e-9);
  assert.equal(curveAt([0.6], 0.5), 0.6);
});

void test('the peak of a curve is where its largest sample sits in the windup', (): void => {
  assert.equal(curvePeak([0, 1, 0.5]), 0.5);
  assert.equal(curvePeak([0, 0.5, 1]), 1);
  assert.equal(curvePeak([1]), 0);
});

void test('dust gathers in proportion to the glow and the time passed', (): void => {
  assert.equal(dustOwed(60, 0.5, 0.1), 3);
  assert.equal(dustOwed(60, 0, 0.1), 0);
  assert.equal(dustOwed(60, 1, -0.1), 0);
});

void test('Wisp Volley gathers brightest on its loudest moment and fullest at the release', (): void => {
  const wisp: SkillDef = must(loadContent().skills.get('wisp_volley'), 'wisp_volley');
  const look: VfxGather = must(wisp.vfx.gather, 'wisp gather');
  assert.ok(Math.abs(curvePeak(look.glow) * wisp.windup - 0.42) <= 0.03);
  assert.equal(curvePeak(look.size), 1);
  assert.ok(curveAt(look.size, 0.05) < 0.1);
});
