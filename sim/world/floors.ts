import type { ZoneTerrain } from '../content/terrain-types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import { lineOfSight } from '../nav/grid.ts';
import { heightJump } from '../nav/terrain.ts';
import type { World } from './types.ts';

export function sameFloor(world: World, from: ReadonlyVec2, to: ReadonlyVec2): boolean {
  const terrain: ZoneTerrain | null = world.zone.terrain;
  return terrain === null || heightJump(world.zone, from, to) <= terrain.groundStep;
}

export function canReach(world: World, from: ReadonlyVec2, to: ReadonlyVec2): boolean {
  return lineOfSight(world.grid, from, to) && sameFloor(world, from, to);
}
