import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vec2 } from '../../sim/math.ts';
import { dustHeadings, PUNCH, punchRoll, reachedFrom, swungFrom } from './punch.ts';

void test('a punch varies its sparks, swing and turn within the tuning and never drops to no sparks', (): void => {
  const low = punchRoll(10, (): number => 0);
  const high = punchRoll(10, (): number => 0.999999);
  assert.equal(low.sparks, Math.round(10 * (1 - PUNCH.sparkSpread)));
  assert.equal(high.sparks, Math.round(10 * (1 + PUNCH.sparkSpread)));
  assert.equal(low.swing, -PUNCH.swing);
  assert.ok(Math.abs(high.swing - PUNCH.swing) < 1e-5);
  assert.equal(low.turn, 0);
  assert.equal(punchRoll(1, (): number => 0).sparks, 1);
  const middle = punchRoll(10, (): number => 0.5);
  assert.equal(middle.sparks, 10);
  assert.equal(middle.swing, 0);
});

void test('kicked dust leaves evenly around the impact, turned by the roll', (): void => {
  const headings: Vec2[] = dustHeadings(4, 0);
  assert.equal(headings.length, 4);
  for (const heading of headings) assert.ok(Math.abs(Math.hypot(heading.x, heading.z) - 1) < 1e-9);
  const sum: Vec2 = headings.reduce((total: Vec2, heading: Vec2): Vec2 => ({ x: total.x + heading.x, z: total.z + heading.z }), { x: 0, z: 0 });
  assert.ok(Math.hypot(sum.x, sum.z) < 1e-9);
  const turned: Vec2[] = dustHeadings(4, Math.PI / 2);
  assert.ok(Math.abs((turned[0]?.x ?? 0) - 1) < 1e-9);
  assert.deepEqual(dustHeadings(0, 1), []);
});

void test('a swing moves the start of the strike sideways and keeps its distance from the line', (): void => {
  const from: Vec2 = { x: 0, z: 0 };
  const to: Vec2 = { x: 0, z: 5 };
  const swung: Vec2 = swungFrom(from, to, 0.3);
  assert.ok(Math.abs(Math.abs(swung.x) - 0.3) < 1e-9);
  assert.equal(swung.z, 0);
  assert.deepEqual(swungFrom(from, from, 0.3), from);
});

void test('a strike starts at the hand reach toward its target, and a close target still gets a strike from the near half', (): void => {
  const from: Vec2 = { x: 0, z: 0 };
  const reached: Vec2 = reachedFrom(from, { x: 0, z: 5 }, 0.9);
  assert.equal(reached.x, 0);
  assert.ok(Math.abs(reached.z - 0.9) < 1e-9);
  assert.deepEqual(reachedFrom(from, { x: 0, z: 0.5 }, 0.9), { x: 0, z: 0.5 * PUNCH.closeShare });
  assert.deepEqual(reachedFrom(from, from, 0.9), from);
});
