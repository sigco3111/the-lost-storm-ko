export const TAILWIND_FEEL = {
  ringBase: 2.2,
  ringStep: 0.45,
  ringTime: 0.75,
  sparksBase: 14,
  sparksStep: 10,
  lightBase: 1.4,
  lightStep: 0.7,
  topShake: 0.18,
  killSparks: 3,
  killSparksStep: 2,
  softShare: 0.45,
  fallRadius: 2.6,
  fallTime: 1.1,
  fallSparks: 18,
  fallFrom: 2,
  glowRadius: 1.9,
  glowStrength: 0.3,
  glowRise: 2.2,
  glowFall: 0.9,
} as const;

export interface RiseLook {
  readonly radius: number;
  readonly duration: number;
  readonly sparks: number;
  readonly light: number;
  readonly shake: number;
}

export interface FallLook {
  readonly radius: number;
  readonly duration: number;
  readonly sparks: number;
}

function scaled(value: number, soft: boolean): number {
  return soft ? value * TAILWIND_FEEL.softShare : value;
}

export function riseLook(tier: number, tiers: number, soft: boolean): RiseLook {
  const step: number = Math.max(0, tier - 1);
  const top: boolean = tier >= tiers;
  return {
    radius: TAILWIND_FEEL.ringBase + TAILWIND_FEEL.ringStep * step,
    duration: TAILWIND_FEEL.ringTime,
    sparks: Math.round(scaled(TAILWIND_FEEL.sparksBase + TAILWIND_FEEL.sparksStep * step, soft)),
    light: scaled(TAILWIND_FEEL.lightBase + TAILWIND_FEEL.lightStep * step, soft),
    shake: top && !soft ? TAILWIND_FEEL.topShake : 0,
  };
}

export function killSparks(tier: number, soft: boolean): number {
  if (tier <= 0) return 0;
  return Math.round(scaled(TAILWIND_FEEL.killSparks + TAILWIND_FEEL.killSparksStep * (tier - 1), soft));
}

export function fallLook(best: number, soft: boolean): FallLook | null {
  if (best < TAILWIND_FEEL.fallFrom) return null;
  return { radius: TAILWIND_FEEL.fallRadius, duration: TAILWIND_FEEL.fallTime, sparks: Math.round(scaled(TAILWIND_FEEL.fallSparks, soft)) };
}

export function glowTarget(tier: number, tiers: number, soft: boolean): number {
  return tier >= tiers && tiers > 0 ? scaled(TAILWIND_FEEL.glowStrength, soft) : 0;
}

export function stepGlow(current: number, target: number, dt: number): number {
  const rate: number = target > current ? TAILWIND_FEEL.glowRise : TAILWIND_FEEL.glowFall;
  const next: number = current + (target - current) * (1 - Math.exp(-rate * dt));
  return Math.abs(target - next) < 0.001 ? target : next;
}
