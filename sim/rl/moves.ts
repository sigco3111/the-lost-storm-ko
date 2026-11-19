import type { Vec2 } from '../math.ts';
import { MOVE_CHOICES } from './contract.ts';

export const MOVES = {
  still: 0.25,
} as const;

const DIRECTIONS: number = MOVE_CHOICES - 1;

export function moveDirection(move: number): Vec2 | null {
  if (move < 1 || move > DIRECTIONS) return null;
  const angle: number = ((move - 1) / DIRECTIONS) * Math.PI * 2;
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

export function moveBucket(offset: Vec2): number {
  if (Math.hypot(offset.x, offset.z) < MOVES.still) return 0;
  const turn: number = Math.atan2(offset.z, offset.x) / (Math.PI * 2);
  const index: number = Math.round(turn * DIRECTIONS);
  return (((index % DIRECTIONS) + DIRECTIONS) % DIRECTIONS) + 1;
}
