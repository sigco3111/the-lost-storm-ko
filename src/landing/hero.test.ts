import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HERO, readPick } from './hero.ts';

void test('the man stands on the page unless the woman is picked', (): void => {
  assert.equal(HERO.fallback, 'man');
  assert.equal(readPick('woman'), 'woman');
  assert.equal(readPick('man'), 'man');
  assert.equal(readPick(undefined), 'man');
  assert.equal(readPick('someone'), 'man');
});
