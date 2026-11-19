import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Batch, ShapedBatch } from './ground.ts';
import { shapedBatch } from './ground.ts';

const TRIANGLE: Batch = { positions: [0, 0, 0, 1, 0, 0, 0, 0, 1], normals: [0, 1, 0, 0, 1, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1], colors: [1, 1, 1, 1, 0.5, 0.5, 0.5, 1, 0.25, 0.25, 0.25, 0.5], indices: [0, 1, 2] };

void test('a shaped batch keeps every vertex and index of the batch it was packed from', (): void => {
  const shaped: ShapedBatch = shapedBatch(TRIANGLE);
  assert.deepEqual([...shaped.positions], TRIANGLE.positions);
  assert.deepEqual([...shaped.normals], TRIANGLE.normals);
  assert.deepEqual([...shaped.uvs], TRIANGLE.uvs);
  assert.deepEqual([...shaped.colors], TRIANGLE.colors);
  assert.deepEqual([...shaped.indices], TRIANGLE.indices);
});

void test('a shaped batch asks for wide indices only once an index no longer fits in sixteen bits', (): void => {
  assert.equal(shapedBatch(TRIANGLE).wideIndices, false);
  assert.equal(shapedBatch({ ...TRIANGLE, indices: [0, 65534, 2] }).wideIndices, false);
  assert.equal(shapedBatch({ ...TRIANGLE, indices: [0, 65535, 2] }).wideIndices, true);
});
