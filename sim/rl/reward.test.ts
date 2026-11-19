import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import { must } from '../../test/support.ts';
import type { WorldEvent } from '../world/types.ts';
import { emptyTally, REWARD, rewardFor } from './reward.ts';

const SKILL = must(loadContent().skills.get('cleave'), 'cleave');
const PLAYER: number = 1;
const FOE: number = 9;

function hit(targetId: number, amount: number, killed: boolean): WorldEvent {
  return { type: 'damage', targetId, sourceId: targetId === PLAYER ? FOE : PLAYER, targetTeam: targetId === PLAYER ? 'player' : 'monster', amount, crit: false, killed, pos: { x: 0, z: 0 }, direction: { x: 1, z: 0 }, skill: SKILL, burn: false };
}

void test('damage dealt pays by the share of the foe’s life, and a kill pays extra', (): void => {
  const tally = emptyTally();
  const reward: number = rewardFor([hit(FOE, 50, false), hit(FOE, 50, true)], { playerId: PLAYER, playerMaxLife: 100, lifeOf: (): number => 100, calm: false, worth: (): number => 0 }, tally);
  assert.equal(reward, REWARD.dealt + REWARD.kill);
  assert.equal(tally.kills, 1);
});

void test('damage taken and death cost the hero', (): void => {
  const tally = emptyTally();
  const died: WorldEvent = { type: 'death', actorId: PLAYER, team: 'player', pos: { x: 0, z: 0 }, direction: { x: 1, z: 0 } };
  const reward: number = rewardFor([hit(PLAYER, 25, false), died], { playerId: PLAYER, playerMaxLife: 100, lifeOf: (): number => 100, calm: false, worth: (): number => 0 }, tally);
  assert.equal(reward, -0.25 * REWARD.taken - REWARD.death);
  assert.equal(tally.deaths, 1);
});

void test('one blow never pays more than the whole foe', (): void => {
  const reward: number = rewardFor([hit(FOE, 1e6, false)], { playerId: PLAYER, playerMaxLife: 100, lifeOf: (): number => 10, calm: false, worth: (): number => 0 }, emptyTally());
  assert.equal(reward, REWARD.dealt);
});
