import type { ZoneDef } from '../../sim/content/types.ts';
import { floorCells, isFloorCell } from '../../sim/nav/layout.ts';
import { surfacesMeet } from '../../sim/nav/terrain.ts';
import type { Batch } from './ground.ts';
import { tileLift } from './terrain-lift.ts';

export const GROUND_CLIFFS = {
  segments: 8,
  sink: 0.25,
  lip: 0.04,
  topShade: 0.62,
  footShade: 0.3,
  least: 0.05,
} as const;

interface Side {
  readonly dc: number;
  readonly dr: number;
}

const SIDES: readonly Side[] = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
];

interface EdgePoint {
  readonly x: number;
  readonly z: number;
  readonly top: number;
  readonly foot: number;
}

function edgePoints(zone: ZoneDef, column: number, row: number, side: Side): EdgePoint[] {
  const size: number = zone.cellSize;
  const points: EdgePoint[] = [];
  for (let index: number = 0; index <= GROUND_CLIFFS.segments; index += 1) {
    const share: number = index / GROUND_CLIFFS.segments;
    const x: number = side.dc !== 0 ? (column + (side.dc > 0 ? 1 : 0)) * size : (column + share) * size;
    const z: number = side.dr !== 0 ? (row + (side.dr > 0 ? 1 : 0)) * size : (row + share) * size;
    const top: number = tileLift(zone, column, row, x, z);
    const foot: number = tileLift(zone, column + side.dc, row + side.dr, x, z);
    points.push({ x, z, top, foot });
  }
  return points;
}

function push(batch: Batch, x: number, y: number, z: number, along: number, side: Side, shade: number): void {
  batch.positions.push(x, y, z);
  batch.normals.push(side.dc, 0, side.dr);
  batch.uvs.push(along, y);
  batch.colors.push(shade, shade, shade, 1);
}

function face(batch: Batch, points: readonly EdgePoint[], side: Side): void {
  for (let index: number = 0; index < points.length - 1; index += 1) {
    const a: EdgePoint | undefined = points[index];
    const b: EdgePoint | undefined = points[index + 1];
    if (a === undefined || b === undefined || (a.top - a.foot < GROUND_CLIFFS.least && b.top - b.foot < GROUND_CLIFFS.least)) continue;
    const base: number = batch.positions.length / 3;
    const alongA: number = a.x + a.z;
    const alongB: number = b.x + b.z;
    push(batch, a.x, a.top + GROUND_CLIFFS.lip, a.z, alongA, side, GROUND_CLIFFS.topShade);
    push(batch, b.x, b.top + GROUND_CLIFFS.lip, b.z, alongB, side, GROUND_CLIFFS.topShade);
    push(batch, a.x, Math.min(a.top, a.foot) - GROUND_CLIFFS.sink, a.z, alongA, side, GROUND_CLIFFS.footShade);
    push(batch, b.x, Math.min(b.top, b.foot) - GROUND_CLIFFS.sink, b.z, alongB, side, GROUND_CLIFFS.footShade);
    batch.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3, base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
}

export function buildCliffs(zone: ZoneDef, batch: Batch): void {
  for (const cell of floorCells(zone)) {
    for (const side of SIDES) {
      const column: number = cell.column + side.dc;
      const row: number = cell.row + side.dr;
      const floor: boolean = isFloorCell(zone, column, row);
      if (floor && surfacesMeet(zone, cell.column, cell.row, side.dc, side.dr)) continue;
      face(batch, edgePoints(zone, cell.column, cell.row, side), side);
      if (!floor) {
        const back: Side = { dc: -side.dc, dr: -side.dr };
        face(batch, edgePoints(zone, column, row, back), back);
      }
    }
  }
}
