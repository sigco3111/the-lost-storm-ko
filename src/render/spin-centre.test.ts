import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vec2 } from '../../sim/math.ts';
import type { SpinCentre } from './spin-centre.ts';
import { centreShift, createSpinCentre, holdSpinCentre, measurePivot, SPIN_CENTRE, turnedBy } from './spin-centre.ts';

void test('a hip held out from the body is drawn back over the hero at any turn, leaving only a small lean', (): void => {
  const centre: SpinCentre = createSpinCentre();
  holdSpinCentre(centre, 1);
  measurePivot(centre, { x: 0.3, z: 0.1 }, { x: 0, z: 0 }, 0);
  for (const yaw of [0, 1, 2.5, -2]) {
    const hip: Vec2 = turnedBy(centre.pivot, yaw);
    const shift: Vec2 = centreShift(centre, yaw);
    const left: number = Math.hypot(hip.x + shift.x, hip.z + shift.z);
    assert.ok(Math.abs(left - SPIN_CENTRE.lean) < 1e-9, `yaw ${yaw} leaves ${left}`);
  }
});

void test('the pivot is read in the body\'s own frame, so the same pose measured at another turn gives the same pivot', (): void => {
  const centre: SpinCentre = createSpinCentre();
  measurePivot(centre, { x: 0.3, z: 0 }, { x: 0, z: 0 }, 0);
  const still: Vec2 = centre.pivot;
  const turned: Vec2 = turnedBy({ x: 0.3, z: 0 }, 1.3);
  measurePivot(centre, { x: 5 + turned.x, z: 2 + turned.z }, { x: 5, z: 2 }, 1.3);
  assert.ok(Math.hypot(centre.pivot.x - still.x, centre.pivot.z - still.z) < 1e-9);
});

void test('the pull follows the spin pose as it blends in and out, so the hips never jump when the spin starts or stops', (): void => {
  const centre: SpinCentre = createSpinCentre();
  centre.pivot = { x: 0.3, z: 0 };
  assert.equal(holdSpinCentre(centre, 0), false);
  assert.deepEqual(centreShift(centre, 0), { x: -0, z: -0 });
  const pulls: number[] = [0.1, 0.5, 1, 0.5, 0.1].map((weight: number): number => {
    holdSpinCentre(centre, weight);
    return -centreShift(centre, 0).x;
  });
  const full: number = 0.3 - SPIN_CENTRE.lean;
  assert.deepEqual(pulls.map((pull: number): number => Math.round((pull / full) * 1000) / 1000), [0.1, 0.5, 1, 0.5, 0.1]);
  assert.equal(holdSpinCentre(centre, 2), true);
  assert.ok(Math.abs(-centreShift(centre, 0).x - full) < 1e-9);
});
