import { TERRAIN_MARKS } from '../content/terrain-types.ts';
import type { Fields } from '../content/read.ts';
import { isFields } from '../content/read.ts';
import type { Vec2 } from '../math.ts';
import type { CaveLayout, CavePack } from './generate.ts';
import { CAVE_GEN } from './generate.ts';
import type { KitWalls } from './kit.ts';
import { createRaster, ROCK, wallLevels } from './raster.ts';
import type { CaveRaster } from './raster.ts';
import { packRecord } from './zone.ts';

export const CAVE_WING = {
  margin: 4,
  reach: 40,
  passageRadius: 2,
  checkpointRadius: 2.5,
  approach: 6,
  approachAside: 0.9,
  backing: 1,
  exitRadius: 2,
  descentShift: 30,
  arrivalAway: 2,
} as const;

export interface WingHost {
  readonly record: Readonly<Record<string, unknown>>;
  readonly exit: string;
}

export interface WingPlacement {
  readonly column: number;
  readonly row: number;
  readonly passage: readonly Cell[];
}

export type WingResult = { readonly ok: true; readonly record: Record<string, unknown>; readonly placement: WingPlacement } | { readonly ok: false; readonly problem: string };

interface Cell {
  readonly column: number;
  readonly row: number;
}

interface Grid {
  readonly tiles: readonly string[];
  readonly levels: readonly string[];
}

type Owner = 'host' | 'wing' | 'passage';

function rows(holder: unknown, key: string): string[] | null {
  if (!isFields(holder)) return null;
  const value: unknown = holder[key];
  return Array.isArray(value) && value.every((row: unknown): row is string => typeof row === 'string') ? [...value] : null;
}

function list(record: Readonly<Record<string, unknown>>, key: string): unknown[] {
  const value: unknown = record[key];
  return Array.isArray(value) ? value.map((entry: unknown): unknown => entry) : [];
}

function charAt(lines: readonly string[], cell: Cell): string {
  return lines[cell.row]?.charAt(cell.column) ?? '';
}

function isFloorTile(lines: readonly string[], cell: Cell): boolean {
  const tile: string = charAt(lines, cell);
  return tile !== '' && tile !== ' ';
}

function levelOf(letter: string): number {
  return TERRAIN_MARKS.levels.indexOf(letter);
}

function letterOf(level: number): string {
  return TERRAIN_MARKS.levels.charAt(Math.max(0, Math.min(TERRAIN_MARKS.levels.length - 1, level)));
}

function cellOf(point: Vec2, size: number): Cell {
  return { column: Math.floor(point.x / size), row: Math.floor(point.z / size) };
}

function floorCells(lines: readonly string[]): Cell[] {
  const found: Cell[] = [];
  lines.forEach((line: string, row: number): void => {
    for (let column: number = 0; column < line.length; column += 1) if (line.charAt(column) !== ' ') found.push({ column, row });
  });
  return found;
}

function stroke(from: Cell, to: Cell, radius: number): Cell[] {
  const steps: number = Math.max(Math.abs(to.column - from.column), Math.abs(to.row - from.row), 1);
  const seen: Set<string> = new Set<string>();
  const cells: Cell[] = [];
  for (let step: number = 0; step <= steps; step += 1) {
    const column: number = Math.round(from.column + ((to.column - from.column) * step) / steps);
    const row: number = Math.round(from.row + ((to.row - from.row) * step) / steps);
    for (let dr: number = -radius; dr <= radius; dr += 1) {
      for (let dc: number = -radius; dc <= radius; dc += 1) {
        if (dc * dc + dr * dr > radius * radius + radius) continue;
        const key: string = `${column + dc},${row + dr}`;
        if (seen.has(key) || column + dc < 0 || row + dr < 0) continue;
        seen.add(key);
        cells.push({ column: column + dc, row: row + dr });
      }
    }
  }
  return cells;
}

function nearMask(cells: readonly Cell[], columns: number, rowCount: number, reach: number): Uint8Array {
  const mask: Uint8Array = new Uint8Array(columns * rowCount);
  for (const cell of cells) {
    for (let dr: number = -reach; dr <= reach; dr += 1) {
      for (let dc: number = -reach; dc <= reach; dc += 1) {
        const column: number = cell.column + dc;
        const row: number = cell.row + dr;
        if (column >= 0 && row >= 0 && column < columns && row < rowCount) mask[row * columns + column] = 1;
      }
    }
  }
  return mask;
}

function masked(mask: Uint8Array, columns: number, cell: Cell): boolean {
  return cell.column >= 0 && cell.row >= 0 && cell.column < columns && mask[cell.row * columns + cell.column] === 1;
}

export function placeWing(host: Grid, wing: Grid, anchor: Cell, entrance: Cell): WingPlacement | null {
  const hostFloor: Cell[] = floorCells(host.tiles);
  const wingFloor: Cell[] = floorCells(wing.tiles);
  const wingWidth: number = Math.max(...wing.tiles.map((line: string): number => line.length));
  const width: number = Math.max(...host.tiles.map((line: string): number => line.length)) + CAVE_WING.reach * 2 + wingWidth;
  const height: number = host.tiles.length + CAVE_WING.reach * 2 + wing.tiles.length;
  const nearHost: Uint8Array = nearMask(hostFloor, width, height, CAVE_WING.margin);
  const anchorLevel: number = levelOf(charAt(host.levels, anchor));
  const entranceLevel: number = levelOf(charAt(wing.levels, entrance));
  if (anchorLevel < 0 || anchorLevel !== entranceLevel) return null;
  const otherLevels: Cell[] = wingFloor.filter((cell: Cell): boolean => levelOf(charAt(wing.levels, cell)) !== entranceLevel);
  const nearOther: Uint8Array = nearMask(otherLevels, wingWidth, wing.tiles.length, CAVE_WING.margin);
  const reach: number = CAVE_WING.margin + CAVE_WING.passageRadius;
  const offsets: Cell[] = [];
  for (let dr: number = -CAVE_WING.reach; dr <= CAVE_WING.reach; dr += 1) for (let dc: number = -CAVE_WING.reach; dc <= CAVE_WING.reach; dc += 1) if (Math.hypot(dc, dr) >= reach) offsets.push({ column: dc, row: dr });
  offsets.sort((a: Cell, b: Cell): number => Math.hypot(a.column, a.row) - Math.hypot(b.column, b.row));
  for (const offset of offsets) {
    const column: number = anchor.column + offset.column - entrance.column;
    const row: number = anchor.row + offset.row - entrance.row;
    if (wingFloor.some((cell: Cell): boolean => cell.column + column < CAVE_WING.margin || cell.row + row < CAVE_WING.margin || masked(nearHost, width, { column: cell.column + column, row: cell.row + row }))) continue;
    const door: Cell = { column: entrance.column + column, row: entrance.row + row };
    const passage: Cell[] = stroke(anchor, door, CAVE_WING.passageRadius);
    const strays: boolean = passage.some((cell: Cell): boolean => {
      const fromAnchor: number = Math.hypot(cell.column - anchor.column, cell.row - anchor.row);
      return (fromAnchor > reach && masked(nearHost, width, cell)) || masked(nearOther, wingWidth, { column: cell.column - column, row: cell.row - row });
    });
    if (!strays) return { column, row, passage };
  }
  return null;
}

function owners(sources: readonly { readonly cells: readonly Cell[]; readonly owner: Owner }[], columns: number, rowCount: number): (Owner | null)[] {
  const owner: (Owner | null)[] = Array.from({ length: columns * rowCount }, (): Owner | null => null);
  const queue: Cell[] = [];
  for (const source of sources) {
    for (const cell of source.cells) {
      const at: number = cell.row * columns + cell.column;
      if (cell.column < 0 || cell.row < 0 || cell.column >= columns || cell.row >= rowCount || owner[at] !== null) continue;
      owner[at] = source.owner;
      queue.push(cell);
    }
  }
  for (let head: number = 0; head < queue.length; head += 1) {
    const cell: Cell | undefined = queue[head];
    if (cell === undefined) continue;
    const from: Owner | null = owner[cell.row * columns + cell.column] ?? null;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const column: number = cell.column + dc;
      const row: number = cell.row + dr;
      if (column < 0 || row < 0 || column >= columns || row >= rowCount || owner[row * columns + column] !== null) continue;
      owner[row * columns + column] = from;
      queue.push({ column, row });
    }
  }
  return owner;
}

function passageWalls(passage: readonly Cell[], level: number, columns: number, rowCount: number, walls: KitWalls): Int16Array {
  const raster: CaveRaster = createRaster(columns, rowCount);
  for (const cell of passage) if (cell.column < columns && cell.row < rowCount) raster.level[cell.row * columns + cell.column] = level;
  return wallLevels(raster, walls.band, walls, CAVE_GEN.rockTop);
}

function moved(point: Vec2, column: number, row: number, size: number): Vec2 {
  return { x: Math.round((point.x + column * size) * 10) / 10, z: Math.round((point.z + row * size) * 10) / 10 };
}

export function approachOpen(tiles: readonly string[], levels: readonly string[], size: number, exit: Vec2, radius: number): boolean {
  const middle: Vec2 = { x: (Math.max(...tiles.map((line: string): number => line.length)) * size) / 2, z: (tiles.length * size) / 2 };
  const span: number = Math.max(1e-9, Math.hypot(middle.x - exit.x, middle.z - exit.z));
  const inward: Vec2 = { x: (middle.x - exit.x) / span, z: (middle.z - exit.z) / span };
  const letter: string = charAt(levels, cellOf(exit, size));
  const aside: number = radius + CAVE_WING.approachAside;
  const open = (side: number, along: number): boolean => {
    const cell: Cell = cellOf({ x: exit.x - inward.z * side + inward.x * along, z: exit.z + inward.x * side + inward.z * along }, size);
    return isFloorTile(tiles, cell) && charAt(levels, cell) === letter;
  };
  const lane: number[] = Array.from({ length: Math.floor(radius + CAVE_WING.approach) + 1 }, (_unused: unknown, along: number): number => along);
  const backed = (side: number): boolean => Array.from({ length: Math.ceil(radius + CAVE_WING.backing) }, (_unused: unknown, step: number): number => step + 1).some((behind: number): boolean => !open(side, -behind));
  return lane.every((along: number): boolean => open(0, along)) && open(-aside, radius + CAVE_WING.approach) && open(aside, radius + CAVE_WING.approach) && [-aside, 0, aside].every(backed);
}

export function openDescent(tiles: readonly string[], levels: readonly string[], size: number, descent: Vec2, radius: number): { readonly at: Vec2; readonly arrival: Vec2 } | null {
  const letter: string = charAt(levels, cellOf(descent, size));
  const middle: Vec2 = { x: (Math.max(...tiles.map((line: string): number => line.length)) * size) / 2, z: (tiles.length * size) / 2 };
  const spots: Vec2[] = floorCells(tiles)
    .filter((cell: Cell): boolean => charAt(levels, cell) === letter)
    .map((cell: Cell): Vec2 => ({ x: (cell.column + 0.5) * size, z: (cell.row + 0.5) * size }))
    .filter((spot: Vec2): boolean => Math.hypot(spot.x - descent.x, spot.z - descent.z) <= CAVE_WING.descentShift)
    .toSorted((a: Vec2, b: Vec2): number => Math.hypot(a.x - descent.x, a.z - descent.z) - Math.hypot(b.x - descent.x, b.z - descent.z));
  const at: Vec2 | undefined = spots.find((spot: Vec2): boolean => approachOpen(tiles, levels, size, spot, radius));
  if (at === undefined) return null;
  const span: number = Math.max(1e-9, Math.hypot(middle.x - at.x, middle.z - at.z));
  const away: number = radius + CAVE_WING.arrivalAway;
  return { at, arrival: { x: at.x + ((middle.x - at.x) / span) * away, z: at.z + ((middle.z - at.z) / span) * away } };
}

export function wingTop(record: Readonly<Record<string, unknown>>, exit: string): number | string {
  const size: unknown = record['cellSize'];
  const tiles: string[] | null = rows(record, 'tiles');
  const levels: string[] | null = rows(record['terrain'], 'levels');
  const door: Fields | undefined = list(record, 'exits').filter(isFields).find((entry: Fields): boolean => entry['id'] === exit);
  if (typeof size !== 'number' || tiles === null || levels === null || door === undefined || typeof door['x'] !== 'number' || typeof door['z'] !== 'number') return `the host zone has no exit ${exit} on a tile map with levels`;
  const level: number = levelOf(charAt(levels, cellOf({ x: door['x'], z: door['z'] }, size)));
  return level < 0 ? `exit ${exit} does not stand on a level` : level;
}

export function graftWing(host: WingHost, wing: CaveLayout, walls: KitWalls): WingResult {
  const size: number = typeof host.record['cellSize'] === 'number' ? host.record['cellSize'] : wing.cellSize;
  if (size !== wing.cellSize) return { ok: false, problem: `the wing's cells are ${wing.cellSize} m and the host's ${size} m` };
  const terrain: unknown = host.record['terrain'];
  const hostTiles: string[] | null = rows(host.record, 'tiles');
  const hostLevels: string[] | null = rows(terrain, 'levels');
  if (hostTiles === null || hostLevels === null || !isFields(terrain)) return { ok: false, problem: 'the host zone has no tile or level rows' };
  const exits: unknown[] = list(host.record, 'exits');
  const door: Fields | undefined = exits.filter(isFields).find((exit: Fields): boolean => exit['id'] === host.exit);
  if (door === undefined || typeof door['x'] !== 'number' || typeof door['z'] !== 'number') return { ok: false, problem: `the host zone has no exit ${host.exit}` };
  const anchor: Cell = cellOf({ x: door['x'], z: door['z'] }, size);
  if (!isFloorTile(hostTiles, anchor)) return { ok: false, problem: `exit ${host.exit} does not stand on the host's floor` };
  const entranceLetter: string = charAt(wing.levels, cellOf(wing.entrance, size));
  if (entranceLetter !== charAt(hostLevels, anchor)) return { ok: false, problem: `the wing starts at level ${entranceLetter} and exit ${host.exit} stands at ${charAt(hostLevels, anchor)}` };
  const placement: WingPlacement | null = placeWing({ tiles: hostTiles, levels: hostLevels }, { tiles: wing.tiles, levels: wing.levels }, anchor, cellOf(wing.entrance, size));
  if (placement === null) return { ok: false, problem: `no place within ${CAVE_WING.reach} cells of exit ${host.exit} keeps the wing ${CAVE_WING.margin} cells from the host's floor` };
  const { column, row, passage } = placement;
  const wingCells: Cell[] = floorCells(wing.tiles).map((cell: Cell): Cell => ({ column: cell.column + column, row: cell.row + row }));
  const hostCells: Cell[] = floorCells(hostTiles);
  const columns: number = Math.max(...hostTiles.map((line: string): number => line.length), ...wing.tiles.map((line: string): number => line.length + column), ...passage.map((cell: Cell): number => cell.column + 1));
  const rowCount: number = Math.max(hostTiles.length, wing.tiles.length + row, ...passage.map((cell: Cell): number => cell.row + 1));
  const owner: (Owner | null)[] = owners([{ cells: hostCells, owner: 'host' }, { cells: wingCells, owner: 'wing' }, { cells: passage, owner: 'passage' }], columns, rowCount);
  const anchorLetter: string = charAt(hostLevels, anchor);
  const anchorTile: string = charAt(hostTiles, anchor);
  const corridor: Int16Array = passageWalls(passage, levelOf(anchorLetter), columns, rowCount, walls);
  const passageSet: Set<string> = new Set<string>(passage.map((cell: Cell): string => `${cell.column},${cell.row}`));
  const tiles: string[] = [];
  const levels: string[] = [];
  for (let r: number = 0; r < rowCount; r += 1) {
    let tileRow: string = '';
    let levelRow: string = '';
    for (let c: number = 0; c < columns; c += 1) {
      const here: Cell = { column: c, row: r };
      const inWing: Cell = { column: c - column, row: r - row };
      const hostFloor: boolean = isFloorTile(hostTiles, here);
      const wingFloor: boolean = isFloorTile(wing.tiles, inWing);
      const hostLevel: string = charAt(hostLevels, here);
      if (hostFloor) {
        tileRow += charAt(hostTiles, here);
        levelRow += hostLevel;
      } else if (wingFloor) {
        tileRow += charAt(wing.tiles, inWing);
        levelRow += charAt(wing.levels, inWing);
      } else if (passageSet.has(`${c},${r}`)) {
        tileRow += anchorTile;
        levelRow += anchorLetter;
      } else {
        tileRow += ' ';
        const by: Owner | null = owner[r * columns + c] ?? null;
        const wingLevel: string = charAt(wing.levels, inWing);
        const corridorLevel: number = corridor[r * columns + c] ?? CAVE_GEN.rockTop;
        if (by === 'wing' && wingLevel !== '') levelRow += wingLevel;
        else if (by === 'passage' && corridorLevel !== ROCK) levelRow += letterOf(corridorLevel);
        else levelRow += hostLevel === '' ? letterOf(CAVE_GEN.rockTop) : hostLevel;
      }
    }
    tiles.push(tileRow);
    levels.push(levelRow);
  }
  const hostId: string = typeof host.record['id'] === 'string' ? host.record['id'] : 'zone';
  const wingProps: Record<string, unknown>[] = wing.props.map((placed): Record<string, unknown> => {
    const at: Vec2 = moved(placed, column, row, size);
    return { prop: placed.prop, x: at.x, z: at.z, y: placed.y, rotationDegrees: placed.rotationDegrees };
  });
  const wingPacks: Record<string, unknown>[] = wing.packs.map((pack: CavePack): Record<string, unknown> => {
    const at: Vec2 = moved(pack, column, row, size);
    return packRecord({ x: at.x, z: at.z, level: pack.level, members: pack.members, waits: pack.waits, rank: pack.rank });
  });
  const spots: Vec2[] = [wing.start, ...wing.checkpoints];
  const checkpoints: Record<string, unknown>[] = spots.map((point: Vec2, at: number): Record<string, unknown> => {
    const spot: Vec2 = moved(point, column, row, size);
    return { id: `${hostId}_wing_${at + 1}`, x: spot.x, z: spot.z, radius: CAVE_WING.checkpointRadius };
  });
  const radius: number = typeof door['radius'] === 'number' ? door['radius'] : CAVE_WING.exitRadius;
  const generated: Vec2 = moved(wing.descent, column, row, size);
  const open: { readonly at: Vec2; readonly arrival: Vec2 } | null = approachOpen(tiles, levels, size, generated, radius) ? { at: generated, arrival: moved(wing.descentArrival, column, row, size) } : openDescent(tiles, levels, size, generated, radius);
  if (open === null) return { ok: false, problem: `the way down at ${generated.x},${generated.z} cannot be walked up to from the middle of the map` };
  const descent: Vec2 = open.at;
  const arrival: Vec2 = open.arrival;
  const movedExits: unknown[] = exits.map((exit: unknown): unknown => (isFields(exit) && exit['id'] === host.exit ? Object.assign({}, exit, { x: descent.x, z: descent.z, arrival }) : exit));
  const record: Record<string, unknown> = {
    ...host.record,
    tiles,
    grewFrom: { columns: Math.max(...hostTiles.map((line: string): number => line.length)), rows: hostTiles.length },
    terrain: { ...terrain, levels },
    props: [...list(host.record, 'props'), ...wingProps],
    packs: [...list(host.record, 'packs'), ...wingPacks],
    exits: movedExits,
    checkpoints: [...list(host.record, 'checkpoints'), ...checkpoints],
  };
  return { ok: true, record, placement };
}
