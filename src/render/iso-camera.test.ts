import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMERA, zoomTarget } from './iso-camera.ts';

void test('a wheel turn scales the wanted distance by the zoom step', (): void => {
  assert.ok(Math.abs(zoomTarget(CAMERA.distance, 50) - CAMERA.distance * (1 + 50 * CAMERA.zoomStep)) < 1e-9);
});

void test('zooming out as far as the wheel goes stops at the farthest view, which is 32', (): void => {
  assert.equal(zoomTarget(CAMERA.distance, 100000), 32);
  assert.equal(zoomTarget(32, 1), 32);
});

void test('zooming in as far as the wheel goes stops at the nearest view', (): void => {
  assert.equal(zoomTarget(CAMERA.distance, -100000), CAMERA.minDistance);
});
