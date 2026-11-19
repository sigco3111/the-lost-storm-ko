import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVoidNoise, latticeHash, latticeOf, VOID_NOISE, voidNoiseValues } from './void-noise.ts';
import { GROUND_FRAGMENT, MIST_FRAGMENT, WISP_FRAGMENT } from './void-shaders.ts';

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function hashNoise(x: number, z: number): number {
  const ix: number = Math.floor(x);
  const iz: number = Math.floor(z);
  const ux: number = smooth(x - ix);
  const uz: number = smooth(z - iz);
  const a: number = latticeHash(ix, iz);
  const b: number = latticeHash(ix + 1, iz);
  const c: number = latticeHash(ix, iz + 1);
  const d: number = latticeHash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a + (a - b + d - c) * ux) * uz;
}

function texel(values: Uint8Array, col: number, row: number): number {
  const size: number = VOID_NOISE.size;
  const wrap = (index: number): number => ((index % size) + size) % size;
  return (values[wrap(row) * size + wrap(col)] ?? 0) / VOID_NOISE.levels;
}

function textureNoise(values: Uint8Array, x: number, z: number): number {
  const size: number = VOID_NOISE.size;
  const col: number = (((Math.floor(x) % size) + size) % size);
  const row: number = (((Math.floor(z) % size) + size) % size);
  const ux: number = smooth(x - Math.floor(x));
  const uz: number = smooth(z - Math.floor(z));
  const a: number = texel(values, col, row);
  const b: number = texel(values, col + 1, row);
  const c: number = texel(values, col, row + 1);
  const d: number = texel(values, col + 1, row + 1);
  return a + (b - a) * ux + (c - a + (a - b + d - c) * ux) * uz;
}

void test('the noise lattice holds the shader hash for every cell on both sides of zero', (): void => {
  const values: Uint8Array = voidNoiseValues();
  const size: number = VOID_NOISE.size;
  for (const [col, row] of [[0, 0], [1, 0], [size / 2 - 1, 7], [size / 2, 3], [size - 1, size - 1], [17, size - 40]] as const) {
    const expected: number = Math.round(latticeHash(latticeOf(col), latticeOf(row)) * VOID_NOISE.levels);
    assert.equal(values[row * size + col], expected);
  }
  assert.equal(latticeOf(size - 1), -1);
  assert.equal(latticeOf(size / 2), -size / 2);
});

void test('sampling the lattice the way the shader does gives the hashed value noise within one level', (): void => {
  const values: Uint8Array = voidNoiseValues();
  const reach: number = VOID_NOISE.size / 2 - 2;
  for (let step: number = 0; step < 400; step += 1) {
    const x: number = -reach + ((step * 97.31) % (2 * reach));
    const z: number = -reach + ((step * 53.77) % (2 * reach));
    assert.ok(Math.abs(textureNoise(values, x, z) - hashNoise(x, z)) <= 1 / VOID_NOISE.levels, `at ${x}, ${z}`);
  }
});

void test('the lattice is built once and shared by every view', (): void => {
  assert.equal(voidNoiseValues(), voidNoiseValues());
  const texture = createVoidNoise();
  assert.equal(texture.image.width, VOID_NOISE.size);
  assert.equal(texture.image.data, voidNoiseValues());
  texture.dispose();
});

void test('the ground and the mist read the lattice, the wisps keep hashing', (): void => {
  for (const shader of [GROUND_FRAGMENT, MIST_FRAGMENT, WISP_FRAGMENT]) {
    assert.match(shader, /#ifdef VOID_NOISE_SIZE/);
    assert.match(shader, /texture2D\(uNoise, \(mod\(i, VOID_NOISE_SIZE\) \+ 0\.5 \+ u\) \/ VOID_NOISE_SIZE\)\.r/);
    assert.ok(shader.includes(`vec2(${VOID_NOISE.stretch[0]}, ${VOID_NOISE.stretch[1]})`));
  }
});
