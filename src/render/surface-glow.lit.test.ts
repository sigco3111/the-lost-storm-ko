import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SurfaceGlow } from '../../sim/content/types.ts';
import { glowFragment, glowKey } from './surface-glow.ts';

const TINTED: SurfaceGlow = { color: '#ff5a14', strength: 1.5, cover: 0.95, cracks: 0, scale: 3.6, flow: 0.2, pulse: 0.12, lit: 'tint' };
const MAPPED: SurfaceGlow = { ...TINTED, lit: 'map' };

void test('a glow lit by its map samples the map twice along drifting coordinates and heats by how bright it finds it', (): void => {
  const fragment: string = glowFragment(MAPPED);
  assert.match(fragment, /vec2 glowFlowUv = vMapUv \+ .* \+ glowDrift \* /);
  assert.match(fragment, /vec2 glowSecondUv = vMapUv \* .* - glowDrift \* /);
  assert.match(fragment, /vec3 glowSample = max\( texture2D\( map, glowFlowUv \)\.rgb, texture2D\( map, glowSecondUv \)\.rgb/);
  assert.match(fragment, /glowLavaHeat = smoothstep\( 0\.06, 0\.26, dot\( glowSample, /);
  assert.match(fragment, /smoothstep\( 0\.0, 0\.55, glowLavaHeat \) \), vec3\( .* \), smoothstep\( 0\.7, 1\.0, glowLavaHeat \) \);/);
  assert.match(fragment, /totalEmissiveRadiance \+= glowTint \* glowMask/);
});

void test('a glow lit by its map darkens its lit colour so the glow carries it, crust and molten alike, where a tinted glow keeps its crust', (): void => {
  assert.match(glowFragment(MAPPED), /diffuseColor\.rgb \*= mix\( 0\.2, 0\.1, glowMolten \);/);
  assert.match(glowFragment(TINTED), /diffuseColor\.rgb \*= mix\( 1\.0, 0\.45, glowMolten \);/);
  assert.doesNotMatch(glowFragment(TINTED), /glowLavaHeat/);
});

void test('a glow lit by its map compiles apart from the same glow lit by its tint', (): void => {
  assert.notEqual(glowKey(MAPPED), glowKey(TINTED));
});
