import type { PropDef, ZoneDef } from '../content/types.ts';
import type { CliffRule, TerrainCliff } from '../content/terrain-types.ts';
import { zoneColumns, zoneRows } from './layout.ts';
import { floorAt, heightAt, rampAt, terrainHash, terrainNoise } from './terrain.ts';

export const CLIFF_ROCKS = {
  reach: 1.6,
  patch: 0.09,
  jitter: 0.8,
  turn: 0.6,
  looks: 8,
  saltStep: 17,
  propClear: 3,
} as const;

export interface CliffSpot {
  readonly x: number;
  readonly z: number;
  readonly rotationDegrees: number;
  readonly pick: number;
  readonly grow: number;
}

export interface CliffRock {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly rotationDegrees: number;
  readonly size: number;
}

interface Look {
  readonly x: number;
  readonly z: number;
}

const LOOKS: readonly Look[] = Array.from({ length: CLIFF_ROCKS.looks }, (_: unknown, index: number): Look => ({ x: Math.cos((index / CLIFF_ROCKS.looks) * Math.PI * 2), z: Math.sin((index / CLIFF_ROCKS.looks) * Math.PI * 2) }));

function cellRamp(zone: ZoneDef, x: number, z: number): boolean {
  return rampAt(zone, Math.floor(x / zone.cellSize), Math.floor(z / zone.cellSize));
}

function nearRamp(zone: ZoneDef, x: number, z: number): boolean {
  return cellRamp(zone, x, z) || LOOKS.some((look: Look): boolean => cellRamp(zone, x + look.x * CLIFF_ROCKS.reach, z + look.z * CLIFF_ROCKS.reach));
}

function nearExit(zone: ZoneDef, x: number, z: number): boolean {
  return zone.exits.some((exit): boolean => Math.hypot(exit.x - x, exit.z - z) < exit.radius + CLIFF_ROCKS.reach);
}

function nearProp(zone: ZoneDef, x: number, z: number): boolean {
  return zone.props.some((placed): boolean => Math.hypot(placed.x - x, placed.z - z) < CLIFF_ROCKS.propClear);
}

function cliffLook(zone: ZoneDef, rule: CliffRule, x: number, z: number): Look | null {
  const here: number = heightAt(zone, x, z);
  let best: Look | null = null;
  let bestRise: number = rule.drop;
  for (const look of LOOKS) {
    const there: number = heightAt(zone, x + look.x * CLIFF_ROCKS.reach, z + look.z * CLIFF_ROCKS.reach);
    const rise: number = rule.side === 'foot' ? there - here : here - there;
    if (rise >= bestRise) {
      best = look;
      bestRise = rise;
    }
  }
  return best;
}

export function cliffSpots(zone: ZoneDef, rule: CliffRule, salt: number): CliffSpot[] {
  if (zone.terrain === null) return [];
  const width: number = zoneColumns(zone) * zone.cellSize;
  const depth: number = zoneRows(zone) * zone.cellSize;
  const spots: CliffSpot[] = [];
  for (let row: number = 0; row * rule.step < depth; row += 1) {
    for (let column: number = 0; column * rule.step < width; column += 1) {
      const x: number = (column + 0.5 + (terrainHash(column, row, salt) - 0.5) * CLIFF_ROCKS.jitter) * rule.step;
      const z: number = (row + 0.5 + (terrainHash(row, column, salt + 1) - 0.5) * CLIFF_ROCKS.jitter) * rule.step;
      if ((terrainNoise(x * CLIFF_ROCKS.patch, z * CLIFF_ROCKS.patch, salt) + 1) / 2 > rule.cover) continue;
      if (!floorAt(zone, x, z) || nearExit(zone, x, z) || nearRamp(zone, x, z)) continue;
      const look: Look | null = cliffLook(zone, rule, x, z);
      if (look === null) continue;
      const atX: number = x + look.x * rule.tuck;
      const atZ: number = z + look.z * rule.tuck;
      if (nearProp(zone, atX, atZ)) continue;
      const turn: number = (terrainHash(column, row + 11, salt + 3) - 0.5) * CLIFF_ROCKS.turn * 360;
      spots.push({ x: atX, z: atZ, rotationDegrees: (Math.atan2(look.x, look.z) * 180) / Math.PI + turn, pick: terrainHash(column + 7, row + 3, salt + 2), grow: terrainHash(row + 5, column + 13, salt + 4) });
    }
  }
  return spots;
}

function rocksOf(zone: ZoneDef, props: ReadonlyMap<string, PropDef>, rule: TerrainCliff, salt: number): CliffRock[] {
  return cliffSpots(zone, rule, salt).flatMap((spot: CliffSpot): CliffRock[] => {
    const prop: string | undefined = rule.props[Math.min(rule.props.length - 1, Math.floor(spot.pick * rule.props.length))];
    if (prop === undefined || !props.has(prop)) return [];
    return [{ prop, x: spot.x, z: spot.z, rotationDegrees: spot.rotationDegrees, size: rule.size.least + (rule.size.most - rule.size.least) * spot.grow }];
  });
}

const placedRocks: WeakMap<ZoneDef, readonly CliffRock[]> = new WeakMap<ZoneDef, readonly CliffRock[]>();

export function cliffRocks(zone: ZoneDef, props: ReadonlyMap<string, PropDef>): readonly CliffRock[] {
  const known: readonly CliffRock[] | undefined = placedRocks.get(zone);
  if (known !== undefined) return known;
  const rocks: CliffRock[] = (zone.terrain?.cliffs ?? []).flatMap((rule: TerrainCliff, index: number): CliffRock[] => rocksOf(zone, props, rule, (index + 1) * CLIFF_ROCKS.saltStep));
  placedRocks.set(zone, rocks);
  return rocks;
}
