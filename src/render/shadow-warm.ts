import type { Object3D, Side } from 'three';
import { BackSide, DoubleSide, FrontSide, Light, Material, Mesh, MeshDepthMaterial, MeshDistanceMaterial, PointLight, Texture } from 'three';

export const SHADOW_WARM = {
  coverageAlphaTest: 0.5,
} as const;

export interface ShadowLights {
  readonly depth: boolean;
  readonly distance: boolean;
}

type ShadowStandIn = MeshDepthMaterial | MeshDistanceMaterial;

const SHADOW_SIDE: Readonly<Record<Side, Side>> = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide };

function textureOf(material: Material, key: string): Texture | null {
  const value: unknown = Reflect.get(material, key);
  return value instanceof Texture ? value : null;
}

function numberOf(material: Material, key: string, fallback: number): number {
  const value: unknown = Reflect.get(material, key);
  return typeof value === 'number' ? value : fallback;
}

export function shadowLights(root: Object3D): ShadowLights {
  let depth: boolean = false;
  let distance: boolean = false;
  root.traverse((object: Object3D): void => {
    if (!(object instanceof Light) || !object.castShadow) return;
    if (object instanceof PointLight) distance = true;
    else depth = true;
  });
  return { depth, distance };
}

const kept: Map<string, WeakMap<Material, ShadowStandIn>> = new Map<string, WeakMap<Material, ShadowStandIn>>();

function keptFor(point: boolean, variance: boolean): WeakMap<Material, ShadowStandIn> {
  const key: string = `${point}:${variance}`;
  const found: WeakMap<Material, ShadowStandIn> | undefined = kept.get(key);
  if (found !== undefined) return found;
  const made: WeakMap<Material, ShadowStandIn> = new WeakMap<Material, ShadowStandIn>();
  kept.set(key, made);
  return made;
}

export function shadowStandIn(material: Material, point: boolean, variance: boolean): ShadowStandIn {
  const cache: WeakMap<Material, ShadowStandIn> = keptFor(point, variance);
  const made: ShadowStandIn = cache.get(material) ?? (point ? new MeshDistanceMaterial() : new MeshDepthMaterial());
  cache.set(material, made);
  made.visible = material.visible;
  if (made instanceof MeshDepthMaterial) made.wireframe = Reflect.get(material, 'wireframe') === true;
  made.side = material.shadowSide ?? (variance ? material.side : SHADOW_SIDE[material.side]);
  made.alphaMap = textureOf(material, 'alphaMap');
  made.alphaTest = material.alphaToCoverage ? SHADOW_WARM.coverageAlphaTest : material.alphaTest;
  made.map = textureOf(material, 'map');
  made.clipShadows = material.clipShadows;
  made.clippingPlanes = material.clippingPlanes;
  made.clipIntersection = material.clipIntersection;
  made.displacementMap = textureOf(material, 'displacementMap');
  made.displacementScale = numberOf(material, 'displacementScale', 1);
  made.displacementBias = numberOf(material, 'displacementBias', 0);
  return made;
}

function isMaterialList(value: unknown): value is Material[] {
  return Array.isArray(value) && value.every((item: unknown): boolean => item instanceof Material);
}

function standInsFor(held: Material | Material[], custom: Material | undefined, point: boolean, variance: boolean): Material | Material[] {
  if (custom !== undefined) return custom;
  return Array.isArray(held) ? held.map((material: Material): Material => shadowStandIn(material, point, variance)) : shadowStandIn(held, point, variance);
}

export function withShadowStandIns<T>(root: Object3D, point: boolean, variance: boolean, work: () => T): T {
  const restores: (() => void)[] = [];
  root.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh) || !object.castShadow) return;
    const own: unknown = object.material;
    if (!(own instanceof Material) && !isMaterialList(own)) return;
    const custom: unknown = point ? object.customDistanceMaterial : object.customDepthMaterial;
    object.material = standInsFor(own, custom instanceof Material ? custom : undefined, point, variance);
    restores.push((): void => {
      object.material = own;
    });
  });
  try {
    return work();
  } finally {
    for (const restore of restores) restore();
  }
}
