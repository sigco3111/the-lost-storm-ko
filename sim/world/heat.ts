import type { SkillDef, SurfaceDef, SurfaceHeat } from '../content/types.ts';
import { tileAtCell } from '../nav/layout.ts';
import { ignite } from './combat.ts';
import type { Actor, BurnState, Offence, World } from './types.ts';

export const HEAT = {
  sourceId: -1,
  refreshTicks: 1,
} as const;

const GROUND_OFFENCE: Offence = { sourceId: HEAT.sourceId, team: 'monster', faction: null, damageMin: 0, damageMax: 0, damagePercent: 0, critChance: 0, critMultiplier: 1 };

export function heatAt(world: World, x: number, z: number): SurfaceHeat | null {
  const zone = world.zone;
  const tile: string = tileAtCell(zone, Math.floor(x / zone.cellSize), Math.floor(z / zone.cellSize));
  const surfaceId: string | undefined = zone.floors[tile];
  const surface: SurfaceDef | undefined = surfaceId === undefined ? undefined : world.content.surfaces.get(surfaceId);
  return surface?.heat ?? null;
}

function feelsHeat(actor: Actor): boolean {
  if (!actor.alive) return false;
  return actor.kind === 'player' || !actor.def.heatproof;
}

function stillBurning(burn: BurnState | null, skill: SkillDef): boolean {
  return burn !== null && burn.source === skill.id && burn.ticksLeft > HEAT.refreshTicks;
}

function scorchActor(world: World, actor: Actor): void {
  if (!feelsHeat(actor)) return;
  const heat: SurfaceHeat | null = heatAt(world, actor.pos.x, actor.pos.z);
  if (heat === null) return;
  const skill: SkillDef | undefined = world.content.skills.get(heat.skill);
  if (skill === undefined || stillBurning(actor.burn, skill)) return;
  ignite(world, GROUND_OFFENCE, actor, skill, actor.maxLife * heat.lifeShare);
}

export function stepHeat(world: World): void {
  scorchActor(world, world.player);
  for (const monster of world.monsters) scorchActor(world, monster);
}
