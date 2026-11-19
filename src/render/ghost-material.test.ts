import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, DoubleSide, MeshStandardMaterial } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { createGhostUniforms, createRigGlow, flashLift, GHOST_BOUND, GHOST_SHADE, ghostVertex, makeGhost, RIM_EDGE, rimEdge, rimPhases, rimShown } from './ghost-material.ts';

void test('the ghost rim never takes pow of an unclamped facing term', (): void => {
  assert.deepEqual(unsafeGlsl(GHOST_SHADE), []);
});

void test('a ghost fades out by its alpha, with no screen-space noise pattern', (): void => {
  assert.ok(!GHOST_SHADE.includes('gl_FragCoord'));
  assert.ok(GHOST_SHADE.includes('diffuseColor.a *='));
});

void test('a double-sided ghost draws in one pass, so three never marks it for a program rebuild mid-frame', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial({ side: DoubleSide });
  makeGhost(material, createRigGlow(), createGhostUniforms(new Color(), 0.5));
  assert.equal(material.transparent, true);
  assert.equal(material.forceSinglePass, true);
});

void test('a hovered ghost glows at its edge, never as a flat fill', (): void => {
  assert.match(GHOST_SHADE, /uHover \* pow\(ghostFacing,/);
});

void test('a struck ghost flashes at its edge and brightens in its own tint, never a flat white fill', (): void => {
  assert.match(GHOST_SHADE, /uFlash \* \( 0\.15 \+ 0\.85 \* pow\( ghostFacing,/);
  assert.match(GHOST_SHADE, /uGhostTint \* uFlashLift/);
  assert.doesNotMatch(GHOST_SHADE, /\+= uFlash \+/);
});

void test('the flash lift peaks on a hit\'s first frames and eases faster than the flash itself, so a landed hit pops and settles', (): void => {
  assert.ok(flashLift(1) > 0);
  assert.ok(flashLift(0.5) < flashLift(1) * 0.5 * 0.5);
  assert.equal(flashLift(0), 0);
});

const RIM_PROBE = { seed: 4242, angles: 90, inside: 0.4 } as const;

void test('a bounded ghost is fully shown well inside its rim, gone at it and a little inside the ground\'s own edge, and part shown across the feather', (): void => {
  for (let step: number = 0; step < RIM_PROBE.angles; step += 1) {
    const angle: number = (step / RIM_PROBE.angles) * Math.PI * 2;
    const edge: number = rimEdge(angle, RIM_PROBE.seed);
    assert.ok(edge <= 1 && edge >= 1 - RIM_EDGE.jag);
    assert.equal(rimShown(RIM_PROBE.inside, angle, RIM_PROBE.seed), 1);
    assert.equal(rimShown(1, angle, RIM_PROBE.seed), 0);
    assert.equal(rimShown(edge, angle, RIM_PROBE.seed), 0);
    assert.ok(rimShown(edge - RIM_EDGE.inset * RIM_EDGE.fade, angle, RIM_PROBE.seed) < 1e-9);
    const half: number = rimShown(edge - (RIM_EDGE.inset + 0.5) * RIM_EDGE.fade, angle, RIM_PROBE.seed);
    assert.ok(Math.abs(half - 0.5) < 1e-9);
    assert.ok(rimShown(edge - (RIM_EDGE.inset + 0.25) * RIM_EDGE.fade, angle, RIM_PROBE.seed) < half);
    assert.ok(rimShown(edge - (RIM_EDGE.inset + 1) * RIM_EDGE.fade, angle, RIM_PROBE.seed) > 1 - 1e-9);
  }
});

void test('the bound in the shader draws the same ragged edge as the ground, with its phases kept small for float precision', (): void => {
  assert.deepEqual(unsafeGlsl(GHOST_BOUND), []);
  assert.ok(GHOST_SHADE.includes(GHOST_BOUND));
  assert.ok(GHOST_BOUND.includes(`1.0 - ${RIM_EDGE.jag.toFixed(2)}`));
  assert.ok(GHOST_BOUND.includes(`/ ${RIM_EDGE.fade.toFixed(2)} - ${RIM_EDGE.inset.toFixed(2)}`));
  for (const wave of RIM_EDGE.waves) assert.ok(GHOST_BOUND.includes(`${wave.weight.toFixed(2)} * sin(${wave.frequency.toFixed(1)} * ghostAngle`));
  const phases = rimPhases(RIM_PROBE.seed);
  for (const phase of [phases.x, phases.y, phases.z]) assert.ok(phase >= 0 && phase < Math.PI * 2);
  const [first] = RIM_EDGE.waves;
  assert.ok(Math.abs(Math.sin(first.frequency + phases.x) - Math.sin(first.frequency + first.phase * RIM_PROBE.seed)) < 1e-6);
});

void test('a ghost with no bound is never clipped, and its vertex shader hands the fragment its world position', (): void => {
  const ghost = createGhostUniforms(new Color(), 0.5);
  assert.equal(ghost.bound.value.z, 0);
  assert.ok(GHOST_BOUND.startsWith('if (uGhostBound.z > 0.0) {'));
  const vertex: string = ghostVertex('void main() {\n#include <project_vertex>\n}');
  assert.match(vertex, /varying vec3 vGhostWorld;\nvoid main\(\) \{/);
  assert.match(vertex, /#include <project_vertex>\nvGhostWorld = \(modelMatrix \* vec4\(transformed, 1\.0\)\)\.xyz;/);
});
