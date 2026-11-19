import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color } from 'three';
import type { Group, Mesh } from 'three';
import { novaLook } from './ability-cues.ts';
import { createMendPulses, MEND_PULSE, moteCount, waveStrength } from './mend-pulse.ts';
import type { MendKit } from './mend-pulse.ts';

interface Recorded {
  readonly added: { readonly duration: number; readonly tick: (t: number) => void }[];
  readonly motes: number[];
  readonly lights: number[];
}

function recorder(): { readonly kit: MendKit; readonly seen: Recorded } {
  const seen: Recorded = { added: [], motes: [], lights: [] };
  const kit: MendKit = {
    add: (_object: Mesh | Group, duration: number, tick: (t: number) => void): void => {
      seen.added.push({ duration, tick });
    },
    spray: (_x: number, _y: number, _z: number, _color: Color, count: number): void => {
      seen.motes.push(count);
    },
    flashLight: (_x: number, _y: number, _z: number, _color: Color, intensity: number): void => {
      seen.lights.push(intensity);
    },
  };
  return { kit, seen };
}

void test('a mending nova is drawn as the mend pulse', (): void => {
  assert.equal(novaLook('mend'), 'mend');
});

void test('the pulse light eases in from nothing and fades back to nothing', (): void => {
  assert.equal(waveStrength(0), 0);
  assert.ok(waveStrength(0.4) > 0.5 * MEND_PULSE.waveStrength);
  assert.ok(waveStrength(1) < 0.01);
});

void test('a wider pulse lifts more motes, up to a cap', (): void => {
  assert.ok(moteCount(6) > moteCount(2));
  assert.equal(moteCount(1000), MEND_PULSE.motesMax);
  assert.ok(moteCount(0.01) >= 1);
});

void test('a pulse spreads one band of light over the ground and lifts motes over its whole area; a healed ally gets a glow at its feet and motes of its own', (): void => {
  const { kit, seen } = recorder();
  const mends = createMendPulses(kit);
  mends.pulse(3, 4, 6, new Color('#7fe39a'));
  assert.deepEqual(seen.added.map((entry): number => entry.duration), [MEND_PULSE.waveTime]);
  assert.equal(seen.motes.reduce((sum: number, count: number): number => sum + count, 0), moteCount(6));
  assert.equal(seen.lights.length, 1);
  for (const entry of seen.added) for (const t of [0, 0.3, 0.7, 1]) entry.tick(t);
  mends.touch(3, 4, new Color('#7fe39a'));
  assert.equal(seen.added.at(-1)?.duration, MEND_PULSE.touchTime);
  assert.equal(seen.motes.at(-1), MEND_PULSE.touchMotes);
  assert.equal(seen.lights.length, 2);
});
