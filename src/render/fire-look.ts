import { Color } from 'three';
import type { AreaDelivery } from '../../sim/content/shape-types.ts';
import type { SkillVfx } from '../../sim/content/vfx-types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { stokeHeat } from '../../sim/world/areas.ts';
import type { BurstOptions } from './particles.ts';

export const FIRE_LOOK = {
  lickEvery: 0.05,
  lickClumps: 1,
  lickHotClumps: 2,
  clump: 4,
  lickInner: 0.72,
  lickHeight: 0.15,
  lickPull: 0.6,
  emberChance: 0.35,
  flareClumps: 9,
  flareHotClumps: 9,
  flareScatter: 0.8,
  flareHeight: 0.2,
  flareRing: 0.95,
  flareRingTime: 0.7,
  flareShine: 0.32,
  flareHotShine: 0.3,
  flareLight: 26,
  flareHotLight: 34,
  flareLift: 1.4,
  hotMix: 0.55,
  heatGlow: 0.8,
  hot: 0xffe2a6,
  burnRate: 26,
  burnSpread: 0.32,
  burnLow: 0.35,
  burnHigh: 1.5,
  burnEmberChance: 0.2,
} as const;

const HOT: Color = new Color(FIRE_LOOK.hot);

const TONGUE: Partial<BurstOptions> = { speed: { min: 0.1, max: 0.6 }, lift: { min: 1.6, max: 3.2 }, life: { min: 0.3, max: 0.55 }, size: { min: 0.5, max: 1 }, gravity: -1.5, drag: 1.6, jitter: 0.35 };
const EMBER: Partial<BurstOptions> = { speed: { min: 0.2, max: 0.9 }, lift: { min: 2.2, max: 4.2 }, life: { min: 0.8, max: 1.4 }, size: { min: 0.06, max: 0.12 }, gravity: -0.6, drag: 0.7, jitter: 0.6 };
const FLARE: Partial<BurstOptions> = { speed: { min: 0.3, max: 1.4 }, lift: { min: 2.4, max: 4.6 }, life: { min: 0.35, max: 0.6 }, size: { min: 0.7, max: 1.3 }, gravity: -2, drag: 1.4, jitter: 0.4 };
const BURN: Partial<BurstOptions> = { speed: { min: 0, max: 0.3 }, lift: { min: 1.2, max: 2.4 }, life: { min: 0.22, max: 0.42 }, size: { min: 0.35, max: 0.7 }, gravity: -1.2, drag: 1.8, jitter: 0.25 };

export interface FireKit {
  readonly spray: (x: number, y: number, z: number, color: Color, count: number, overrides: Partial<BurstOptions>) => void;
  readonly ring: (x: number, z: number, radius: number, color: Color, duration: number) => void;
  readonly flashLight: (x: number, y: number, z: number, color: Color, intensity: number) => void;
}

export function burnsAsFire(vfx: SkillVfx): boolean {
  return vfx.style === 'fire' && vfx.burn === null;
}

export function heatShare(delivery: AreaDelivery, pulses: number): number {
  if (delivery.stoke === null || delivery.stoke.max <= 0) return 0;
  return stokeHeat(delivery, pulses) / delivery.stoke.max;
}

export function hotter(base: Color, share: number): Color {
  return base.clone().lerp(HOT, Math.min(1, Math.max(0, share)) * FIRE_LOOK.hotMix);
}

export function heatGlow(glow: number, share: number): number {
  return glow * (1 + FIRE_LOOK.heatGlow * Math.min(1, Math.max(0, share)));
}

export function rimSpot(center: Vec2, radius: number, angle: number, share: number): Vec2 {
  const reach: number = radius * (FIRE_LOOK.lickInner + (1 - FIRE_LOOK.lickInner) * share);
  return { x: center.x + Math.sin(angle) * reach, z: center.z + Math.cos(angle) * reach };
}

export function lick(kit: FireKit, center: Vec2, radius: number, pull: number, color: Color, heat: number, random: () => number): void {
  const flame: Color = hotter(color, heat);
  const clumps: number = FIRE_LOOK.lickClumps + Math.round(FIRE_LOOK.lickHotClumps * heat);
  for (let index: number = 0; index < clumps; index += 1) {
    const angle: number = random() * Math.PI * 2;
    const spot: Vec2 = rimSpot(center, radius, angle, random());
    const inward: Partial<BurstOptions> = pull > 0 ? { dirX: -Math.sin(angle), dirZ: -Math.cos(angle), spread: 0.5, speed: { min: pull * FIRE_LOOK.lickPull * 0.5, max: pull * FIRE_LOOK.lickPull } } : {};
    kit.spray(spot.x, FIRE_LOOK.lickHeight, spot.z, flame, FIRE_LOOK.clump, { ...TONGUE, ...inward });
  }
  if (random() < FIRE_LOOK.emberChance * (1 + heat)) {
    const spot: Vec2 = rimSpot(center, radius, random() * Math.PI * 2, random());
    kit.spray(spot.x, FIRE_LOOK.lickHeight, spot.z, hotter(color, 1), 1, EMBER);
  }
}

export function flare(kit: FireKit, center: Vec2, radius: number, color: Color, heat: number, random: () => number): void {
  const flame: Color = hotter(color, heat);
  const clumps: number = FIRE_LOOK.flareClumps + Math.round(FIRE_LOOK.flareHotClumps * heat);
  for (let index: number = 0; index < clumps; index += 1) {
    const angle: number = ((index + random() * FIRE_LOOK.flareScatter) / clumps) * Math.PI * 2;
    const spot: Vec2 = rimSpot(center, radius, angle, random());
    kit.spray(spot.x, FIRE_LOOK.flareHeight, spot.z, flame, FIRE_LOOK.clump, FLARE);
  }
  kit.ring(center.x, center.z, radius * FIRE_LOOK.flareRing, flame.clone().multiplyScalar(FIRE_LOOK.flareShine + FIRE_LOOK.flareHotShine * heat), FIRE_LOOK.flareRingTime);
  kit.flashLight(center.x, FIRE_LOOK.flareLift, center.z, flame, FIRE_LOOK.flareLight + FIRE_LOOK.flareHotLight * heat);
}

export function burnTongues(kit: FireKit, at: Vec2, color: Color, count: number, random: () => number): void {
  for (let index: number = 0; index < count; index += 1) {
    const angle: number = random() * Math.PI * 2;
    const reach: number = random() * FIRE_LOOK.burnSpread;
    const height: number = FIRE_LOOK.burnLow + random() * (FIRE_LOOK.burnHigh - FIRE_LOOK.burnLow);
    const ember: boolean = random() < FIRE_LOOK.burnEmberChance;
    kit.spray(at.x + Math.sin(angle) * reach, height, at.z + Math.cos(angle) * reach, ember ? hotter(color, 1) : color, 1, ember ? EMBER : BURN);
  }
}
