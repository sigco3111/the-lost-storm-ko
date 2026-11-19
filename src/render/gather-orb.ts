import type { Color, ShaderMaterial } from 'three';
import type { IcosahedronGeometry } from 'three';
import { AdditiveBlending, Group, Mesh, MeshBasicMaterial } from 'three';
import type { VfxGather } from '../../sim/content/vfx-types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { glow, orbHalo, orbSphere } from './effect-shapes.ts';
import type { BurstOptions } from './particles.ts';
import { floorUp } from './terrain-lift.ts';

export const GATHER_ORB = {
  coreBoost: 2.4,
  coreDim: 0.35,
  haloBoost: 0.9,
  haloSize: 2.4,
  dustFrom: 4.5,
  dustTo: 1.2,
  dustSwirl: 0.95,
  dustSizeMin: 0.16,
  dustSizeMax: 0.32,
  dustRise: 0.6,
  breakMotes: 26,
  breakSpeedMin: 2.5,
  breakSpeedMax: 7,
  breakLifeMin: 0.25,
  breakLifeMax: 0.6,
  breakLight: 0.6,
} as const;

export function curveAt(samples: readonly number[], t: number): number {
  const last: number = samples.length - 1;
  if (last <= 0) return samples[0] ?? 0;
  const at: number = Math.min(1, Math.max(0, t)) * last;
  const index: number = Math.min(last - 1, Math.floor(at));
  const from: number = samples[index] ?? 0;
  const to: number = samples[index + 1] ?? from;
  const share: number = at - index;
  const eased: number = share * share * (3 - 2 * share);
  return from + (to - from) * eased;
}

export function curvePeak(samples: readonly number[]): number {
  const last: number = samples.length - 1;
  if (last <= 0) return 0;
  let best: number = 0;
  samples.forEach((value: number, index: number): void => {
    if (value > (samples[best] ?? 0)) best = index;
  });
  return best / last;
}

export function dustOwed(rate: number, level: number, dt: number): number {
  return Math.max(0, rate * level * dt);
}

export interface GatherKit {
  readonly add: (object: Mesh | Group, duration: number, tick: (t: number) => void, owner: number | null) => void;
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly gather: (x: number, y: number, z: number, color: Color, intensity: number, rise: number) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
}

export interface GatherOrbs {
  start(owner: number, at: Vec2, height: number, look: VfxGather, duration: number, color: Color): void;
  release(at: Vec2, height: number, direction: Vec2, look: VfxGather, color: Color): void;
}

export function createGatherOrbs(kit: GatherKit): GatherOrbs {
  return {
    start(owner: number, at: Vec2, height: number, look: VfxGather, duration: number, color: Color): void {
      if (duration <= 0) return;
      const y: number = height + look.lift;
      const orb: Group = new Group();
      const coreMaterial: MeshBasicMaterial = new MeshBasicMaterial({ color: glow(color, GATHER_ORB.coreBoost), transparent: true, depthWrite: false, blending: AdditiveBlending });
      const core: Mesh = new Mesh(orbSphere(), coreMaterial);
      const halo: Mesh<IcosahedronGeometry, ShaderMaterial> = orbHalo(color);
      halo.scale.setScalar(GATHER_ORB.haloSize);
      const strength: { value: unknown } | undefined = halo.material.uniforms['uStrength'];
      orb.add(core, halo);
      orb.position.set(at.x, floorUp(at.x, y, at.z), at.z);
      const tint: Color = color.clone();
      let last: number = 0;
      let owed: number = 0;
      kit.add(
        orb,
        duration,
        (t: number): void => {
          const size: number = curveAt(look.size, t);
          const level: number = curveAt(look.glow, t);
          orb.scale.setScalar(Math.max(0.001, look.radius * size));
          coreMaterial.color.copy(tint).multiplyScalar(GATHER_ORB.coreBoost * (GATHER_ORB.coreDim + (1 - GATHER_ORB.coreDim) * level));
          if (strength !== undefined) strength.value = GATHER_ORB.haloBoost * level;
          owed += dustOwed(look.dust, Math.max(level, size * 0.5), Math.max(0, t - last) * duration);
          last = t;
          const left: number = Math.max(0.05, (1 - t) * duration);
          while (owed >= 1) {
            owed -= 1;
            const angle: number = Math.random() * Math.PI * 2;
            const reach: number = look.radius * (GATHER_ORB.dustFrom + Math.random() * GATHER_ORB.dustFrom * 0.4);
            const rise: number = (Math.random() - 0.5) * reach * GATHER_ORB.dustRise;
            const inward: number = angle + Math.PI + GATHER_ORB.dustSwirl;
            const travel: number = reach - look.radius * GATHER_ORB.dustTo;
            const life: number = Math.min(left, 0.2 + Math.random() * 0.25);
            const speed: number = travel / life;
            kit.spray(at.x + Math.sin(angle) * reach, y + rise, at.z + Math.cos(angle) * reach, color, 1, { dirX: Math.sin(inward), dirZ: Math.cos(inward), spread: 0.15, speed: { min: speed * 0.9, max: speed }, lift: { min: -rise / life, max: -rise / life }, life: { min: life * 0.9, max: life }, size: { min: GATHER_ORB.dustSizeMin, max: GATHER_ORB.dustSizeMax }, gravity: 0, drag: 0, jitter: 0 });
          }
        },
        owner,
      );
      kit.gather(at.x, y, at.z, color, look.light, curvePeak(look.glow) * duration);
    },
    release(at: Vec2, height: number, direction: Vec2, look: VfxGather, color: Color): void {
      const y: number = height + look.lift;
      kit.spray(at.x, y, at.z, color, GATHER_ORB.breakMotes, { dirX: direction.x, dirZ: direction.z, spread: 2.4, speed: { min: GATHER_ORB.breakSpeedMin, max: GATHER_ORB.breakSpeedMax }, lift: { min: -1.2, max: 1.6 }, life: { min: GATHER_ORB.breakLifeMin, max: GATHER_ORB.breakLifeMax }, size: { min: GATHER_ORB.dustSizeMin, max: GATHER_ORB.dustSizeMax * 1.6 }, gravity: 0, drag: 3.2, jitter: 0.2 });
      kit.flashLight(at.x, y, at.z, color, look.light * GATHER_ORB.breakLight);
    },
  };
}
