import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Springy } from './wear-spring.ts';
import { anyUnsettled, dropSettled, sameIds, settledPiece, springTo } from './wear-spring.ts';

const FRAME: number = 1 / 60;

void test('a piece springs to its target, lands on it exactly and then stops moving', (): void => {
  const piece: Springy = { value: 0, velocity: 0, target: 1 };
  let frames: number = 0;
  while (springTo(piece, FRAME, 1)) frames += 1;
  assert.ok(frames > 0);
  assert.equal(piece.value, 1);
  assert.equal(piece.velocity, 0);
  assert.equal(settledPiece(piece), true);
  assert.equal(springTo(piece, FRAME, 1), false);
});

void test('a piece never springs past its ceiling', (): void => {
  const piece: Springy = { value: 0, velocity: 0, target: 1 };
  const ceiling: number = 0.5;
  for (let frame: number = 0; frame < 120; frame += 1) {
    springTo(piece, FRAME, ceiling);
    assert.ok(piece.value <= ceiling);
  }
  assert.equal(piece.value, ceiling);
});

void test('only pieces that have shrunk to nothing and stopped are dropped, in order, and the rest keep their order', (): void => {
  const gone: Springy = { value: 0, velocity: 0, target: 0 };
  const shrinking: Springy = { value: 0.4, velocity: -1, target: 0 };
  const passing: Springy = { value: 0, velocity: -0.2, target: 0 };
  const alsoGone: Springy = { value: 0, velocity: 0, target: 0 };
  const pieces: Springy[] = [gone, shrinking, passing, alsoGone];
  const dropped: Springy[] = [];
  assert.equal(dropSettled(pieces, (piece: Springy): void => void dropped.push(piece)), true);
  assert.deepEqual(dropped, [gone, alsoGone]);
  assert.deepEqual(pieces, [shrinking, passing]);
  assert.equal(dropSettled(pieces, (piece: Springy): void => void dropped.push(piece)), false);
  assert.equal(anyUnsettled(pieces), true);
  assert.equal(anyUnsettled([gone, alsoGone]), false);
});

void test('two id lists match only when they hold the same ids in the same order', (): void => {
  assert.equal(sameIds(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameIds(['a', 'b'], ['b', 'a']), false);
  assert.equal(sameIds(['a'], ['a', 'b']), false);
  assert.equal(sameIds([], []), true);
});
