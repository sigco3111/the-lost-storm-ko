import assert from 'node:assert/strict';
import test from 'node:test';
import { edgeFade, fitRows, gridColumns, heldLine, lastUsed, rowsHeight, STASH_GRID, stashRows } from './auction-layout.ts';

function slots(size: number, used: readonly number[]): (string | null)[] {
  return Array.from({ length: size }, (_: unknown, index: number): string | null => (used.includes(index) ? `item${index}` : null));
}

void test('the stash grid fits as many 44 px cells with 4 px gaps as the width holds', (): void => {
  assert.equal(gridColumns(536, STASH_GRID), 11);
  assert.equal(gridColumns(524, STASH_GRID), 11);
  assert.equal(gridColumns(523, STASH_GRID), 10);
  assert.equal(gridColumns(20, STASH_GRID), 1);
});

void test('an empty stash shows one row, not a wall of empty squares', (): void => {
  assert.equal(stashRows(slots(96, []), 11), 1);
});

void test('the stash shows its rows up to the last used one and one spare row', (): void => {
  assert.equal(stashRows(slots(96, [0]), 11), 2);
  assert.equal(stashRows(slots(96, [10]), 11), 2);
  assert.equal(stashRows(slots(96, [11]), 11), 3);
  assert.equal(stashRows(slots(96, [3, 40]), 11), 5);
});

void test('a full or nearly full stash shows every row it has and no more', (): void => {
  assert.equal(stashRows(slots(96, [95]), 11), 9);
  assert.equal(stashRows(slots(96, [88]), 11), 9);
  assert.equal(stashRows(slots(0, []), 11), 0);
});

void test('the last used slot ignores empty slots after it', (): void => {
  assert.equal(lastUsed(slots(12, [2, 7])), 7);
  assert.equal(lastUsed(slots(12, [])), -1);
});

void test('rows take their cells and the gaps between them', (): void => {
  assert.equal(rowsHeight(1, STASH_GRID), 44);
  assert.equal(rowsHeight(3, STASH_GRID), 140);
  assert.equal(rowsHeight(0, STASH_GRID), 0);
});

void test('a short window shows whole rows only, so no row is cut in half', (): void => {
  assert.equal(fitRows(140, 5, STASH_GRID), 3);
  assert.equal(fitRows(139, 5, STASH_GRID), 3);
  assert.equal(fitRows(130, 5, STASH_GRID), 2);
  assert.equal(fitRows(1000, 5, STASH_GRID), 5);
});

void test('the stash always keeps one row in view however short the window', (): void => {
  assert.equal(fitRows(10, 5, STASH_GRID), 1);
  assert.equal(fitRows(10, 0, STASH_GRID), 0);
});

void test('a line that goes away keeps its text while it fades, so its place never collapses', (): void => {
  assert.deepEqual(heldLine('Listed.', ''), { text: 'Listed.', shown: true });
  assert.deepEqual(heldLine(null, 'Listed.'), { text: 'Listed.', shown: false });
  assert.deepEqual(heldLine('', 'Listed.'), { text: 'Listed.', shown: false });
});

void test('a scrolled grid fades the edge that has more rows past it', (): void => {
  assert.deepEqual(edgeFade(0, 100, 100), { top: false, bottom: false });
  assert.deepEqual(edgeFade(0, 100, 200), { top: false, bottom: true });
  assert.deepEqual(edgeFade(50, 100, 200), { top: true, bottom: true });
  assert.deepEqual(edgeFade(100, 100, 200), { top: true, bottom: false });
});
