export interface SpillSide {
  readonly id: string;
  readonly spill: number;
}

export function spreadsOnto(other: SpillSide, own: SpillSide): boolean {
  if (other.id === own.id) return false;
  if (other.spill !== own.spill) return other.spill > own.spill;
  return own.spill > 0 && other.id > own.id;
}

export function fringeShare(distance: number, reach: number, ragged: number): number {
  if (distance <= 0) return 1;
  const t: number = Math.min(1, Math.max(0, 1 - distance / reach + ragged));
  return t * t * (3 - 2 * t);
}
