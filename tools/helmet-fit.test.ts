import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CylinderGeometry, SphereGeometry, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import type { BufferAttribute, InterleavedBufferAttribute } from 'three';
import type { FitGoal, HeadShape, HelmetShape, Placement } from './helmet-fit.ts';
import { clearanceAt, fitHelmet, headShape, helmetMesh } from './helmet-fit.ts';

const BALL = {
  head: 0.1,
  helmet: 1,
  segments: 24,
  rings: 16,
  every: 1,
  settled: 0.0002,
  skirtTop: 0.9,
  skirtBottom: 1.8,
  skirtLength: 1.4,
  sameSize: 0.1,
} as const;

const GOAL: FitGoal = { anchor: 'crown', clearance: 0.004, crown: 0.006, forward: 0, lift: 0, lowest: 0.8, highest: 2, steps: 18 };

function shapeOf(geometry: BufferGeometry, lift: number): HelmetShape {
  const position: BufferAttribute | InterleavedBufferAttribute = geometry.getAttribute('position');
  const index: BufferAttribute | null = geometry.getIndex();
  if (index === null) throw new Error('sphere has no index');
  const positions: number[] = [];
  for (let at: number = 0; at < position.count; at += 1) positions.push(position.getX(at), position.getY(at) + lift, position.getZ(at));
  return { positions, indices: Array.from(index.array) };
}

function dome(radius: number, upperOnly: boolean): HelmetShape {
  return shapeOf(new SphereGeometry(radius, BALL.segments, BALL.rings, 0, Math.PI * 2, 0, upperOnly ? Math.PI * 0.6 : Math.PI), 0);
}

function skirted(): HelmetShape {
  const cap: HelmetShape = dome(BALL.helmet, true);
  const rim: number = BALL.helmet * Math.cos(Math.PI * 0.6);
  const skirt: HelmetShape = shapeOf(new CylinderGeometry(BALL.skirtTop, BALL.skirtBottom, BALL.skirtLength, BALL.segments, 1, true), rim - BALL.skirtLength / 2);
  const start: number = cap.positions.length / 3;
  return { positions: [...cap.positions, ...skirt.positions], indices: [...cap.indices, ...skirt.indices.map((at: number): number => at + start)] };
}

function ballHead(): HeadShape {
  const shape: HelmetShape = dome(BALL.head, false);
  const points: Vector3[] = [];
  for (let at: number = 0; at + 2 < shape.positions.length; at += 3) points.push(new Vector3(shape.positions[at] ?? 0, shape.positions[at + 1] ?? 0, shape.positions[at + 2] ?? 0).add(new Vector3(0, 1.6, 0)));
  return headShape(points, -Infinity, BALL.every);
}

void test('a head is measured from the points above its cut, with its centre, top and width', (): void => {
  const head: HeadShape = ballHead();
  assert.ok(Math.abs(head.centre.y - 1.6) < 1e-6);
  assert.ok(Math.abs(head.top - 1.7) < 1e-6);
  assert.ok(Math.abs(head.width - 0.2) < 0.01);
});

void test('a helmet is scaled until every covered point of the head clears it by the asked gap, and no further', (): void => {
  const head: HeadShape = ballHead();
  const placed: Placement = fitHelmet(dome(BALL.helmet, true), head, GOAL);
  assert.ok(placed.clearance >= GOAL.clearance - BALL.settled);
  assert.ok(placed.clearance < GOAL.clearance * 4);
  assert.ok(placed.covered > 0);
});

void test('the inside of the crown sits the asked gap above the top of the head', (): void => {
  const head: HeadShape = ballHead();
  const placed: Placement = fitHelmet(dome(BALL.helmet, true), head, GOAL);
  const crown: number = placed.offset.y + BALL.helmet * placed.scale;
  assert.ok(Math.abs(crown - (head.top + GOAL.crown)) < 0.003);
});

void test('a part anchored by its base stands that far above the centre of the head', (): void => {
  const head: HeadShape = ballHead();
  const placed: Placement = fitHelmet(dome(BALL.helmet, true), head, { ...GOAL, anchor: 'base', lift: 0.02 });
  const bottom: number = placed.offset.y + BALL.helmet * Math.cos(Math.PI * 0.6) * placed.scale;
  assert.ok(Math.abs(bottom - (head.centre.y + 0.02)) < 0.001);
});

void test('points the helmet leaves open are not counted against it', (): void => {
  const head: HeadShape = ballHead();
  const shape: HelmetShape = dome(BALL.helmet, true);
  const { covered } = clearanceAt(helmetMesh(shape), head, 0.12, new Vector3(0, 1.6, 0));
  assert.ok(covered > 0);
  assert.ok(covered < head.points.length);
});

void test('a skirt that flares below the skull does not make the helmet any larger', (): void => {
  const head: HeadShape = ballHead();
  const plain: Placement = fitHelmet(dome(BALL.helmet, true), head, GOAL);
  const flared: Placement = fitHelmet(skirted(), head, { ...GOAL, lowest: GOAL.lowest * 2, highest: GOAL.highest * 2 });
  assert.ok(Math.abs(flared.scale - plain.scale) / plain.scale < BALL.sameSize);
});
