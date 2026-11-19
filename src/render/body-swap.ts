import type { Material } from 'three';
import type { Spring } from '../hud/character-spring.ts';
import { stepSpring } from '../hud/character-spring.ts';

export const BODY_SWAP = {
  longestStep: 1 / 60,
  depthFrom: 0.5,
} as const;

export function fadeWritesDepth(amount: number): boolean {
  return amount >= BODY_SWAP.depthFrom;
}

export function fadeMaterials(materials: readonly Material[], amount: number): void {
  for (const material of materials) {
    material.opacity = Math.min(1, Math.max(0, amount));
    material.depthWrite = fadeWritesDepth(amount);
  }
}

export interface BodySwap<V> {
  readonly old: V;
  readonly level: Spring;
}

export interface SwapMix {
  readonly incoming: number;
  readonly outgoing: number;
  readonly done: boolean;
}

export function startSwap<V>(old: V): BodySwap<V> {
  return { old, level: { value: 0, velocity: 0, target: 1 } };
}

export function stepSwap<V>(swap: BodySwap<V>, dt: number): SwapMix {
  const moving: boolean = stepSpring(swap.level, Math.min(dt, BODY_SWAP.longestStep));
  const incoming: number = Math.min(1, Math.max(0, swap.level.value));
  return { incoming, outgoing: 1 - incoming, done: !moving && incoming >= 1 };
}
