import type { IUniform, Texture, Vector3 } from 'three';
import { ClampToEdgeWrapping, DataTexture, DataUtils, HalfFloatType, LinearFilter, RedFormat, Vector4 } from 'three';
import type { ZoneDef } from '../../sim/content/types.ts';
import { heightAt, terrainMap, tileHeight } from '../../sim/nav/terrain.ts';

export const TERRAIN_LIFT = {
  texel: 0.5,
  flightGlide: 7,
} as const;

export interface LiftUniforms {
  readonly uLiftMap: IUniform<Texture | null>;
  readonly uLiftArea: IUniform<Vector4>;
  readonly uLiftOn: IUniform<number>;
}

export const LIFT_UNIFORMS: LiftUniforms = {
  uLiftMap: { value: null },
  uLiftArea: { value: new Vector4(0, 0, 1, 1) },
  uLiftOn: { value: 0 },
};

export const LIFT_SAMPLER: readonly string[] = ['uniform sampler2D uLiftMap;', 'uniform vec4 uLiftArea;', 'uniform float uLiftOn;', 'float liftOf(vec2 xz) { return texture2D(uLiftMap, (xz - uLiftArea.xy) / uLiftArea.zw).r; }'];

let shownZone: ZoneDef | null = null;

export function liftHere(x: number, z: number): number {
  return shownZone === null ? 0 : liftAt(shownZone, x, z);
}

export function floorUp(x: number, up: number, z: number): number {
  return up + liftHere(x, z);
}

export function glideFloor(current: number | undefined, x: number, z: number, dt: number): number {
  const below: number = liftHere(x, z);
  if (current === undefined) return below;
  return current + (below - current) * (1 - Math.exp(-TERRAIN_LIFT.flightGlide * dt));
}

export function liftAt(zone: ZoneDef, x: number, z: number): number {
  return heightAt(zone, x, z) - zone.floorHeight;
}

export function tileLift(zone: ZoneDef, column: number, row: number, x: number, z: number): number {
  return tileHeight(zone, column, row, x, z) - zone.floorHeight;
}

export function liftSamples(zone: ZoneDef, texel: number): { readonly width: number; readonly depth: number; readonly values: Float32Array } {
  const width: number = Math.max(1, Math.ceil(((zone.tiles[0]?.length ?? 0) * zone.cellSize) / texel));
  const depth: number = Math.max(1, Math.ceil((zone.tiles.length * zone.cellSize) / texel));
  const values: Float32Array = new Float32Array(width * depth);
  for (let row: number = 0; row < depth; row += 1) {
    for (let column: number = 0; column < width; column += 1) values[row * width + column] = liftAt(zone, (column + 0.5) * texel, (row + 0.5) * texel);
  }
  return { width, depth, values };
}

export function useTerrain(zone: ZoneDef): void {
  const old: Texture | null = LIFT_UNIFORMS.uLiftMap.value;
  shownZone = terrainMap(zone) === null ? null : zone;
  if (shownZone === null) {
    LIFT_UNIFORMS.uLiftOn.value = 0;
    LIFT_UNIFORMS.uLiftMap.value = null;
    old?.dispose();
    return;
  }
  const { width, depth, values } = liftSamples(zone, TERRAIN_LIFT.texel);
  const half: Uint16Array = Uint16Array.from(values, (value: number): number => DataUtils.toHalfFloat(value));
  const texture: DataTexture = new DataTexture(half, width, depth, RedFormat, HalfFloatType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  LIFT_UNIFORMS.uLiftMap.value = texture;
  LIFT_UNIFORMS.uLiftArea.value.set(0, 0, width * TERRAIN_LIFT.texel, depth * TERRAIN_LIFT.texel);
  LIFT_UNIFORMS.uLiftOn.value = 1;
  old?.dispose();
}

export interface RayLike {
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly direction: { readonly x: number; readonly y: number; readonly z: number };
}

export const RAY_MARCH = {
  step: 0.25,
  inside: 0.05,
  reach: 600,
  refine: 12,
} as const;

export type PassThrough = (x: number, y: number, z: number) => boolean;

export function rayToSurface(ray: RayLike, heightOf: (x: number, z: number) => number, out: Vector3, through: PassThrough | null = null): Vector3 | null {
  const { origin, direction } = ray;
  const side = (t: number): boolean | null => {
    const height: number = heightOf(origin.x + direction.x * t, origin.z + direction.z * t);
    return Number.isNaN(height) ? null : origin.y + direction.y * t > height;
  };
  let low: number = side(0) === true ? 0 : -1;
  let passed: boolean = false;
  for (let t: number = RAY_MARCH.step; t <= RAY_MARCH.reach; t += passed ? RAY_MARCH.inside : RAY_MARCH.step) {
    const now: boolean | null = side(t);
    if (now === true) {
      low = t;
      passed = false;
      continue;
    }
    if (now === null) {
      low = -1;
      passed = false;
      continue;
    }
    if (low < 0) continue;
    let near: number = low;
    let far: number = t;
    for (let pass: number = 0; pass < RAY_MARCH.refine; pass += 1) {
      const middle: number = (near + far) / 2;
      if (side(middle) !== false) near = middle;
      else far = middle;
    }
    const at: number = (near + far) / 2;
    const x: number = origin.x + direction.x * at;
    const z: number = origin.z + direction.z * at;
    const y: number = heightOf(x, z);
    if (through !== null && through(x, y, z)) {
      low = -1;
      passed = true;
      continue;
    }
    return out.set(x, y, z);
  }
  return null;
}

export type FloorTest = (x: number, y: number, z: number) => boolean;

export function rayToFloor(ray: RayLike, heightOf: (x: number, z: number) => number, isFloor: FloorTest, out: Vector3, through: PassThrough | null = null): Vector3 | null {
  const rock: PassThrough = (x: number, y: number, z: number): boolean => !isFloor(x, y, z);
  const seen: PassThrough = (x: number, y: number, z: number): boolean => !isFloor(x, y, z) || (through !== null && through(x, y, z));
  return rayToSurface(ray, heightOf, out, seen) ?? (through === null ? null : rayToSurface(ray, heightOf, out, rock)) ?? rayToSurface(ray, heightOf, out, through);
}
