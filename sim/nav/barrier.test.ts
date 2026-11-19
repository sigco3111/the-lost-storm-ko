import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, PropDef, ZoneDef, ZoneExit } from '../content/types.ts';
import type { ReadonlyVec2 } from '../math.ts';
import { must } from '../../test/support.ts';
import type { BarrierRow, ZoneBarrier } from '../content/barrier-types.ts';
import { roadZone } from '../../test/road-support.ts';
import type { BarrierPiece, BarrierRun } from './barrier.ts';
import { BARRIER, BARRIER_WORK, barrierPieces, barrierRuns, floorDepth, sizedProp } from './barrier.ts';
import type { Blocker, NavGrid } from './grid.ts';
import { blockerGap, buildNavGrid, cellCenter, isWalkable, propBlockers } from './grid.ts';
import { isFloorCell } from './layout.ts';
import { findPath } from './path.ts';
import { heightAt, tileHeight } from './terrain.ts';

const content: Content = loadContent();
const fenced: ZoneDef[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.outside?.barrier !== null && zone.outside?.barrier !== undefined);

const EDGE = {
  bodyGap: 0.5,
  edgeBand: 1.2,
  exitBand: 2,
  waist: 1.0,
  shrink: 0.12,
  neighbours: [
    { x: 0.5, z: 0 },
    { x: -0.5, z: 0 },
    { x: 0, z: 0.5 },
    { x: 0, z: -0.5 },
  ],
} as const;

function walls(zone: ZoneDef, pieces: readonly BarrierPiece[]): Blocker[] {
  return pieces
    .filter((piece: BarrierPiece): boolean => piece.collide)
    .flatMap((piece: BarrierPiece): Blocker[] => propBlockers(sizedProp(must(content.props.get(piece.prop), piece.prop), piece.size), piece.x, piece.z, piece.rotationDegrees));
}

function nearExit(zone: ZoneDef, point: ReadonlyVec2, band: number): boolean {
  const clear: number = zone.outside?.barrier?.exitClear ?? 0;
  return zone.exits.some((exit: ZoneExit): boolean => Math.hypot(point.x - exit.x, point.z - exit.z) < exit.radius + clear + band);
}

function besideDrop(zone: ZoneDef, x: number, z: number): boolean {
  const column: number = Math.floor(x / zone.cellSize);
  const row: number = Math.floor(z / zone.cellSize);
  const here: number = heightAt(zone, x, z);
  for (let dr: number = -1; dr <= 1; dr += 1) {
    for (let dc: number = -1; dc <= 1; dc += 1) {
      if (!isFloorCell(zone, column + dc, row + dr) && tileHeight(zone, column + dc, row + dr, x, z) < here - BARRIER.drop) return true;
    }
  }
  return false;
}

function walkableIn(grid: NavGrid, x: number, z: number, radius: number): number {
  let count: number = 0;
  for (let index: number = 0; index < grid.walkable.length; index += 1) {
    if (grid.walkable[index] !== 1) continue;
    const centre: ReadonlyVec2 = cellCenter(grid, index);
    if (Math.hypot(centre.x - x, centre.z - z) <= radius) count += 1;
  }
  return count;
}

void test('the Hall and the Hideout are fenced by a barrier', (): void => {
  const ids: ReadonlySet<string> = new Set<string>(fenced.map((zone: ZoneDef): string => zone.id));
  assert.ok(ids.has('hall_of_time'));
  assert.ok(ids.has('hideout'));
});

for (const zone of fenced) {
  const pieces: readonly BarrierPiece[] = barrierPieces(zone, content.props);
  const bare: NavGrid = buildNavGrid({ ...zone, props: [] }, content.props, content.surfaces, content.player.radius);
  const open: NavGrid = buildNavGrid({ ...zone, props: [], outside: null }, content.props, content.surfaces, content.player.radius);
  const full: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);

  void test(`${zone.id}: the barrier is placed the same way every time`, (): void => {
    assert.deepEqual(barrierPieces(zone, content.props), pieces);
    assert.ok(barrierRuns(zone).length >= 4);
  });

  void test(`${zone.id}: the hero walks up to the barrier on every edge away from the exits`, (): void => {
    const blockers: Blocker[] = [...walls(zone, pieces), ...zone.props.filter((placed): boolean => placed.when.length === 0).flatMap((placed): Blocker[] => propBlockers(must(content.props.get(placed.prop), placed.prop), placed.x, placed.z, placed.rotationDegrees))];
    let worst: number = 0;
    let at: ReadonlyVec2 = { x: 0, z: 0 };
    for (let index: number = 0; index < full.walkable.length; index += 1) {
      if (full.walkable[index] !== 1) continue;
      const centre: ReadonlyVec2 = cellCenter(full, index);
      if (floorDepth(zone, centre.x, centre.z) > EDGE.edgeBand || nearExit(zone, centre, EDGE.exitBand) || besideDrop(zone, centre.x, centre.z)) continue;
      if (EDGE.neighbours.every((step: ReadonlyVec2): boolean => isWalkable(full, centre.x + step.x, centre.z + step.z))) continue;
      const gap: number = Math.min(...blockers.map((blocker: Blocker): number => blockerGap(blocker, centre.x, centre.z))) - content.player.radius;
      if (gap > worst) {
        worst = gap;
        at = centre;
      }
    }
    assert.ok(worst <= EDGE.bodyGap, `${zone.id}: ${worst.toFixed(2)} m between the hero and the barrier at ${at.x}, ${at.z}`);
  });

  void test(`${zone.id}: every exit stays open and reachable from the start`, (): void => {
    for (const exit of zone.exits) {
      const clear: number = zone.outside?.barrier?.exitClear ?? 0;
      for (const piece of pieces) assert.ok(Math.hypot(piece.x - exit.x, piece.z - exit.z) >= exit.radius + clear, `${piece.prop} sits in the ${exit.to} exit`);
      const path: ReadonlyVec2[] = findPath(full, zone.playerStart, exit);
      const end: ReadonlyVec2 | undefined = path.at(-1);
      assert.ok(end !== undefined && Math.hypot(end.x - exit.x, end.z - exit.z) <= exit.radius, `${zone.id}: no path to the ${exit.to} exit`);
    }
  });

  void test(`${zone.id}: the start, packs, people, waypoint and strike sites keep their floor`, (): void => {
    const points: ReadonlyVec2[] = [zone.playerStart, ...zone.packs, ...zone.npcs, ...zone.checkpoints, ...(zone.waypoint === null ? [] : [zone.waypoint])];
    for (const point of points) assert.ok(isWalkable(bare, point.x, point.z) || !isWalkable(open, point.x, point.z), `${zone.id}: the barrier covers ${point.x}, ${point.z}`);
    for (const area of zone.moments?.areas ?? []) {
      const before: number = walkableIn(open, area.x, area.z, area.radius);
      const after: number = walkableIn(bare, area.x, area.z, area.radius);
      assert.ok(after >= before * (1 - EDGE.shrink), `${zone.id}: the barrier takes ${before - after} of ${before} cells from the strike site at ${area.x}, ${area.z}`);
    }
  });

  void test(`${zone.id}: the front row on the camera side stays under the hero's waist`, (): void => {
    const near: ReadonlySet<string> = new Set<string>(zone.outside?.barrier?.nearSides ?? []);
    for (const piece of pieces) {
      if (piece.row !== 0 || !near.has(piece.side)) continue;
      const def: PropDef = must(content.props.get(piece.prop), piece.prop);
      assert.ok(def.height * piece.size <= EDGE.waist, `${piece.prop} is ${(def.height * piece.size).toFixed(2)} m tall on the ${piece.side} edge`);
    }
  });
}

const WORK = {
  gapsPerPiece: 400,
} as const;

for (const zone of fenced) {
  void test(`${zone.id}: placing the barrier measures each piece a bounded number of times, and only once per zone`, (): void => {
    const fresh: ZoneDef = { ...zone };
    const placements: number = BARRIER_WORK.placements;
    const gaps: number = BARRIER_WORK.gaps;
    const pieces: readonly BarrierPiece[] = barrierPieces(fresh, content.props);
    const spent: number = BARRIER_WORK.gaps - gaps;
    assert.ok(pieces.length > 0);
    assert.ok(spent / pieces.length < WORK.gapsPerPiece, `${String(spent)} outline gaps for ${String(pieces.length)} pieces`);
    assert.equal(BARRIER_WORK.placements, placements + 1);
    assert.equal(barrierPieces(fresh, content.props), pieces);
    buildNavGrid(fresh, content.props, content.surfaces, content.player.radius);
    assert.equal(BARRIER_WORK.placements, placements + 1);
    assert.equal(BARRIER_WORK.gaps - gaps, spent);
  });
}

const DROP_ROW: BarrierRow = { far: { props: ['cave_crag_a'], out: -0.9, step: 2.6, turn: 70 }, near: { props: ['cave_edge_a'], out: -0.6, step: 1.1, turn: 90 }, collide: true, shadow: true };

function ledge(drop: readonly BarrierRow[]): ZoneDef {
  const barrier: ZoneBarrier = { nearSides: [], exitClear: 3, rows: [DROP_ROW], drop };
  return roadZone({
    id: 'ledge_test',
    cellSize: 4,
    tiles: ['        ', ' wwwwww ', ' wwwwww ', ' wwwwww ', ' wwwwww ', '        '],
    terrain: { rise: 1, groundStep: 0.6, levels: ['09999999', '03333339', '03333339', '03333339', '03333339', '09999999'], cliff: 'road_firm', rough: null, blends: [], cliffs: [] },
    outside: { surface: 'road_firm', reach: 2, edge: null, barrier },
    playerStart: { x: 12, z: 12 },
  });
}

void test('an edge over a drop takes the drop rows, and an edge under a wall keeps the wall rows', (): void => {
  const open: ZoneDef = ledge([]);
  const runs: BarrierRun[] = barrierRuns(open);
  assert.ok(runs.some((run: BarrierRun): boolean => run.side === 'west' && run.drop));
  assert.ok(runs.every((run: BarrierRun): boolean => run.side === 'west' || !run.drop));
  const bare: readonly BarrierPiece[] = barrierPieces(open, content.props);
  assert.ok(bare.some((piece: BarrierPiece): boolean => piece.side === 'east'));
  assert.ok(bare.every((piece: BarrierPiece): boolean => piece.side !== 'west'));
  const lipped: readonly BarrierPiece[] = barrierPieces(ledge([DROP_ROW]), content.props);
  assert.ok(lipped.some((piece: BarrierPiece): boolean => piece.side === 'west'));
});
