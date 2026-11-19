import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, SurfaceDef, ZoneDef } from '../content/types.ts';
import { buildNavGrid, isWalkable, paceAt } from './grid.ts';
import type { NavGrid } from './grid.ts';

const content: Content = loadContent();
const molten: SurfaceDef = must(content.surfaces.get('molten'), 'molten');
const LAVA_LEVELS: readonly string[] = ['lava_depths', 'lava_depths_2', 'lava_depths_3'];

function moltenCells(zone: ZoneDef): { readonly x: number; readonly z: number }[] {
  const cells: { readonly x: number; readonly z: number }[] = [];
  zone.tiles.forEach((row: string, rowIndex: number): void => {
    for (let column: number = 0; column < row.length; column += 1) {
      if (zone.floors[row.charAt(column)] === molten.id) cells.push({ x: (column + 0.5) * zone.cellSize, z: (rowIndex + 0.5) * zone.cellSize });
    }
  });
  return cells;
}

void test('open molten lava is walkable, slows whoever wades in, and burns them', (): void => {
  assert.ok(molten.pace < 1);
  assert.equal(molten.blocks, false);
  assert.notEqual(molten.heat, null);
  assert.equal(molten.glow?.lit, 'map');
});

void test('every lava level has molten pools, and wading through one is slower than the ground around it', (): void => {
  for (const id of LAVA_LEVELS) {
    const zone: ZoneDef = must(content.zones.get(id), id);
    const cells = moltenCells(zone);
    assert.ok(cells.length > 0, `${id} has molten pools`);
    const grid: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
    const walked = cells.filter((cell: { readonly x: number; readonly z: number }): boolean => isWalkable(grid, cell.x, cell.z));
    assert.ok(walked.length > 0, `${id} lets the hero into its molten pools`);
    for (const cell of walked) assert.equal(paceAt(grid, cell.x, cell.z), Math.fround(molten.pace), `${id} at ${cell.x},${cell.z}`);
  }
});
