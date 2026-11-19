export const WEAR_FADE = {
  stiffness: 240,
  damping: 31,
  settle: 0.004,
  longestStep: 1 / 30,
  overshoot: 1.2,
} as const;

export interface Springy {
  value: number;
  velocity: number;
  target: number;
}

export function settledPiece(piece: Springy): boolean {
  return piece.value === piece.target && piece.velocity === 0;
}

export function springTo(piece: Springy, step: number, ceiling: number): boolean {
  if (settledPiece(piece)) return false;
  piece.velocity += (WEAR_FADE.stiffness * (piece.target - piece.value) - WEAR_FADE.damping * piece.velocity) * step;
  const next: number = Math.min(ceiling, Math.max(0, piece.value + piece.velocity * step));
  const settled: boolean = Math.abs(piece.target - next) < WEAR_FADE.settle && Math.abs(piece.velocity) < WEAR_FADE.settle * WEAR_FADE.stiffness;
  piece.value = settled ? piece.target : next;
  if (settled) piece.velocity = 0;
  return !settled;
}

export function anyUnsettled(pieces: Iterable<Springy>): boolean {
  for (const piece of pieces) if (!settledPiece(piece)) return true;
  return false;
}

export function dropSettled<T extends Springy>(pieces: T[], drop: (piece: T) => void): boolean {
  let kept: number = 0;
  let dropped: boolean = false;
  for (const piece of pieces) {
    if (piece.value === 0 && piece.velocity === 0) {
      drop(piece);
      dropped = true;
      continue;
    }
    pieces[kept] = piece;
    kept += 1;
  }
  pieces.length = kept;
  return dropped;
}

export function sameIds(kept: readonly string[], ids: readonly string[]): boolean {
  if (kept.length !== ids.length) return false;
  for (let index: number = 0; index < ids.length; index += 1) if (kept[index] !== ids[index]) return false;
  return true;
}
