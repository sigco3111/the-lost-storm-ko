import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { dominantJoint, fitMove, mappedInfluences, measure, readSkullPlans, sphere } from './build-skull-body.ts';

void test('a skull is scaled to the share of the head height it should fill and centred where the head was, plus its offset', (): void => {
  const skull = measure([new Vector3(-1, -1, -1), new Vector3(1, 1, 1)]);
  const head = measure([new Vector3(-0.1, 1.6, -0.1), new Vector3(0.1, 1.8, 0.1)]);
  const move = fitMove(skull, head, 0.5, [0, 0.01, 0.02]);
  const top: Vector3 = new Vector3(0, 1, 0).applyMatrix4(move);
  const middle: Vector3 = new Vector3(0, 0, 0).applyMatrix4(move);
  assert.ok(Math.abs(middle.y - 1.71) < 1e-9 && Math.abs(middle.z - 0.02) < 1e-9);
  assert.ok(Math.abs(top.y - middle.y - 0.05) < 1e-9, `half of a 0.2 m head is 0.1 m, so the top sits ${top.y - middle.y} above the middle`);
});

void test('a vertex keeps its source weights on the joints they map to, and falls back whole to the anchor', (): void => {
  const joints: number[] = [3, 5, 0, 0];
  const weights: number[] = [0.75, 0.25, 0, 0];
  assert.equal(dominantJoint(joints, weights, 0), 3);
  const mapped = mappedInfluences(joints, weights, 0, new Map<number, number>([[3, 10], [5, 11]]), 7);
  assert.deepEqual(mapped.joints.slice(0, 2), [10, 11]);
  assert.deepEqual(mapped.weights, [0.75, 0.25, 0, 0]);
  const loose = mappedInfluences([], [], 0, new Map<number, number>(), 7);
  assert.deepEqual(loose, { joints: [7, 0, 0, 0], weights: [1, 0, 0, 0] });
});

void test('an eye is a closed ball of the asked radius around its centre', (): void => {
  const ball = sphere([0.04, 1.7, 0.06], 0.01, 0);
  for (let vertex: number = 0; vertex < ball.positions.length / 3; vertex += 1) {
    const offset: Vector3 = new Vector3(ball.positions[vertex * 3] ?? 0, ball.positions[vertex * 3 + 1] ?? 0, ball.positions[vertex * 3 + 2] ?? 0).sub(new Vector3(0.04, 1.7, 0.06));
    assert.ok(Math.abs(offset.length() - 0.01) < 1e-9);
  }
  assert.equal(ball.indices.length % 3, 0);
});

void test('a plan reads its parts with their defaults and refuses a part with no height', (): void => {
  const plans = readSkullPlans([{ out: 'a.glb', body: 'b.glb', drop: ['Head'], mesh: 'Head', anchor: 'Head', parts: [{ source: 's.glb', height: 0.9, material: 'skull' }] }]);
  const part = plans[0]?.parts[0];
  assert.deepEqual(part, { source: 's.glb', sizeFrom: null, keep: null, joints: [], turnDegrees: 0, height: 0.9, offset: [0, 0, 0], triangles: null, material: 'skull', tint: '#ffffff' });
  assert.equal(plans[0]?.eyes, null);
  assert.throws((): unknown => readSkullPlans([{ out: 'a.glb', body: 'b.glb', drop: [], mesh: 'Head', anchor: 'Head', parts: [{ source: 's.glb', material: 'skull' }] }]));
});
