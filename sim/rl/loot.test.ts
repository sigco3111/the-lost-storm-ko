import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { RarityDef } from '../content/item-types.ts';
import { rollItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { withCount } from '../stacks.ts';
import { must } from '../../test/support.ts';
import { dropOnGround } from '../world/ground.ts';
import type { GroundItem, ItemInstance, World } from '../world/types.ts';
import type { Arena } from './arena.ts';
import { createArena } from './arena.ts';
import { bagFree, fits, nearestWanted, rarityIndex, rarityShare, ruleShare, wanted, worth } from './loot.ts';

const CONTENT: Content = loadContent();
const FAR = { gap: 6 } as const;
const HOURS = { base: 'folded_hour', held: 15, lying: 10 } as const;

function itemOf(world: World, rarity: RarityDef): ItemInstance {
  const item: ItemInstance = must(rollItem(CONTENT, createRng(world.nextItemUid), world.nextItemUid, world.player.level, { base: null, rarity: rarity.id, floor: null, zone: null }), `a ${rarity.id} item`);
  world.nextItemUid += 1;
  return item;
}

function quietWorld(): World {
  const arena: Arena = createArena(CONTENT, { seed: 51, jitter: 0, waves: 1 });
  arena.world.monsters = [];
  arena.world.ground = [];
  return arena.world;
}

void test('rarity reaches the model as its place in the rarity order', (): void => {
  const world: World = quietWorld();
  CONTENT.rarities.forEach((rarity: RarityDef, index: number): void => {
    const item: ItemInstance = itemOf(world, rarity);
    assert.equal(rarityIndex(CONTENT, item), index);
    assert.equal(rarityShare(CONTENT, item), index / (CONTENT.rarities.length - 1));
  });
  assert.equal(ruleShare(CONTENT, { minRarity: 0 }), 0);
  assert.equal(ruleShare(CONTENT, { minRarity: CONTENT.rarities.length }), 1);
});

void test('gold is always wanted, and an item only from the rule rarity up', (): void => {
  const world: World = quietWorld();
  const top: RarityDef = must(CONTENT.rarities.at(-1), 'the top rarity');
  const low: RarityDef = must(CONTENT.rarities[0], 'the lowest rarity');
  const rule = { minRarity: CONTENT.rarities.length - 1 };
  const gold: GroundItem = dropOnGround(world, world.player.pos, { kind: 'gold', amount: 9 });
  const best: GroundItem = dropOnGround(world, world.player.pos, { kind: 'item', item: itemOf(world, top) });
  const plain: GroundItem = dropOnGround(world, world.player.pos, { kind: 'item', item: itemOf(world, low) });
  assert.equal(worth(CONTENT, rule, gold), 1);
  assert.equal(worth(CONTENT, rule, best), 2);
  assert.equal(worth(CONTENT, rule, plain), 0);
  assert.ok(wanted(world, world.player, rule, gold) && wanted(world, world.player, rule, best) && !wanted(world, world.player, rule, plain));
  assert.ok(!wanted(world, world.player, { minRarity: CONTENT.rarities.length }, best));
});

void test('a full bag leaves an item unwanted and bag space reads empty', (): void => {
  const world: World = quietWorld();
  const low: RarityDef = must(CONTENT.rarities[0], 'the lowest rarity');
  assert.equal(bagFree(world.player), 1);
  world.player.inventory = world.player.inventory.map((): ItemInstance => itemOf(world, low));
  assert.equal(bagFree(world.player), 0);
  const stuck: GroundItem = dropOnGround(world, world.player.pos, { kind: 'item', item: itemOf(world, low) });
  assert.equal(wanted(world, world.player, { minRarity: 0 }, stuck), false);
});

void test('the nearest wanted loot is chosen over nearer loot the rule passes over', (): void => {
  const world: World = quietWorld();
  const low: RarityDef = must(CONTENT.rarities[0], 'the lowest rarity');
  dropOnGround(world, world.player.pos, { kind: 'item', item: itemOf(world, low) });
  const gold: GroundItem = dropOnGround(world, { x: world.player.pos.x + FAR.gap, z: world.player.pos.z }, { kind: 'gold', amount: 3 });
  assert.equal(nearestWanted(world, world.player, { minRarity: 1 }), gold);
});

void test('a stack that only partly fits the bag does not fit, so it is never offered', (): void => {
  const world: World = quietWorld();
  const low: RarityDef = must(CONTENT.rarities[0], 'the lowest rarity');
  const hour: ItemInstance = must(rollItem(CONTENT, createRng(1), world.nextItemUid, world.player.level, { base: HOURS.base, rarity: low.id, floor: null, zone: null }), 'a folded hour');
  world.player.inventory = world.player.inventory.map((): ItemInstance => itemOf(world, low));
  world.player.inventory[0] = withCount(hour, HOURS.held);
  const lying: GroundItem = dropOnGround(world, world.player.pos, { kind: 'item', item: withCount(hour, HOURS.lying) });
  assert.equal(fits(world, world.player, lying), false);
  assert.equal(nearestWanted(world, world.player, { minRarity: 0 }), null);
});
