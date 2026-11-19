import { botInDanger } from '../bot.ts';
import type { Vec2 } from '../math.ts';
import type { PlayerState, World } from '../world/types.ts';
import { moveDirection } from './moves.ts';
import { MOVE_CHOICES, RL } from './contract.ts';

function dangerAlong(world: World, hero: PlayerState, direction: Vec2 | null): number {
  const from: Vec2 = hero.pos;
  if (direction === null) return botInDanger(world, from, 0, hero) ? 1 : 0;
  let hit: number = 0;
  for (const step of RL.dangerSteps) {
    if (botInDanger(world, { x: from.x + direction.x * step, z: from.z + direction.z * step }, 0, hero)) hit += 1;
  }
  return hit / RL.dangerSteps.length;
}

export function dangerAround(world: World, hero: PlayerState): number[] {
  return Array.from({ length: MOVE_CHOICES }, (_unused: unknown, move: number): number => dangerAlong(world, hero, moveDirection(move)));
}
