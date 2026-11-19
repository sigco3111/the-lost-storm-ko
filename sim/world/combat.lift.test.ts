import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { RunCondition } from '../content/run-table-types.ts';
import type { Content, MonsterDef } from '../content/types.ts';
import { rollItem } from '../items.ts';
import { createRng } from '../rng.ts';
import { kill } from './combat.ts';
import type { LootTicket, MintClaim } from './ledger.ts';
import { giveTickets, liftedBySeed, takeClaims } from './ledger.ts';
import { setOut } from './run-table.ts';
import type { ItemInstance, MonsterState, World } from './types.ts';

const base: Content = loadContent();
const CAVE: string = 'under_hall';
const LIFTING: string = 'crowded';
const TICKETS: number = 400;
const FIRST_SEED: number = 1000;
const HALF: number = 0.5;

function lifting(rarity: number): Content {
  const conditions: RunCondition[] = base.runTable.conditions.map((condition: RunCondition): RunCondition => (condition.id === LIFTING ? { ...condition, reward: { ...condition.reward, items: 50, rarity } } : condition));
  return { ...base, runTable: { ...base.runTable, conditions } };
}

function claimsAfterKills(content: Content, pinned: boolean): { readonly world: World; readonly claims: readonly MintClaim[] } {
  const world: World = worldIn(content, content.world.town, 9);
  world.waypoints.push(CAVE);
  world.visited.push(CAVE);
  world.player.gold = 1000000;
  world.service = { kind: 'descent', owner: 'descent_table', anchor: { x: 0, z: 0 } };
  setOut(world, { zone: CAVE, pins: pinned ? [{ condition: LIFTING, pick: null }] : [] });
  assert.equal(world.zone.id, CAVE);
  world.ledger.waiting = [];
  world.flags[content.player.firstDrop.flag] = 'yes';
  const tickets: LootTicket[] = Array.from({ length: TICKETS }, (_: unknown, index: number): LootTicket => ({ id: index + 1, seed: FIRST_SEED + index }));
  giveTickets(world, tickets);
  for (const monster of world.monsters.filter((each: MonsterState): boolean => each.def.boss === null && each.def.rank === null)) kill(world, monster, { x: 1, z: 0 });
  return { world, claims: takeClaims(world) };
}

function claimedItem(world: World, uid: number): ItemInstance {
  for (const ground of world.ground) if (ground.content.kind === 'item' && ground.content.item.uid === uid) return ground.content.item;
  throw new Error(`no item ${uid} on the ground`);
}

void test('a drop the run lifts is claimed as lifted, naming the floor, and its seed rolls the same item with that floor', (): void => {
  const content: Content = lifting(1);
  const { world, claims } = claimsAfterKills(content, true);
  const floor: string = must(content.rarities[1], 'the first lifted rarity').id;
  const lifted: MintClaim[] = claims.filter((claim: MintClaim): boolean => claim.source.kind === 'lifted');
  assert.ok(lifted.length > 0);
  assert.equal(lifted.length, claims.filter((claim: MintClaim): boolean => claim.source.kind === 'monster' || claim.source.kind === 'lifted').length);
  for (const claim of lifted) {
    if (claim.source.kind !== 'lifted') continue;
    assert.equal(claim.source.floor, floor);
    assert.equal(claim.source.zone, CAVE);
    const monster: MonsterDef = must(content.monsters.get(claim.source.monster), claim.source.monster);
    assert.equal(monster.boss, null);
    const ticket: number = claim.ticket;
    const again: ItemInstance | null = rollItem(content, createRng(FIRST_SEED + ticket - 1), claim.uid, claim.level, { base: null, rarity: null, floor: claim.source.floor, zone: claim.source.zone });
    const item: ItemInstance = claimedItem(world, claim.uid);
    assert.deepEqual({ base: again?.base, rarity: again?.rarity, affixes: again?.affixes }, { base: item.base, rarity: item.rarity, affixes: item.affixes });
  }
});

void test('without a run that lifts, a monster drop is claimed as a plain monster drop', (): void => {
  const { claims } = claimsAfterKills(lifting(0), true);
  assert.ok(claims.length > 0);
  assert.ok(claims.every((claim: MintClaim): boolean => claim.source.kind !== 'lifted'));
});

void test('whether a drop is lifted is read from its ticket seed, so the server can work it out from the same seed and the run', (): void => {
  const { claims } = claimsAfterKills(lifting(HALF), true);
  const drops: MintClaim[] = claims.filter((claim: MintClaim): boolean => claim.source.kind === 'monster' || claim.source.kind === 'lifted');
  assert.ok(drops.some((claim: MintClaim): boolean => claim.source.kind === 'lifted'));
  assert.ok(drops.some((claim: MintClaim): boolean => claim.source.kind === 'monster'));
  for (const claim of drops) assert.equal(claim.source.kind === 'lifted', liftedBySeed(FIRST_SEED + claim.ticket - 1, HALF), `ticket ${claim.ticket}`);
});
