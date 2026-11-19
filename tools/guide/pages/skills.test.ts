import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guideData, playerSkills, skill } from '../data.ts';
import { howToGet, itemChanges, placeChanges } from './skills.ts';

void test('every skill a player can use says how to get it', (): void => {
  const data = guideData();
  for (const entry of playerSkills(data)) assert.notEqual(howToGet(data, entry), 'Not yet in the game', entry.id);
});

void test('the changes to a skill come from the tree and from weapons', (): void => {
  const data = guideData();
  const cleave: string = skill(data, 'cleave').id;
  assert.ok(placeChanges(data, cleave).length > 0);
  assert.ok(itemChanges(data, cleave).length > 0);
});
