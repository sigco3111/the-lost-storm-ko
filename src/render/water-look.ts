import { Color } from 'three';
import type { Vec2 } from '../../sim/math.ts';
import type { SkillVfx, VfxShadow } from '../../sim/content/vfx-types.ts';
import type { BurstOptions } from './particles.ts';

export const WATER_LOOK = {
  splashHeight: 0.45,
  splashDrops: 14,
  splashGain: 1.2,
  lapEvery: 0.3,
  lapReach: 0.85,
  lapDrops: 3,
  lapRingMin: 1.1,
  lapRingMax: 1.9,
  lapRingTime: 1.1,
  lapRingShine: 0.16,
  surface: 0.08,
  swirlEvery: 0.05,
  swirlMotes: 5,
  swirlInner: 0.2,
  swirlTurn: 1.15,
  swirlLift: 0.3,
  swirlShine: 0.75,
  swirlSlow: 0.45,
  swirlFast: 0.75,
  surgeHeight: 0.3,
  surgeDrops: 28,
  crestShine: 0.6,
  crestTime: 0.55,
  breakerDrops: 36,
  breakerStart: 0.5,
  breakerHeight: 0.3,
  swellReach: 0.9,
  swellShine: 0.22,
  swellTime: 0.9,
} as const;

const SPLASH: Partial<BurstOptions> = { speed: { min: 0.6, max: 2.2 }, lift: { min: 2.5, max: 4.5 }, life: { min: 0.45, max: 0.75 }, size: { min: 0.12, max: 0.26 }, gravity: 11, drag: 0.4, jitter: 0.2 };
const LAP: Partial<BurstOptions> = { speed: { min: 0.1, max: 0.6 }, lift: { min: 0.8, max: 1.6 }, life: { min: 0.3, max: 0.5 }, size: { min: 0.1, max: 0.2 }, gravity: 9, drag: 0.5, jitter: 0.15 };

export interface WaterKit {
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly ring: (x: number, z: number, radius: number, color: Color, duration: number) => void;
}

export function poolOf(vfx: SkillVfx): VfxShadow | null {
  if (vfx.shadow !== null) return vfx.shadow;
  if (vfx.water !== null) return { color: vfx.water.deep, strength: vfx.water.depth };
  return null;
}

export function splash(kit: WaterKit, at: Vec2, foam: Color, power: number): void {
  kit.spray(at.x, WATER_LOOK.splashHeight, at.z, foam, Math.round(WATER_LOOK.splashDrops * (1 + WATER_LOOK.splashGain * power)), SPLASH);
}

export function lapSpot(center: Vec2, radius: number, angle: number, share: number): Vec2 {
  const reach: number = Math.sqrt(share) * radius * WATER_LOOK.lapReach;
  return { x: center.x + Math.sin(angle) * reach, z: center.z + Math.cos(angle) * reach };
}

export function lap(kit: WaterKit, center: Vec2, radius: number, foam: Color, random: () => number): void {
  const spot: Vec2 = lapSpot(center, radius, random() * Math.PI * 2, random());
  kit.ring(spot.x, spot.z, WATER_LOOK.lapRingMin + random() * (WATER_LOOK.lapRingMax - WATER_LOOK.lapRingMin), new Color().copy(foam).multiplyScalar(WATER_LOOK.lapRingShine), WATER_LOOK.lapRingTime);
  kit.spray(spot.x, WATER_LOOK.surface, spot.z, foam, WATER_LOOK.lapDrops, LAP);
}

export function swell(kit: WaterKit, center: Vec2, radius: number, foam: Color): void {
  kit.ring(center.x, center.z, radius * WATER_LOOK.swellReach, new Color().copy(foam).multiplyScalar(WATER_LOOK.swellShine), WATER_LOOK.swellTime);
}

const SURGE: Partial<BurstOptions> = { speed: { min: 0.4, max: 2.6 }, lift: { min: 3.5, max: 6.5 }, life: { min: 0.55, max: 0.9 }, size: { min: 0.14, max: 0.3 }, gravity: 13, drag: 0.3, jitter: 0.3 };

export function swirlHeading(angle: number): number {
  return angle + Math.PI + WATER_LOOK.swirlTurn;
}

export function whirl(kit: WaterKit, center: Vec2, radius: number, pull: number, foam: Color, random: () => number): void {
  const shine: Color = new Color().copy(foam).multiplyScalar(WATER_LOOK.swirlShine);
  for (let mote: number = 0; mote < WATER_LOOK.swirlMotes; mote += 1) {
    const angle: number = random() * Math.PI * 2;
    const reach: number = radius * (WATER_LOOK.swirlInner + random() * (1 - WATER_LOOK.swirlInner));
    const heading: number = swirlHeading(angle);
    kit.spray(center.x + Math.sin(angle) * reach, WATER_LOOK.surface + random() * WATER_LOOK.swirlLift, center.z + Math.cos(angle) * reach, shine, 1, { dirX: Math.sin(heading), dirZ: Math.cos(heading), spread: 0.15, speed: { min: pull * WATER_LOOK.swirlSlow, max: pull * WATER_LOOK.swirlFast }, lift: { min: 0, max: 0.2 }, life: { min: 0.35, max: 0.6 }, size: { min: 0.18, max: 0.38 }, gravity: 0, drag: 0.6, jitter: 0.05 });
  }
}

export function surge(kit: WaterKit, center: Vec2, foam: Color): void {
  kit.spray(center.x, WATER_LOOK.surgeHeight, center.z, foam, WATER_LOOK.surgeDrops, SURGE);
}

export function breakerHeading(index: number): Vec2 {
  const angle: number = (index / WATER_LOOK.breakerDrops) * Math.PI * 2;
  return { x: Math.sin(angle), z: Math.cos(angle) };
}

export function breaker(kit: WaterKit, center: Vec2, radius: number, foam: Color): void {
  kit.ring(center.x, center.z, radius, new Color().copy(foam).multiplyScalar(WATER_LOOK.crestShine), WATER_LOOK.crestTime);
  for (let index: number = 0; index < WATER_LOOK.breakerDrops; index += 1) {
    const heading: Vec2 = breakerHeading(index);
    kit.spray(center.x + heading.x * WATER_LOOK.breakerStart, WATER_LOOK.breakerHeight, center.z + heading.z * WATER_LOOK.breakerStart, foam, 1, { dirX: heading.x, dirZ: heading.z, spread: 0.25, speed: { min: radius * 1.4, max: radius * 2.4 }, lift: { min: 2.5, max: 5 }, life: { min: 0.5, max: 0.8 }, size: { min: 0.14, max: 0.3 }, gravity: 12, drag: 0.4, jitter: 0.1 });
  }
}
