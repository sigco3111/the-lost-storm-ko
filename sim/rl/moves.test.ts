import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vec2 } from '../math.ts';
import { must } from '../../test/support.ts';
import { MOVE_CHOICES } from './contract.ts';
import { moveBucket, moveDirection } from './moves.ts';

void test('every move direction falls back into its own bucket', (): void => {
  for (let move: number = 1; move < MOVE_CHOICES; move += 1) {
    const direction: Vec2 = must(moveDirection(move), 'direction');
    assert.equal(moveBucket(direction), move);
  }
  assert.equal(moveDirection(0), null);
  assert.equal(moveBucket({ x: 0.01, z: 0 }), 0);
});
