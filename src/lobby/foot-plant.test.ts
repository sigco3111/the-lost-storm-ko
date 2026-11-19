import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box3, Vector3 } from 'three';
import { Bone, BufferGeometry, Float32BufferAttribute, Group, MeshBasicMaterial, Skeleton, SkinnedMesh, Uint16BufferAttribute } from 'three';
import { footing, lowestOf } from './foot-plant.ts';

interface Figure {
  readonly root: Group;
  readonly mesh: SkinnedMesh;
  readonly foot: Bone;
  readonly head: Bone;
}

function figure(): Figure {
  const positions: number[] = [];
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const put = (x: number, y: number, z: number, bone: number): void => {
    positions.push(x, y, z);
    skinIndices.push(bone, 0, 0, 0);
    skinWeights.push(1, 0, 0, 0);
  };
  for (let step: number = 0; step < 8; step += 1) put(step * 0.02, 0.02 + step * 0.01, 0.1, 0);
  for (let step: number = 0; step < 8; step += 1) put(step * 0.02, 1.5 + step * 0.03, 0, 1);
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4));
  const foot: Bone = new Bone();
  const head: Bone = new Bone();
  head.position.y = 1.5;
  foot.add(head);
  const mesh: SkinnedMesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
  mesh.add(foot);
  mesh.bind(new Skeleton([foot, head]));
  const root: Group = new Group();
  root.rotation.y = 0.7;
  root.add(mesh);
  return { root, mesh, foot, head };
}

function wholeLowest(made: Figure): number {
  made.root.updateMatrixWorld(true);
  made.mesh.computeBoundingBox();
  const box: Box3 = made.mesh.boundingBox;
  return box.clone().applyMatrix4(made.mesh.matrixWorld).min.y;
}

void test('the footing finds the lowest point of the whole figure and keeps only the vertices near the ground', (): void => {
  const made: Figure = figure();
  const found = footing(made.root);
  assert.ok(Math.abs(found.lowest - wholeLowest(made)) < 1e-6);
  assert.equal(found.low.length, 1);
  assert.equal(found.low[0]?.indices.length, 8);
});

void test('through a pose the kept vertices give the same lowest point as measuring every vertex', (): void => {
  const made: Figure = figure();
  const found = footing(made.root);
  for (const [lift, lean] of [[0.04, 0.1], [-0.03, -0.2], [0.12, 0.35], [0, 0]] as const) {
    made.foot.position.y = lift;
    made.foot.rotation.x = lean;
    made.head.rotation.z = lean * 2;
    assert.ok(Math.abs(lowestOf(made.root, found.low) - wholeLowest(made)) < 1e-6, `lift ${lift} lean ${lean}`);
  }
});

void test('a figure with nothing drawn has no footing', (): void => {
  const empty: Group = new Group();
  const found = footing(empty);
  assert.equal(found.lowest, Number.POSITIVE_INFINITY);
  assert.deepEqual(found.low, []);
  assert.equal(lowestOf(empty, found.low), Number.POSITIVE_INFINITY);
});

void test('only the vertices low on the figure at rest are skinned, so the head is never posed to find the feet', (): void => {
  const made: Figure = figure();
  const posed: number[] = [];
  const pose = made.mesh.getVertexPosition.bind(made.mesh);
  made.mesh.getVertexPosition = (index: number, target: Vector3): Vector3 => {
    posed.push(index);
    return pose(index, target);
  };
  const found = footing(made.root);
  assert.deepEqual([...new Set(posed)].toSorted((a: number, b: number): number => a - b), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.ok(Math.abs(found.lowest - wholeLowest(made)) < 1e-6);
});
