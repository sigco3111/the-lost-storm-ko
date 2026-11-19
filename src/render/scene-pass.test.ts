import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HalfFloatType, PerspectiveCamera, Scene } from 'three';
import { FRAME_GUARD_FRAGMENT } from './frame-guard.ts';
import { postBufferTarget, scenePass } from './scene-pass.ts';
import type { ScenePass } from './scene-pass.ts';

void test('the post buffers are single-sample half float, with depth only when the scene draws straight into them', (): void => {
  assert.equal(postBufferTarget(true).depthBuffer, true);
  const target = postBufferTarget(false);
  assert.equal(target.samples, 0);
  assert.equal(target.depthBuffer, false);
  assert.equal(target.texture.type, HalfFloatType);
  const copy = target.clone();
  assert.equal(copy.samples, 0);
  assert.equal(copy.depthBuffer, false);
});

void test('only the scene pass owns a multisampled target, and it follows the composer size', (): void => {
  const made: ScenePass = scenePass(new Scene(), new PerspectiveCamera(), 4, true);
  assert.equal(made.target.samples, 4);
  assert.equal(made.target.depthBuffer, true);
  assert.equal(made.target.texture.type, HalfFloatType);
  assert.equal(made.pass.needsSwap, true);
  made.pass.setSize(640, 360);
  assert.deepEqual([made.target.width, made.target.height], [640, 360]);
  made.pass.setSize(1280, 720);
  assert.deepEqual([made.target.width, made.target.height], [1280, 720]);
  made.pass.dispose();
});

void test('the scene is guarded before bloom and only copied without it', (): void => {
  const guarded: ScenePass = scenePass(new Scene(), new PerspectiveCamera(), 4, true);
  const plain: ScenePass = scenePass(new Scene(), new PerspectiveCamera(), 4, false);
  assert.equal(guarded.pass.material.fragmentShader, FRAME_GUARD_FRAGMENT);
  assert.notEqual(plain.pass.material.fragmentShader, FRAME_GUARD_FRAGMENT);
  guarded.pass.dispose();
  plain.pass.dispose();
});
