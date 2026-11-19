import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MeshStandardMaterial } from 'three';
import type { BodySwap, SwapMix } from './body-swap.ts';
import { fadeMaterials, fadeWritesDepth, startSwap, stepSwap } from './body-swap.ts';

const FRAME: number = 1 / 60;
const LARGEST_STEP: number = 0.15;

function run(swap: BodySwap<string>): SwapMix[] {
  const mixes: SwapMix[] = [];
  for (let frame: number = 0; frame < 600; frame += 1) {
    const mix: SwapMix = stepSwap(swap, FRAME);
    mixes.push(mix);
    if (mix.done) break;
  }
  return mixes;
}

void test('the real body eases in over several frames while the stand-in eases out, never in one frame', (): void => {
  const mixes: SwapMix[] = run(startSwap('stand-in'));
  assert.ok(mixes.length > 10, `${mixes.length} frames`);
  let before: number = 0;
  for (const mix of mixes) {
    assert.ok(mix.incoming - before <= LARGEST_STEP, `${before} to ${mix.incoming}`);
    assert.equal(mix.incoming + mix.outgoing, 1);
    before = mix.incoming;
  }
  const last: SwapMix | undefined = mixes.at(-1);
  assert.deepEqual(last, { incoming: 1, outgoing: 0, done: true });
});

void test('a long frame, such as the one that builds the real body, moves the swap no further than an ordinary frame', (): void => {
  const ordinary: SwapMix = stepSwap(startSwap('stand-in'), FRAME);
  const long: SwapMix = stepSwap(startSwap('stand-in'), 0.1);
  assert.equal(long.incoming, ordinary.incoming);
  assert.ok(long.incoming <= LARGEST_STEP);
});

void test('the swap settles within a second', (): void => {
  assert.ok(run(startSwap('stand-in')).length * FRAME < 1);
});

void test('a body fading in or out writes depth only while it is the more visible one, so a fading stand-in never cuts holes in the real body behind it', (): void => {
  assert.equal(fadeWritesDepth(1), true);
  assert.equal(fadeWritesDepth(0.6), true);
  assert.equal(fadeWritesDepth(0.4), false);
  assert.equal(fadeWritesDepth(0.07), false);
  for (let incoming: number = 0; incoming <= 1; incoming += 0.05) assert.ok(!(fadeWritesDepth(incoming) && fadeWritesDepth(1 - incoming)) || Math.abs(incoming - 0.5) < 1e-9);
});

void test('fading a body sets every material to the same clamped opacity and lets only a mostly shown body write depth', (): void => {
  const materials: MeshStandardMaterial[] = [new MeshStandardMaterial(), new MeshStandardMaterial()];
  fadeMaterials(materials, 0.3);
  assert.deepEqual(materials.map((material: MeshStandardMaterial): [number, boolean] => [material.opacity, material.depthWrite]), [[0.3, false], [0.3, false]]);
  fadeMaterials(materials, 1.4);
  assert.deepEqual(materials.map((material: MeshStandardMaterial): [number, boolean] => [material.opacity, material.depthWrite]), [[1, true], [1, true]]);
});
