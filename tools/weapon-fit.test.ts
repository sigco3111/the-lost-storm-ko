import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Matrix4 } from 'three';
import { Box3, Vector3 } from 'three';
import type { WeaponGoal, WeaponPlacement } from './weapon-fit.ts';
import { placeWeapon } from './weapon-fit.ts';

const ROD = {
  length: 10,
  width: 0.4,
  steps: 40,
  head: 3,
  target: 1.5,
  grip: 0.2,
  near: 1e-6,
  slack: 1.01,
  aligned: 0.01,
  rise: 0.05,
} as const;

function rodAlong(direction: Vector3, across: Vector3): Vector3[] {
  const points: Vector3[] = [];
  for (let step: number = 0; step <= ROD.steps; step += 1) {
    const along: Vector3 = direction.clone().multiplyScalar((step / ROD.steps) * ROD.length);
    points.push(along.clone().addScaledVector(across, ROD.width), along.clone().addScaledVector(across, -ROD.width));
  }
  points.push(direction.clone().multiplyScalar(ROD.length).addScaledVector(across, ROD.head));
  return points;
}

function placed(points: readonly Vector3[], placement: WeaponPlacement): Box3 {
  return new Box3().setFromPoints(points.map((point: Vector3): Vector3 => point.clone().applyMatrix4(placement.matrix)));
}

function handedness(matrix: Matrix4): number {
  return matrix.determinant();
}

void test('a pole lying along -z stands along +y at the asked length with its grip at the origin', (): void => {
  const points: Vector3[] = rodAlong(new Vector3(0, 0, -1), new Vector3(1, 0, 0));
  const goal: WeaponGoal = { hold: { kind: 'pole', forward: '-z', side: '+x' }, align: false, length: ROD.target, grip: ROD.grip };
  const placement: WeaponPlacement = placeWeapon(points, goal);
  const box: Box3 = placed(points, placement);
  assert.ok(Math.abs(box.max.y - box.min.y - ROD.target) < ROD.near);
  assert.ok(Math.abs(box.min.y + ROD.grip * ROD.target) < ROD.near);
  assert.ok(Math.abs(placement.reach - (1 - ROD.grip) * ROD.target) < ROD.near);
  assert.ok(box.max.x > -box.min.x);
  assert.ok(handedness(placement.matrix) > 0);
});

void test('a tilted pole is stood upright when aligned to its own long axis', (): void => {
  const direction: Vector3 = new Vector3(1, 1, 0).normalize();
  const points: Vector3[] = rodAlong(direction, new Vector3(-1, 1, 0).normalize());
  const goal: WeaponGoal = { hold: { kind: 'pole', forward: '+y', side: null }, align: true, length: ROD.target, grip: ROD.grip };
  const box: Box3 = placed(points, placeWeapon(points, goal));
  assert.ok(box.max.x - box.min.x < (ROD.head + ROD.width) * (ROD.target / ROD.length) * ROD.slack);
  assert.ok(Math.abs(box.max.y - box.min.y - ROD.target) < ROD.aligned);
});

void test('a crossbow points along +x with its top up, unmirrored, and rises above the hand', (): void => {
  const points: Vector3[] = rodAlong(new Vector3(0, 0, 1), new Vector3(0, 1, 0));
  const rise: number = ROD.rise;
  const goal: WeaponGoal = { hold: { kind: 'crossbow', forward: '+z', up: '+y', rise }, align: false, length: ROD.target, grip: ROD.grip };
  const placement: WeaponPlacement = placeWeapon(points, goal);
  const box: Box3 = placed(points, placement);
  assert.ok(Math.abs(box.max.x - box.min.x - ROD.target) < ROD.near);
  assert.ok(box.max.y - rise > rise - box.min.y);
  assert.ok(handedness(placement.matrix) > 0);
});
