import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flicker, TORCH_FLAMES } from './torch-flames.ts';

void test('a torch flame flickers around its resting size and never shrinks to nothing', (): void => {
  assert.equal(flicker(0, 0), TORCH_FLAMES.rest);
  const lowest: number = TORCH_FLAMES.rest - TORCH_FLAMES.swing - TORCH_FLAMES.flutter;
  for (let step: number = 0; step < 200; step += 1) {
    const size: number = flicker(step * 0.013, step % 5);
    assert.ok(size >= lowest && size <= TORCH_FLAMES.rest + TORCH_FLAMES.swing + TORCH_FLAMES.flutter);
  }
  assert.ok(lowest > 0);
});

void test('neighbouring flames are out of step with each other', (): void => {
  assert.notEqual(flicker(0.3, 0), flicker(0.3, 1));
});
