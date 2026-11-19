import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, ShaderLib, Vector3 } from 'three';
import type { IUniform } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import type { BodyCrust } from '../../sim/content/combat-types.ts';
import { GLOW_CLOCK } from './surface-glow.ts';
import { BODY_CRUST, CRUST_HELPERS, crustBody, crustFragment, crustMaterial, crustUniforms, patchCrustShader } from './body-crust.ts';

const CRUST: BodyCrust = { cells: 5, seam: 0.08, strength: 2, rim: 0.4 };

function physical(): { vertexShader: string; fragmentShader: string; uniforms: Record<string, IUniform> } {
  return { vertexShader: ShaderLib.physical.vertexShader, fragmentShader: ShaderLib.physical.fragmentShader, uniforms: {} };
}

void test('the crust is safe GLSL that glows in the seams between plates, pulses on the shared clock and lights the rim', (): void => {
  assert.deepEqual(unsafeGlsl(crustFragment()), []);
  assert.deepEqual(unsafeGlsl(CRUST_HELPERS), []);
  assert.match(crustFragment(), /totalEmissiveRadiance \+= uCrustColor \* \( crustSeamGlow \* crustPulse \+ uCrustRim \* pow\( crustFacing, /);
  assert.match(crustFragment(), /sin\( uCrustTime \* /);
});

void test('the seams are laid on the body at rest, measured across its own size, so they stay put while it moves', (): void => {
  const uniforms = crustUniforms(CRUST, '#ff6a1c', new Box3(new Vector3(-1, 0, -2), new Vector3(1, 3, 2)));
  assert.deepEqual(uniforms.uCrustMin.value.toArray(), [-1, 0, -2]);
  assert.equal(uniforms.uCrustSpan.value, 4);
  assert.equal(uniforms.uCrustCells.value, 5);
  assert.ok(Math.abs(uniforms.uCrustColor.value.r - 2) < 1e-6);
  const flat = crustUniforms(CRUST, '#ff6a1c', new Box3(new Vector3(0, 0, 0), new Vector3(0, 0, 0)));
  assert.equal(flat.uCrustSpan.value, BODY_CRUST.leastSpan);
  const shader = physical();
  patchCrustShader(shader, uniforms);
  assert.match(shader.vertexShader, /#include <begin_vertex>\nvCrustPos = \( position - uCrustMin \) \/ uCrustSpan;/);
  assert.ok(shader.vertexShader.indexOf('varying vec3 vCrustPos;') < shader.vertexShader.indexOf('vCrustPos = '));
  assert.ok(shader.fragmentShader.indexOf('float crustCells(') < shader.fragmentShader.indexOf('crustCells( crustPlace )'));
  assert.match(shader.fragmentShader, /#include <emissivemap_fragment>\nvec3 crustPlace/);
  assert.equal(shader.uniforms['uCrustTime'], GLOW_CLOCK);
  assert.equal(shader.uniforms['uCrustSeam'], uniforms.uCrustSeam);
});

void test('a crusted material compiles a program of its own on top of the one it had', (): void => {
  const material: MeshStandardMaterial = new MeshStandardMaterial();
  material.customProgramCacheKey = (): string => 'storm-flash-rim';
  crustMaterial(material, crustUniforms(CRUST, '#ff6a1c', new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1))));
  assert.equal(material.customProgramCacheKey(), 'storm-flash-rim-crust');
});

void test('every standard material on a body takes the crust, and other materials are left alone', (): void => {
  const body: Group = new Group();
  const shell: Mesh = new Mesh(new BoxGeometry(2, 1, 1), new MeshStandardMaterial());
  const plain: MeshStandardMaterial = new MeshStandardMaterial();
  const pair: Mesh = new Mesh(new BoxGeometry(1, 1, 1), [plain, new MeshStandardMaterial()]);
  body.add(shell, pair);
  const before: string = plain.customProgramCacheKey();
  crustBody(body, CRUST, '#ff6a1c');
  assert.notEqual(plain.customProgramCacheKey(), before);
  assert.match(plain.customProgramCacheKey(), /-crust$/);
});
