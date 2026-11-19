import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MeshStandardMaterial } from 'three';
import { glimpseOrder, glimpseTurn, glimpseUniforms, patchVeil, veiled, VOID_GLIMPSE } from './void-glimpse.ts';
import { patchPropShader, withPropLook } from './prop-surface.ts';
import type { ShaderSource } from './prop-surface.ts';

function shaderSource(): ShaderSource {
  return { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: 'void main() {\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <opaque_fragment>\n#include <fog_fragment>\n}' };
}

function degrees(roll: number): number {
  return (glimpseTurn(45, roll) * 180) / Math.PI;
}

void test('consecutive glimpses never show the same set twice and cover every set', (): void => {
  const seen: Set<number> = new Set<number>();
  let which: number = -1;
  for (let index: number = 0; index < 60; index += 1) {
    const next: number = glimpseOrder(5, which, (index * 0.37) % 1);
    assert.notEqual(next, which);
    assert.ok(next >= 0 && next < 5);
    seen.add(next);
    which = next;
  }
  assert.equal(seen.size, 5);
  assert.equal(glimpseOrder(1, 0, 0.9), 0);
  assert.equal(glimpseOrder(2, 0, 0.99), 1);
});

void test('a glimpse turns to face the camera within its spread', (): void => {
  assert.ok(Math.abs(degrees(0.5) - 45) < 1e-9);
  assert.ok(Math.abs(degrees(0) - (45 - VOID_GLIMPSE.faceSpread)) < 1e-9);
  assert.ok(Math.abs(degrees(1) - (45 + VOID_GLIMPSE.faceSpread)) < 1e-9);
});

void test('the veil replaces the plain output with mist-faded colour and a soft alpha', (): void => {
  const shader: ShaderSource = shaderSource();
  patchPropShader(shader, { tileMetres: 2, wet: 0, ground: 0 });
  patchVeil(shader, glimpseUniforms(0));
  assert.match(shader.fragmentShader, /varying vec3 vPropWorld;[\s\S]*uniform float uVeilShow;[\s\S]*void main\(\) \{/);
  assert.match(shader.fragmentShader, /uniform float uVeilShow;/);
  assert.match(shader.fragmentShader, /gl_FragColor = vec4\( veilColour/);
  assert.doesNotMatch(shader.fragmentShader, /#include <opaque_fragment>/);
  assert.ok('uVeilHero' in shader.uniforms);
});

void test('a veiled prop draws over the mist without writing depth, keeps the prop look and has its own program', (): void => {
  const material: MeshStandardMaterial = withPropLook(new MeshStandardMaterial(), { tileMetres: 2, wet: 0, ground: 0 });
  const made: MeshStandardMaterial = veiled(material, glimpseUniforms(0));
  assert.equal(made.transparent, true);
  assert.equal(made.depthWrite, false);
  assert.equal(made.fog, false);
  assert.match(made.customProgramCacheKey(), /prop-look-triplanar\+void-glimpse/);
});
