import type { Accessor, Document, Mesh } from '@gltf-transform/core';
import { Primitive } from '@gltf-transform/core';
import { compactPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

export interface SimplifyOptions {
  readonly ratio: number;
  readonly error: number;
  readonly minTriangles: number;
}

export interface SimplifyReport {
  readonly before: number;
  readonly after: number;
}

interface ShapedAttribute {
  readonly semantic: string;
  readonly weight: number;
}

const SHAPE: readonly ShapedAttribute[] = [
  { semantic: 'NORMAL', weight: 0.5 },
  { semantic: 'TEXCOORD_0', weight: 1 },
  { semantic: 'WEIGHTS_0', weight: 1 },
];

const VERTICES_PER_TRIANGLE = 3;
const UINT16_VERTEX_LIMIT = 65534;
const POSITION_WIDTH = 3;

export const DEFAULT_SIMPLIFY: SimplifyOptions = { ratio: 0.4, error: 0.01, minTriangles: 100 };

function elementsOf(accessor: Accessor): number[][] {
  const rows: number[][] = [];
  for (let index = 0; index < accessor.getCount(); index++) rows.push(accessor.getElement(index, []));
  return rows;
}

function scalarsOf(accessor: Accessor): number[] {
  const values: number[] = [];
  for (let index = 0; index < accessor.getCount(); index++) values.push(accessor.getScalar(index));
  return values;
}

function flatten(rows: readonly (readonly number[])[], width: number): Float32Array {
  const flat: Float32Array = new Float32Array(rows.length * width);
  rows.forEach((row: readonly number[], index: number): void => flat.set(row, index * width));
  return flat;
}

function shapeBuffer(primitive: Primitive, vertexCount: number): { readonly values: Float32Array; readonly stride: number; readonly weights: number[] } {
  const columns: { readonly rows: number[][]; readonly width: number; readonly weight: number }[] = [];
  for (const shaped of SHAPE) {
    const accessor: Accessor | null = primitive.getAttribute(shaped.semantic);
    if (accessor === null) continue;
    const rows: number[][] = elementsOf(accessor);
    columns.push({ rows, width: accessor.getElementSize(), weight: shaped.weight });
  }
  const stride: number = columns.reduce((sum: number, column): number => sum + column.width, 0);
  const values: Float32Array = new Float32Array(vertexCount * stride);
  const weights: number[] = columns.flatMap((column): number[] => Array.from({ length: column.width }, (): number => column.weight));
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    let offset: number = vertex * stride;
    for (const column of columns) {
      values.set(column.rows[vertex] ?? [], offset);
      offset += column.width;
    }
  }
  return { values, stride, weights };
}

function simplifyPrimitive(primitive: Primitive, options: SimplifyOptions): void {
  const indices: Accessor | null = primitive.getIndices();
  const position: Accessor | null = primitive.getAttribute('POSITION');
  if (indices === null || position === null || primitive.getMode() !== Primitive.Mode.TRIANGLES) return;
  const triangles: number = indices.getCount() / VERTICES_PER_TRIANGLE;
  if (triangles < options.minTriangles) return;
  const vertexCount: number = position.getCount();
  const shape = shapeBuffer(primitive, vertexCount);
  const target: number = Math.max(VERTICES_PER_TRIANGLE, Math.floor(triangles * options.ratio) * VERTICES_PER_TRIANGLE);
  const [kept]: [Uint32Array, number] = MeshoptSimplifier.simplifyWithAttributes(
    Uint32Array.from(scalarsOf(indices)),
    flatten(elementsOf(position), POSITION_WIDTH),
    POSITION_WIDTH,
    shape.values,
    shape.stride,
    shape.weights,
    null,
    target,
    options.error,
    ['LockBorder'],
  );
  indices.setArray(kept);
  compactPrimitive(primitive);
  const compacted: Accessor | null = primitive.getIndices();
  if (compacted !== null && position.getCount() <= UINT16_VERTEX_LIMIT) compacted.setArray(Uint16Array.from(scalarsOf(compacted)));
}

function trianglesOf(document: Document): number {
  return document
    .getRoot()
    .listMeshes()
    .flatMap((mesh: Mesh): readonly Primitive[] => mesh.listPrimitives())
    .reduce((sum: number, primitive: Primitive): number => sum + (primitive.getIndices()?.getCount() ?? 0) / VERTICES_PER_TRIANGLE, 0);
}

export async function simplifyDocument(document: Document, options: SimplifyOptions): Promise<SimplifyReport> {
  await MeshoptSimplifier.ready;
  await document.transform(weld({ overwrite: false }));
  const before: number = trianglesOf(document);
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) simplifyPrimitive(primitive, options);
  }
  return { before, after: trianglesOf(document) };
}
