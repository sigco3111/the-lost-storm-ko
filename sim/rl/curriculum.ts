import type { Rng } from '../rng.ts';
import { ARENA } from './arena.ts';

export const CURRICULUM = {
  seedSalt: 2654435761,
} as const;

export function levelCount(): number {
  return ARENA.levels.max - ARENA.levels.min + 1;
}

export function readLevelWeights(raw: unknown): number[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('level weights must be a list');
  const weights: number[] = raw.map((value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('a level weight must be a number of zero or more');
    return value;
  });
  if (weights.length === 0) return [];
  if (weights.length !== levelCount()) throw new Error(`level weights must name all ${levelCount()} levels from ${ARENA.levels.min} to ${ARENA.levels.max}`);
  if (weights.every((weight: number): boolean => weight === 0)) throw new Error('at least one level weight must be above zero');
  return weights;
}

export function pickLevel(rng: Rng, weights: readonly number[]): number | null {
  const total: number = weights.reduce((sum: number, weight: number): number => sum + weight, 0);
  if (total <= 0) return null;
  let left: number = rng.next() * total;
  for (let index: number = 0; index < weights.length; index += 1) {
    left -= weights[index] ?? 0;
    if (left < 0) return ARENA.levels.min + index;
  }
  const last: number = weights.findLastIndex((weight: number): boolean => weight > 0);
  return ARENA.levels.min + last;
}
