import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AtlasCell, Raster } from './atlas-layout.ts';
import { atlasCells, bigCellCount, blankRaster, paste, placeUv, resample } from './atlas-layout.ts';

function overlaps(a: AtlasCell, b: AtlasCell): boolean {
  return a.x < b.x + b.size && b.x < a.x + a.size && a.y < b.y + b.size && b.y < a.y + a.size;
}

void test('seven tiles take three half cells and four quarter cells, none overlapping and all inside the atlas', (): void => {
  assert.equal(bigCellCount(7), 3);
  const cells: AtlasCell[] = atlasCells(7, 1024);
  assert.deepEqual(cells.map((cell: AtlasCell): number => cell.size), [512, 512, 512, 256, 256, 256, 256]);
  for (const [index, cell] of cells.entries()) {
    assert.ok(cell.x >= 0 && cell.y >= 0 && cell.x + cell.size <= 1024 && cell.y + cell.size <= 1024);
    for (const other of cells.slice(index + 1)) assert.ok(!overlaps(cell, other), `${JSON.stringify(cell)} overlaps ${JSON.stringify(other)}`);
  }
});

void test('every count from one to sixteen fits, with as many half cells as leave room for the rest', (): void => {
  for (let count: number = 1; count <= 16; count += 1) {
    const cells: AtlasCell[] = atlasCells(count, 1024);
    assert.equal(cells.length, count);
    for (const [index, cell] of cells.entries()) for (const other of cells.slice(index + 1)) assert.ok(!overlaps(cell, other));
  }
  assert.throws((): AtlasCell[] => atlasCells(17, 1024));
});

void test('a tile corner lands inside its cell past the gutter', (): void => {
  const cell: AtlasCell = { x: 512, y: 256, size: 256 };
  assert.deepEqual(placeUv(cell, 1024, 8, 0, 0), [520 / 1024, 264 / 1024]);
  assert.deepEqual(placeUv(cell, 1024, 8, 1, 1), [760 / 1024, 504 / 1024]);
});

void test('a pasted tile fills its gutter with its own edge colours and leaves the rest of the atlas alone', (): void => {
  const atlas: Raster = blankRaster(8, 8);
  const tile: Raster = blankRaster(2, 2);
  tile.data.set([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255]);
  paste(atlas, tile, { x: 4, y: 0, size: 4 }, 1);
  const red = (x: number, y: number): number => atlas.data[(y * 8 + x) * 4] ?? -1;
  assert.deepEqual([red(4, 0), red(5, 1), red(6, 1), red(7, 0)], [10, 10, 20, 20]);
  assert.deepEqual([red(4, 3), red(6, 2), red(7, 3)], [30, 40, 40]);
  assert.equal(red(3, 0), 0);
});

void test('a resampled flat colour keeps its colour', (): void => {
  const flat: Raster = blankRaster(16, 16);
  for (let at: number = 0; at < flat.data.length; at += 4) flat.data.set([90, 120, 200, 255], at);
  const small: Raster = resample(flat, 7);
  assert.equal(small.width, 7);
  assert.deepEqual([...small.data.subarray(0, 4)], [90, 120, 200, 255]);
});
