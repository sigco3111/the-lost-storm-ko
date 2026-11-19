import type { MonsterScaling, ScalingPoint, ScalingRamp } from '../content/types.ts';

export interface MonsterScale {
  readonly life: number;
  readonly damage: number;
}

export function lifeTimesAt(points: readonly ScalingPoint[], level: number): number {
  const first: ScalingPoint | undefined = points[0];
  if (first === undefined) return 1;
  if (level <= first.level) return first.times;
  for (let index: number = 1; index < points.length; index += 1) {
    const low: ScalingPoint | undefined = points[index - 1];
    const high: ScalingPoint | undefined = points[index];
    if (low === undefined || high === undefined || level > high.level) continue;
    return low.times + ((high.times - low.times) * (level - low.level)) / (high.level - low.level);
  }
  return points[points.length - 1]?.times ?? 1;
}

export function monsterScale(scaling: MonsterScaling, level: number): MonsterScale {
  const scale: MonsterScale = rampScale(scaling, level);
  return { life: scale.life * lifeTimesAt(scaling.lifeTimes, level), damage: scale.damage };
}

function rampScale(scaling: MonsterScaling, level: number): MonsterScale {
  const steps: number = level - 1;
  const gentle: MonsterScale = { life: 1 + scaling.lifePerLevel * steps, damage: 1 + scaling.damagePerLevel * steps };
  const ramp: ScalingRamp | null = scaling.ramp;
  if (ramp === null || level <= ramp.from) return gentle;
  const steep: MonsterScale = { life: 1 + ramp.lifePerLevel * steps, damage: 1 + ramp.damagePerLevel * steps };
  if (level >= ramp.to) return steep;
  const weight: number = (level - ramp.from) / (ramp.to - ramp.from);
  return { life: gentle.life + (steep.life - gentle.life) * weight, damage: gentle.damage + (steep.damage - gentle.damage) * weight };
}
