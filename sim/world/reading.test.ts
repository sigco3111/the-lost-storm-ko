import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineSeconds, READING } from './reading.ts';

void test('a short line is shown for the least reading time and a long one for its words, each with the gap after it', (): void => {
  assert.equal(lineSeconds('Stay close.'), READING.least + READING.gap);
  const long: string = 'one two three four five six seven eight nine ten eleven twelve';
  assert.ok(Math.abs(lineSeconds(long) - (12 * READING.perWord + READING.gap)) < 1e-9);
  assert.ok(lineSeconds(long) > lineSeconds('Stay close.'));
});
