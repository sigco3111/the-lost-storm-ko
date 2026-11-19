import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { roadZone } from '../../test/road-support.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import { loadContent } from '../../sim/content/content.ts';
import { TERRAIN_MARKS } from '../../sim/content/terrain-types.ts';
import { isFloorCell } from '../../sim/nav/layout.ts';
import { heightAt } from '../../sim/nav/terrain.ts';
import { floorUp, glideFloor, liftAt, liftHere, liftSamples, rayToFloor, rayToSurface, tileLift, useTerrain } from './terrain-lift.ts';

const SIZE = 4;
const STAIR: ZoneDef = roadZone({
  id: 'stair_lift_test',
  cellSize: SIZE,
  floorHeight: 0.5,
  tiles: ['wwwwww', 'wwwwww'],
  terrain: { rise: 1, groundStep: 0.6, levels: ['000/22', '000/22'], cliff: 'road_firm', rough: null, blends: [], cliffs: [] },
});
function heightOf(x: number, z: number): number {
  return liftAt(STAIR, x, z);
}

const FLAT: ZoneDef = roadZone({ id: 'flat_lift_test', cellSize: SIZE, tiles: ['ww'] });

void test('the lift is the terrain height above the zone floor, and a flat zone lifts nothing', (): void => {
  assert.equal(liftAt(STAIR, 2, 2), 0);
  assert.equal(liftAt(STAIR, 22, 2), 2);
  assert.equal(liftAt(STAIR, 3 * SIZE + SIZE / 2, 2), 1);
  assert.equal(liftAt(FLAT, 2, 2), 0);
});

void test('each tile keeps its own height at a shared edge, so a cliff has a top and a foot', (): void => {
  const edge: number = 3 * SIZE + SIZE;
  assert.equal(tileLift(STAIR, 3, 0, edge, 2), 2);
  assert.equal(tileLift(STAIR, 2, 0, 3 * SIZE, 2), 0);
});

void test('the lift map samples every texel of the zone, high on the upper terrace and low on the lower', (): void => {
  const texel: number = 1;
  const { width, depth, values } = liftSamples(STAIR, texel);
  assert.equal(width, 6 * SIZE);
  assert.equal(depth, 2 * SIZE);
  assert.equal(values[0], 0);
  assert.equal(values[width - 1], 2);
  const middle: number | undefined = values[3 * SIZE + SIZE / 2];
  assert.ok(middle !== undefined && middle > 0 && middle < 2);
});

void test('a ground effect drawn on the stair rises with it, and stops rising when a flat zone is shown', (): void => {
  useTerrain(STAIR);
  assert.equal(liftHere(22, 2), 2);
  assert.equal(liftHere(3 * SIZE + SIZE / 2, 2), 1);
  useTerrain(FLAT);
  assert.equal(liftHere(22, 2), 0);
});

void test('a click ray finds the upper terrace before the floor beneath it', (): void => {
  const ray = { origin: { x: 22, y: 10, z: 2 }, direction: { x: -0.2, y: -1, z: 0 } };
  const hit: Vector3 | null = rayToSurface(ray, heightOf, new Vector3());
  assert.ok(hit !== null);
  assert.ok(Math.abs(hit.y - 2) < 0.01, `hit at ${hit.y}`);
  assert.ok(Math.abs(hit.x - 20.4) < 0.05, `hit at ${hit.x}`);
  const below = { origin: { x: 22, y: -1, z: 2 }, direction: { x: 0, y: -1, z: 0 } };
  assert.equal(rayToSurface(below, heightOf, new Vector3()), null);
});

function caveWall(x: number): number {
  return x < 10 ? 50 : 0;
}

void test('a ray that starts inside rock lands on the first surface it meets from above, as a camera behind a cave wall must', (): void => {
  const ray = { origin: { x: 4, y: 30, z: 2 }, direction: { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 } };
  const hit: Vector3 | null = rayToSurface(ray, caveWall, new Vector3());
  assert.ok(hit !== null);
  assert.ok(Math.abs(hit.y) < 0.01, `hit at ${hit.y}`);
  assert.ok(Math.abs(hit.x - 34) < 0.05, `hit at ${hit.x}`);
});

function caveTerraces(zone: ZoneDef): readonly { readonly x: number; readonly z: number; readonly height: number }[] {
  const levels: readonly string[] = zone.terrain?.levels ?? [];
  const rise: number = zone.terrain?.rise ?? 0;
  const found: Map<string, { readonly x: number; readonly z: number; readonly height: number }> = new Map();
  for (let row: number = 1; row < levels.length - 1; row += 1) {
    const line: string = levels[row] ?? '';
    for (let column: number = 1; column < line.length - 1; column += 1) {
      const mark: string = line.charAt(column);
      const level: number = TERRAIN_MARKS.levels.indexOf(mark);
      if (level < 0 || found.has(mark)) continue;
      let interior: boolean = true;
      for (let dr: number = -1; dr <= 1; dr += 1) {
        for (let dc: number = -1; dc <= 1; dc += 1) {
          if ((levels[row + dr] ?? '').charAt(column + dc) !== mark || !isFloorCell(zone, column + dc, row + dr)) interior = false;
        }
      }
      if (interior) found.set(mark, { x: (column + 0.5) * zone.cellSize, z: (row + 0.5) * zone.cellSize, height: zone.floorHeight + level * rise });
    }
  }
  return [...found.values()];
}

void test('every effect height on a cave terrace stands on that terrace, and a flat zone keeps it as given', (): void => {
  const content: Content = loadContent();
  const cave: ZoneDef | undefined = content.zones.get('under_hall');
  const hall: ZoneDef | undefined = content.zones.get('hall_of_time');
  assert.ok(cave !== undefined && hall !== undefined);
  const terraces = caveTerraces(cave);
  assert.ok(terraces.length >= 3, `found ${terraces.length} terraces`);
  useTerrain(cave);
  for (const terrace of terraces) {
    assert.ok(Math.abs(floorUp(terrace.x, 1.25, terrace.z) - (terrace.height + 1.25)) < 1e-6, `terrace at ${terrace.height}`);
    assert.ok(Math.abs(floorUp(terrace.x, 0, terrace.z) - heightAt(cave, terrace.x, terrace.z)) < 1e-6);
  }
  useTerrain(hall);
  for (const terrace of terraces) assert.equal(floorUp(terrace.x, 1.25, terrace.z), 1.25);
});

void test('a bolt flying off a terrace glides down to the lower floor instead of dropping in one frame', (): void => {
  useTerrain(STAIR);
  let flight: number = glideFloor(undefined, 22, 2, 1 / 60);
  assert.equal(flight, 2);
  flight = glideFloor(flight, 2, 2, 1 / 60);
  assert.ok(flight > 1.7 && flight < 2, `after one frame ${flight}`);
  for (let frame: number = 0; frame < 120; frame += 1) flight = glideFloor(flight, 2, 2, 1 / 60);
  assert.ok(flight < 0.01, `after two seconds ${flight}`);
  useTerrain(FLAT);
});

function shelfBeforeFloor(x: number): number {
  return x > 6 && x < 10 ? 22 : 0;
}

function drawnOnlyNearFloor(x: number): number {
  return x < 12 ? Number.NaN : 0;
}

void test('a click ray passes a crossing the cutaway has opened and lands on the floor behind it', (): void => {
  const ray = { origin: { x: 0, y: 30, z: 0 }, direction: { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 } };
  const shelf: Vector3 | null = rayToSurface(ray, shelfBeforeFloor, new Vector3());
  assert.ok(shelf !== null && Math.abs(shelf.y - 22) < 0.01 && Math.abs(shelf.x - 8) < 0.05, `hit at ${shelf?.x},${shelf?.y}`);
  const floor: Vector3 | null = rayToSurface(ray, shelfBeforeFloor, new Vector3(), (_x: number, y: number): boolean => y > 4);
  assert.ok(floor !== null && Math.abs(floor.y) < 0.01 && Math.abs(floor.x - 30) < 0.05, `hit at ${floor?.x},${floor?.y}`);
});

void test('ground that is not drawn is neither above nor below, so a ray entering the drawn ground from under its edge does not stop there', (): void => {
  const ray = { origin: { x: 0, y: 4, z: 0 }, direction: { x: 1, y: -0.2, z: 0 } };
  const hit: Vector3 | null = rayToSurface(ray, drawnOnlyNearFloor, new Vector3());
  assert.ok(hit !== null && Math.abs(hit.x - 20) < 0.05, `hit at ${hit?.x}`);
});

function floorBehindShelf(x: number): number {
  return x > 6 && x < 10 ? 4 : 0;
}

function onLowFloor(x: number, y: number): boolean {
  return (x <= 6 || x >= 10) && Math.abs(y) < 0.35;
}

function terraceOverFloor(x: number): number {
  return x > 14 && x < 18 ? 3 : 0;
}

function rampUp(x: number): number {
  return Math.min(4, x * 0.2);
}

function onAnyLevel(_x: number, y: number): boolean {
  return Math.abs(y) < 0.35 || Math.abs(y - 3) < 0.35;
}

void test('a floor click passes the shelf top in front, with no window open, and lands on the floor behind it', (): void => {
  const ray = { origin: { x: 0, y: 10, z: 0 }, direction: { x: 0.8, y: -0.6, z: 0 } };
  const top: Vector3 | null = rayToSurface(ray, floorBehindShelf, new Vector3());
  assert.ok(top !== null && Math.abs(top.y - 4) < 0.01, `shelf hit at ${top?.x},${top?.y}`);
  const floor: Vector3 | null = rayToFloor(ray, floorBehindShelf, onLowFloor, new Vector3());
  assert.ok(floor !== null && Math.abs(floor.y) < 0.01 && Math.abs(floor.x - 13.33) < 0.05, `floor hit at ${floor?.x},${floor?.y}`);
});

void test('a floor click on a walkable terrace above the floor takes the terrace, nearest the camera, unless the window has cut it', (): void => {
  const ray = { origin: { x: 0, y: 19, z: 0 }, direction: { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 } };
  const terrace: Vector3 | null = rayToFloor(ray, terraceOverFloor, onAnyLevel, new Vector3());
  assert.ok(terrace !== null && Math.abs(terrace.y - 3) < 0.01 && Math.abs(terrace.x - 16) < 0.05, `terrace hit at ${terrace?.x},${terrace?.y}`);
  const cut: Vector3 | null = rayToFloor(ray, terraceOverFloor, onAnyLevel, new Vector3(), (_x: number, y: number): boolean => y > 1.5);
  assert.ok(cut !== null && Math.abs(cut.y) < 0.01 && Math.abs(cut.x - 19) < 0.05, `floor under the cut terrace at ${cut?.x},${cut?.y}`);
});

void test('a floor click whose only floor the window has cut still takes that floor rather than nothing', (): void => {
  const ray = { origin: { x: 0, y: 10, z: 0 }, direction: { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 } };
  const hit: Vector3 | null = rayToFloor(ray, rampUp, (): boolean => true, new Vector3(), (): boolean => true);
  assert.ok(hit !== null && Math.abs(hit.x - 8.33) < 0.05, `ramp hit at ${hit?.x},${hit?.y}`);
});

void test('a floor click whose ray meets only rock keeps the first surface it meets', (): void => {
  const ray = { origin: { x: 0, y: 10, z: 0 }, direction: { x: 0.8, y: -0.6, z: 0 } };
  const hit: Vector3 | null = rayToFloor(ray, floorBehindShelf, (): boolean => false, new Vector3());
  assert.ok(hit !== null && Math.abs(hit.y - 4) < 0.01 && hit.x > 6 && hit.x < 10, `rock hit at ${hit?.x},${hit?.y}`);
});
