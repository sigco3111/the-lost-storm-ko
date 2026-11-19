import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dummy, offset, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import { ignite, offenceOf, setTempo } from '../world/combat.ts';
import { dropOnGround } from '../world/ground.ts';
import type { MonsterState, World } from '../world/types.ts';
import { ENTITY_FEATURES, FOE_FEATURES, RL, SELF_FEATURES, SLOT_FEATURES, STATUS_FEATURES } from './contract.ts';
import { TAKE_ALL } from './loot.ts';
import type { Observation, Seen } from './observe.ts';
import { observe } from './observe.ts';
import { createRecall } from './recall.ts';
import { burning, slowed } from './status.ts';

const HIT = { amount: 200, tempo: 0.5, slowFor: 2, strain: 0.7, guard: 0.4, root: 1.5, gold: 10 } as const;

function seenOf(world: World): Observation {
  return observe(world, { situation: 'arena', objective: null, timeLeft: 0, progress: 0, recall: createRecall(), pickup: TAKE_ALL }, world.player);
}

function selfValue(seen: Observation, name: string): number {
  return seen.obs[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
}

function entityValue(seen: Observation, index: number, name: string): number {
  return seen.obs[SELF_FEATURES.length + RL.slots * SLOT_FEATURES.length + index * ENTITY_FEATURES.length + ENTITY_FEATURES.indexOf(name)] ?? Number.NaN;
}

function tokenOf(seen: Observation, match: (entry: Seen) => boolean): number {
  const index: number = seen.view.seen.findIndex(match);
  assert.ok(index >= 0);
  return index;
}

void test('the hero reads its own burn and slow and how many foes are coming for it', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  foe.aggro = true;
  ignite(world, offenceOf(foe), world.player, shapeSkill('fire_burst'), HIT.amount);
  setTempo(world.player, HIT.tempo, HIT.slowFor);
  const seen: Observation = seenOf(world);
  assert.ok(Math.abs(selfValue(seen, 'burning') - burning(world.player)) < 1e-6);
  assert.ok(burning(world.player) > 0);
  assert.ok(Math.abs(selfValue(seen, 'slowed') - slowed(world.player)) < 1e-6);
  assert.ok(Math.abs(selfValue(seen, 'targeted_by') - 1 / RL.countScale) < 1e-6);
});

void test('a foe token carries its statuses, whether it targets the hero, and its recovery', (): void => {
  const world: World = shapeArena([]);
  const foe: MonsterState = dummy(world, offset(0, 4));
  foe.aggro = true;
  foe.root = HIT.root;
  foe.recovery.guard = HIT.guard;
  foe.recovery.strain = HIT.strain;
  setTempo(foe, HIT.tempo, HIT.slowFor);
  const seen: Observation = seenOf(world);
  const at: number = tokenOf(seen, (entry: Seen): boolean => entry.type === 'monster' && entry.monster.id === foe.id);
  assert.equal(entityValue(seen, at, 'targeting_me'), 1);
  assert.ok(Math.abs(entityValue(seen, at, 'slowed') - (1 - HIT.tempo)) < 1e-6);
  assert.ok(Math.abs(entityValue(seen, at, 'rooted') - HIT.root) < 1e-6);
  assert.ok(Math.abs(entityValue(seen, at, 'recovering') - HIT.guard) < 1e-6);
  assert.ok(Math.abs(entityValue(seen, at, 'strain') - HIT.strain) < 1e-6);
});

void test('a loot token leaves every foe input blank', (): void => {
  const world: World = shapeArena([]);
  const gold = dropOnGround(world, world.player.pos, { kind: 'gold', amount: HIT.gold });
  const seen: Observation = seenOf(world);
  const at: number = tokenOf(seen, (entry: Seen): boolean => entry.type === 'loot' && entry.ground.id === gold.id);
  for (const name of [...STATUS_FEATURES, ...FOE_FEATURES]) assert.equal(entityValue(seen, at, name), 0, name);
});
