export const FIGURE_TURN = {
  radiansPerWidth: Math.PI,
  velocityWindowMs: 90,
  maxSpeed: 24,
  restBelowSpeed: 0.05,
  settledWithin: 0.002,
  settleFraction: 0.01,
  msPerSecond: 1000,
} as const;

export interface TurnSample {
  readonly at: number;
  readonly angle: number;
}

export type FigureTurn =
  | { readonly kind: 'rest'; readonly angle: number }
  | { readonly kind: 'held'; readonly angle: number; readonly from: number; readonly x: number; readonly samples: readonly TurnSample[] }
  | { readonly kind: 'coast'; readonly from: number; readonly speed: number; readonly at: number; readonly rate: number };

export const RESTING_TURN: FigureTurn = { kind: 'rest', angle: 0 };

export function settleRate(settleMs: number): number {
  return Math.log(1 / FIGURE_TURN.settleFraction) / (settleMs / FIGURE_TURN.msPerSecond);
}

function coastTarget(turn: Extract<FigureTurn, { kind: 'coast' }>): number {
  return turn.from + turn.speed / turn.rate;
}

function coastLeft(turn: Extract<FigureTurn, { kind: 'coast' }>, now: number): number {
  const seconds: number = Math.max(0, now - turn.at) / FIGURE_TURN.msPerSecond;
  return (turn.speed / turn.rate) * Math.exp(-turn.rate * seconds);
}

export function turnAngle(turn: FigureTurn, now: number): number {
  switch (turn.kind) {
    case 'rest':
    case 'held':
      return turn.angle;
    case 'coast':
      return coastTarget(turn) - coastLeft(turn, now);
  }
  return 0;
}

export function turnSpeed(turn: FigureTurn, now: number): number {
  if (turn.kind !== 'coast') return 0;
  return coastLeft(turn, now) * turn.rate;
}

export function pressTurn(turn: FigureTurn, x: number, now: number): FigureTurn {
  const angle: number = turnAngle(turn, now);
  return { kind: 'held', angle, from: angle, x, samples: [{ at: now, angle }] };
}

export function dragTurn(turn: FigureTurn, x: number, now: number, width: number): FigureTurn {
  if (turn.kind !== 'held' || width <= 0) return turn;
  const angle: number = turn.from + ((x - turn.x) / width) * FIGURE_TURN.radiansPerWidth;
  const samples: TurnSample[] = recentSamples(turn.samples, now);
  samples.push({ at: now, angle });
  return { ...turn, angle, samples };
}

function recentSamples(samples: readonly TurnSample[], now: number): TurnSample[] {
  const inside: number = samples.findIndex((sample: TurnSample): boolean => now - sample.at <= FIGURE_TURN.velocityWindowMs);
  if (inside < 0) return samples.slice(-1);
  return samples.slice(Math.max(0, inside - 1));
}

export function releaseSpeed(samples: readonly TurnSample[], now: number): number {
  const last: TurnSample | undefined = samples[samples.length - 1];
  if (last === undefined || now - last.at > FIGURE_TURN.velocityWindowMs) return 0;
  const inside: number = samples.findIndex((sample: TurnSample): boolean => now - sample.at <= FIGURE_TURN.velocityWindowMs);
  const first: TurnSample | undefined = samples[inside === samples.length - 1 ? inside - 1 : inside];
  if (first === undefined || last.at <= first.at) return 0;
  const speed: number = ((last.angle - first.angle) / (last.at - first.at)) * FIGURE_TURN.msPerSecond;
  return Math.max(-FIGURE_TURN.maxSpeed, Math.min(FIGURE_TURN.maxSpeed, speed));
}

export function releaseTurn(turn: FigureTurn, now: number, settleMs: number): FigureTurn {
  if (turn.kind !== 'held') return turn;
  const speed: number = releaseSpeed(turn.samples, now);
  if (Math.abs(speed) < FIGURE_TURN.restBelowSpeed || settleMs <= 0) return { kind: 'rest', angle: turn.angle };
  return { kind: 'coast', from: turn.angle, speed, at: now, rate: settleRate(settleMs) };
}

export function settleTurn(turn: FigureTurn, now: number): FigureTurn {
  if (turn.kind !== 'coast') return turn;
  if (Math.abs(coastLeft(turn, now)) > FIGURE_TURN.settledWithin) return turn;
  return { kind: 'rest', angle: coastTarget(turn) };
}

export function isTurning(turn: FigureTurn): boolean {
  return turn.kind === 'coast';
}
