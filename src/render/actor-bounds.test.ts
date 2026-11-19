import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, Box3, BoxGeometry, BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three';
import type { PickCandidate, PickPoint } from '../pick.ts';
import { pickActor } from '../pick.ts';
import { ACTOR_BOUNDS, actorBounds } from './actor-bounds.ts';

interface Person {
  readonly root: Group;
  readonly body: SkinnedMesh;
  readonly worn: SkinnedMesh;
}

function skin(skeleton: Skeleton): SkinnedMesh {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([-0.2, 0, 0, 0.2, 0, 0, 0, 1.7, 0]), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  const mesh: SkinnedMesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.bind(skeleton, new Matrix4());
  return mesh;
}

function person(x: number, z: number): Person {
  const root: Group = new Group();
  const hips: Bone = new Bone();
  const head: Bone = new Bone();
  head.position.y = 1.7;
  hips.add(head);
  root.add(hips);
  root.updateMatrixWorld(true);
  const skeleton: Skeleton = new Skeleton([hips, head]);
  const body: SkinnedMesh = skin(skeleton);
  const worn: SkinnedMesh = skin(skeleton);
  root.add(body, worn);
  root.position.set(x, 0, z);
  root.updateMatrixWorld(true);
  return { root, body, worn };
}

function rounded(point: Vector3): number[] {
  return point.toArray().map((value: number): number => Math.round(value * 100) / 100);
}

const PIXELS_PER_METRE: number = 100;

function screenOf(box: Box3): PickCandidate['body'] {
  return { minX: box.min.x * PIXELS_PER_METRE, minY: box.min.y * PIXELS_PER_METRE, maxX: box.max.x * PIXELS_PER_METRE, maxY: box.max.y * PIXELS_PER_METRE };
}

function pointAt(x: number, y: number): PickPoint {
  return { x: x * PIXELS_PER_METRE, y: y * PIXELS_PER_METRE };
}

void test('a person\'s bounds follow their bones where they stand now, with a little flesh around them', (): void => {
  const { root } = person(30, 15);
  const box: Box3 = actorBounds(root, new Box3());
  assert.equal(ACTOR_BOUNDS.flesh, 0.15);
  assert.deepEqual(rounded(box.min), [29.85, -0.15, 14.85]);
  assert.deepEqual(rounded(box.max), [30.15, 1.85, 15.15]);
});

void test('a skinned piece whose box was measured while the person stood elsewhere never stretches the person across the ground', (): void => {
  const { root, worn } = person(30, 15);
  worn.boundingBox = new Box3(new Vector3(-31, 0, -16), new Vector3(-29, 2, -14));
  const stale: Box3 = new Box3().setFromObject(root);
  assert.equal(stale.min.x < 0, true);
  const box: Box3 = actorBounds(root, new Box3());
  assert.equal(box.min.x > 29, true);
  assert.equal(box.max.x < 31, true);
});

void test('a held rigid piece counts where it is held', (): void => {
  const { root } = person(30, 15);
  const lantern: Mesh = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshStandardMaterial());
  lantern.position.set(0.6, 1, 0);
  root.add(lantern);
  const box: Box3 = actorBounds(root, new Box3());
  assert.deepEqual(rounded(box.max), [30.7, 1.85, 15.15]);
});

void test('a left click on open ground two metres from a person whose piece was measured elsewhere walks, and a click on the person still talks', (): void => {
  const { root, worn } = person(30, 0);
  worn.boundingBox = new Box3(new Vector3(-31, 0, -1), new Vector3(-29, 2, 1));
  const candidate: PickCandidate = { id: 2, kind: 'npc', body: screenOf(actorBounds(root, new Box3())), footGap: 2, depth: 0 };
  const stale: PickCandidate = { ...candidate, body: screenOf(new Box3().setFromObject(root)) };
  assert.equal(pickActor([stale], pointAt(28, 0.5), null)?.id, 2);
  assert.equal(pickActor([candidate], pointAt(28, 0.5), null), null);
  assert.equal(pickActor([candidate], pointAt(32, 0.5), null), null);
  assert.equal(pickActor([candidate], pointAt(30, 1), null)?.id, 2);
});
