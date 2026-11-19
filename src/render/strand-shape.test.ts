import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StrandBuffers, StrandEnds } from './strand-shape.ts';
import { createDice, createStrandBuffers, drawnForks, FORK_POINTS, restrikeAge, STRAND, STRAND_POINTS, strandGrow, strandLight, strandSpan, strandStrips, strandTaper, TRUNK_POINTS, writeStrand } from './strand-shape.ts';

const FROM: StrandEnds = { x: 1, y: 1.4, z: 2 };
const TO: StrandEnds = { x: 7, y: 1.1, z: -3 };

function pointAt(buffers: StrandBuffers, index: number): StrandEnds {
  return { x: buffers.points[index * 3] ?? Number.NaN, y: buffers.points[index * 3 + 1] ?? Number.NaN, z: buffers.points[index * 3 + 2] ?? Number.NaN };
}

function near(actual: StrandEnds, expected: StrandEnds): void {
  assert.ok(Math.abs(actual.x - expected.x) < 1e-5 && Math.abs(actual.y - expected.y) < 1e-5 && Math.abs(actual.z - expected.z) < 1e-5, `${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
}

function gap(a: StrandEnds, b: StrandEnds): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function written(seed: number, forks: number, jitter: number, to: StrandEnds = TO): StrandBuffers {
  const dice = createDice();
  dice.reset(seed);
  const buffers: StrandBuffers = createStrandBuffers();
  writeStrand(FROM, to, { forks, jitter }, dice.next, buffers);
  return buffers;
}

function turnAt(buffers: StrandBuffers, index: number): number {
  const a: StrandEnds = pointAt(buffers, index - 1);
  const b: StrandEnds = pointAt(buffers, index);
  const c: StrandEnds = pointAt(buffers, index + 1);
  const ux: number = b.x - a.x;
  const uz: number = b.z - a.z;
  const vx: number = c.x - b.x;
  const vz: number = c.z - b.z;
  return Math.abs(Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz));
}

void test('the same seed always gives the same bolt, and another seed gives another', (): void => {
  const first: StrandBuffers = written(0.3, 2, 0.6);
  const again: StrandBuffers = written(0.3, 2, 0.6);
  assert.deepEqual(again.points, first.points);
  assert.deepEqual(again.weights, first.weights);
  assert.deepEqual(again.heats, first.heats);
  assert.notDeepEqual(written(0.9, 2, 0.6).points, first.points);
});

void test('a bolt runs exactly from its start to its end, every value finite', (): void => {
  for (const seed of [0.1, 0.42, 0.77]) {
    const buffers: StrandBuffers = written(seed, 2, 0.8);
    near(pointAt(buffers, 0), FROM);
    near(pointAt(buffers, TRUNK_POINTS - 1), TO);
    for (const value of buffers.points) assert.ok(Number.isFinite(value));
    for (const weight of buffers.weights) assert.ok(weight >= 0 && weight <= 1);
    for (const heat of buffers.heats) assert.ok(heat >= -1 && heat <= 1);
  }
});

void test('a bolt tapers to nothing at both ends and is full somewhere along its middle', (): void => {
  for (const to of [TO, { x: 1.8, y: 1.3, z: 2.2 }, { x: 60, y: 1, z: 40 }]) {
    const buffers: StrandBuffers = written(0.55, 1, 0.6, to);
    assert.equal(buffers.weights[0], 0);
    assert.equal(buffers.weights[TRUNK_POINTS - 1], 0);
    const share: number = Math.min(STRAND.taperShareMax, STRAND.taperReach / gap(FROM, to));
    for (let point: number = 0; point < TRUNK_POINTS; point += 1) assert.ok((buffers.weights[point] ?? 1) <= strandTaper(point / (TRUNK_POINTS - 1), share) + 1e-6);
    let widest: number = 0;
    for (let point: number = 0; point < TRUNK_POINTS; point += 1) widest = Math.max(widest, buffers.weights[point] ?? 0);
    assert.ok(widest > 1 - STRAND.widthVary - 1e-6);
  }
  assert.equal(strandTaper(0, 0.1), 0);
  assert.equal(strandTaper(1, 0.1), 0);
  assert.equal(strandTaper(0.5, 0.1), 1);
});

void test('a bolt is jagged: it turns sharply at some kinks and wanders off the straight line by a share of its length', (): void => {
  const buffers: StrandBuffers = written(0.21, 0, 0.8);
  let sharpest: number = 0;
  for (let point: number = 1; point < TRUNK_POINTS - 1; point += 1) sharpest = Math.max(sharpest, turnAt(buffers, point));
  assert.ok(sharpest > 0.5, `sharpest turn ${sharpest}`);
  const length: number = gap(FROM, TO);
  let furthest: number = 0;
  for (let point: number = 0; point < TRUNK_POINTS; point += 1) {
    const t: number = point / (TRUNK_POINTS - 1);
    furthest = Math.max(furthest, gap(pointAt(buffers, point), { x: FROM.x + (TO.x - FROM.x) * t, y: FROM.y + (TO.y - FROM.y) * t, z: FROM.z + (TO.z - FROM.z) * t }));
  }
  assert.ok(furthest > 0.02 * length && furthest < 0.5 * length, `wander ${furthest} on ${length}`);
  const calm: StrandBuffers = written(0.21, 0, 0);
  for (let point: number = 0; point < TRUNK_POINTS; point += 1) {
    const t: number = point / (TRUNK_POINTS - 1);
    near(pointAt(calm, point), { x: FROM.x + (TO.x - FROM.x) * t, y: FROM.y + (TO.y - FROM.y) * t, z: FROM.z + (TO.z - FROM.z) * t });
  }
});

void test('branches stay within their reach, start on the trunk, thin out to nothing and are never more than the buffer holds', (): void => {
  assert.equal(drawnForks(0), 0);
  assert.equal(drawnForks(9), STRAND.maxForks);
  assert.ok(drawnForks(1) >= 1);
  const length: number = gap(FROM, TO);
  const reach: number = Math.min(length * STRAND.forkReach, STRAND.forkReachMax);
  for (const seed of [0.11, 0.37, 0.64, 0.92]) {
    const buffers: StrandBuffers = written(seed, 3, 1);
    const trunk: StrandEnds[] = Array.from({ length: TRUNK_POINTS }, (_: unknown, index: number): StrandEnds => pointAt(buffers, index));
    for (let fork: number = 0; fork < STRAND.maxForks; fork += 1) {
      const base: number = TRUNK_POINTS + fork * FORK_POINTS;
      const root: StrandEnds = pointAt(buffers, base);
      assert.ok(trunk.some((point: StrandEnds): boolean => gap(point, root) < 1e-5));
      const rootIndex: number = trunk.findIndex((point: StrandEnds): boolean => gap(point, root) < 1e-5);
      assert.ok(rootIndex >= 1 && rootIndex <= TRUNK_POINTS - 2);
      assert.ok((buffers.weights[base] ?? 1) <= (buffers.weights[rootIndex] ?? 0) + 1e-6);
      assert.equal(buffers.weights[base + FORK_POINTS - 1], 0);
      for (let point: number = 0; point < FORK_POINTS; point += 1) assert.ok(gap(pointAt(buffers, base + point), root) <= reach * (1 + STRAND.forkKink * 2) + 1e-6);
    }
  }
  const bare: StrandBuffers = written(0.5, 0, 0.6);
  for (let index: number = TRUNK_POINTS; index < STRAND_POINTS; index += 1) assert.equal(bare.weights[index], 0);
});

void test('branches leave the trunk more often toward the target than near the hand', (): void => {
  let nearHand: number = 0;
  let nearTarget: number = 0;
  for (let seed: number = 1; seed < 200; seed += 1) {
    const buffers: StrandBuffers = written(seed / 200, 3, 0.7);
    for (let fork: number = 0; fork < STRAND.maxForks; fork += 1) {
      const along: number = buffers.alongs[TRUNK_POINTS + fork * FORK_POINTS] ?? 0;
      if (along < 0.5) nearHand += 1;
      else nearTarget += 1;
    }
  }
  assert.ok(nearTarget > nearHand * 1.5, `${nearTarget} near the target, ${nearHand} near the hand`);
});

void test('the buffer holds the trunk and every branch, laid out in strips', (): void => {
  assert.equal(strandStrips().reduce((sum: number, [, count]: readonly [number, number]): number => sum + count, 0), STRAND_POINTS);
  assert.equal(createStrandBuffers().points.length, STRAND_POINTS * 3);
});

void test('a strike grows out of the hand, snaps to full, decays, restrikes and is gone by the end of its span', (): void => {
  assert.equal(strandGrow(0), 0);
  assert.ok(strandGrow(STRAND.lead / 2) > 0.4 && strandGrow(STRAND.lead / 2) < 0.6);
  assert.equal(strandGrow(STRAND.lead), 1);
  for (const restrike of [true, false]) {
    assert.equal(strandLight(0, 0.25, restrike), 0);
    assert.equal(strandLight(1 / 120, 0.25, restrike), STRAND.leaderLight);
    assert.ok(strandLight(STRAND.lead + 1e-4, 0.25, restrike) > 0.99);
    assert.equal(strandLight(strandSpan(0.25), 0.25, restrike), 0);
    assert.ok(strandLight(strandSpan(0.25) - 1 / 120, 0.25, restrike) < 0.02);
    for (let age: number = 0; age < 1; age += 0.005) {
      const light: number = strandLight(age, 0.25, restrike);
      assert.ok(light >= 0 && light <= 1);
    }
  }
  const at: number = restrikeAge(0.25);
  assert.ok(strandLight(at + 1e-4, 0.25, true) > strandLight(at - 1e-3, 0.25, true) + 0.2);
  let last: number = strandLight(STRAND.lead, 0.25, false);
  for (let age: number = STRAND.lead; age < strandSpan(0.25); age += 0.005) {
    const light: number = strandLight(age, 0.25, false);
    assert.ok(light <= last + 1e-9);
    last = light;
  }
});

void test('a short arc kinks only every few tenths of a metre, with straight runs between, so its ribbon never folds over itself', (): void => {
  const to: StrandEnds = { x: FROM.x + 1.6, y: FROM.y, z: FROM.z };
  const buffers: StrandBuffers = written(0.33, 0, 1, to);
  const spacing: number = 1.6 / (TRUNK_POINTS - 1);
  const run: number = 2 ** Math.ceil(Math.log2(STRAND.kinkSpacing / spacing)) / 2;
  let straight: number = 0;
  for (let point: number = 1; point < TRUNK_POINTS - 1; point += 1) if (point % run !== 0 && turnAt(buffers, point) < 1e-3) straight += 1;
  assert.ok(straight >= TRUNK_POINTS - 2 - Math.ceil((TRUNK_POINTS - 1) / run), `${straight} straight points`);
});
