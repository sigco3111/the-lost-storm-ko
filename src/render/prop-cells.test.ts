import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PROP_CELLS, propCell } from './prop-cells.ts';

void test('two props share a cell only when they stand in the same square of the grid', (): void => {
  const size: number = PROP_CELLS.size;
  assert.equal(propCell(0, 0), propCell(size - 0.01, size - 0.01));
  assert.notEqual(propCell(0, 0), propCell(size, 0));
  assert.notEqual(propCell(0, 0), propCell(0, size));
  assert.notEqual(propCell(size, 0), propCell(0, size));
});

void test('cells run on past zero, so a prop just west of the origin is not batched with one just east of it', (): void => {
  assert.notEqual(propCell(-0.01, 0), propCell(0.01, 0));
  assert.equal(propCell(-0.01, 0), propCell(-PROP_CELLS.size + 0.01, 0));
  assert.notEqual(propCell(0, -0.01), propCell(0, 0.01));
});

void test('every prop within one cell is at most the cell diagonal from any other', (): void => {
  const size: number = PROP_CELLS.size;
  const points: readonly (readonly [number, number])[] = Array.from({ length: 400 }, (_unused: unknown, index: number): readonly [number, number] => [((index * 37) % 211) - 90.5, ((index * 53) % 197) - 80.25]);
  for (const [ax, az] of points) for (const [bx, bz] of points) if (propCell(ax, az) === propCell(bx, bz)) assert.ok(Math.hypot(ax - bx, az - bz) <= Math.hypot(size, size));
});
