import type { Vec2 } from '../math.ts';
import type { MonsterState, PlayerState, World, WorldEvent } from '../world/types.ts';
import type { Action } from './contract.ts';
import { NO_ACTION, RL } from './contract.ts';

export interface Moment {
  readonly time: number;
  readonly amount: number;
}

export interface Hit {
  readonly time: number;
  readonly sourceId: number;
}

export interface Sighting {
  readonly pos: Vec2;
  readonly time: number;
}

export interface Recall {
  decisions: readonly [Action, Action];
  taken: Moment[];
  dealt: Moment[];
  lastHit: Hit | null;
  readonly sightings: Map<number, Sighting>;
}

export function createRecall(): Recall {
  return { decisions: [NO_ACTION, NO_ACTION], taken: [], dealt: [], lastHit: null, sightings: new Map<number, Sighting>() };
}

export function rememberDecision(recall: Recall, action: Action): void {
  recall.decisions = [action, recall.decisions[0]];
}

function fresh(moments: readonly Moment[], now: number): Moment[] {
  return moments.filter((moment: Moment): boolean => now - moment.time <= RL.recentWindow);
}

export function recallEvents(recall: Recall, world: World, hero: PlayerState, events: readonly WorldEvent[]): void {
  const now: number = world.time;
  for (const event of events) {
    if (event.type !== 'damage') continue;
    if (event.targetId === hero.id) {
      recall.taken.push({ time: now, amount: event.amount });
      recall.lastHit = { time: now, sourceId: event.sourceId };
    }
    else if (event.targetTeam === 'monster' || event.sourceId === hero.id) recall.dealt.push({ time: now, amount: event.amount });
  }
  recall.taken = fresh(recall.taken, now);
  recall.dealt = fresh(recall.dealt, now);
}

export function recentAmount(moments: readonly Moment[], now: number): number {
  return fresh(moments, now).reduce((sum: number, moment: Moment): number => sum + moment.amount, 0);
}

export function noteSeen(recall: Recall, world: World, seen: readonly MonsterState[]): void {
  for (const monster of seen) recall.sightings.set(monster.id, { pos: { x: monster.pos.x, z: monster.pos.z }, time: world.time });
  for (const [id, sighting] of recall.sightings) {
    if (world.time - sighting.time > RL.memoryWindow) recall.sightings.delete(id);
  }
}
