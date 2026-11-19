import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bone, BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three';
import type { Object3D } from 'three';
import { geometryShape, mergeRigidAlike, mergeSkinnedAlike } from './merge-alike.ts';

function triangle(offset: number, withSkin: boolean): BufferGeometry {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([offset, 0, 0, offset + 1, 0, 0, offset, 1, 0]), 3));
  if (withSkin) {
    geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(12), 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  }
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

function skinned(offset: number, material: MeshStandardMaterial, skeleton: Skeleton): SkinnedMesh {
  const mesh: SkinnedMesh = new SkinnedMesh(triangle(offset, true), material);
  mesh.bind(skeleton);
  return mesh;
}

function isMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}

function meshesUnder(root: Object3D): Mesh[] {
  const found: Mesh[] = [];
  root.traverse((object: Object3D): void => {
    if (isMesh(object)) found.push(object);
  });
  return found;
}

void test('pieces of a wearable that share a material and a skeleton become one skinned mesh with every triangle', (): void => {
  const skeleton: Skeleton = new Skeleton([new Bone()]);
  const iron: MeshStandardMaterial = new MeshStandardMaterial();
  const leather: MeshStandardMaterial = new MeshStandardMaterial();
  const merged: SkinnedMesh[] = mergeSkinnedAlike([skinned(0, iron, skeleton), skinned(2, leather, skeleton), skinned(4, iron, skeleton)]);
  assert.equal(merged.length, 2);
  const [first, second] = merged;
  assert.ok(first !== undefined && second !== undefined);
  assert.equal(first.material, iron);
  assert.equal(first.geometry.getAttribute('position').count, 6);
  assert.deepEqual(Array.from(first.geometry.getIndex()?.array ?? []), [0, 1, 2, 3, 4, 5]);
  assert.equal(first.skeleton, skeleton);
  assert.equal(second.material, leather);
});

void test('pieces placed differently, on other bones or with other attributes stay apart', (): void => {
  const iron: MeshStandardMaterial = new MeshStandardMaterial();
  const one: Skeleton = new Skeleton([new Bone()]);
  const other: Bone = new Bone();
  other.name = 'other';
  const moved: SkinnedMesh = skinned(2, iron, one);
  moved.position.set(1, 0, 0);
  const plain: SkinnedMesh = new SkinnedMesh(triangle(4, false), iron);
  plain.bind(one);
  const pieces: SkinnedMesh[] = [skinned(0, iron, one), moved, skinned(6, iron, new Skeleton([other])), plain];
  assert.equal(mergeSkinnedAlike(pieces).length, 4);
});

void test('a single piece comes back as itself', (): void => {
  const piece: SkinnedMesh = skinned(0, new MeshStandardMaterial(), new Skeleton([new Bone()]));
  assert.deepEqual(mergeSkinnedAlike([piece]), [piece]);
});

void test('rigid parts of held gear that share a material become one mesh where each part stood', (): void => {
  const bronze: MeshStandardMaterial = new MeshStandardMaterial();
  const leather: MeshStandardMaterial = new MeshStandardMaterial();
  const root: Group = new Group();
  const blade: Group = new Group();
  root.add(blade);
  const edge: Mesh = new Mesh(triangle(0, false), bronze);
  const guard: Mesh = new Mesh(triangle(0, false), bronze);
  guard.position.set(0, 3, 0);
  const grip: Mesh = new Mesh(triangle(0, false), leather);
  edge.castShadow = true;
  guard.castShadow = true;
  blade.add(edge, guard, grip);
  assert.equal(mergeRigidAlike(root), root);
  const meshes: Mesh[] = meshesUnder(root);
  assert.equal(meshes.length, 2);
  const joined: Mesh | undefined = meshes.find((mesh: Mesh): boolean => mesh.material === bronze);
  assert.ok(joined !== undefined);
  assert.equal(joined.parent, blade);
  assert.equal(joined.castShadow, true);
  const position: unknown = joined.geometry.getAttribute('position');
  assert.ok(position instanceof BufferAttribute);
  assert.equal(position.count, 6);
  assert.deepEqual(new Vector3().fromBufferAttribute(position, 5).toArray(), [0, 4, 0]);
});

void test('rigid parts under different parents or casting different shadows stay apart', (): void => {
  const bronze: MeshStandardMaterial = new MeshStandardMaterial();
  const root: Group = new Group();
  const left: Group = new Group();
  const right: Group = new Group();
  root.add(left, right);
  left.add(new Mesh(triangle(0, false), bronze));
  right.add(new Mesh(triangle(0, false), bronze));
  const unshadowed: Mesh = new Mesh(triangle(0, false), bronze);
  unshadowed.castShadow = false;
  const shadowed: Mesh = new Mesh(triangle(0, false), bronze);
  shadowed.castShadow = true;
  left.add(unshadowed, shadowed);
  mergeRigidAlike(root);
  assert.equal(meshesUnder(root).length, 3);
});

void test('two geometries with the same attributes have the same shape and a missing attribute changes it', (): void => {
  assert.equal(geometryShape(triangle(0, true)), geometryShape(triangle(5, true)));
  assert.notEqual(geometryShape(triangle(0, true)), geometryShape(triangle(0, false)));
});
