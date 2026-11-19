export const VOLLEY = {
  punch: 0.16,
  punchShake: 0.12,
  crit: 2,
  gain: 0.3,
  ceiling: 0.32,
} as const;

export interface VolleyHit {
  readonly key: string;
  readonly dirX: number;
  readonly dirZ: number;
  readonly crit: boolean;
  readonly shake: number;
}

export interface VolleyKick {
  readonly dirX: number;
  readonly dirZ: number;
  readonly amount: number;
}

interface Gathered {
  sumX: number;
  sumZ: number;
  firstX: number;
  firstZ: number;
  strongest: number;
  count: number;
}

export function hitKick(shake: number, crit: boolean): number {
  return VOLLEY.punch * (crit ? VOLLEY.crit : 1) * Math.min(1, Math.max(0, shake) / VOLLEY.punchShake);
}

export function volleyAmount(strongest: number, count: number): number {
  if (strongest <= 0 || count <= 0) return 0;
  return Math.min(VOLLEY.ceiling, strongest * (1 + VOLLEY.gain * Math.log2(count)));
}

export function volleyKicks(hits: readonly VolleyHit[]): VolleyKick[] {
  const volleys: Map<string, Gathered> = new Map<string, Gathered>();
  for (const hit of hits) {
    const kick: number = hitKick(hit.shake, hit.crit);
    const known: Gathered | undefined = volleys.get(hit.key);
    if (known === undefined) {
      volleys.set(hit.key, { sumX: hit.dirX, sumZ: hit.dirZ, firstX: hit.dirX, firstZ: hit.dirZ, strongest: kick, count: 1 });
      continue;
    }
    known.sumX += hit.dirX;
    known.sumZ += hit.dirZ;
    known.strongest = Math.max(known.strongest, kick);
    known.count += 1;
  }
  const kicks: VolleyKick[] = [];
  for (const volley of volleys.values()) {
    const amount: number = volleyAmount(volley.strongest, volley.count);
    if (amount <= 0) continue;
    const length: number = Math.hypot(volley.sumX, volley.sumZ);
    const dirX: number = length > 1e-6 ? volley.sumX / length : volley.firstX;
    const dirZ: number = length > 1e-6 ? volley.sumZ / length : volley.firstZ;
    kicks.push({ dirX, dirZ, amount });
  }
  return kicks;
}
