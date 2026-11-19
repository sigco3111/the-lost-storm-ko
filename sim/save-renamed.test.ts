import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renamedList } from './save-renamed.ts';

void test('a saved list keeps its order and its blanks and swaps only the retired names', (): void => {
  const renames: ReadonlyMap<string, string> = new Map<string, string>([['still_water', 'millrace']]);
  assert.deepEqual(renamedList(renames, ['cleave', null, 'still_water', 7]), ['cleave', null, 'millrace', 7]);
  assert.equal(renamedList(renames, 'still_water'), 'still_water');
  assert.equal(renamedList(renames, undefined), undefined);
});
