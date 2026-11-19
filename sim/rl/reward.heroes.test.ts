import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offset, shapeSkill } from '../../test/shape-support.ts';
import type { WorldEvent } from '../world/types.ts';
import type { RewardInputs } from './reward.ts';
import { emptyTally, REWARD, rewardFor } from './reward.ts';

const DUEL = { me: 1, rival: 2, stranger: 3, life: 100, blow: 25 } as const;

function blow(sourceId: number, killed: boolean): WorldEvent {
  return { type: 'damage', targetId: DUEL.rival, sourceId, targetTeam: 'player', amount: DUEL.blow, crit: false, killed, pos: offset(0, 0), direction: { x: 1, z: 0 }, skill: shapeSkill('cleave'), burn: false };
}

const INPUTS: RewardInputs = { playerId: DUEL.me, playerMaxLife: DUEL.life, lifeOf: (): number => DUEL.life, calm: false, worth: (): number => 0 };

void test('a blow a hero lands on a rival hero is rewarded as damage dealt, and a killing blow as a kill', (): void => {
  assert.equal(rewardFor([blow(DUEL.me, false)], INPUTS, emptyTally()), (DUEL.blow / DUEL.life) * REWARD.dealt);
  assert.equal(rewardFor([blow(DUEL.me, true)], INPUTS, emptyTally()), (DUEL.blow / DUEL.life) * REWARD.dealt + REWARD.kill);
});

void test('a blow someone else lands on a rival hero is not this hero reward', (): void => {
  assert.equal(rewardFor([blow(DUEL.stranger, false)], INPUTS, emptyTally()), 0);
});
