import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { RarityDef } from '../content/item-types.ts';
import { rollItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { must } from '../../test/support.ts';
import { dropOnGround } from '../world/ground.ts';
import type { GroundItem, ItemInstance, World } from '../world/types.ts';
import { commandsFor } from './act.ts';
import type { Arena } from './arena.ts';
import { arenaContext, createArena } from './arena.ts';
import { ENTITY_FEATURES, MOVE_CHOICES, PICKUP_CHOICE, RL, SELF_FEATURES, SKILL_CHOICES, SLOT_FEATURES } from './contract.ts';
import type { PickupRule } from './loot.ts';
import { ruleShare } from './loot.ts';
import type { Observation, Seen } from './observe.ts';
import { observe } from './observe.ts';

const CONTENT: Content = loadContent();
const PICKUP_MASK: number = MOVE_CHOICES + SKILL_CHOICES + RL.targets + PICKUP_CHOICE;
const GOLD = { amount: 40 } as const;

function quietArena(): Arena {
  const arena: Arena = createArena(CONTENT, { seed: 53, jitter: 0, waves: 1 });
  arena.world.monsters = [];
  arena.world.ground = [];
  return arena;
}

function seenWith(arena: Arena, rule: PickupRule): Observation {
  return observe(arena.world, { ...arenaContext(arena), pickup: rule }, arena.world.player);
}

function selfValue(seen: Observation, name: string): number {
  return seen.obs[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
}

function entityValue(seen: Observation, index: number, name: string): number {
  return seen.obs[SELF_FEATURES.length + RL.slots * SLOT_FEATURES.length + index * ENTITY_FEATURES.length + ENTITY_FEATURES.indexOf(name)] ?? Number.NaN;
}

function lowItem(world: World): ItemInstance {
  const low: RarityDef = must(CONTENT.rarities[0], 'the lowest rarity');
  return must(rollItem(CONTENT, createRng(world.nextItemUid), world.nextItemUid, world.player.level, { base: null, rarity: low.id, floor: null, zone: null }), 'a plain item');
}

function lootIndex(seen: Observation, ground: GroundItem): number {
  return seen.view.seen.findIndex((entry: Seen): boolean => entry.type === 'loot' && entry.ground.id === ground.id);
}

void test('the hero reads the pickup rule and its free bag space', (): void => {
  const arena: Arena = quietArena();
  const rule: PickupRule = { minRarity: 2 };
  const seen: Observation = seenWith(arena, rule);
  assert.equal(selfValue(seen, 'pickup_rule'), ruleShare(CONTENT, rule));
  assert.equal(selfValue(seen, 'bag_free'), 1);
});

void test('each loot token carries its rarity, gold amount, and whether it is wanted and fits', (): void => {
  const arena: Arena = quietArena();
  const world: World = arena.world;
  const gold: GroundItem = dropOnGround(world, world.player.pos, { kind: 'gold', amount: GOLD.amount });
  const plain: GroundItem = dropOnGround(world, world.player.pos, { kind: 'item', item: lowItem(world) });
  const seen: Observation = seenWith(arena, { minRarity: 1 });
  const goldAt: number = lootIndex(seen, gold);
  const plainAt: number = lootIndex(seen, plain);
  assert.ok(goldAt >= 0 && plainAt >= 0);
  assert.ok(Math.abs(entityValue(seen, goldAt, 'gold_amount') - Math.log1p(GOLD.amount) / RL.goldScale) < 1e-6);
  assert.equal(entityValue(seen, goldAt, 'wanted'), 1);
  assert.equal(entityValue(seen, plainAt, 'rarity'), 0);
  assert.equal(entityValue(seen, plainAt, 'wanted'), 0);
  assert.equal(entityValue(seen, plainAt, 'fits'), 1);
});

void test('pick up is masked when only loot the rule passes over lies near, and offered when the rule takes it', (): void => {
  const arena: Arena = quietArena();
  const world: World = arena.world;
  const plain: GroundItem = dropOnGround(world, world.player.pos, { kind: 'item', item: lowItem(world) });
  const picky: Observation = seenWith(arena, { minRarity: 1 });
  assert.equal(picky.mask[PICKUP_MASK], 0);
  assert.deepEqual(commandsFor(world, { move: 0, skill: 0, target: 0, use: PICKUP_CHOICE }, picky.view), []);
  const keen: Observation = seenWith(arena, { minRarity: 0 });
  assert.equal(keen.mask[PICKUP_MASK], 1);
  assert.deepEqual(commandsFor(world, { move: 0, skill: 0, target: 0, use: PICKUP_CHOICE }, keen.view), [{ type: 'pickup', groundId: plain.id }]);
});
