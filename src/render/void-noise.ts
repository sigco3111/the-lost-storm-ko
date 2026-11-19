import { DataTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType } from 'three';

export const VOID_NOISE = {
  size: 1024,
  stretch: [123.34, 456.21],
  fold: 45.32,
  levels: 255,
} as const;

const f32: (value: number) => number = Math.fround;

function fraction(value: number): number {
  return f32(value - Math.floor(value));
}

interface Axis {
  readonly at: number;
  readonly lift: number;
}

function axis(value: number, stretch: number): Axis {
  const at: number = fraction(f32(f32(value) * f32(stretch)));
  return { at, lift: f32(at * f32(at + f32(VOID_NOISE.fold))) };
}

function mixed(xAt: number, xLift: number, zAt: number, zLift: number): number {
  const lift: number = f32(xLift + zLift);
  return fraction(f32(f32(xAt + lift) * f32(zAt + lift)));
}

function hashOf(x: Axis, z: Axis): number {
  return mixed(x.at, x.lift, z.at, z.lift);
}

export function latticeHash(x: number, z: number): number {
  return hashOf(axis(x, VOID_NOISE.stretch[0]), axis(z, VOID_NOISE.stretch[1]));
}

export function latticeOf(texel: number): number {
  return texel < VOID_NOISE.size / 2 ? texel : texel - VOID_NOISE.size;
}

function buildValues(): Uint8Array {
  const size: number = VOID_NOISE.size;
  const values: Uint8Array = new Uint8Array(size * size);
  const at: Float32Array = new Float32Array(size);
  const lift: Float32Array = new Float32Array(size);
  for (let col: number = 0; col < size; col += 1) {
    const x: Axis = axis(latticeOf(col), VOID_NOISE.stretch[0]);
    at[col] = x.at;
    lift[col] = x.lift;
  }
  for (let row: number = 0; row < size; row += 1) {
    const z: Axis = axis(latticeOf(row), VOID_NOISE.stretch[1]);
    for (let col: number = 0; col < size; col += 1) values[row * size + col] = Math.round(mixed(at[col] ?? 0, lift[col] ?? 0, z.at, z.lift) * VOID_NOISE.levels);
  }
  return values;
}

let built: Uint8Array | null = null;

export function voidNoiseValues(): Uint8Array {
  built ??= buildValues();
  return built;
}

export function createVoidNoise(): DataTexture {
  const texture: DataTexture = new DataTexture(voidNoiseValues(), VOID_NOISE.size, VOID_NOISE.size, RedFormat, UnsignedByteType);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
