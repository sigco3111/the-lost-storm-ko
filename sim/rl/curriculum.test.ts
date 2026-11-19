import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRng } from '../rng.ts';
import { ARENA } from './arena.ts';
import { levelCount, pickLevel, readLevelWeights } from './curriculum.ts';

const DRAWS: number = 2000;

void test('level weights are read for every level or not at all', (): void => {
  assert.deepEqual(readLevelWeights(undefined), []);
  assert.deepEqual(readLevelWeights([]), []);
  const even: number[] = Array.from({ length: levelCount() }, (): number => 1);
  assert.deepEqual(readLevelWeights(even), even);
  assert.throws((): number[] => readLevelWeights([1, 2]), /all 12 levels/);
  assert.throws((): number[] => readLevelWeights(even.map((): number => 0)), /above zero/);
  assert.throws((): number[] => readLevelWeights(even.map((_one: number, index: number): number => (index === 0 ? -1 : 1))), /zero or more/);
  assert.throws((): number[] => readLevelWeights('high'), /list/);
});

void test('a level is drawn in proportion to its weight, and a zero weight is never drawn', (): void => {
  const weights: number[] = Array.from({ length: levelCount() }, (_one: unknown, index: number): number => (index === 2 ? 3 : index === 9 ? 1 : 0));
  const rng = createRng(17);
  const drawn: Map<number, number> = new Map<number, number>();
  for (let draw: number = 0; draw < DRAWS; draw += 1) {
    const level: number | null = pickLevel(rng, weights);
    assert.ok(level !== null);
    drawn.set(level, (drawn.get(level) ?? 0) + 1);
  }
  assert.deepEqual([...drawn.keys()].toSorted((a: number, b: number): number => a - b), [ARENA.levels.min + 2, ARENA.levels.min + 9]);
  const share: number = (drawn.get(ARENA.levels.min + 2) ?? 0) / DRAWS;
  assert.ok(share > 0.7 && share < 0.8, `level 3 was drawn ${share} of the time`);
});

void test('no weights leave the level to the arena', (): void => {
  assert.equal(pickLevel(createRng(1), []), null);
});
