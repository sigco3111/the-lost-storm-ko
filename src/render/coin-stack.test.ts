import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, DoubleSide, Group, Mesh, MeshDepthMaterial, MeshStandardMaterial } from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { createCoinStacks } from './coin-stack.ts';

type Part = Mesh<BufferGeometry, Material | Material[]>;

function isPart(object: Object3D): object is Part {
  return object instanceof Mesh;
}

function meshesOf(root: Object3D): Part[] {
  const found: Part[] = [];
  root.traverse((object: Object3D): void => {
    if (isPart(object)) found.push(object);
  });
  return found;
}

void test('every coin stack casts its shadow through one depth material of its own, so no other caster decides its program', (): void => {
  const source: Group = new Group();
  source.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ side: DoubleSide })));
  const make = createCoinStacks(source);
  const first: Part[] = meshesOf(make());
  const second: Part[] = meshesOf(make());
  const depth: unknown = first[0]?.customDepthMaterial;
  assert.ok(depth instanceof MeshDepthMaterial);
  assert.equal(second[0]?.customDepthMaterial, depth);
  assert.equal(meshesOf(source)[0]?.customDepthMaterial, undefined);
});

void test('a coin stack shares the source geometry and material', (): void => {
  const source: Group = new Group();
  source.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
  const copy: Part | undefined = meshesOf(createCoinStacks(source)())[0];
  const original: Part | undefined = meshesOf(source)[0];
  assert.equal(copy?.geometry, original?.geometry);
  assert.equal(copy?.material, original?.material);
});
