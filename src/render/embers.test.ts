import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ShaderMaterial, Vector3 } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { createEmbers, emberCount, emberSeeds, EMBERS } from './embers.ts';

void test('a zone with no embers builds nothing, and a full one builds the most the frame allows', (): void => {
  assert.equal(emberCount(0), 0);
  assert.equal(emberCount(1), EMBERS.most);
  assert.equal(emberCount(3), EMBERS.most);
  assert.equal(createEmbers(0).points, null);
});

void test('every ember gets four seeds from the random source', (): void => {
  let calls: number = 0;
  const seeds: Float32Array = emberSeeds(5, (): number => {
    calls += 1;
    return 0.25;
  });
  assert.equal(seeds.length, 20);
  assert.equal(calls, 20);
});

void test('embers follow the hero and the clock without moving a single vertex on the CPU', (): void => {
  const embers = createEmbers(0.5, (): number => 0.5);
  const points = embers.points;
  assert.ok(points !== null);
  assert.equal(points.geometry.getAttribute('seed').count, emberCount(0.5));
  const material = points.material;
  assert.ok(material instanceof ShaderMaterial);
  assert.deepEqual(unsafeGlsl(material.vertexShader), []);
  assert.deepEqual(unsafeGlsl(material.fragmentShader), []);
  embers.update(3, 10, 2, 20);
  assert.equal(material.uniforms['uTime']?.value, 3);
  const focus: unknown = material.uniforms['uFocus']?.value;
  assert.ok(focus instanceof Vector3);
  assert.deepEqual(focus.toArray(), [10, 2, 20]);
  embers.dispose();
});
