import { distance } from '../../sim/math.ts';
import type { MonsterState, World } from '../../sim/world/types.ts';

export const FIGHT_NEAR = {
  reach: 20,
} as const;

export function fightNear(world: World): boolean {
  if (!world.player.alive) return false;
  return world.monsters.some((monster: MonsterState): boolean => monster.alive && monster.aggro && distance(monster.pos, world.player.pos) <= FIGHT_NEAR.reach);
}
