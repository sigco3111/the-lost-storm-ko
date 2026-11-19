import type { ZoneDef } from '../content/types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import type { TerrainRough, ZoneTerrain } from '../content/terrain-types.ts';
import { TERRAIN_MARKS } from '../content/terrain-types.ts';
import { isFloorCell } from './layout.ts';

export const TERRAIN = {
  meet: 0.05,
  edgeSamples: [0.1, 0.5, 0.9],
  slope: 0.75,
  probe: 0.25,
  hashX: 127.1,
  hashZ: 311.7,
  hashSalt: 74.7,
  hashScale: 43758.5453,
} as const;

export interface TerrainCell {
  readonly column: number;
  readonly row: number;
}

export type RampAxis = 'x' | 'z';

export type TileSurface = { readonly kind: 'flat'; readonly height: number } | { readonly kind: 'ramp'; readonly axis: RampAxis; readonly start: number; readonly length: number; readonly from: number; readonly to: number };

export interface TerrainMap {
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly surfaces: readonly TileSurface[];
}

export type TerrainBuild = { readonly ok: true; readonly map: TerrainMap } | { readonly ok: false; readonly problem: string };

function levelOf(mark: string, rise: number): number | null {
  const index: number = TERRAIN_MARKS.levels.indexOf(mark);
  return index < 0 || mark === '' ? null : index * rise;
}

interface RunEnd {
  readonly at: number;
  readonly height: number;
}

function runEnd(levels: readonly string[], rise: number, column: number, row: number, dc: number, dr: number): RunEnd | null {
  let c: number = column + dc;
  let r: number = row + dr;
  while ((levels[r]?.charAt(c) ?? '') === TERRAIN_MARKS.ramp) {
    c += dc;
    r += dr;
  }
  const height: number | null = levelOf(levels[r]?.charAt(c) ?? '', rise);
  return height === null ? null : { at: dc !== 0 ? c : r, height };
}

function ramp(levels: readonly string[], rise: number, cellSize: number, column: number, row: number, axis: RampAxis): TileSurface | null {
  const step: readonly [number, number] = axis === 'x' ? [1, 0] : [0, 1];
  const before: RunEnd | null = runEnd(levels, rise, column, row, -step[0], -step[1]);
  const after: RunEnd | null = runEnd(levels, rise, column, row, step[0], step[1]);
  if (before === null || after === null || before.height === after.height) return null;
  return { kind: 'ramp', axis, start: (before.at + 1) * cellSize, length: (after.at - before.at - 1) * cellSize, from: before.height, to: after.height };
}

export function buildTerrain(terrain: ZoneTerrain, tiles: readonly string[], cellSize: number): TerrainBuild {
  const { levels, rise } = terrain;
  const rows: number = tiles.length;
  const columns: number = tiles[0]?.length ?? 0;
  if (levels.length !== rows) return { ok: false, problem: `has ${levels.length} rows of levels for ${rows} rows of tiles` };
  const surfaces: TileSurface[] = [];
  for (let row: number = 0; row < rows; row += 1) {
    const line: string = levels[row] ?? '';
    if (line.length !== columns) return { ok: false, problem: `row ${row} has ${line.length} levels for ${columns} tiles` };
    for (let column: number = 0; column < columns; column += 1) {
      const mark: string = line.charAt(column);
      const height: number | null = levelOf(mark, rise);
      if (height !== null) {
        surfaces.push({ kind: 'flat', height });
        continue;
      }
      if (mark !== TERRAIN_MARKS.ramp) return { ok: false, problem: `row ${row} column ${column} has "${mark}", which is neither a level nor a ramp` };
      const found: TileSurface | null = ramp(levels, rise, cellSize, column, row, 'x') ?? ramp(levels, rise, cellSize, column, row, 'z');
      if (found === null) return { ok: false, problem: `the ramp at row ${row} column ${column} does not run between two different levels along a row or a column` };
      surfaces.push(found);
    }
  }
  return { ok: true, map: { columns, rows, cellSize, surfaces } };
}

const MAPS: WeakMap<ZoneDef, TerrainMap | null> = new WeakMap<ZoneDef, TerrainMap | null>();

export function terrainMap(zone: ZoneDef): TerrainMap | null {
  const known: TerrainMap | null | undefined = MAPS.get(zone);
  if (known !== undefined) return known;
  const built: TerrainBuild | null = zone.terrain === null ? null : buildTerrain(zone.terrain, zone.tiles, zone.cellSize);
  const map: TerrainMap | null = built === null || !built.ok ? null : built.map;
  MAPS.set(zone, map);
  return map;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

export function surfaceHeight(map: TerrainMap, column: number, row: number, x: number, z: number): number {
  const c: number = clamp(column, 0, map.columns - 1);
  const r: number = clamp(row, 0, map.rows - 1);
  const surface: TileSurface | undefined = map.surfaces[r * map.columns + c];
  if (surface === undefined) return 0;
  if (surface.kind === 'flat') return surface.height;
  const along: number = surface.axis === 'x' ? clamp(x, c * map.cellSize, (c + 1) * map.cellSize) : clamp(z, r * map.cellSize, (r + 1) * map.cellSize);
  const share: number = surface.length > 0 ? clamp((along - surface.start) / surface.length, 0, 1) : 0;
  return surface.from + (surface.to - surface.from) * share;
}

export function tileHeight(zone: ZoneDef, column: number, row: number, x: number, z: number): number {
  const map: TerrainMap | null = terrainMap(zone);
  return zone.floorHeight + (map === null ? 0 : surfaceHeight(map, column, row, x, z));
}

export function terrainHash(x: number, z: number, salt: number): number {
  const value: number = Math.sin(x * TERRAIN.hashX + z * TERRAIN.hashZ + salt * TERRAIN.hashSalt) * TERRAIN.hashScale;
  return value - Math.floor(value);
}

function eased(t: number): number {
  return t * t * (3 - 2 * t);
}

export function terrainNoise(x: number, z: number, salt: number): number {
  const ix: number = Math.floor(x);
  const iz: number = Math.floor(z);
  const fx: number = eased(x - ix);
  const fz: number = eased(z - iz);
  const northWest: number = terrainHash(ix, iz, salt);
  const southWest: number = terrainHash(ix, iz + 1, salt);
  const top: number = northWest + (terrainHash(ix + 1, iz, salt) - northWest) * fx;
  const bottom: number = southWest + (terrainHash(ix + 1, iz + 1, salt) - southWest) * fx;
  return (top + (bottom - top) * fz) * 2 - 1;
}

export interface NoiseLattice {
  readonly scale: number;
  readonly salt: number;
  readonly columns: number;
  readonly rows: number;
  readonly values: Float64Array;
}

const LATTICE_MARGIN = 1;

export function noiseLattice(width: number, depth: number, scale: number, salt: number): NoiseLattice {
  const columns: number = Math.ceil(width / scale) + 2 * LATTICE_MARGIN + 1;
  const rows: number = Math.ceil(depth / scale) + 2 * LATTICE_MARGIN + 1;
  const values: Float64Array = new Float64Array(columns * rows);
  for (let row: number = 0; row < rows; row += 1) {
    for (let column: number = 0; column < columns; column += 1) values[row * columns + column] = terrainHash(column - LATTICE_MARGIN, row - LATTICE_MARGIN, salt);
  }
  return { scale, salt, columns, rows, values };
}

export function latticeNoise(lattice: NoiseLattice, x: number, z: number): number {
  const sx: number = x / lattice.scale;
  const sz: number = z / lattice.scale;
  const ix: number = Math.floor(sx);
  const iz: number = Math.floor(sz);
  const column: number = ix + LATTICE_MARGIN;
  const row: number = iz + LATTICE_MARGIN;
  if (column < 0 || row < 0 || column + 1 >= lattice.columns || row + 1 >= lattice.rows) return terrainNoise(sx, sz, lattice.salt);
  const fx: number = eased(sx - ix);
  const fz: number = eased(sz - iz);
  const at: number = row * lattice.columns + column;
  const northWest: number = lattice.values[at] ?? 0;
  const southWest: number = lattice.values[at + lattice.columns] ?? 0;
  const top: number = northWest + ((lattice.values[at + 1] ?? 0) - northWest) * fx;
  const bottom: number = southWest + ((lattice.values[at + lattice.columns + 1] ?? 0) - southWest) * fx;
  return (top + (bottom - top) * fz) * 2 - 1;
}

interface CalmTiles {
  readonly ramps: Uint8Array;
  readonly rampColumns: number;
  readonly letters: Uint8Array;
  readonly width: number;
  readonly rows: number;
  readonly quiet: Uint8Array;
}

const CALM: WeakMap<ZoneDef, CalmTiles> = new WeakMap<ZoneDef, CalmTiles>();

function calmTilesOf(zone: ZoneDef, calm: readonly string[]): CalmTiles {
  const known: CalmTiles | undefined = CALM.get(zone);
  if (known !== undefined) return known;
  const map: TerrainMap | null = terrainMap(zone);
  const ramps: Uint8Array = new Uint8Array(map === null ? 0 : map.surfaces.length);
  if (map !== null) {
    for (let index: number = 0; index < map.surfaces.length; index += 1) ramps[index] = map.surfaces[index]?.kind === 'ramp' ? 1 : 0;
  }
  const width: number = zone.tiles.reduce((most: number, line: string): number => Math.max(most, line.length), 0);
  const letters: Uint8Array = new Uint8Array(width * zone.tiles.length);
  zone.tiles.forEach((line: string, row: number): void => {
    for (let column: number = 0; column < line.length; column += 1) letters[row * width + column] = calm.includes(line.charAt(column)) ? 1 : 0;
  });
  const quiet: Uint8Array = new Uint8Array(width * zone.tiles.length);
  const built: CalmTiles = { ramps, rampColumns: map === null ? 0 : map.columns, letters, width, rows: zone.tiles.length, quiet };
  for (let row: number = 0; row < built.rows; row += 1) {
    for (let column: number = 0; column < width; column += 1) quiet[row * width + column] = calmAround(built, column, row) ? 0 : 1;
  }
  CALM.set(zone, built);
  return built;
}

function calmTile(tiles: CalmTiles, column: number, row: number): boolean {
  const index: number = row * tiles.rampColumns + column;
  if (index >= 0 && index < tiles.ramps.length && tiles.ramps[index] === 1) return true;
  return row >= 0 && row < tiles.rows && column >= 0 && column < tiles.width && tiles.letters[row * tiles.width + column] === 1;
}

function calmAround(tiles: CalmTiles, column: number, row: number): boolean {
  for (let dr: number = -1; dr <= 1; dr += 1) {
    for (let dc: number = -1; dc <= 1; dc += 1) {
      if (calmTile(tiles, column + dc, row + dr)) return true;
    }
  }
  return false;
}

function calmShare(zone: ZoneDef, calm: readonly string[], x: number, z: number): number {
  const tiles: CalmTiles = calmTilesOf(zone, calm);
  const size: number = zone.cellSize;
  const column: number = Math.floor(x / size);
  const row: number = Math.floor(z / size);
  if (row >= 0 && row < tiles.rows && column >= 0 && column < tiles.width && tiles.quiet[row * tiles.width + column] === 1) return eased(1);
  let nearest: number = size;
  for (let dr: number = -1; dr <= 1; dr += 1) {
    for (let dc: number = -1; dc <= 1; dc += 1) {
      if (!calmTile(tiles, column + dc, row + dr)) continue;
      const left: number = (column + dc) * size;
      const top: number = (row + dr) * size;
      nearest = Math.min(nearest, Math.hypot(Math.max(left - x, 0, x - left - size), Math.max(top - z, 0, z - top - size)));
    }
  }
  return eased(clamp(nearest / size, 0, 1));
}

export function terrainCell(zone: ZoneDef, x: number, z: number): TerrainCell {
  const size: number = zone.cellSize;
  const rough: TerrainRough | null = zone.terrain?.rough ?? null;
  if (rough === null || rough.reach <= 0) return { column: Math.floor(x / size), row: Math.floor(z / size) };
  const reach: number = rough.reach * calmShare(zone, rough.calm, x, z);
  const warpedX: number = x + reach * terrainNoise(x / rough.scale, z / rough.scale, 1);
  const warpedZ: number = z + reach * terrainNoise(x / rough.scale, z / rough.scale, 2);
  return { column: Math.floor(warpedX / size), row: Math.floor(warpedZ / size) };
}

export function heightAt(zone: ZoneDef, x: number, z: number): number {
  const cell: TerrainCell = terrainCell(zone, x, z);
  return tileHeight(zone, cell.column, cell.row, x, z);
}

export function heightJump(zone: ZoneDef, from: ReadonlyVec2, to: ReadonlyVec2): number {
  if (zone.terrain === null) return 0;
  const steps: number = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / TERRAIN.probe);
  let last: number = heightAt(zone, from.x, from.z);
  let jump: number = 0;
  for (let step: number = 1; step <= steps; step += 1) {
    const share: number = step / steps;
    const next: number = heightAt(zone, from.x + (to.x - from.x) * share, from.z + (to.z - from.z) * share);
    jump = Math.max(jump, Math.abs(next - last));
    last = next;
  }
  return jump;
}

export function floorAt(zone: ZoneDef, x: number, z: number): boolean {
  const cell: TerrainCell = terrainCell(zone, x, z);
  return isFloorCell(zone, cell.column, cell.row);
}

export function standsAt(zone: ZoneDef, x: number, z: number, margin: number): boolean {
  const centre: TerrainCell = terrainCell(zone, x, z);
  if (!isFloorCell(zone, centre.column, centre.row)) return false;
  if (margin <= 0) return true;
  const here: number = tileHeight(zone, centre.column, centre.row, x, z);
  for (let step: number = 0; step < 8; step += 1) {
    const angle: number = (step / 8) * Math.PI * 2;
    const px: number = x + Math.cos(angle) * margin;
    const pz: number = z + Math.sin(angle) * margin;
    const cell: TerrainCell = terrainCell(zone, px, pz);
    if (!isFloorCell(zone, cell.column, cell.row) || Math.abs(tileHeight(zone, cell.column, cell.row, px, pz) - here) > Math.max(TERRAIN.meet, TERRAIN.slope * margin)) return false;
  }
  return true;
}

export function rampAt(zone: ZoneDef, column: number, row: number): boolean {
  const map: TerrainMap | null = terrainMap(zone);
  return map !== null && map.surfaces[row * map.columns + column]?.kind === 'ramp';
}

function meetAt(map: TerrainMap, column: number, row: number, other: readonly [number, number], x: number, z: number): boolean {
  return Math.abs(surfaceHeight(map, column, row, x, z) - surfaceHeight(map, other[0], other[1], x, z)) <= TERRAIN.meet;
}

export function surfacesMeet(zone: ZoneDef, column: number, row: number, dc: number, dr: number): boolean {
  if (!isFloorCell(zone, column + dc, row + dr)) return false;
  const map: TerrainMap | null = terrainMap(zone);
  if (map === null || (dc === 0 && dr === 0)) return true;
  const size: number = zone.cellSize;
  const other: readonly [number, number] = [column + dc, row + dr];
  if (dc !== 0 && dr !== 0) return meetAt(map, column, row, other, (column + (dc > 0 ? 1 : 0)) * size, (row + (dr > 0 ? 1 : 0)) * size);
  return TERRAIN.edgeSamples.every((share: number): boolean => {
    const x: number = dc !== 0 ? (column + (dc > 0 ? 1 : 0)) * size : (column + share) * size;
    const z: number = dr !== 0 ? (row + (dr > 0 ? 1 : 0)) * size : (row + share) * size;
    return meetAt(map, column, row, other, x, z);
  });
}
