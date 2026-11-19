import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ZoneFall } from '../../sim/content/types.ts';
import { FALL_VERTEX, fallFragment, fallMesh, fallProfile, LAVA_FALL } from './lava-falls.ts';
import type { FallPoint } from './lava-falls.ts';

const FALL: ZoneFall = { x: 10, z: 20, facingDegrees: 90, width: 2, surface: 'molten' };

void test('a fall runs along the rim, curls over the lip, drops down the face and spreads out at the foot', (): void => {
  const profile: FallPoint[] = fallProfile(5, 3);
  const first: FallPoint | undefined = profile[0];
  const last: FallPoint | undefined = profile.at(-1);
  assert.deepEqual(first, { along: 0, out: -LAVA_FALL.run, y: 5 });
  assert.ok(last !== undefined && Math.abs(last.y - 3) < 1e-9 && last.out > LAVA_FALL.foot);
  for (let index: number = 1; index < profile.length; index += 1) {
    const before: FallPoint | undefined = profile[index - 1];
    const after: FallPoint | undefined = profile[index];
    assert.ok(before !== undefined && after !== undefined && after.y <= before.y + 1e-9 && after.out >= before.out - 1e-9);
  }
});

void test('the points of a fall are spaced evenly along it', (): void => {
  const profile: FallPoint[] = fallProfile(6, 2, 12);
  const steps: number[] = profile.slice(1).map((point: FallPoint, index: number): number => point.along - (profile[index]?.along ?? 0));
  for (const step of steps) assert.ok(Math.abs(step - (steps[0] ?? 0)) < 1e-9);
});

void test('a fall with almost no drop still curls over its lip', (): void => {
  const profile: FallPoint[] = fallProfile(3, 3);
  assert.ok((profile[0]?.y ?? 0) - (profile.at(-1)?.y ?? 0) >= LAVA_FALL.leastDrop - 1e-9);
});

void test('a fall facing east starts behind its lip to the west and spreads wider as it falls', (): void => {
  const mesh = fallMesh(FALL, 5, 3);
  const { columns, rows } = LAVA_FALL;
  assert.equal(mesh.positions.length, columns * rows * 3);
  assert.equal(mesh.indices.length, (columns - 1) * (rows - 1) * 6);
  const middle: number = Math.floor(columns / 2);
  assert.ok(Math.abs((mesh.positions[middle * 3] ?? 0) - (FALL.x - LAVA_FALL.run)) < 1e-6);
  assert.ok(Math.abs((mesh.positions[middle * 3 + 2] ?? 0) - FALL.z) < 1e-6);
  const across = (row: number): number => Math.abs((mesh.positions[(row * columns + columns - 1) * 3 + 2] ?? 0) - (mesh.positions[row * columns * 3 + 2] ?? 0));
  assert.ok(Math.abs(across(0) - FALL.width) < 1e-6);
  assert.ok(across(rows - 1) > FALL.width);
  assert.equal(mesh.shares[1], 0);
  assert.equal(mesh.shares[(rows * columns - 1) * 2 + 1], 1);
});

void test('a fall flows its lava texture downward, feathers its sides and ends, and sits in the scene fog', (): void => {
  const fragment: string = fallFragment();
  assert.match(fragment, /vFallUv\.y \* [0-9.]+ - uGlowTime \* [0-9.]+ \) \/ uMetres/);
  assert.match(fragment, /float fallSide = smoothstep\( 0\.0, /);
  assert.match(fragment, /gl_FragColor = vec4\( fallColour, fallSide \* fallEnds \);/);
  assert.match(fragment, /#include <fog_fragment>/);
  assert.match(FALL_VERTEX, /#include <fog_vertex>/);
});
