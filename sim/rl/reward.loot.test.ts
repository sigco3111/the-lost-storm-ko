import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GroundItem, WorldEvent } from '../world/types.ts';
import type { RewardInputs, RewardTally } from './reward.ts';
import { emptyTally, REWARD, rewardFor } from './reward.ts';

const PLAYER: number = 1;
const RARE_WORTH: number = 1.75;

function picked(content: GroundItem['content']): WorldEvent {
  return { type: 'pickup', ground: { id: 40, pos: { x: 0, z: 0 }, from: { x: 0, z: 0 }, content, find: null, age: 0, kept: false } };
}

function inputs(calm: boolean, worth: number): RewardInputs {
  return { playerId: PLAYER, playerMaxLife: 100, lifeOf: (): number => 100, calm, worth: (): number => worth };
}

void test('loot picked up away from the fight pays by its worth', (): void => {
  const tally: RewardTally = emptyTally();
  assert.equal(rewardFor([picked({ kind: 'gold', amount: 12 })], inputs(true, 1), tally), REWARD.loot);
  assert.equal(rewardFor([picked({ kind: 'gold', amount: 12 })], inputs(true, RARE_WORTH), tally), REWARD.loot * RARE_WORTH);
  assert.equal(tally.loot, 2);
});

void test('loot picked up with a foe close by, or loot the rule does not want, pays nothing', (): void => {
  const tally: RewardTally = emptyTally();
  assert.equal(rewardFor([picked({ kind: 'gold', amount: 12 })], inputs(false, 1), tally), 0);
  assert.equal(rewardFor([picked({ kind: 'gold', amount: 12 })], inputs(true, 0), tally), 0);
  assert.equal(tally.loot, 0);
});
