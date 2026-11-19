import type { ReadonlyVec2, Vec2 } from '../../sim/math.ts';

export const SPIN_CENTRE = {
  lean: 0.06,
  rest: 0.001,
} as const;

export interface SpinCentre {
  weight: number;
  pivot: Vec2;
}

export function createSpinCentre(): SpinCentre {
  return { weight: 0, pivot: { x: 0, z: 0 } };
}

export function turnedBy(offset: ReadonlyVec2, yaw: number): Vec2 {
  const cos: number = Math.cos(yaw);
  const sin: number = Math.sin(yaw);
  return { x: offset.x * cos + offset.z * sin, z: -offset.x * sin + offset.z * cos };
}

export function holdSpinCentre(centre: SpinCentre, poseWeight: number): boolean {
  centre.weight = Math.min(1, Math.max(0, poseWeight));
  return centre.weight > SPIN_CENTRE.rest;
}

export function centreShift(centre: SpinCentre, yaw: number): Vec2 {
  const offset: Vec2 = turnedBy(centre.pivot, yaw);
  const reach: number = Math.hypot(offset.x, offset.z);
  if (reach <= SPIN_CENTRE.lean) return { x: 0, z: 0 };
  const share: number = (centre.weight * (reach - SPIN_CENTRE.lean)) / reach;
  return { x: -offset.x * share, z: -offset.z * share };
}

export function measurePivot(centre: SpinCentre, hips: ReadonlyVec2, root: ReadonlyVec2, yaw: number): void {
  centre.pivot = turnedBy({ x: hips.x - root.x, z: hips.z - root.z }, -yaw);
}
