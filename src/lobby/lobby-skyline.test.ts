import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, Mesh, Vector3 } from 'three';
import { LOBBY_SKYLINE, pieceDepth, skylineGeometry, skylineWindows, stepHash } from './lobby-skyline.ts';
import { SKYLINE_KINDS } from './lobby-sets.ts';
import type { Skyline, SkylineKind } from './lobby-sets.ts';

function one(kind: SkylineKind, angle: number = 0): Skyline {
  return { radius: 30, sink: 2, color: '#05070b', pieces: [{ kind, angleDegrees: angle, width: 6, height: 8, lit: 0 }] };
}

void test('every skyline shape stands on the ring, sunk below the ground and as tall as its data asks', (): void => {
  for (const kind of SKYLINE_KINDS) {
    const geometry = skylineGeometry(one(kind));
    const position = geometry.getAttribute('position');
    assert.equal(position.count % 3, 0, kind);
    const box: Box3 = new Box3().setFromObject(new Mesh(geometry));
    assert.ok(Math.abs(box.min.y + 2) < 1e-6, `${kind} is not sunk`);
    assert.ok(Math.abs(box.max.y - 8) < 1e-6 || kind === 'broken', `${kind} top ${box.max.y}`);
    assert.ok(box.max.y <= 8 + 1e-6);
    const middle: Vector3 = box.getCenter(new Vector3());
    assert.ok(Math.abs(Math.hypot(middle.x, middle.z) - 30) < LOBBY_SKYLINE.maxDepth, `${kind} is off the ring`);
    assert.ok(middle.z < 0, `${kind} at angle 0 is not behind the hero`);
  }
});

void test('a skyline piece is placed by its angle around the hero, and the broken top is the same every time', (): void => {
  const box: Box3 = new Box3().setFromObject(new Mesh(skylineGeometry(one('block', 90))));
  const middle: Vector3 = box.getCenter(new Vector3());
  assert.ok(middle.x > 28 && Math.abs(middle.z) < 1e-6);
  assert.equal(stepHash(3, 40), stepHash(3, 40));
  assert.deepEqual(skylineGeometry(one('broken', 12)).getAttribute('position').array, skylineGeometry(one('broken', 12)).getAttribute('position').array);
});

void test('a lit skyline piece shows its windows on the face toward the hero, within its width and below its top', (): void => {
  const skyline: Skyline = { radius: 40, sink: 3, color: '#05070b', pieces: [{ kind: 'tower', angleDegrees: 0, width: 4, height: 10, lit: 3 }, { kind: 'wall', angleDegrees: 90, width: 20, height: 5, lit: 0 }] };
  const windows = skylineWindows(skyline);
  assert.equal(windows.length, 3);
  const first = skyline.pieces[0];
  assert.ok(first !== undefined);
  for (const window of windows) {
    assert.ok(Math.abs(window.x) <= 2, `${window.x}`);
    assert.ok(window.y > 0 && window.y < 10);
    assert.ok(Math.abs(-window.z - (40 - pieceDepth(first) / 2 - LOBBY_SKYLINE.windowInset)) < 1e-9);
  }
});
