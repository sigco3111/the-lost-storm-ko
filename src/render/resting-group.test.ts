import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone, Scene, Vector3 } from 'three';
import { RestingGroup } from './resting-group.ts';

function rig(): { readonly scene: Scene; readonly root: RestingGroup; readonly hand: Bone } {
  const scene: Scene = new Scene();
  const root: RestingGroup = new RestingGroup();
  const arm: Bone = new Bone();
  const hand: Bone = new Bone();
  arm.position.set(0, 1, 0);
  hand.position.set(0.5, 0, 0);
  arm.add(hand);
  root.add(arm);
  scene.add(root);
  scene.updateMatrixWorld();
  return { scene, root, hand };
}

function placeOf(hand: Bone): Vector3 {
  return new Vector3().setFromMatrixPosition(hand.matrixWorld);
}

void test('a group that is awake updates its whole tree with the scene, like every other group', (): void => {
  const { scene, root, hand } = rig();
  root.position.set(4, 0, 2);
  scene.updateMatrixWorld();
  assert.deepEqual(placeOf(hand).toArray(), [4.5, 1, 2]);
  assert.equal(root.resting, false);
});

void test('a resting group that is hidden, and everything under it, is skipped by the scene update', (): void => {
  const { scene, root, hand } = rig();
  root.visible = false;
  root.rest();
  root.position.set(4, 0, 2);
  hand.position.set(9, 9, 9);
  scene.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  assert.deepEqual(placeOf(hand).toArray(), [0.5, 1, 0]);
  assert.equal(root.resting, true);
});

void test('waking brings the whole tree up to date at once, before the next scene update', (): void => {
  const { root, hand } = rig();
  root.rest();
  root.position.set(4, 0, 2);
  hand.position.set(1, 0, 0);
  root.wake();
  assert.deepEqual(placeOf(hand).toArray(), [5, 1, 2]);
  assert.equal(root.resting, false);
});

void test('a place read from a resting tree is still right, because the read updates the chain it needs', (): void => {
  const { root, hand } = rig();
  root.rest();
  root.position.set(4, 0, 2);
  assert.deepEqual(hand.getWorldPosition(new Vector3()).toArray(), [4.5, 1, 2]);
});

void test('waking a group that was never resting does nothing', (): void => {
  const { root, hand } = rig();
  hand.position.set(7, 0, 0);
  root.wake();
  assert.deepEqual(placeOf(hand).toArray(), [0.5, 1, 0]);
});

void test('a resting group that something has made visible again updates like any other, so it is never drawn from stale matrices', (): void => {
  const { scene, root, hand } = rig();
  root.visible = false;
  root.rest();
  root.position.set(4, 0, 2);
  scene.updateMatrixWorld();
  assert.deepEqual(placeOf(hand).toArray(), [0.5, 1, 0]);
  root.visible = true;
  scene.updateMatrixWorld();
  assert.deepEqual(placeOf(hand).toArray(), [4.5, 1, 2]);
  assert.equal(root.resting, true);
});
