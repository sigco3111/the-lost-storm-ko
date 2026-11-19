import assert from 'node:assert/strict';
import { test } from 'node:test';
import { propCache } from './parse-cache.ts';
import { ContentError } from './read.ts';

void test('a prop with no cache has none', (): void => {
  assert.equal(propCache(undefined, 'props[0].cache'), null);
});

void test('a cache reads its gold range, item chance and opened look', (): void => {
  assert.deepEqual(propCache({ goldMin: 4, goldMax: 9, itemChance: 0.25, opened: 'urn_broken' }, 'props[0].cache'), { goldMin: 4, goldMax: 9, itemChance: 0.25, opened: 'urn_broken' });
  assert.deepEqual(propCache({ goldMin: 0, goldMax: 0, itemChance: 1 }, 'props[0].cache'), { goldMin: 0, goldMax: 0, itemChance: 1, opened: null });
});

void test('a cache rejects a gold range that runs backwards and an item chance past one', (): void => {
  assert.throws((): unknown => propCache({ goldMin: 9, goldMax: 4, itemChance: 0 }, 'props[0].cache'), ContentError);
  assert.throws((): unknown => propCache({ goldMin: 1, goldMax: 4, itemChance: 1.5 }, 'props[0].cache'), ContentError);
});
