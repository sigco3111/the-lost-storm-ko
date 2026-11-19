import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shrunkSize } from './shrink-size.ts';

void test('a square texture over the edge halves to it', (): void => {
  assert.deepEqual(shrunkSize([1024, 1024], 512), [512, 512]);
});

void test('a wide texture keeps its proportions', (): void => {
  assert.deepEqual(shrunkSize([2048, 1024], 512), [512, 256]);
});

void test('a texture at or under the edge is left alone', (): void => {
  assert.equal(shrunkSize([512, 512], 512), null);
  assert.equal(shrunkSize([256, 128], 512), null);
});
