import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { ItemBaseDef } from '../../sim/content/types.ts';
import { createWorld } from '../../sim/world/create.ts';
import type { World } from '../../sim/world/types.ts';
import { worldIn } from '../../test/support.ts';
import { droppable, keptAsKeepsake, zoneFinds } from './loot-view.ts';

void test('the opening mist warms every item it can lay in front of the hero, before it is laid', (): void => {
  const world: World = createWorld(loadContent(), { seed: 2, save: null, opening: true });
  const finds: ItemBaseDef[] = zoneFinds(world);
  const expected: string[] = (world.zone.void?.encounters ?? []).flatMap((met): string[] => (met.find.type === 'item' ? [met.find.item] : []));
  assert.ok(expected.length > 0);
  assert.deepEqual(finds.map((base: ItemBaseDef): string => base.id), expected);
  assert.ok(finds.some((base: ItemBaseDef): boolean => !keptAsKeepsake(base)));
});

void test('a zone with no encounters has no finds to warm', (): void => {
  const content = loadContent();
  const town: World = worldIn(content, 'hall_of_time', 1);
  assert.deepEqual(zoneFinds(town), []);
});

void test('every base that can drop at random has a ground model to warm, and keepsakes and story finds are left out', (): void => {
  const content = loadContent();
  const drops: ItemBaseDef[] = droppable(content);
  const expected: string[] = [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.dropWeight > 0 && !keptAsKeepsake(base)).map((base: ItemBaseDef): string => base.id);
  assert.ok(drops.length > 20);
  assert.deepEqual(drops.map((base: ItemBaseDef): string => base.id), expected);
  assert.ok(drops.some((base: ItemBaseDef): boolean => base.ground.model === 'held'));
  assert.ok(drops.some((base: ItemBaseDef): boolean => base.ground.model === 'worn'));
  assert.ok(drops.every((base: ItemBaseDef): boolean => base.dropWeight > 0 && !keptAsKeepsake(base)));
});
