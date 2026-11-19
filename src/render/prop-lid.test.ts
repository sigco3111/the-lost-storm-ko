import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferAttribute, BufferGeometry } from 'three';
import type { LidStep, LidSwing } from './prop-lid.ts';
import { closedSwing, lidAngle, openAt, PROP_LID, splitAtSeam, stepLid } from './prop-lid.ts';

const FRAME: number = 1 / 60;

function run(swing: LidSwing, open: boolean, frames: number): LidStep[] {
  return Array.from({ length: frames }, (): LidStep => stepLid(swing, open, FRAME));
}

void test('opening says so on its first frame, swings past fully open and settles there', (): void => {
  const swing: LidSwing = closedSwing();
  const steps: LidStep[] = run(swing, true, 180);
  assert.equal(steps[0], 'opened');
  assert.equal(steps.filter((step: LidStep): boolean => step === 'opened').length, 1);
  const traced: LidSwing = closedSwing();
  const values: number[] = Array.from({ length: 180 }, (): number => {
    stepLid(traced, true, FRAME);
    return traced.value;
  });
  assert.ok(Math.max(...values) > 1.03);
  assert.ok(Math.max(...values) < 1.2);
  assert.equal(swing.value, 1);
  assert.equal(steps.at(-1), 'still');
});

void test('closing never sinks the lid below shut, lands once with a thud and settles shut', (): void => {
  const swing: LidSwing = closedSwing();
  run(swing, true, 180);
  const values: number[] = [];
  const steps: LidStep[] = Array.from({ length: 240 }, (): LidStep => {
    const step: LidStep = stepLid(swing, false, FRAME);
    values.push(swing.value);
    return step;
  });
  assert.ok(Math.min(...values) >= 0);
  assert.equal(steps.filter((step: LidStep): boolean => step === 'landed').length, 1);
  assert.equal(swing.value, 0);
  assert.equal(steps.at(-1), 'still');
});

void test('a panel toggled every few frames moves the lid smoothly and never jumps', (): void => {
  const swing: LidSwing = closedSwing();
  let last: number = 0;
  let biggest: number = 0;
  for (let frame: number = 0; frame < 120; frame += 1) {
    stepLid(swing, Math.floor(frame / 7) % 2 === 0, FRAME);
    biggest = Math.max(biggest, Math.abs(swing.value - last));
    last = swing.value;
  }
  assert.ok(biggest < 0.12);
});

void test('a lid barely moving when it shuts makes no thud', (): void => {
  const swing: LidSwing = { value: 0.01, velocity: 0, open: false };
  const steps: LidStep[] = run(swing, false, 60);
  assert.ok(!steps.includes('landed'));
});

void test('a lid opens only for the service anchored where it stands', (): void => {
  const stash = { kind: 'stash', owner: 'stash_chest', anchor: { x: 20.5, z: 26.5 } } as const;
  assert.equal(openAt(stash, { x: 20.5, z: 26.5 }), true);
  assert.equal(openAt(stash, { x: 20.5 + PROP_LID.anchorReach * 2, z: 26.5 }), false);
  assert.equal(openAt(null, { x: 20.5, z: 26.5 }), false);
});

void test('a lid hinged at the back swings up and backwards by its open angle', (): void => {
  assert.equal(lidAngle({ seam: 0.4, hinge: -0.22, degrees: 90 }, 1), -Math.PI / 2);
  assert.equal(lidAngle({ seam: 0.4, hinge: 0.22, degrees: 90 }, 0.5), Math.PI / 4);
});

void test('a model splits at the seam into the triangles below and the triangles above', (): void => {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 0.2, 0, 0, 0.6, 0, 1, 0.6, 0, 0, 0.8, 0]), 3));
  assert.equal(splitAtSeam(geometry, 0.4, false).getAttribute('position').count, 3);
  assert.equal(splitAtSeam(geometry, 0.4, true).getAttribute('position').count, 3);
  assert.equal(splitAtSeam(geometry, 0.4, true).getAttribute('position').getY(0), Math.fround(0.6));
});
