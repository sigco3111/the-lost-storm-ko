import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import { leanOf } from './content/lean-rules.ts';
import type { Content, DropLean, ItemBaseDef } from './content/types.ts';
import { boostedLean, leanedWeight, rollItem, rollLeaned } from './items.ts';
import type { ItemPlan } from './items.ts';
import { createRng } from './rng.ts';
import type { ItemInstance } from './world/types.ts';

const content: Content = loadContent();
const CAVE: string = 'under_hall';
const INNER_HALL: string = 'ledger_court';
const DOUBLE: number = 2;
const ROLLS: number = 400;
const LEVEL: number = 8;

void test('a boost of one leaves the lean as it is', (): void => {
  const lean: DropLean = must(leanOf(content, CAVE), 'the cave lean');
  assert.equal(boostedLean(lean, 1), lean);
});

void test('a boost multiplies the share of the gear a lean favours and a legendary lean, and leaves an unused part at one', (): void => {
  const cave: DropLean = must(leanOf(content, CAVE), 'the cave lean');
  const boostedCave: DropLean = boostedLean(cave, DOUBLE);
  assert.equal(boostedCave.share, cave.share * DOUBLE);
  assert.equal(boostedCave.legendary, 1);
  const inner: DropLean = must(leanOf(content, INNER_HALL), 'the inner hall lean');
  const boostedInner: DropLean = boostedLean(inner, DOUBLE);
  assert.equal(boostedInner.legendary, inner.legendary * DOUBLE);
  assert.equal(boostedInner.share, 1);
});

void test('a boosted lean weighs the favoured bases more and the rest the same', (): void => {
  const lean: DropLean = must(leanOf(content, CAVE), 'the cave lean');
  const boosted: DropLean = boostedLean(lean, DOUBLE);
  const bases: readonly ItemBaseDef[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.dropWeight > 0);
  const favoured: readonly ItemBaseDef[] = bases.filter((base: ItemBaseDef): boolean => leanedWeight(content, base, lean) > base.dropWeight);
  assert.ok(favoured.length > 0);
  for (const base of bases) {
    const plain: number = leanedWeight(content, base, lean);
    assert.equal(leanedWeight(content, base, boosted), favoured.includes(base) ? plain * DOUBLE : plain);
  }
});

void test('rolling with a boost of one is the plain roll, and a boost changes what some seeds roll', (): void => {
  let changed: number = 0;
  for (let seed: number = 1; seed <= ROLLS; seed += 1) {
    const plan: ItemPlan = { base: null, rarity: null, floor: null, zone: CAVE };
    const plain: ItemInstance | null = rollItem(content, createRng(seed), seed, LEVEL, plan);
    assert.deepEqual(rollLeaned(content, createRng(seed), seed, LEVEL, plan, 1), plain);
    if (rollLeaned(content, createRng(seed), seed, LEVEL, plan, DOUBLE)?.base !== plain?.base) changed += 1;
  }
  assert.ok(changed > 0);
});
