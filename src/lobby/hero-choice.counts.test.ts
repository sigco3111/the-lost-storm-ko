import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choiceCounts } from './hero-choice.ts';

void test('a hero chosen on the shown lobby counts, even while the lobby is still settling in behind its veil', (): void => {
  assert.equal(choiceCounts({ shown: true, held: false }), true);
});

void test('a hero chosen while the lobby holds its controls, as it does when leaving, does not count', (): void => {
  assert.equal(choiceCounts({ shown: true, held: true }), false);
});

void test('a hero choice from a lobby that is not shown does not count', (): void => {
  assert.equal(choiceCounts({ shown: false, held: false }), false);
  assert.equal(choiceCounts({ shown: false, held: true }), false);
});
