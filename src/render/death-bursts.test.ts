import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bigBurst, blowShare, FALL } from './death-bursts.ts';

void test('a killing blow is measured against the monster whole life', (): void => {
  assert.equal(blowShare(50, 100), 0.5);
  assert.equal(blowShare(-5, 100), 0);
  assert.equal(blowShare(50, 0), 0);
});

void test('only a blow far past the monster life bursts bigger, growing to a ceiling', (): void => {
  assert.equal(bigBurst(1), 0);
  assert.equal(bigBurst(FALL.bigFrom), 0);
  assert.ok(bigBurst((FALL.bigFrom + FALL.bigFull) / 2) > 0);
  assert.equal(bigBurst(FALL.bigFull), 1);
  assert.equal(bigBurst(100), 1);
});
