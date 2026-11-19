import type { Color, Material, MeshStandardMaterial, Object3D } from 'three';
import { Mesh } from 'three';
import type { MonsterDef } from '../../sim/content/types.ts';
import type { RigGlow } from './ghost-material.ts';
import { createRigGlow } from './ghost-material.ts';

export const REST_LOOKS = {
  glowEpsilon: 1 / 512,
} as const;

export type RestLooks = Map<Material, Material>;

export const REST_GLOW: RigGlow = createRigGlow();

const shared: WeakMap<Material, Map<string, MeshStandardMaterial>> = new WeakMap<Material, Map<string, MeshStandardMaterial>>();

export function sharesLook(def: Pick<MonsterDef, 'crust'>, echoed: boolean): boolean {
  return !echoed && def.crust === null;
}

export function isMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}

export function restLook(source: Material, key: string, make: () => MeshStandardMaterial): MeshStandardMaterial {
  const byKey: Map<string, MeshStandardMaterial> = shared.get(source) ?? new Map<string, MeshStandardMaterial>();
  shared.set(source, byKey);
  const found: MeshStandardMaterial | undefined = byKey.get(key);
  if (found !== undefined) return found;
  const made: MeshStandardMaterial = make();
  byKey.set(key, made);
  return made;
}

function dark(r: number, g: number, b: number): boolean {
  return Math.abs(r) < REST_LOOKS.glowEpsilon && Math.abs(g) < REST_LOOKS.glowEpsilon && Math.abs(b) < REST_LOOKS.glowEpsilon;
}

export function glowAtRest(glow: RigGlow): boolean {
  const flash: Color = glow.flash.value;
  const hover: Color = glow.hover.value;
  const rankRim: Color = glow.rankRim.value;
  return dark(flash.r, flash.g, flash.b) && dark(hover.r, hover.g, hover.b) && dark(rankRim.r, rankRim.g, rankRim.b) && Math.abs(glow.lift.value) < REST_LOOKS.glowEpsilon && glow.shadeMix.value === 0 && glow.shadeWet.value === 0;
}

export function sameDrawState(own: Material, rest: Material): boolean {
  return own.opacity === rest.opacity && own.transparent === rest.transparent && own.depthWrite === rest.depthWrite && own.visible === rest.visible && own.side === rest.side;
}

function restingOne(own: Material, rests: RestLooks): Material {
  const rest: Material | undefined = rests.get(own);
  return rest !== undefined && sameDrawState(own, rest) ? rest : own;
}

export function restingMaterial(own: Material | Material[], rests: RestLooks): Material | Material[] {
  return Array.isArray(own) ? own.map((one: Material): Material => restingOne(one, rests)) : restingOne(own, rests);
}

export interface MeshLooks {
  keep(mesh: Mesh): void;
  forget(mesh: Mesh): void;
  settle(resting: boolean): void;
  resting(): boolean;
}

export function createMeshLooks(rests: RestLooks): MeshLooks {
  const owned: Map<Mesh, Material | Material[]> = new Map<Mesh, Material | Material[]>();
  let atRest: boolean = false;
  let changed: boolean = false;
  return {
    keep(mesh: Mesh): void {
      owned.set(mesh, mesh.material);
      changed = true;
    },
    forget(mesh: Mesh): void {
      const own: Material | Material[] | undefined = owned.get(mesh);
      if (own !== undefined) mesh.material = own;
      owned.delete(mesh);
    },
    settle(resting: boolean): void {
      if (resting === atRest && !changed) return;
      atRest = resting;
      changed = false;
      for (const [mesh, own] of owned) mesh.material = resting ? restingMaterial(own, rests) : own;
    },
    resting(): boolean {
      return atRest;
    },
  };
}
