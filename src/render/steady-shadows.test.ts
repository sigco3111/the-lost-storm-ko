import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, DataTexture, DoubleSide, Group, Mesh, MeshDepthMaterial, MeshStandardMaterial, Skeleton, SkinnedMesh } from 'three';
import { createSteadyShadows, depthKey } from './steady-shadows.ts';
import type { SteadyShadows } from './steady-shadows.ts';

function caster(material: MeshStandardMaterial): Mesh {
  const mesh: Mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
  mesh.castShadow = true;
  return mesh;
}

function skinnedCaster(material: MeshStandardMaterial): SkinnedMesh {
  const mesh: SkinnedMesh = new SkinnedMesh(new BoxGeometry(1, 1, 1), material);
  mesh.bind(new Skeleton([]));
  mesh.castShadow = true;
  return mesh;
}

void test('casters drawn the same way share one depth material, so the first one drawn never decides another kind of caster', (): void => {
  const shadows: SteadyShadows = createSteadyShadows();
  const root: Group = new Group();
  const plainA: Mesh = caster(new MeshStandardMaterial());
  const plainB: Mesh = caster(new MeshStandardMaterial({ color: 0xff0000 }));
  const mapped: Mesh = caster(new MeshStandardMaterial({ map: new DataTexture() }));
  const doubled: Mesh = caster(new MeshStandardMaterial({ side: DoubleSide }));
  const skinned: SkinnedMesh = skinnedCaster(new MeshStandardMaterial());
  root.add(plainA, plainB, mapped, doubled, skinned);
  shadows.steady(root);
  const depths: unknown[] = [plainA, plainB, mapped, doubled, skinned].map((mesh: Mesh): unknown => mesh.customDepthMaterial);
  for (const depth of depths) assert.ok(depth instanceof MeshDepthMaterial);
  assert.equal(depths[0], depths[1]);
  assert.equal(new Set(depths).size, 4);
});

void test('a cut-out caster, a caster that casts no shadow and one with its own depth material are left to three.js', (): void => {
  const shadows: SteadyShadows = createSteadyShadows();
  const cutOut: Mesh = caster(new MeshStandardMaterial({ map: new DataTexture(), alphaTest: 0.5 }));
  const unlit: Mesh = caster(new MeshStandardMaterial());
  unlit.castShadow = false;
  const own: MeshDepthMaterial = new MeshDepthMaterial();
  const kept: Mesh = caster(new MeshStandardMaterial());
  kept.customDepthMaterial = own;
  const root: Group = new Group();
  root.add(cutOut, unlit, kept);
  shadows.steady(root);
  assert.equal(depthKey(cutOut), null);
  assert.equal(cutOut.customDepthMaterial, undefined);
  assert.equal(unlit.customDepthMaterial, undefined);
  assert.equal(kept.customDepthMaterial, own);
});

void test('a caster keeps the depth material it was given the first time', (): void => {
  const shadows: SteadyShadows = createSteadyShadows();
  const mesh: Mesh = caster(new MeshStandardMaterial());
  shadows.steady(mesh);
  const first: unknown = mesh.customDepthMaterial;
  shadows.steady(mesh);
  assert.equal(mesh.customDepthMaterial, first);
});
