import type { ReadonlyVec2 } from '../math.ts';
import type { NavGrid } from './grid.ts';
import { cellIndex } from './grid.ts';

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface WalkRegion {
  readonly grid: NavGrid;
  readonly cells: Uint8Array;
}

export function walkRegion(grid: NavGrid, from: ReadonlyVec2): WalkRegion {
  const cells: Uint8Array = new Uint8Array(grid.columns * grid.rows);
  const first: number = cellIndex(grid, from.x, from.z);
  if (first < 0 || grid.walkable[first] !== 1) return { grid, cells };
  const queue: number[] = [first];
  cells[first] = 1;
  while (queue.length > 0) {
    const index: number | undefined = queue.pop();
    if (index === undefined) break;
    const column: number = index % grid.columns;
    const row: number = Math.floor(index / grid.columns);
    for (const [dc, dr] of NEIGHBOURS) {
      const nextColumn: number = column + dc;
      const nextRow: number = row + dr;
      if (nextColumn < 0 || nextRow < 0 || nextColumn >= grid.columns || nextRow >= grid.rows) continue;
      const next: number = nextRow * grid.columns + nextColumn;
      if (cells[next] === 1 || grid.walkable[next] !== 1) continue;
      cells[next] = 1;
      queue.push(next);
    }
  }
  return { grid, cells };
}

export function inRegion(region: WalkRegion, point: ReadonlyVec2): boolean {
  const index: number = cellIndex(region.grid, point.x, point.z);
  return index >= 0 && region.cells[index] === 1;
}
