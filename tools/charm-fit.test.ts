import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import type { CordPlan, Influence, Weighted } from './charm-fit.ts';
import { blendNearest, buildLoop, closedFrom, contactAlong, cordGap, cordLine, frontShare, leastDistance, PointGrid, restingTilt, settleCord, smoothAlong, strongest, surfaceSamples } from './charm-fit.ts';
import type { Triangle } from './headgear-shapes.ts';

const NECK: Vector3 = new Vector3(0, 1.5, 0);

const PLAN: CordPlan = {
  centre: NECK,
  frontY: 1.39,
  ceiling: 1.62,
  samples: 48,
  gap: 0.004,
  frontGap: 0.008,
  smoothing: 3,
  collarReach: 0.15,
  collarWindow: 10,
  collarBand: 0.01,
  skinMargin: 0.012,
  outside: 0.006,
  frontFrom: 80,
};

const CHEST = {
  radius: 0.09,
  neckRadius: 0.05,
  top: 1.45,
  bottom: 1.2,
  steps: 72,
  rows: 40,
} as const;

function chest(): { readonly surface: Vector3[]; readonly collar: Vector3[]; readonly neck: Vector3[] } {
  const surface: Vector3[] = [];
  const collar: Vector3[] = [];
  const neck: Vector3[] = [];
  for (let step: number = 0; step < CHEST.steps; step += 1) {
    const angle: number = (step / CHEST.steps) * Math.PI * 2;
    const out: Vector3 = new Vector3(Math.sin(angle), 0, Math.cos(angle));
    for (let row: number = 0; row <= CHEST.rows; row += 1) {
      const y: number = CHEST.bottom + ((CHEST.top - CHEST.bottom) * row) / CHEST.rows;
      const point: Vector3 = out.clone().multiplyScalar(CHEST.radius).setY(y);
      surface.push(point);
      if (row === CHEST.rows) collar.push(point);
    }
    for (let row: number = 0; row <= 10; row += 1) {
      const point: Vector3 = out.clone().multiplyScalar(CHEST.neckRadius).setY(CHEST.top + row * 0.005);
      surface.push(point);
      neck.push(point);
    }
  }
  return { surface, collar, neck };
}

void test('the cord turns from hanging down at the back to lying out at the front, and stands further off where the charm hangs', (): void => {
  assert.equal(frontShare(PLAN, 0), 1);
  assert.equal(frontShare(PLAN, Math.PI), 0);
  assert.ok(frontShare(PLAN, 0.5) > frontShare(PLAN, 1));
  assert.equal(cordGap(PLAN, 0), PLAN.frontGap);
  assert.ok(Math.abs(cordGap(PLAN, Math.PI) - PLAN.gap) < 1e-9);
  const back = cordLine(PLAN, Math.PI, 0.1);
  assert.ok(Math.abs(back.out.y - 1) < 1e-9);
  const front = cordLine(PLAN, 0, 0.1);
  assert.ok(Math.abs(front.out.z - 1) < 1e-9);
  assert.ok(Math.abs(front.origin.y - PLAN.frontY) < 1e-9);
});

void test('a point in the way pushes the cord along its line until it stands the gap off, and closing never pulls a value in', (): void => {
  const line = { origin: new Vector3(), out: new Vector3(0, 0, 1) };
  assert.equal(contactAlong([], line, 0.01), 0);
  assert.ok(Math.abs(contactAlong([new Vector3(0, 0, 0.05)], line, 0.01) - 0.06) < 1e-9);
  assert.equal(contactAlong([new Vector3(0, 0.02, 0.05)], line, 0.01), 0);
  const values: number[] = [0, 0, 1, 0, 0, 0, 0, 0];
  const closed: number[] = closedFrom(values, 1);
  for (const [index, value] of values.entries()) assert.ok((closed[index] ?? 0) >= value - 1e-9);
});

void test('a cord settled on a round chest closes on itself and clears the chest by at least its gap', (): void => {
  const { surface, collar, neck } = chest();
  const path: Vector3[] = settleCord(surface, collar, neck, PLAN);
  assert.equal(path.length, PLAN.samples);
  assert.ok(leastDistance(path, surface) >= PLAN.gap - 1e-6);
  const front: Vector3 | undefined = path[0];
  assert.ok(front !== undefined && front.z > CHEST.radius && front.y < CHEST.top);
  const back: Vector3 | undefined = path[PLAN.samples / 2];
  assert.ok(back !== undefined && back.z < 0 && back.y > CHEST.top);
});

void test('a closed tube has a ring of sides at every point of its path', (): void => {
  const soup: Triangle[] = [];
  const ring: Vector3[] = Array.from({ length: 12 }, (_: unknown, index: number): Vector3 => new Vector3(Math.sin((index / 12) * Math.PI * 2), 0, Math.cos((index / 12) * Math.PI * 2)).multiplyScalar(0.004));
  buildLoop(soup, ring, 0.0008, 6, 'cord');
  assert.equal(soup.length, 12 * 6 * 2);
  assert.ok(soup.every((triangle: Triangle): boolean => triangle.material === 'cord'));
});

void test('weights keep the strongest joints and sum to one, and blending follows the nearer source', (): void => {
  const kept: Influence[] = strongest([{ joint: 'a', weight: 2 }, { joint: 'b', weight: 1 }, { joint: 'a', weight: 1 }, { joint: 'c', weight: 0.5 }], 2);
  assert.deepEqual(kept.map((influence: Influence): string => influence.joint), ['a', 'b']);
  assert.ok(Math.abs(kept.reduce((sum: number, influence: Influence): number => sum + influence.weight, 0) - 1) < 1e-9);
  const sources: Weighted[] = [
    { at: new Vector3(0, 0, 0), influences: [{ joint: 'spine', weight: 1 }] },
    { at: new Vector3(1, 0, 0), influences: [{ joint: 'neck', weight: 1 }] },
  ];
  assert.equal(blendNearest(sources, new Vector3(0.1, 0, 0), 2, 1)[0]?.joint, 'spine');
  const smoothed: Influence[][] = smoothAlong([[{ joint: 'spine', weight: 1 }], [{ joint: 'neck', weight: 1 }], [{ joint: 'spine', weight: 1 }]], 1, 2);
  assert.ok(smoothed[1]?.some((influence: Influence): boolean => influence.joint === 'spine') === true);
});

void test('a pendant hangs straight when nothing is near and tilts out until it clears a wall behind it', (): void => {
  const wall: Vector3[] = [];
  for (let x: number = -10; x <= 10; x += 1) for (let y: number = -40; y <= 0; y += 1) wall.push(new Vector3(x * 0.001, y * 0.001, -0.003 - y * 0.0004));
  const pendant: Vector3[] = [new Vector3(0, -0.005, 0), new Vector3(0, -0.03, 0)];
  assert.equal(restingTilt(pendant, new Vector3(0, 0, 0.02), new PointGrid(wall, 0.004), 0.002).tilt, 0);
  const tilted = restingTilt(pendant, new Vector3(), new PointGrid(wall, 0.004), 0.002);
  assert.ok(tilted.tilt > 0);
  const grid: PointGrid = new PointGrid(wall, 0.004);
  assert.ok(pendant.every((point: Vector3): boolean => !grid.nearerThan(point.clone().applyMatrix4(tilted.placed), 0.002)));
});

void test('a triangle is sampled at its corners and densely enough between them', (): void => {
  const a: Vector3 = new Vector3();
  const b: Vector3 = new Vector3(0.01, 0, 0);
  const c: Vector3 = new Vector3(0, 0.01, 0);
  const samples: Vector3[] = surfaceSamples(a, b, c, 0.002);
  for (const corner of [a, b, c]) assert.ok(samples.some((point: Vector3): boolean => point.distanceTo(corner) < 1e-9));
  const grid: PointGrid = new PointGrid(samples, 0.004);
  assert.ok(grid.nearerThan(new Vector3(0.003, 0.003, 0), 0.0015));
  assert.ok(!grid.nearerThan(new Vector3(0.02, 0.02, 0), 0.005));
});
