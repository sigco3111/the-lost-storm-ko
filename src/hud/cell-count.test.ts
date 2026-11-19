import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countChange, heldText } from './cell-count.ts';

void test('a count shows from two up, hides at one or an empty slot, and a changed count ticks', (): void => {
  assert.equal(countChange(0, 1), 'none');
  assert.equal(countChange(1, 1), 'none');
  assert.equal(countChange(1, 2), 'show');
  assert.equal(countChange(0, 5), 'show');
  assert.equal(countChange(5, 4), 'tick');
  assert.equal(countChange(4, 5), 'tick');
  assert.equal(countChange(2, 1), 'hide');
  assert.equal(countChange(7, 0), 'hide');
  assert.equal(countChange(7, 7), 'none');
});

void test('the tooltip says how many are held and how many a stack holds', (): void => {
  assert.equal(heldText(7, 20), '7 held · stacks to 20');
});
