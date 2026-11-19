import type { FlaskState } from '../../sim/world/types.ts';
import { isRestoring } from '../../sim/world/flasks.ts';

export const GAUGE = {
  levelStep: 0.01,
} as const;

export interface FlaskReading {
  readonly charges: number;
  readonly maxCharges: number;
  readonly chargesPerUse: number;
  readonly restoring: boolean;
}

export interface FlaskGauge {
  readonly level: number;
  readonly uses: number;
  readonly maxUses: number;
  readonly empty: boolean;
  readonly restoring: boolean;
}

export type FlaskCue = 'drank' | 'gained' | null;

export function flaskUses(flask: Pick<FlaskReading, 'charges' | 'chargesPerUse'>): number {
  return flask.chargesPerUse > 0 ? Math.max(0, Math.floor(flask.charges / flask.chargesPerUse)) : 0;
}

export function readFlask(flask: FlaskState): FlaskReading {
  return { charges: flask.charges, maxCharges: flask.def.maxCharges, chargesPerUse: flask.def.chargesPerUse, restoring: isRestoring(flask) };
}

export function flaskGauge(reading: FlaskReading): FlaskGauge {
  const share: number = reading.maxCharges > 0 ? Math.min(1, Math.max(0, reading.charges / reading.maxCharges)) : 0;
  const uses: number = flaskUses(reading);
  return {
    level: Math.round(share / GAUGE.levelStep) * GAUGE.levelStep,
    uses,
    maxUses: flaskUses({ charges: reading.maxCharges, chargesPerUse: reading.chargesPerUse }),
    empty: uses === 0,
    restoring: reading.restoring,
  };
}

export function flaskCue(before: FlaskReading | null, now: FlaskReading): FlaskCue {
  if (before === null || before.charges === now.charges) return null;
  return now.charges < before.charges ? 'drank' : 'gained';
}

export function sameGauge(a: FlaskGauge | null, b: FlaskGauge): boolean {
  return a !== null && a.level === b.level && a.uses === b.uses && a.maxUses === b.maxUses && a.empty === b.empty && a.restoring === b.restoring;
}

export function flaskTicks(maxCharges: number, chargesPerUse: number): readonly number[] {
  if (maxCharges <= 0 || chargesPerUse <= 0) return [];
  const uses: number = flaskUses({ charges: maxCharges, chargesPerUse });
  return Array.from({ length: uses }, (_unused: unknown, index: number): number => ((index + 1) * chargesPerUse) / maxCharges);
}
