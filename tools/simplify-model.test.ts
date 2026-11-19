import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Accessor, Document, Primitive } from '@gltf-transform/core';
import { Document as GltfDocument } from '@gltf-transform/core';
import type { SimplifyOptions, SimplifyReport } from './simplify-model.ts';
import { simplifyDocument } from './simplify-model.ts';

const GRID = { cells: 24, seam: 12, jointCount: 4 } as const;
const OPTIONS: SimplifyOptions = { ratio: 0.4, error: 0.5, minTriangles: 100 };
const PRECISION = 5;

interface Sheet {
  readonly document: Document;
  readonly primitive: Primitive;
}

function jointOf(x: number): number {
  return Math.min(GRID.jointCount - 1, Math.floor(x * GRID.jointCount));
}

function keyOf(row: readonly number[]): string {
  return row.map((value: number): string => value.toFixed(PRECISION)).join(',');
}

function buildSheet(cells: number, seam: number): Sheet {
  const document: Document = new GltfDocument();
  const buffer = document.createBuffer();
  const columns: number = cells + 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];
  for (let row = 0; row <= cells; row++) {
    for (let column = 0; column < columns; column++) {
      const x: number = (column > seam ? column - 1 : column) / cells;
      const y: number = row / cells;
      positions.push(x, y, 0.05 * Math.sin(x * 6) * Math.cos(y * 5));
      normals.push(0, 0, 1);
      uvs.push(column > seam ? 0.5 + x * 0.4 : x * 0.4, y);
      joints.push(jointOf(x), 0, 0, 0);
      weights.push(1, 0, 0, 0);
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < cells; row++) {
    for (let column = 0; column < columns - 1; column++) {
      if (column === seam) continue;
      const a: number = row * columns + column;
      indices.push(a, a + 1, a + columns, a + 1, a + columns + 1, a + columns);
    }
  }
  const accessor = (array: Float32Array | Uint16Array, type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4'): Accessor => document.createAccessor().setBuffer(buffer).setType(type).setArray(array);
  const primitive: Primitive = document
    .createPrimitive()
    .setIndices(accessor(new Uint16Array(indices), 'SCALAR'))
    .setAttribute('POSITION', accessor(new Float32Array(positions), 'VEC3'))
    .setAttribute('NORMAL', accessor(new Float32Array(normals), 'VEC3'))
    .setAttribute('TEXCOORD_0', accessor(new Float32Array(uvs), 'VEC2'))
    .setAttribute('JOINTS_0', accessor(new Uint16Array(joints), 'VEC4'))
    .setAttribute('WEIGHTS_0', accessor(new Float32Array(weights), 'VEC4'))
    .setMaterial(document.createMaterial('cloth'));
  document.createMesh('sheet').addPrimitive(primitive);
  return { document, primitive };
}

function rowsOf(accessor: Accessor | null): number[][] {
  const rows: number[][] = [];
  for (let index = 0; index < (accessor?.getCount() ?? 0); index++) rows.push(accessor?.getElement(index, []) ?? []);
  return rows;
}

function firstPrimitive(document: Document): Primitive {
  const primitive: Primitive | undefined = document.getRoot().listMeshes()[0]?.listPrimitives()[0];
  assert.ok(primitive !== undefined);
  return primitive;
}

void test('a sheet with a UV seam loses triangles but keeps its border, its seam, its joints and its material', async (): Promise<void> => {
  const { document, primitive } = buildSheet(GRID.cells, GRID.seam);
  const original: number[][] = rowsOf(primitive.getAttribute('POSITION'));
  const report: SimplifyReport = await simplifyDocument(document, OPTIONS);
  assert.equal(report.before, GRID.cells * GRID.cells * 2);
  assert.ok(report.after < report.before * 0.6, `${report.after} of ${report.before}`);
  const kept: Primitive = firstPrimitive(document);
  const after: number[][] = rowsOf(kept.getAttribute('POSITION'));
  const originalKeys: Set<string> = new Set(original.map(keyOf));
  assert.ok(after.every((row: number[]): boolean => originalKeys.has(keyOf(row))));
  const afterKeys: Set<string> = new Set(after.map(keyOf));
  const borderLost: string[] = original.filter((row: number[]): boolean => (row[0] === 0 || row[0] === 1 || row[1] === 0 || row[1] === 1) && !afterKeys.has(keyOf(row))).map(keyOf);
  assert.deepEqual(borderLost, []);
  const seamX: number = GRID.seam / GRID.cells;
  const uvs: number[][] = rowsOf(kept.getAttribute('TEXCOORD_0'));
  const seamUs: Set<string> = new Set(after.flatMap((row: number[], index: number): string[] => (Math.abs((row[0] ?? 0) - seamX) < 1e-6 ? [(uvs[index]?.[0] ?? 0).toFixed(PRECISION)] : [])));
  assert.equal(seamUs.size, 2);
  const joints: number[][] = rowsOf(kept.getAttribute('JOINTS_0'));
  assert.ok(joints.every((row: number[]): boolean => (row[0] ?? GRID.jointCount) < GRID.jointCount));
  assert.equal(kept.getMaterial()?.getName(), 'cloth');
  const indices: number[] = rowsOf(kept.getIndices()).map((row: number[]): number => row[0] ?? after.length);
  assert.ok(indices.every((value: number): boolean => value < after.length));
});

void test('a primitive under the minimum is left alone', async (): Promise<void> => {
  const { document } = buildSheet(4, 2);
  const report: SimplifyReport = await simplifyDocument(document, OPTIONS);
  assert.equal(report.after, report.before);
});

void test('a ratio of one keeps every triangle of a sheet', async (): Promise<void> => {
  const { document } = buildSheet(GRID.cells, GRID.seam);
  const report: SimplifyReport = await simplifyDocument(document, { ...OPTIONS, ratio: 1 });
  assert.equal(report.after, report.before);
});
