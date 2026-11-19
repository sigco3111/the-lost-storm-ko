import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MeshStandardMaterial, ShaderLib } from 'three';
import type { IUniform } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import type { SurfaceGlow } from '../../sim/content/types.ts';
import { GLOW_CLOCK, GLOW_HELPERS, glowFragment, glowingGround, glowKey, patchGlowShader, tickGlow } from './surface-glow.ts';
import { patchGroundShader, wetGroundKey } from './wet-ground.ts';

const LAVA: SurfaceGlow = { color: '#ff5a14', strength: 2, cover: 0.7, cracks: 0.3, scale: 6, flow: 0.08, pulse: 0.2, lit: 'tint' };

void test('the glow is written as safe GLSL that drifts, pulses and lights the surface in its own colour', (): void => {
  const source: string = glowFragment(LAVA);
  assert.deepEqual(unsafeGlsl(source), []);
  assert.match(source, /uGlowTime \* 0\.08/);
  assert.match(source, /sin\( uGlowTime \* /);
  assert.match(source, /totalEmissiveRadiance \+= glowTint \* glowMask/);
  assert.match(source, /vec3 glowTint = mix\( mix\( vec3\( 1\.1, /);
  assert.doesNotMatch(glowFragment({ ...LAVA, pulse: 0 }), /sin\(/);
  assert.deepEqual(unsafeGlsl(glowFragment({ ...LAVA, cover: 0 })), []);
  assert.deepEqual(unsafeGlsl(GLOW_HELPERS), []);
});

void test('a glowing ground keeps the wet patch, adds its glow after the emissive map and shares the clock', (): void => {
  const shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, IUniform> } = { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader, uniforms: {} };
  patchGroundShader(shader, 0.2);
  patchGlowShader(shader, LAVA);
  assert.match(shader.fragmentShader, /uniform float uGlowTime;\nvec2 glowHash/);
  assert.ok(shader.fragmentShader.indexOf('float glowPlates(') < shader.fragmentShader.indexOf('glowEdge = glowPlates('));
  assert.match(shader.fragmentShader, /#include <emissivemap_fragment>\nvec2 glowDrift/);
  assert.ok(shader.fragmentShader.indexOf('groundFbm( vec2 p )') < shader.fragmentShader.indexOf('glowFirst = groundFbm'));
  assert.equal(shader.uniforms['uGlowTime'], GLOW_CLOCK);
  tickGlow(12.5);
  assert.equal(GLOW_CLOCK.value, 12.5);
});

void test('each glow compiles its own program and plain ground keeps the wet key', (): void => {
  const lava: MeshStandardMaterial = new MeshStandardMaterial();
  glowingGround(lava, 0, LAVA);
  const plain: MeshStandardMaterial = new MeshStandardMaterial();
  glowingGround(plain, 0, null);
  assert.equal(plain.customProgramCacheKey(), wetGroundKey(0));
  assert.equal(lava.customProgramCacheKey(), `${wetGroundKey(0)}${glowKey(LAVA)}`);
  assert.notEqual(glowKey(LAVA), glowKey({ ...LAVA, cover: 0.2 }));
});
