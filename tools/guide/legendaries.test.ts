import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, DropLean, ItemBaseDef } from '../../sim/content/types.ts';
import { familyPieces, legendary, legendaryBases, legendaryShare, placesFor } from './legendaries.ts';

const content: Content = loadContent();

function leanIds(leans: readonly DropLean[]): string[] {
  return leans.map((lean: DropLean): string => lean.id);
}

void test('every legendary that drops belongs to a family, and the four build families have three pieces each', (): void => {
  for (const base of legendaryBases(content)) assert.ok(content.families.has(base.power?.family ?? ''), `${base.id} has no family`);
  for (const family of ['forkweather', 'millwheel', 'quietshot', 'groundbreaker']) assert.equal(familyPieces(content, family).length, 3, family);
  assert.throws((): ItemBaseDef => legendary(content, 'rusted_blade'));
});

void test('a legendary is most likely where its family is favoured, and every legendary is likelier in the boss court', (): void => {
  const millwheel = placesFor(content, legendary(content, 'the_millwheel'));
  assert.deepEqual(leanIds(millwheel.family), ['hourfall', 'lava']);
  assert.deepEqual(leanIds(millwheel.boss), ['ledger_court']);
  const boots = placesFor(content, legendary(content, 'mist_treader_boots'));
  assert.deepEqual(leanIds(boots.family), []);
  assert.deepEqual(leanIds(boots.weapon), []);
  assert.deepEqual(leanIds(boots.boss), ['ledger_court']);
  for (const base of legendaryBases(content)) assert.ok(placesFor(content, base).boss.length > 0, base.id);
});

void test('the legendary share of a drop follows the rarity weights, the floor and the lean', (): void => {
  const court: DropLean | undefined = content.leans.find((lean: DropLean): boolean => lean.legendary > 1);
  assert.ok(court !== undefined);
  const weights: Map<string, number> = new Map(content.rarities.map((rarity): [string, number] => [rarity.id, rarity.weight]));
  const total: number = [...weights.values()].reduce((sum: number, weight: number): number => sum + weight, 0);
  assert.ok(Math.abs(legendaryShare(content, null, null) - (weights.get('stormtouched') ?? 0) / total) < 1e-9);
  const rare: number = weights.get('rare') ?? 0;
  const top: number = (weights.get('stormtouched') ?? 0) * court.legendary;
  assert.ok(Math.abs(legendaryShare(content, court, 'rare') - top / (rare + top)) < 1e-9);
  assert.ok(legendaryShare(content, court, 'rare') > legendaryShare(content, null, 'rare'));
});
