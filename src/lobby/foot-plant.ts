import type { BufferAttribute, InterleavedBufferAttribute, Object3D } from 'three';
import { SkinnedMesh, Vector3 } from 'three';

export const FOOT_PLANT = {
  reach: 0.3,
  restReach: 0.6,
} as const;

export interface LowVertices {
  readonly mesh: SkinnedMesh;
  readonly indices: readonly number[];
}

export interface Footing {
  readonly lowest: number;
  readonly low: readonly LowVertices[];
}

const point: Vector3 = new Vector3();

function isSkinned(object: Object3D): object is SkinnedMesh {
  return object instanceof SkinnedMesh;
}

function heightOf(mesh: SkinnedMesh, index: number): number {
  return mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld).y;
}

function restHeights(mesh: SkinnedMesh): Float32Array {
  const position: BufferAttribute | InterleavedBufferAttribute = mesh.geometry.getAttribute('position');
  const heights: Float32Array = new Float32Array(position.count);
  for (let index: number = 0; index < heights.length; index += 1) heights[index] = point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld).y;
  return heights;
}

export function footing(root: Object3D, reach: number = FOOT_PLANT.reach, restReach: number = FOOT_PLANT.restReach): Footing {
  root.updateMatrixWorld(true);
  const rest: { readonly mesh: SkinnedMesh; readonly heights: Float32Array }[] = [];
  let restLowest: number = Number.POSITIVE_INFINITY;
  root.traverseVisible((node: Object3D): void => {
    if (!isSkinned(node)) return;
    const heights: Float32Array = restHeights(node);
    for (const height of heights) if (height < restLowest) restLowest = height;
    rest.push({ mesh: node, heights });
  });
  const posed: { readonly mesh: SkinnedMesh; readonly indices: readonly number[]; readonly heights: readonly number[] }[] = [];
  let lowest: number = Number.POSITIVE_INFINITY;
  for (const { mesh, heights } of rest) {
    const indices: number[] = [];
    const measured: number[] = [];
    for (let index: number = 0; index < heights.length; index += 1) {
      if ((heights[index] ?? Number.POSITIVE_INFINITY) > restLowest + restReach) continue;
      const height: number = heightOf(mesh, index);
      indices.push(index);
      measured.push(height);
      if (height < lowest) lowest = height;
    }
    posed.push({ mesh, indices, heights: measured });
  }
  const low: LowVertices[] = [];
  for (const { mesh, indices, heights } of posed) {
    const kept: number[] = indices.filter((_index: number, at: number): boolean => (heights[at] ?? Number.POSITIVE_INFINITY) <= lowest + reach);
    if (kept.length > 0) low.push({ mesh, indices: kept });
  }
  return { lowest, low };
}

export function lowestOf(root: Object3D, low: readonly LowVertices[]): number {
  root.updateMatrixWorld(true);
  let lowest: number = Number.POSITIVE_INFINITY;
  for (const { mesh, indices } of low) {
    for (const index of indices) {
      const height: number = heightOf(mesh, index);
      if (height < lowest) lowest = height;
    }
  }
  return lowest;
}
