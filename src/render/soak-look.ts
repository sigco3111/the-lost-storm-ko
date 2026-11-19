import { Color } from 'three';
import type { ShadeMotion } from './shadow-shade.ts';
import { stepShade } from './shadow-shade.ts';

export const SOAK_LOOK = {
  color: 0x5f9fd8,
  tint: 0.12,
  dripRate: 9,
  dripSpread: 0.3,
  dripLow: 0.7,
  dripHigh: 1.5,
  dripFall: 1.2,
  dripGravity: 9,
  dripLifeMin: 0.3,
  dripLifeMax: 0.55,
  dripSizeMin: 0.07,
  dripSizeMax: 0.14,
} as const;

export const SOAK_COLOR: Color = new Color(SOAK_LOOK.color);

export interface Soaking {
  left: number;
  readonly motion: ShadeMotion;
}

export function soakedFor(soaks: Map<number, Soaking>, id: number, duration: number): void {
  const held: Soaking | undefined = soaks.get(id);
  if (held === undefined) soaks.set(id, { left: duration, motion: { value: 0, speed: 0 } });
  else held.left = Math.max(held.left, duration);
}

export function stepSoak(soaking: Soaking, dt: number): number {
  soaking.left = Math.max(0, soaking.left - dt);
  stepShade(soaking.motion, soaking.left > 0 ? 1 : 0, dt);
  return soaking.motion.value;
}

export function soakDried(soaking: Soaking): boolean {
  return soaking.left === 0 && soaking.motion.value === 0;
}

export function dripsDue(rate: number, dt: number, roll: number): number {
  const expected: number = rate * dt;
  const whole: number = Math.floor(expected);
  return whole + (roll < expected - whole ? 1 : 0);
}
