import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LootShowing } from './loot-shown.ts';
import { lootShown, pilesFold } from './loot-shown.ts';

const FAR_COMMON: LootShowing = { all: false, near: false, find: false, rank: 0, shownRank: 1, inView: true };

void test('a far common item has no name until the names are asked for', (): void => {
  assert.equal(lootShown(FAR_COMMON), false);
  assert.equal(lootShown({ ...FAR_COMMON, all: true }), true);
});

void test('showing every name only reaches items in view', (): void => {
  assert.equal(lootShown({ ...FAR_COMMON, all: true, inView: false }), false);
});

void test('a near common item shows its name without a key', (): void => {
  assert.equal(lootShown({ ...FAR_COMMON, near: true }), true);
});

void test('magic and better always show their names, with the key up or down', (): void => {
  for (const all of [false, true]) {
    for (const inView of [false, true]) {
      assert.equal(lootShown({ ...FAR_COMMON, rank: 1, all, inView }), true);
      assert.equal(lootShown({ ...FAR_COMMON, rank: 3, all, inView }), true);
    }
  }
});

void test('a find always shows its name', (): void => {
  assert.equal(lootShown({ ...FAR_COMMON, find: true, inView: false }), true);
});

void test('piles fold only while the names are not all asked for', (): void => {
  assert.equal(pilesFold(false), true);
  assert.equal(pilesFold(true), false);
});
