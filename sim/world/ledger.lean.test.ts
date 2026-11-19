import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { RunCondition } from '../content/run-table-types.ts';
import type { Content, ItemBaseDef, RarityDef } from '../content/types.ts';
import { rollLeaned } from '../items.ts';
import { createRng } from '../rng.ts';
import { kill } from './combat.ts';
import type { LootTicket, MintClaim } from './ledger.ts';
import { giveTickets, makeItem, sourceZone, takeClaims } from './ledger.ts';
import { leanBoostOf } from './run-state.ts';
import { setOut } from './run-table.ts';
import type { ItemInstance, MonsterState, World } from './types.ts';

const base: Content = loadContent();
const CAVE: string = 'under_hall';
const LEANING: string = 'crowded';
const LEAN: number = 1.5;
const TICKETS: number = 200;
const FIRST_SEED: number = 3000;

function leaning(lean: number): Content {
  const conditions: RunCondition[] = base.runTable.conditions.map((condition: RunCondition): RunCondition => (condition.id === LEANING ? { ...condition, shape: { ...condition.shape, lean } } : condition));
  return { ...base, runTable: { ...base.runTable, conditions } };
}

function leaningRun(content: Content, pinned: boolean): World {
  const world: World = worldIn(content, content.world.town, 9);
  world.waypoints.push(CAVE);
  world.visited.push(CAVE);
  world.player.gold = 1000000;
  world.service = { kind: 'descent', owner: 'descent_table', anchor: { x: 0, z: 0 } };
  setOut(world, { zone: CAVE, pins: pinned ? [{ condition: LEANING, pick: null }] : [] });
  assert.equal(world.zone.id, CAVE);
  world.ledger.waiting = [];
  world.flags[content.player.firstDrop.flag] = 'yes';
  return world;
}

function claimsAfterKills(content: Content, pinned: boolean): { readonly world: World; readonly claims: readonly MintClaim[] } {
  const world: World = leaningRun(content, pinned);
  giveTickets(world, Array.from({ length: TICKETS }, (_: unknown, index: number): LootTicket => ({ id: index + 1, seed: FIRST_SEED + index })));
  for (const monster of world.monsters.filter((each: MonsterState): boolean => each.def.boss === null)) kill(world, monster, { x: 1, z: 0 });
  return { world, claims: takeClaims(world) };
}

function groundItem(world: World, uid: number): ItemInstance {
  for (const ground of world.ground) if (ground.content.kind === 'item' && ground.content.item.uid === uid) return ground.content.item;
  throw new Error(`no item ${uid} on the ground`);
}

void test('the lean boost of a run is one plus the lean of every pinned condition', (): void => {
  const content: Content = leaning(LEAN);
  assert.equal(leanBoostOf(content, []), 1);
  assert.equal(leanBoostOf(content, [{ condition: LEANING, pick: null }]), 1 + LEAN);
  assert.equal(leanBoostOf(base, [{ condition: LEANING, pick: null }]), 1);
});

void test('a drop in a run that leans harder is claimed with the boost, and its seed rolls the same item with it', (): void => {
  const content: Content = leaning(LEAN);
  const { world, claims } = claimsAfterKills(content, true);
  assert.ok(claims.length > 0);
  for (const claim of claims) {
    assert.equal(claim.boost, 1 + LEAN);
    if (claim.source.kind !== 'monster' && claim.source.kind !== 'leader') continue;
    const again: ItemInstance | null = rollLeaned(content, createRng(FIRST_SEED + claim.ticket - 1), claim.uid, claim.level, { base: null, rarity: null, floor: null, zone: sourceZone(claim.source) }, claim.boost);
    const item: ItemInstance = groundItem(world, claim.uid);
    assert.deepEqual({ base: again?.base, rarity: again?.rarity, affixes: again?.affixes }, { base: item.base, rarity: item.rarity, affixes: item.affixes });
  }
});

void test('a drop outside a leaning run is claimed with no boost', (): void => {
  const { claims } = claimsAfterKills(leaning(LEAN), false);
  assert.ok(claims.length > 0);
  assert.ok(claims.every((claim: MintClaim): boolean => claim.boost === 1));
});

void test('a drop that waited for its ticket in a leaning run is claimed with no boost, since its base and rarity were fixed', (): void => {
  const content: Content = leaning(LEAN);
  const world: World = leaningRun(content, true);
  world.ledger.tickets = [];
  const plain: RarityDef = must(content.rarities.find((rarity: RarityDef): boolean => rarity.affixMax === 0), 'a plain rarity');
  const gear: ItemBaseDef = must([...content.itemBases.values()].find((each: ItemBaseDef): boolean => each.power === null && each.dropWeight > 0), 'a plain base');
  const item: ItemInstance = must(makeItem(world, 4, gear.id, plain.id, { kind: 'monster', monster: 'cave_rat', zone: CAVE }), 'a waiting drop');
  assert.equal(world.ledger.waiting.length, 1);
  giveTickets(world, [{ id: 1, seed: FIRST_SEED }]);
  const claims: readonly MintClaim[] = takeClaims(world);
  assert.deepEqual(claims.map((claim: MintClaim): readonly [number, number] => [claim.uid, claim.boost]), [[item.uid, 1]]);
});
