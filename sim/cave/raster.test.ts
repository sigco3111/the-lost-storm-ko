import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CaveRamp, CaveRaster } from './raster.ts';
import { cellAt, createRaster, crowded, evenRampSides, paintCell, paintRamp, paintStroke, rampCells, rampSidesClear, rockDistance, ROCK, wallLevels } from './raster.ts';

const C: number = 'c'.charCodeAt(0);

void test('painting one cell at two levels is a conflict, at the same level it is not', (): void => {
  const raster: CaveRaster = createRaster(8, 8);
  paintCell(raster, 2, 2, 5, 0, C);
  paintCell(raster, 2, 2, 5, 0, C);
  assert.equal(raster.conflict, false);
  paintCell(raster, 2, 2, 3, 1, C);
  assert.equal(raster.conflict, true);
});

void test('a stroke paints a lane of its width and a ramp may not land on floor', (): void => {
  const raster: CaveRaster = createRaster(20, 8);
  paintStroke(raster, { x: 2, z: 4 }, { x: 18, z: 4 }, 1.9, 7, 0, C);
  assert.equal(raster.level[cellAt(raster, 10, 4)], 7);
  assert.equal(raster.level[cellAt(raster, 10, 1)], ROCK);
  paintRamp(raster, 10, 4, 0, C);
  assert.equal(raster.conflict, true);
});

void test('a ramp with rock on both flanks is clear, the flanks are levelled alike, and the distance to rock counts in cells', (): void => {
  const raster: CaveRaster = createRaster(12, 14);
  const ramp: CaveRamp = { axis: 'z', sign: 1, line: 6, start: 5, width: 4, length: 4 };
  for (let row: number = 1; row <= 4; row += 1) for (let column: number = 4; column < 8; column += 1) paintCell(raster, column, row, 9, 0, C);
  for (let row: number = 9; row <= 12; row += 1) for (let column: number = 4; column < 8; column += 1) paintCell(raster, column, row, 7, 1, C);
  for (const cell of rampCells(ramp)) paintRamp(raster, cell.column, cell.row, 1, C);
  assert.equal(raster.conflict, false);
  assert.equal(rampSidesClear(raster, ramp), true);
  assert.equal(crowded(raster, 2, 3), false);
  const levels: Int16Array = wallLevels(raster, 6, { back: 1, side: 2, front: 4 }, 30);
  evenRampSides(raster, levels, ramp);
  for (let row: number = 5; row <= 8; row += 1) assert.equal(levels[cellAt(raster, 3, row)], levels[cellAt(raster, 8, row)]);
  const clear: Int16Array = rockDistance(raster);
  assert.equal(clear[cellAt(raster, 3, 2)], 0);
  assert.equal(clear[cellAt(raster, 4, 2)], 1);
  assert.equal(clear[cellAt(raster, 5, 2)], 2);
});

void test('walls rise least behind the floor and most in front of it, toward the camera', (): void => {
  const raster: CaveRaster = createRaster(9, 9);
  paintCell(raster, 4, 4, 10, 0, C);
  const levels: Int16Array = wallLevels(raster, 6, { back: 1, side: 2, front: 4 }, 30);
  assert.equal(levels[cellAt(raster, 4, 3)], 11);
  assert.equal(levels[cellAt(raster, 3, 4)], 11);
  assert.equal(levels[cellAt(raster, 5, 4)], 12);
  assert.equal(levels[cellAt(raster, 4, 5)], 14);
  assert.equal(levels[cellAt(raster, 0, 0)], 30);
});

void test('two different levels side by side, or two far features touching, read as crowded', (): void => {
  const raster: CaveRaster = createRaster(10, 10);
  paintCell(raster, 2, 2, 5, 0, C);
  paintCell(raster, 3, 3, 7, 1, C);
  assert.equal(crowded(raster, 2, 3), true);
  const apart: CaveRaster = createRaster(10, 10);
  paintCell(apart, 2, 2, 5, 0, C);
  paintCell(apart, 4, 4, 5, 4, C);
  assert.equal(crowded(apart, 2, 3), true);
});
