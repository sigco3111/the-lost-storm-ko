import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SurfaceGlow } from '../../sim/content/types.ts';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { glowFragment, SURFACE_GLOW } from './surface-glow.ts';

const POOL: SurfaceGlow = { color: '#ff5414', strength: 1, cover: 0.45, cracks: 0.1, scale: 3.2, flow: 0.16, pulse: 0.14, lit: 'tint' };
const CRUST: SurfaceGlow = { color: '#ff4a12', strength: 1.15, cover: 0.14, cracks: 0.85, scale: 2.4, flow: 0.02, pulse: 0.12, lit: 'tint' };

void test('molten rock runs from deep red through its own colour to a hot core, never one flat colour', (): void => {
  const source: string = glowFragment(POOL);
  assert.deepEqual(unsafeGlsl(source), []);
  assert.match(source, /float glowCore = /);
  assert.match(source, /smoothstep\( 0\.6, 1\.0, glowCore \* glowShimmer \)/);
  const deep: readonly number[] = SURFACE_GLOW.deep;
  const hot: readonly number[] = SURFACE_GLOW.hot;
  assert.ok(deep.every((share: number): boolean => share < 1));
  assert.ok((hot[1] ?? 0) > (deep[1] ?? 0));
});

void test('the crust plates ride the flow and the molten surface shimmers as it moves', (): void => {
  const source: string = glowFragment(POOL);
  assert.match(source, /glowPlates\( glowWarped - glowDrift \* 0\.55, /);
  assert.match(source, /float glowShimmer = mix\( 0\.55, 1\.0, groundNoise\( glowAt \* 2\.7 - glowDrift \* 2\.2 \) \);/);
});

void test('molten rock cools to crust at its broken shore instead of glowing up to a hard line', (): void => {
  assert.match(glowFragment(POOL), /float glowShore = mix\( 0\.3, 1\.0, smoothstep\( 0\.0, 0\.25, groundShare - groundCut \) \);/);
  assert.match(glowFragment(POOL), /\) \* glowShore;/);
});

void test('a pool always shows molten gaps between its plates while thin crust cracks may close', (): void => {
  assert.match(glowFragment(POOL), new RegExp(`mix\\( ${SURFACE_GLOW.widthLeast}, `));
  assert.match(glowFragment(CRUST), /mix\( 0\.0, 2\.4, glowOpen \)/);
});
