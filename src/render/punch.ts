import type { Vec2 } from '../../sim/math.ts';

export const PUNCH = {
  sparkSpread: 0.3,
  swing: 0.3,
  dustHeight: 0.12,
  dustSpread: 0.35,
  dustLiftMin: 0.3,
  dustLiftMax: 1.2,
  dustLifeMin: 0.16,
  dustLifeMax: 0.38,
  dustSizeMin: 0.14,
  dustSizeMax: 0.3,
  dustDrag: 6,
  dustSlowest: 0.55,
  closeShare: 0.5,
} as const;

export interface PunchRoll {
  readonly sparks: number;
  readonly swing: number;
  readonly turn: number;
}

export function punchRoll(sparks: number, random: () => number): PunchRoll {
  const scale: number = 1 + (random() * 2 - 1) * PUNCH.sparkSpread;
  return {
    sparks: Math.max(1, Math.round(sparks * scale)),
    swing: (random() * 2 - 1) * PUNCH.swing,
    turn: random() * Math.PI * 2,
  };
}

export function dustHeadings(count: number, turn: number): Vec2[] {
  const headings: Vec2[] = [];
  for (let index: number = 0; index < count; index += 1) {
    const angle: number = turn + (index / Math.max(1, count)) * Math.PI * 2;
    headings.push({ x: Math.sin(angle), z: Math.cos(angle) });
  }
  return headings;
}

export function reachedFrom(from: Vec2, to: Vec2, reach: number): Vec2 {
  const length: number = Math.hypot(to.x - from.x, to.z - from.z);
  if (length <= 0) return { x: from.x, z: from.z };
  const share: number = Math.min(reach, length * PUNCH.closeShare) / length;
  return { x: from.x + (to.x - from.x) * share, z: from.z + (to.z - from.z) * share };
}

export function swungFrom(from: Vec2, to: Vec2, swing: number): Vec2 {
  const length: number = Math.hypot(to.x - from.x, to.z - from.z);
  if (length <= 0) return { x: from.x, z: from.z };
  const sideX: number = (to.z - from.z) / length;
  const sideZ: number = -(to.x - from.x) / length;
  return { x: from.x + sideX * swing, z: from.z + sideZ * swing };
}
