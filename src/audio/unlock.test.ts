import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unlockOnInput } from './unlock.ts';

void test('sound is unlocked on the first press or key, and the listeners leave once sound runs', (): void => {
  const target: EventTarget = new EventTarget();
  let unlocks: number = 0;
  let running: boolean = false;
  unlockOnInput(target, (): void => {
    unlocks += 1;
  }, (): boolean => running);
  target.dispatchEvent(new Event('mousemove'));
  assert.equal(unlocks, 0);
  target.dispatchEvent(new Event('pointerdown'));
  assert.equal(unlocks, 1);
  target.dispatchEvent(new Event('keydown'));
  assert.equal(unlocks, 2);
  running = true;
  target.dispatchEvent(new Event('touchend'));
  assert.equal(unlocks, 3);
  target.dispatchEvent(new Event('pointerdown'));
  target.dispatchEvent(new Event('keydown'));
  assert.equal(unlocks, 3);
});
