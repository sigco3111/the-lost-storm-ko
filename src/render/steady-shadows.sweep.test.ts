import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Object3D } from 'three';
import { createSteadyShadows } from './steady-shadows.ts';
import type { SteadyShadows } from './steady-shadows.ts';

function caster(): Mesh {
  const mesh: Mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial());
  mesh.castShadow = true;
  return mesh;
}

function sceneOf(count: number): { readonly root: Group; readonly casters: Mesh[] } {
  const root: Group = new Group();
  const casters: Mesh[] = Array.from({ length: count }, caster);
  for (const mesh of casters) root.add(mesh);
  return { root, casters };
}

function steadied(meshes: readonly Mesh[]): number {
  return meshes.filter((mesh: Mesh): boolean => mesh.customDepthMaterial !== undefined).length;
}

void test('a sweep visits no more objects in a frame than its budget, and reaches every caster within a few frames', (): void => {
  const shadows: SteadyShadows = createSteadyShadows(4);
  const { root, casters } = sceneOf(10);
  shadows.sweep(root);
  assert.equal(steadied(casters), 3);
  shadows.sweep(root);
  assert.equal(steadied(casters), 7);
  shadows.sweep(root);
  assert.equal(steadied(casters), 10);
});

void test('a caster added after a sweep has gone round is found on a later lap', (): void => {
  const shadows: SteadyShadows = createSteadyShadows(100);
  const { root } = sceneOf(3);
  shadows.sweep(root);
  const late: Mesh = caster();
  const holder: Object3D = new Group();
  holder.add(late);
  root.add(holder);
  shadows.sweep(root);
  assert.notEqual(late.customDepthMaterial, undefined);
});

void test('a sweep passes over hidden branches, as the shadow pass does, and finds them once they are shown', (): void => {
  const shadows: SteadyShadows = createSteadyShadows(100);
  const root: Group = new Group();
  const hidden: Group = new Group();
  hidden.visible = false;
  const inside: Mesh = caster();
  hidden.add(inside);
  root.add(hidden);
  shadows.sweep(root);
  assert.equal(inside.customDepthMaterial, undefined);
  hidden.visible = true;
  shadows.sweep(root);
  assert.notEqual(inside.customDepthMaterial, undefined);
});

void test('a cut-out caster that keeps its own shadow is checked again only when its material changes', (): void => {
  const shadows: SteadyShadows = createSteadyShadows(100);
  const root: Group = new Group();
  const cutout: Mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ alphaTest: 0.5 }));
  cutout.castShadow = true;
  root.add(cutout);
  shadows.sweep(root);
  shadows.sweep(root);
  assert.equal(cutout.customDepthMaterial, undefined);
  cutout.material = new MeshStandardMaterial();
  shadows.sweep(root);
  assert.notEqual(cutout.customDepthMaterial, undefined);
});
