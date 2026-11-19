import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plateTitle } from './boss-bar.ts';

void test('a boss plate shows the title on its own line only when it says something the name does not', (): void => {
  assert.equal(plateTitle('Timekeeper', 'Timekeeper'), null);
  assert.equal(plateTitle('Timekeeper', ' timekeeper '), null);
  assert.equal(plateTitle('The Reckoner', ''), null);
  assert.equal(plateTitle('The Reckoner', 'Keeper of the Last Gate'), 'Keeper of the Last Gate');
});
