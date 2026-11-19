import type { Content, PropDef, ZoneDef, ZonePack, ZoneProp } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { zoneRankProblems } from '../content/parse-ranks.ts';
import type { NavGrid } from '../nav/grid.ts';
import { buildNavGrid, cellIndex, isWalkable, propBlockers, setDriftOpen } from '../nav/grid.ts';
import type { ScreenLimit } from './generate.ts';
import { CAVE_GEN } from './generate.ts';

export const CAVE_CHECKS = {
  packApart: 9,
  notice: 10.5,
  exitClear: 3,
  step: 2,
  crumb: 8,
} as const;

interface Weighed {
  readonly at: ReadonlyVec2;
  readonly weight: number;
}

function packWeight(pack: ZonePack): number {
  return pack.members.reduce((sum: number, member): number => sum + member.count, 0);
}

function peakOver(zone: ZoneDef, points: readonly Weighed[]): number {
  const width: number = (zone.tiles[0]?.length ?? 0) * zone.cellSize;
  const depth: number = zone.tiles.length * zone.cellSize;
  let peak: number = 0;
  for (let z: number = 0; z <= depth; z += CAVE_CHECKS.step) {
    for (let x: number = 0; x <= width; x += CAVE_CHECKS.step) {
      let seen: number = 0;
      for (const point of points) if (Math.hypot(point.at.x - x, point.at.z - z) <= CAVE_GEN.screen) seen += point.weight;
      peak = Math.max(peak, seen);
    }
  }
  return peak;
}

function lightsOf(content: Content, zone: ZoneDef): Weighed[] {
  return zone.props.filter((placed: ZoneProp): boolean => (content.props.get(placed.prop)?.light ?? null) !== null).map((placed: ZoneProp): Weighed => ({ at: placed, weight: 1 }));
}

export function screenLoad(content: Content, zone: ZoneDef): ScreenLimit {
  return { monsters: peakOver(zone, zone.packs.map((pack: ZonePack): Weighed => ({ at: pack, weight: packWeight(pack) }))), lights: peakOver(zone, lightsOf(content, zone)) };
}

function flood(grid: NavGrid, from: ReadonlyVec2): Uint8Array {
  const seen: Uint8Array = new Uint8Array(grid.columns * grid.rows);
  const first: number = cellIndex(grid, from.x, from.z);
  if (first < 0 || grid.walkable[first] !== 1) return seen;
  seen[first] = 1;
  const queue: number[] = [first];
  for (let head: number = 0; head < queue.length; head += 1) {
    const at: number = queue[head] ?? 0;
    const column: number = at % grid.columns;
    const row: number = Math.floor(at / grid.columns);
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const c: number = column + dc;
      const r: number = row + dr;
      if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) continue;
      const next: number = r * grid.columns + c;
      if (seen[next] === 1 || grid.walkable[next] !== 1) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return seen;
}

export function strandedPockets(grid: NavGrid, field: Uint8Array): number[] {
  const seen: Uint8Array = Uint8Array.from(field);
  const sizes: number[] = [];
  for (let index: number = 0; index < seen.length; index += 1) {
    if (seen[index] === 1 || grid.walkable[index] !== 1) continue;
    seen[index] = 1;
    const queue: number[] = [index];
    for (let head: number = 0; head < queue.length; head += 1) {
      const at: number = queue[head] ?? 0;
      const column: number = at % grid.columns;
      const row: number = Math.floor(at / grid.columns);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const c: number = column + dc;
        const r: number = row + dr;
        if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) continue;
        const next: number = r * grid.columns + c;
        if (seen[next] === 1 || grid.walkable[next] !== 1) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    sizes.push(queue.length);
  }
  return sizes;
}

function reached(grid: NavGrid, field: Uint8Array, point: ReadonlyVec2): boolean {
  const index: number = cellIndex(grid, point.x, point.z);
  return index >= 0 && field[index] === 1;
}

function safePoints(zone: ZoneDef): { readonly label: string; readonly at: Vec2 }[] {
  return [
    { label: 'start', at: zone.playerStart },
    ...zone.exits.flatMap((exit): { readonly label: string; readonly at: Vec2 }[] => [{ label: `exit ${exit.id}`, at: exit }, { label: `arrival ${exit.id}`, at: exit.arrival }]),
    ...zone.checkpoints.map((checkpoint): { readonly label: string; readonly at: Vec2 } => ({ label: `checkpoint ${checkpoint.id}`, at: checkpoint })),
    ...(zone.waypoint === null ? [] : [{ label: 'waypoint', at: zone.waypoint }]),
  ];
}

export function caveProblems(content: Content, zone: ZoneDef, limit: ScreenLimit): string[] {
  const problems: string[] = [];
  const grid: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
  for (const patch of grid.drifts) setDriftOpen(grid, patch, true);
  const field: Uint8Array = flood(grid, zone.playerStart);
  const pockets: number[] = strandedPockets(grid, field).filter((size: number): boolean => size > CAVE_CHECKS.crumb);
  if (pockets.length > 0) problems.push(`${pockets.reduce((sum: number, size: number): number => sum + size, 0)} walkable cells in ${pockets.length} pockets cannot be reached from the start`);
  const safe = safePoints(zone);
  for (const point of safe) if (!isWalkable(grid, point.at.x, point.at.z) || !reached(grid, field, point.at)) problems.push(`${point.label} is not reachable on foot`);
  zone.packs.forEach((pack: ZonePack, at: number): void => {
    if (!reached(grid, field, pack)) problems.push(`pack ${at} is not reachable on foot`);
    zone.packs.slice(at + 1).forEach((other: ZonePack, later: number): void => {
      if (distance(pack, other) < CAVE_CHECKS.packApart) problems.push(`packs ${at} and ${at + 1 + later} stand ${distance(pack, other).toFixed(1)} m apart`);
    });
    for (const point of safe) if (distance(pack, point.at) < CAVE_CHECKS.notice) problems.push(`pack ${at} stands ${distance(pack, point.at).toFixed(1)} m from the ${point.label}`);
  });
  const blocking: { readonly prop: string; readonly at: Vec2; readonly reach: number }[] = zone.props.flatMap((placed: ZoneProp): { readonly prop: string; readonly at: Vec2; readonly reach: number }[] => {
    const def: PropDef | undefined = content.props.get(placed.prop);
    if (def === undefined) return [{ prop: placed.prop, at: placed, reach: 0 }];
    return propBlockers(def, placed.x, placed.z, placed.rotationDegrees).length > 0 ? [{ prop: placed.prop, at: placed, reach: Math.max(def.blockRadius, def.blockLength / 2 + def.blockRadius) }] : [];
  });
  for (const exit of zone.exits) for (const prop of blocking) if (distance(prop.at, exit) < exit.radius + prop.reach + CAVE_CHECKS.exitClear) problems.push(`${prop.prop} blocks exit ${exit.id}`);
  if (zone.waypoint !== null) for (const prop of blocking) if (distance(prop.at, zone.waypoint) < zone.waypoint.radius + prop.reach + CAVE_CHECKS.exitClear) problems.push(`${prop.prop} blocks the waypoint`);
  for (const placed of zone.props) if (!content.props.has(placed.prop)) problems.push(`unknown prop ${placed.prop}`);
  const load: ScreenLimit = screenLoad(content, zone);
  if (load.monsters > limit.monsters) problems.push(`${load.monsters} monsters fit on one screen, more than ${limit.monsters}`);
  if (load.lights > limit.lights) problems.push(`${load.lights} lights fit on one screen, more than ${limit.lights}`);
  problems.push(...zoneRankProblems(content, zone));
  return problems;
}
