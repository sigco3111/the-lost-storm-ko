import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STUN_MARKS, stunGlow } from './stun-marks.ts';

void test('a stun mark glows while the monster is held and asks for nothing once the stun is over', (): void => {
  assert.equal(stunGlow(false, 3), 0);
  for (const time of [0, 0.4, 1.3, 2.7]) {
    const glow: number = stunGlow(true, time);
    assert.ok(glow >= STUN_MARKS.glow * (1 - STUN_MARKS.pulse) - 1e-9 && glow <= STUN_MARKS.glow * (1 + STUN_MARKS.pulse) + 1e-9);
  }
});
