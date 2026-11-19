import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, PropDef, ZoneDef, ZoneProp } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import type { NavGrid } from './grid.ts';
import { buildNavGrid, cellIndex, isWalkable, setDriftOpen } from './grid.ts';
import { findPath, reachFrom } from './path.ts';

const content: Content = loadContent();

const APPROACH = {
  rings: [4, 8],
  directions: 16,
} as const;

interface Target {
  readonly label: string;
  readonly at: ReadonlyVec2;
  readonly reach: number;
}

function targets(zone: ZoneDef): Target[] {
  const reach: number = content.trade.reach;
  const props: Target[] = zone.props.flatMap((placed: ZoneProp): Target[] => {
    const def: PropDef | undefined = content.props.get(placed.prop);
    return def !== undefined && placed.when.length === 0 && (def.cache !== null || def.service !== null) ? [{ label: `${placed.prop} at ${String(placed.x)}, ${String(placed.z)}`, at: placed, reach: reach + def.blockRadius }] : [];
  });
  return [
    ...zone.exits.flatMap((exit): Target[] => [{ label: `exit ${exit.id}`, at: exit, reach: exit.radius }, { label: `arrival ${exit.id}`, at: exit.arrival, reach: exit.radius }]),
    ...zone.checkpoints.map((checkpoint): Target => ({ label: `checkpoint ${checkpoint.id}`, at: checkpoint, reach: checkpoint.radius })),
    ...(zone.waypoint === null ? [] : [{ label: 'waypoint', at: zone.waypoint, reach: zone.waypoint.radius }]),
    ...zone.npcs.map((npc): Target => ({ label: `npc ${npc.npc}`, at: npc, reach })),
    ...zone.packs.map((pack, at: number): Target => ({ label: `pack ${String(at)}`, at: pack, reach })),
    ...props,
  ];
}

function approaches(grid: NavGrid, reached: Uint8Array, at: ReadonlyVec2): Vec2[] {
  return APPROACH.rings.flatMap((ring: number): Vec2[] => Array.from({ length: APPROACH.directions }, (_: unknown, index: number): Vec2 => {
    const angle: number = (index / APPROACH.directions) * Math.PI * 2;
    return { x: at.x + Math.cos(angle) * ring, z: at.z + Math.sin(angle) * ring };
  }).filter((from: Vec2): boolean => isWalkable(grid, from.x, from.z) && reached[cellIndex(grid, from.x, from.z)] === 1));
}

function arrives(grid: NavGrid, from: Vec2, target: Target): boolean {
  const end: Vec2 | undefined = findPath(grid, from, target.at).at(-1);
  return end !== undefined && Math.hypot(end.x - target.at.x, end.z - target.at.z) <= target.reach;
}

function unreached(zone: ZoneDef): string[] {
  const grid: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
  for (const patch of grid.drifts) setDriftOpen(grid, patch, true);
  const reached: Uint8Array = reachFrom(grid, zone.playerStart);
  return targets(zone).flatMap((target: Target): string[] => approaches(grid, reached, target.at).some((from: Vec2): boolean => arrives(grid, from, target)) ? [] : [`${zone.id} ${target.label}`]);
}

void test('in every walkable zone the hero walks from the start\'s open ground up to every exit, arrival, checkpoint, waypoint, keeper, cache and pack', (): void => {
  const missed: string[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.void === null).flatMap(unreached);
  assert.deepEqual(missed, []);
});
