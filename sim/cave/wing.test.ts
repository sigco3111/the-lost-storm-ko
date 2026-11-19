import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFields } from '../content/read.ts';
import type { CaveLayout } from './generate.ts';
import type { KitWalls } from './kit.ts';
import { approachOpen, CAVE_WING, graftWing, openDescent, wingTop } from './wing.ts';
import type { WingResult } from './wing.ts';

const WALLS: KitWalls = { band: 3, back: 4, side: 3, front: 1 };

function block(columns: number, rows: number, box: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }, floor: string, rock: string): string[] {
  return Array.from({ length: rows }, (_unused: unknown, row: number): string => Array.from({ length: columns }, (_none: unknown, column: number): string => (column >= box.left && column <= box.right && row >= box.top && row <= box.bottom ? floor : rock)).join(''));
}

const HOST_ROOM = { left: 4, right: 15, top: 2, bottom: 9 } as const;

function host(): Record<string, unknown> {
  return {
    id: 'upper',
    cellSize: 2,
    tiles: block(20, 12, HOST_ROOM, 'c', ' '),
    terrain: { rise: 1, levels: block(20, 12, HOST_ROOM, 'b', 'u') },
    props: [{ prop: 'stone', x: 12, z: 8, y: 0, rotationDegrees: 0 }],
    packs: [{ x: 14, z: 10, members: [{ monster: 'rat', count: 1 }], level: 9 }],
    exits: [{ id: 'gate', x: 10, z: 6, radius: 2, to: 'town', toExit: 'cave', arrival: { x: 12, z: 6 }, requires: [] }, { id: 'down', x: 21, z: 19, radius: 2.2, to: 'lower', toExit: 'up', arrival: { x: 21, z: 15 }, requires: [] }],
    checkpoints: [{ id: 'first', x: 20, z: 10, radius: 2.5 }],
    playerStart: { x: 12, z: 6 },
  };
}

const WING_ROOM = { left: 3, right: 18, top: 2, bottom: 13 } as const;

function wing(level: string): CaveLayout {
  return {
    seed: 1,
    columns: 22,
    rows: 16,
    cellSize: 2,
    tiles: block(22, 16, WING_ROOM, 'm', ' '),
    levels: block(22, 16, WING_ROOM, level, 'u'),
    chambers: [],
    passages: [],
    props: [{ prop: 'stone', x: 30, z: 20, y: 0, rotationDegrees: 90 }],
    packs: [{ x: 20, z: 18, level: 12, members: [{ monster: 'rat', count: 3 }], waits: null, rank: 'magic' }],
    start: { x: 21, z: 11 },
    entrance: { x: 21, z: 7 },
    waypoint: { x: 25, z: 11 },
    descent: { x: 33, z: 25 },
    descentArrival: { x: 31, z: 23 },
    checkpoints: [],
  };
}

function fieldsOf(value: unknown): Readonly<Record<string, unknown>> {
  assert.ok(isFields(value));
  return value;
}

function listOf(record: Readonly<Record<string, unknown>>, key: string): readonly Readonly<Record<string, unknown>>[] {
  const value: unknown = record[key];
  assert.ok(Array.isArray(value));
  return value.map((entry: unknown): Readonly<Record<string, unknown>> => fieldsOf(entry));
}

function rowsOf(record: Readonly<Record<string, unknown>>, holder: 'tiles' | 'levels'): string[] {
  const source: unknown = holder === 'tiles' ? record['tiles'] : fieldsOf(record['terrain'])['levels'];
  assert.ok(Array.isArray(source));
  return source.map((row: unknown): string => String(row));
}

function grafted(level: string): Extract<WingResult, { readonly ok: true }> {
  const result: WingResult = graftWing({ record: host(), exit: 'down' }, wing(level), WALLS);
  assert.ok(result.ok, result.ok ? '' : result.problem);
  return result;
}

function reachable(tiles: readonly string[], from: { readonly column: number; readonly row: number }): Set<string> {
  const seen: Set<string> = new Set<string>([`${from.column},${from.row}`]);
  const queue: { readonly column: number; readonly row: number }[] = [from];
  for (let head: number = 0; head < queue.length; head += 1) {
    const cell: { readonly column: number; readonly row: number } | undefined = queue[head];
    if (cell === undefined) continue;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next: { readonly column: number; readonly row: number } = { column: cell.column + dc, row: cell.row + dr };
      const tile: string = tiles[next.row]?.charAt(next.column) ?? ' ';
      if (tile === ' ' || tile === '' || seen.has(`${next.column},${next.row}`)) continue;
      seen.add(`${next.column},${next.row}`);
      queue.push(next);
    }
  }
  return seen;
}

void test('a wing leaves every host tile and level where it was and grows the map only down and to the right', (): void => {
  const { record } = grafted('b');
  const before: Record<string, unknown> = host();
  const tiles: string[] = rowsOf(record, 'tiles');
  const levels: string[] = rowsOf(record, 'levels');
  rowsOf(before, 'tiles').forEach((row: string, at: number): void => {
    for (let column: number = 0; column < row.length; column += 1) if (row.charAt(column) !== ' ') assert.equal(tiles[at]?.charAt(column), row.charAt(column), `tile ${column},${at}`);
  });
  rowsOf(before, 'levels').forEach((row: string, at: number): void => {
    for (let column: number = 0; column < row.length; column += 1) if (rowsOf(before, 'tiles')[at]?.charAt(column) !== ' ') assert.equal(levels[at]?.charAt(column), row.charAt(column), `level ${column},${at}`);
  });
  assert.ok(tiles.length > 12);
  assert.ok(tiles.every((row: string): boolean => row.length === tiles[0]?.length && row.length === levels[0]?.length));
});

void test('the way down moves to the far end of the wing and can be walked to from the host, through a passage at the exit level', (): void => {
  const { record, placement } = grafted('b');
  const exits: readonly Readonly<Record<string, unknown>>[] = listOf(record, 'exits');
  const down: Readonly<Record<string, unknown>> = fieldsOf(exits.find((exit: Readonly<Record<string, unknown>>): boolean => exit['id'] === 'down'));
  assert.deepEqual({ to: down['to'], toExit: down['toExit'] }, { to: 'lower', toExit: 'up' });
  assert.deepEqual(exits[0], listOf(host(), 'exits')[0]);
  const tiles: string[] = rowsOf(record, 'tiles');
  const levels: string[] = rowsOf(record, 'levels');
  const at: { readonly x: number; readonly z: number } = { x: Number(down['x']), z: Number(down['z']) };
  assert.ok(approachOpen(tiles, levels, 2, at, 2.2));
  assert.ok(at.x >= (WING_ROOM.left + placement.column) * 2 && at.z >= (WING_ROOM.top + placement.row) * 2);
  const walked: Set<string> = reachable(tiles, { column: 6, row: 3 });
  assert.ok(walked.has(`${Math.floor(at.x / 2)},${Math.floor(at.z / 2)}`));
  for (const cell of placement.passage) if (tiles[cell.row]?.charAt(cell.column) === 'c' && cell.row >= 12) assert.equal(levels[cell.row]?.charAt(cell.column), 'b');
});

void test('the wing keeps its margin of rock from the host floor, and brings its props, packs and a checkpoint along', (): void => {
  const { record, placement } = grafted('b');
  const tiles: string[] = rowsOf(record, 'tiles');
  for (let row: number = WING_ROOM.top; row <= WING_ROOM.bottom; row += 1) {
    for (let column: number = WING_ROOM.left; column <= WING_ROOM.right; column += 1) {
      const at: { readonly column: number; readonly row: number } = { column: column + placement.column, row: row + placement.row };
      assert.equal(tiles[at.row]?.charAt(at.column), 'm');
      assert.ok(at.row > HOST_ROOM.bottom + CAVE_WING.margin || at.column > HOST_ROOM.right + CAVE_WING.margin, `wing cell ${at.column},${at.row}`);
    }
  }
  const props: readonly Readonly<Record<string, unknown>>[] = listOf(record, 'props');
  const packs: readonly Readonly<Record<string, unknown>>[] = listOf(record, 'packs');
  const checkpoints: readonly Readonly<Record<string, unknown>>[] = listOf(record, 'checkpoints');
  assert.equal(props.length, 2);
  assert.deepEqual(props[1], { prop: 'stone', x: 30 + placement.column * 2, z: 20 + placement.row * 2, y: 0, rotationDegrees: 90 });
  assert.deepEqual(packs[1], { x: 20 + placement.column * 2, z: 18 + placement.row * 2, members: [{ monster: 'rat', count: 3 }], level: 12, rank: 'magic' });
  assert.deepEqual(checkpoints.map((checkpoint: Readonly<Record<string, unknown>>): unknown => checkpoint['id']), ['first', 'upper_wing_1']);
});

void test('a wing that starts on another level than the exit, a missing exit, or no room nearby is refused', (): void => {
  const raised: WingResult = graftWing({ record: host(), exit: 'down' }, wing('d'), WALLS);
  assert.ok(!raised.ok && raised.problem.includes('starts at level d'));
  const lost: WingResult = graftWing({ record: host(), exit: 'cellar' }, wing('b'), WALLS);
  assert.ok(!lost.ok && lost.problem.includes('no exit cellar'));
  assert.equal(wingTop(host(), 'down'), 11);
  assert.match(String(wingTop(host(), 'cellar')), /no exit cellar/);
});

void test('a way down counts as open only when the floor runs from it toward the middle of the map at its own level', (): void => {
  const tiles: string[] = block(20, 12, { left: 1, right: 18, top: 1, bottom: 10 }, 'c', ' ');
  const flat: string[] = block(20, 12, { left: 1, right: 18, top: 1, bottom: 10 }, 'b', 'u');
  assert.ok(approachOpen(tiles, flat, 2, { x: 35, z: 12 }, 2));
  assert.ok(!approachOpen(tiles, flat, 2, { x: 30, z: 12 }, 2));
  const walled: string[] = tiles.map((line: string): string => `${line.slice(0, 14)} ${line.slice(15)}`);
  assert.ok(!approachOpen(walled, flat, 2, { x: 35, z: 12 }, 2));
  const stepped: string[] = flat.map((line: string): string => `${line.slice(0, 14)}d${line.slice(15)}`);
  assert.ok(!approachOpen(tiles, stepped, 2, { x: 35, z: 12 }, 2));
});

void test('a way down on the far side of its chamber from the middle of the map moves to the nearest spot that can be walked up to, with its arrival on the way in', (): void => {
  const tiles: string[] = block(20, 12, { left: 1, right: 18, top: 1, bottom: 10 }, 'c', ' ');
  const flat: string[] = block(20, 12, { left: 1, right: 18, top: 1, bottom: 10 }, 'b', 'u');
  const moved = openDescent(tiles, flat, 2, { x: 3, z: 3 }, 2);
  assert.ok(moved !== null);
  assert.ok(approachOpen(tiles, flat, 2, moved.at, 2));
  assert.ok(Math.hypot(moved.at.x - 3, moved.at.z - 3) <= CAVE_WING.descentShift);
  assert.ok(Math.hypot(moved.arrival.x - 20, moved.arrival.z - 12) < Math.hypot(moved.at.x - 20, moved.at.z - 12));
  assert.equal(openDescent(block(4, 4, { left: 1, right: 2, top: 1, bottom: 2 }, 'c', ' '), block(4, 4, { left: 1, right: 2, top: 1, bottom: 2 }, 'b', 'u'), 2, { x: 3, z: 3 }, 2), null);
});
