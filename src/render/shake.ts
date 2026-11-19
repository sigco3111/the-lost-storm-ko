export const SHAKE = {
  level: 0.78,
  ceiling: 0.7,
  together: 0.12,
  stackShare: 0.3,
  decay: 1.9,
  punchLevel: 0.65,
  punchCeiling: 0.25,
  punchDecay: 14,
} as const;

export interface Punch {
  readonly x: number;
  readonly z: number;
}

interface TraumaMoment {
  readonly at: number;
  readonly before: number;
  readonly peak: number;
}

interface PunchMoment {
  readonly at: number;
  readonly before: Punch;
  readonly peak: Punch;
}

export interface Shake {
  readonly clock: number;
  readonly trauma: number;
  readonly punch: Punch;
  readonly traumaMoment: TraumaMoment;
  readonly punchMoment: PunchMoment;
}

const STILL: Punch = { x: 0, z: 0 };

export function stillShake(): Shake {
  return {
    clock: 0,
    trauma: 0,
    punch: STILL,
    traumaMoment: { at: Number.NEGATIVE_INFINITY, before: 0, peak: 0 },
    punchMoment: { at: Number.NEGATIVE_INFINITY, before: STILL, peak: STILL },
  };
}

export function combineTrauma(before: number, peak: number): number {
  return Math.min(SHAKE.ceiling, Math.max(before, peak) + Math.min(before, peak) * SHAKE.stackShare);
}

function together(clock: number, at: number): boolean {
  return clock - at < SHAKE.together;
}

export function addTrauma(shake: Shake, amount: number): Shake {
  const scaled: number = Math.max(0, amount) * SHAKE.level;
  if (scaled <= 0) return shake;
  if (!together(shake.clock, shake.traumaMoment.at)) {
    return { ...shake, trauma: combineTrauma(shake.trauma, scaled), traumaMoment: { at: shake.clock, before: shake.trauma, peak: scaled } };
  }
  const moment: TraumaMoment = shake.traumaMoment;
  if (scaled <= moment.peak) return shake;
  const rise: number = combineTrauma(moment.before, scaled) - combineTrauma(moment.before, moment.peak);
  return { ...shake, trauma: Math.min(SHAKE.ceiling, shake.trauma + rise), traumaMoment: { ...moment, peak: scaled } };
}

function length(punch: Punch): number {
  return Math.hypot(punch.x, punch.z);
}

function capped(punch: Punch): Punch {
  const size: number = length(punch);
  if (size <= SHAKE.punchCeiling) return punch;
  const scale: number = SHAKE.punchCeiling / size;
  return { x: punch.x * scale, z: punch.z * scale };
}

function sum(a: Punch, b: Punch): Punch {
  return { x: a.x + b.x, z: a.z + b.z };
}

export function addPunch(shake: Shake, dirX: number, dirZ: number, amount: number): Shake {
  const kick: Punch = { x: dirX * amount * SHAKE.punchLevel, z: dirZ * amount * SHAKE.punchLevel };
  if (length(kick) <= 0) return shake;
  if (!together(shake.clock, shake.punchMoment.at)) {
    return { ...shake, punch: capped(sum(shake.punch, kick)), punchMoment: { at: shake.clock, before: shake.punch, peak: kick } };
  }
  const moment: PunchMoment = shake.punchMoment;
  if (length(kick) <= length(moment.peak)) return shake;
  const was: Punch = capped(sum(moment.before, moment.peak));
  const now: Punch = capped(sum(moment.before, kick));
  return { ...shake, punch: capped({ x: shake.punch.x + now.x - was.x, z: shake.punch.z + now.z - was.z }), punchMoment: { ...moment, peak: kick } };
}

export function settleShake(shake: Shake, dt: number): Shake {
  const fade: number = Math.exp(-SHAKE.punchDecay * dt);
  return { ...shake, clock: shake.clock + dt, trauma: Math.max(0, shake.trauma - SHAKE.decay * dt), punch: { x: shake.punch.x * fade, z: shake.punch.z * fade } };
}

export function shakeStrength(shake: Shake): number {
  return shake.trauma * shake.trauma;
}
