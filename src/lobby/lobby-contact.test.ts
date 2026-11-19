import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MeshBasicMaterial, ShaderLib } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { groundHeight, LOBBY_GROUND } from './lobby-ground.ts';
import type { Mound } from './lobby-ground.ts';
import { CONTACT_HEAD, contactShare, fieldCentre, fieldHeight, groundContact, groundField, LOBBY_CONTACT, softenOnGround, withGroundContact } from './lobby-contact.ts';
import type { ContactShader, GroundContact, GroundField } from './lobby-contact.ts';

const MOUNDS: readonly Mound[] = [{ x: -3.6, z: -4.6, size: 0.9 }, { x: 3.9, z: -5.4, size: 1 }];

void test('the baked ground field holds the lobby ground\'s height at every texel centre, to within a few millimetres', (): void => {
  const field: GroundField = groundField(MOUNDS, 32);
  assert.equal(field.span, LOBBY_GROUND.radius * 2);
  let worst: number = 0;
  for (let row: number = 0; row < field.texels; row += 3) {
    for (let column: number = 0; column < field.texels; column += 3) {
      const x: number = fieldCentre(column, field.texels, field.span);
      const z: number = fieldCentre(row, field.texels, field.span);
      worst = Math.max(worst, Math.abs(fieldHeight(field, x, z) - groundHeight(x, z, MOUNDS)));
    }
  }
  assert.ok(worst <= field.range / LOBBY_CONTACT.levels, `the field is off by ${worst} m`);
});

void test('between texels the field follows the ground closely enough that a sheet meets it within its feather', (): void => {
  const field: GroundField = groundField(MOUNDS);
  let worst: number = 0;
  for (let step: number = 0; step < 400; step += 1) {
    const x: number = Math.sin(step * 1.7) * 13;
    const z: number = Math.cos(step * 2.3) * 13;
    worst = Math.max(worst, Math.abs(fieldHeight(field, x, z) - groundHeight(x, z, MOUNDS)));
  }
  assert.ok(worst < LOBBY_CONTACT.mistFeather * 0.1, `the field misses the ground by ${worst} m`);
  assert.ok(contactShare(worst, 0, LOBBY_CONTACT.mistFeather) < 0.03, 'a miss that size would still leave a visible step');
});

void test('a sheet standing in the ground adds nothing where it meets the ground and eases in above it, with no step and no kink', (): void => {
  const feather: number = LOBBY_CONTACT.mistFeather;
  assert.equal(contactShare(0.3, 0.3, feather), 0);
  assert.equal(contactShare(-1, 0, feather), 0);
  assert.equal(contactShare(feather, 0, feather), 1);
  assert.equal(contactShare(5, 0, feather), 1);
  const slope = (at: number): number => (contactShare(at + 1e-4, 0, feather) - contactShare(at, 0, feather)) / 1e-4;
  assert.ok(slope(0) < 0.01 && slope(feather - 1e-4) < 0.01, 'the share starts or ends with a kink');
  let previous: number = 0;
  for (let step: number = 1; step <= 100; step += 1) {
    const share: number = contactShare((step / 100) * feather, 0, feather);
    assert.ok(share >= previous && share - previous < 0.02, `the share jumps at ${step}`);
    previous = share;
  }
});

void test('the mist sheets fade at the ground through the baked field, and the shader has no unsafe pow or reversed smoothstep', (): void => {
  const contact: GroundContact = groundContact(MOUNDS);
  const shader: ContactShader = { uniforms: {}, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader };
  withGroundContact(shader, contact, LOBBY_CONTACT.mistFeather);
  assert.ok(shader.vertexShader.includes('vContactWorld = (modelMatrix * vec4(position, 1.0)).xyz;'));
  assert.ok(shader.fragmentShader.includes(`diffuseColor.a *= groundContact(${LOBBY_CONTACT.mistFeather.toFixed(3)});`));
  assert.equal(shader.uniforms['uGroundField'], contact.uniforms.uGroundField);
  assert.equal(contact.uniforms.uGroundSpan.value, contact.field.span);
  assert.throws((): void => withGroundContact({ uniforms: {}, vertexShader: 'void main() {}', fragmentShader: 'void main() {}' }, contact, 1));
  const material: MeshBasicMaterial = new MeshBasicMaterial({ transparent: true });
  softenOnGround(material, contact, LOBBY_CONTACT.mistFeather);
  assert.equal(material.customProgramCacheKey(), `${LOBBY_CONTACT.cacheKey}:${LOBBY_CONTACT.mistFeather}`);
  assert.deepEqual(unsafeGlsl(CONTACT_HEAD), []);
});
