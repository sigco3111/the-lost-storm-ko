import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NavGrid } from './grid.ts';
import { inRegion, walkRegion } from './region.ts';

function gridOf(rows: readonly string[]): NavGrid {
  const columns: number = rows[0]?.length ?? 0;
  const walkable: Uint8Array = Uint8Array.from(rows.join(''), (cell: string): number => (cell === '.' ? 1 : 0));
  return { cellSize: 1, columns, rows: rows.length, walkable, solid: walkable.map((value: number): number => 1 - value), pace: new Float32Array(walkable.length).fill(1), drifts: [], ground: walkable, bodies: [], near: new Map<number, number[]>(), radius: 0.4, routed: false };
}

void test('a walk region holds every cell joined to the start on foot and none behind a wall', (): void => {
  const grid: NavGrid = gridOf(['..#..', '..#..', '.....', '###..', '..#..']);
  const region = walkRegion(grid, { x: 0.5, z: 0.5 });
  assert.ok(inRegion(region, { x: 4.5, z: 0.5 }));
  assert.ok(inRegion(region, { x: 3.5, z: 4.5 }));
  assert.ok(!inRegion(region, { x: 0.5, z: 4.5 }));
  assert.ok(!inRegion(region, { x: 2.5, z: 0.5 }));
});

void test('a walk region from a wall or from outside the grid is empty', (): void => {
  const grid: NavGrid = gridOf(['.#.', '...']);
  assert.ok(!inRegion(walkRegion(grid, { x: 1.5, z: 0.5 }), { x: 0.5, z: 0.5 }));
  assert.ok(!inRegion(walkRegion(grid, { x: -4, z: 0.5 }), { x: 0.5, z: 0.5 }));
  assert.ok(!inRegion(walkRegion(grid, { x: 0.5, z: 0.5 }), { x: 9, z: 9 }));
});
