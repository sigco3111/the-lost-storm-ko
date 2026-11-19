import type { GroundItem, WorldEvent } from '../world/types.ts';

export const REWARD = {
  dealt: 1,
  kill: 0.5,
  taken: 2,
  death: 3,
  wave: 2,
  win: 3,
  loot: 0.1,
  step: 0.002,
} as const;

export interface RewardTally {
  dealt: number;
  kills: number;
  taken: number;
  deaths: number;
  waves: number;
  loot: number;
}

export function emptyTally(): RewardTally {
  return { dealt: 0, kills: 0, taken: 0, deaths: 0, waves: 0, loot: 0 };
}

export interface RewardInputs {
  readonly playerId: number;
  readonly playerMaxLife: number;
  readonly lifeOf: (id: number) => number;
  readonly calm: boolean;
  readonly worth: (ground: GroundItem) => number;
}

export function rewardFor(events: readonly WorldEvent[], inputs: RewardInputs, tally: RewardTally): number {
  let reward: number = 0;
  for (const event of events) {
    if (event.type === 'damage' && event.targetTeam === 'monster') {
      const share: number = Math.min(1, event.amount / Math.max(1, inputs.lifeOf(event.targetId)));
      reward += share * REWARD.dealt;
      tally.dealt += share;
      if (event.killed) {
        reward += REWARD.kill;
        tally.kills += 1;
      }
    }
    else if (event.type === 'damage' && event.targetId !== inputs.playerId && event.sourceId === inputs.playerId) {
      const share: number = Math.min(1, event.amount / Math.max(1, inputs.lifeOf(event.targetId)));
      reward += share * REWARD.dealt;
      tally.dealt += share;
      if (event.killed) {
        reward += REWARD.kill;
        tally.kills += 1;
      }
    }
    else if (event.type === 'damage' && event.targetId === inputs.playerId) {
      const share: number = Math.min(1, event.amount / Math.max(1, inputs.playerMaxLife));
      reward -= share * REWARD.taken;
      tally.taken += share;
    }
    else if (event.type === 'pickup' && inputs.calm && inputs.worth(event.ground) > 0) {
      reward += REWARD.loot * inputs.worth(event.ground);
      tally.loot += 1;
    }
    else if (event.type === 'death' && event.actorId === inputs.playerId) {
      reward -= REWARD.death;
      tally.deaths += 1;
    }
  }
  return reward;
}
