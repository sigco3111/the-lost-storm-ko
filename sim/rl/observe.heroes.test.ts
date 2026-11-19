import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offset, shapeArena } from '../../test/shape-support.ts';
import type { Vec2 } from '../math.ts';
import { dropOnGround } from '../world/ground.ts';
import type { PlayerState, World } from '../world/types.ts';
import { ENTITY_FEATURES, LAYOUT, MOVE_CHOICES, PICKUP_CHOICE, RL, SELF_FEATURES, SKILL_CHOICES, SLOT_FEATURES } from './contract.ts';
import type { ObserveContext, Observation } from './observe.ts';
import { observe } from './observe.ts';
import { createRecall } from './recall.ts';

const DUEL = { rival: 1, apart: 6, aside: -4, wounded: 0.5 } as const;

function joined(world: World, at: Vec2, party: number): PlayerState {
  const apart: PlayerState = shapeArena([]).player;
  const hero: PlayerState = { ...apart, id: world.nextId, pos: { x: at.x, z: at.z }, party };
  world.nextId += 1;
  world.heroes.push(hero);
  return hero;
}

function context(): ObserveContext {
  return { situation: 'duel', objective: null, timeLeft: 0, progress: 0, recall: createRecall(), pickup: { minRarity: 0 } };
}

function entityValue(seen: Observation, index: number, name: string): number {
  return seen.obs[SELF_FEATURES.length + RL.slots * SLOT_FEATURES.length + index * ENTITY_FEATURES.length + ENTITY_FEATURES.indexOf(name)] ?? Number.NaN;
}

function selfValue(seen: Observation, name: string): number {
  return seen.obs[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
}

void test('a hero in another party is seen as a hostile rival and can be targeted, and an ally is seen but not targeted', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(0, 0);
  const rival: PlayerState = joined(world, offset(DUEL.apart, 0), DUEL.rival);
  const ally: PlayerState = joined(world, offset(DUEL.aside, 0), 0);
  const seen: Observation = observe(world, context(), world.player);
  assert.deepEqual(seen.view.targets, [rival]);
  assert.equal(entityValue(seen, 0, 'kind_rival'), 1);
  assert.equal(entityValue(seen, 0, 'hostile'), 1);
  assert.equal(entityValue(seen, 1, 'kind_ally'), 1);
  assert.equal(entityValue(seen, 1, 'hostile'), 0);
  assert.equal(seen.view.seen.length, 2);
  assert.ok(seen.view.seen.some((one): boolean => one.type === 'hero' && one.hero === ally));
});

void test('each hero is observed from its own seat: its own life, and the other hero on the other side', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(0, 0);
  const rival: PlayerState = joined(world, offset(DUEL.apart, 0), DUEL.rival);
  rival.life = rival.maxLife * DUEL.wounded;
  const mine: Observation = observe(world, context(), world.player);
  const theirs: Observation = observe(world, context(), rival);
  assert.equal(selfValue(mine, 'life'), 1);
  assert.equal(selfValue(theirs, 'life'), DUEL.wounded);
  assert.deepEqual(theirs.view.targets, [world.player]);
  assert.equal(entityValue(theirs, 0, 'dx'), -entityValue(mine, 0, 'dx'));
  assert.equal(entityValue(theirs, 0, 'life'), 1);
  assert.equal(entityValue(mine, 0, 'life'), DUEL.wounded);
});

void test('only the primary hero may choose to pick up loot', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(0, 0);
  const rival: PlayerState = joined(world, offset(DUEL.apart, 0), DUEL.rival);
  dropOnGround(world, offset(DUEL.apart / 2, 0), { kind: 'gold', amount: 5 });
  const pickupAt: number = MOVE_CHOICES + SKILL_CHOICES + RL.targets + PICKUP_CHOICE;
  assert.equal(pickupAt < LAYOUT.mask, true);
  assert.equal(observe(world, context(), world.player).mask[pickupAt], 1);
  assert.equal(observe(world, context(), rival).mask[pickupAt], 0);
});

void test('a blow from a rival hero out of sight reads as an unseen attacker, and one in sight does not', (): void => {
  const world: World = shapeArena([]);
  world.player.pos = offset(0, 0);
  const rival: PlayerState = joined(world, offset(DUEL.apart, 0), DUEL.rival);
  const recall = createRecall();
  recall.lastHit = { time: world.time, sourceId: rival.id };
  const near: ObserveContext = { ...context(), recall };
  assert.equal(selfValue(observe(world, near, world.player), 'hit_unseen'), 0);
  for (let index: number = 0; index < RL.targets; index += 1) joined(world, offset(1, index * 0.1), DUEL.rival);
  for (let index: number = 0; index < RL.entities; index += 1) joined(world, offset(-1, index * 0.1), 0);
  const crowded: Observation = observe(world, near, world.player);
  assert.ok(!crowded.view.seen.some((one): boolean => one.type === 'hero' && one.hero === rival));
  assert.equal(selfValue(crowded, 'hit_unseen'), 1);
});
