import type { MonsterDef } from '../../sim/content/types.ts';

export const MOMENT = {
  low: 0.25,
  dip: 0.04,
  hold: 0.05,
  back: 0.16,
  cooldown: 2,
  bigCrit: 2,
} as const;

export interface Moment {
  readonly at: number;
}

export interface Blow {
  readonly crit: boolean;
  readonly amount: number;
  readonly maxLife: number;
}

export const NO_MOMENT: Moment = { at: Number.NEGATIVE_INFINITY };

function smooth(share: number): number {
  const clamped: number = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
}

export function startMoment(moment: Moment, now: number): Moment {
  return now - moment.at < MOMENT.cooldown ? moment : { at: now };
}

export function momentScale(moment: Moment, now: number): number {
  const elapsed: number = now - moment.at;
  if (elapsed < 0) return 1;
  if (elapsed < MOMENT.dip) return 1 - (1 - MOMENT.low) * smooth(elapsed / MOMENT.dip);
  if (elapsed < MOMENT.dip + MOMENT.hold) return MOMENT.low;
  const back: number = (elapsed - MOMENT.dip - MOMENT.hold) / MOMENT.back;
  if (back >= 1) return 1;
  return MOMENT.low + (1 - MOMENT.low) * smooth(back);
}

export function momentousKill(def: Pick<MonsterDef, 'boss' | 'rank'>, blow: Blow): boolean {
  if (def.boss !== null || def.rank?.leader === true) return true;
  return def.rank !== null && blow.crit && blow.maxLife > 0 && blow.amount >= blow.maxLife * MOMENT.bigCrit;
}
