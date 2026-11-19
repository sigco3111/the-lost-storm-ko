import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Mesh, Scene } from 'three';
import { beforeScene, sceneOf } from './scene-hooks.ts';

void test('an object finds the scene at the root of its tree, and none once it is taken out', (): void => {
  const scene: Scene = new Scene();
  const outer: Group = new Group();
  const inner: Mesh = new Mesh();
  outer.add(inner);
  assert.equal(sceneOf(inner), null);
  scene.add(outer);
  assert.equal(sceneOf(inner), scene);
  outer.removeFromParent();
  assert.equal(sceneOf(inner), null);
});

void test('a scene renders its hooks from its own before-render step, added once', (): void => {
  const scene: Scene = new Scene();
  assert.equal(Object.hasOwn(scene, 'onBeforeRender'), false);
  const unhookFirst: () => void = beforeScene(scene, (): void => {});
  const unhookSecond: () => void = beforeScene(scene, (): void => {});
  assert.equal(Object.hasOwn(scene, 'onBeforeRender'), true);
  unhookFirst();
  unhookSecond();
  assert.equal(Object.hasOwn(new Scene(), 'onBeforeRender'), false);
});
