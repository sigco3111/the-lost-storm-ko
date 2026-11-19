import type { SkillDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';

export const HOLD = {
  floor: 0.05,
  min: 0.04,
  max: 0.08,
  crit: 1.6,
  kill: 0.02,
  release: 0.06,
  again: 0.3,
  heavy: 0.07,
} as const;

export const RIPPLE = {
  perMetre: 0.03,
  max: 0.12,
} as const;

export interface HoldClock {
  readonly span: number;
  readonly age: number;
}

export interface Holds {
  hold(id: number, span: number): void;
  rate(id: number): number;
  step(dt: number): void;
  forget(id: number): void;
  clear(): void;
}

export interface Fallen {
  readonly id: number;
  readonly pos: Vec2;
}

export interface Later<T> {
  add(delay: number, item: T): void;
  take(dt: number): T[];
  drop(keep: (item: T) => boolean): void;
  clear(): void;
}

interface Waiting<T> {
  readonly item: T;
  left: number;
}

function smooth(share: number): number {
  const clamped: number = Math.min(1, Math.max(0, share));
  return clamped * clamped * (3 - 2 * clamped);
}

export function holdSpan(hitStop: number, crit: boolean, killed: boolean): number {
  if (hitStop <= 0) return 0;
  const wanted: number = hitStop * (crit ? HOLD.crit : 1) + (killed ? HOLD.kill : 0);
  return Math.min(HOLD.max, Math.max(HOLD.min, wanted));
}

export function heroHolds(skill: SkillDef): boolean {
  return skill.delivery.type === 'arc' && skill.hitStop >= HOLD.heavy;
}

export function holdRate(clock: HoldClock): number {
  if (clock.age < clock.span) return HOLD.floor;
  const easing: number = (clock.age - clock.span) / HOLD.release;
  if (easing >= 1) return 1;
  return HOLD.floor + (1 - HOLD.floor) * smooth(easing);
}

function settled(clock: HoldClock): boolean {
  return clock.age >= Math.max(HOLD.again, clock.span + HOLD.release);
}

export function rehold(clock: HoldClock | undefined, span: number): HoldClock | undefined {
  if (span <= 0) return clock;
  if (clock === undefined || clock.age >= HOLD.again) return { span, age: 0 };
  if (clock.age < clock.span) return { span: Math.max(clock.span, span), age: clock.age };
  return clock;
}

export function createHolds(): Holds {
  const clocks: Map<number, HoldClock> = new Map<number, HoldClock>();
  return {
    hold(id: number, span: number): void {
      const next: HoldClock | undefined = rehold(clocks.get(id), span);
      if (next !== undefined) clocks.set(id, next);
    },
    rate(id: number): number {
      const clock: HoldClock | undefined = clocks.get(id);
      return clock === undefined ? 1 : holdRate(clock);
    },
    step(dt: number): void {
      for (const [id, clock] of clocks) {
        const next: HoldClock = { span: clock.span, age: clock.age + dt };
        if (settled(next)) clocks.delete(id);
        else clocks.set(id, next);
      }
    },
    forget(id: number): void {
      clocks.delete(id);
    },
    clear(): void {
      clocks.clear();
    },
  };
}

export function rippleDelays(fallen: readonly Fallen[], origin: Vec2): ReadonlyMap<number, number> {
  const reach: number[] = fallen.map((one: Fallen): number => Math.hypot(one.pos.x - origin.x, one.pos.z - origin.z));
  const nearest: number = Math.min(...reach);
  const delays: Map<number, number> = new Map<number, number>();
  fallen.forEach((one: Fallen, index: number): void => {
    const distance: number = reach[index] ?? nearest;
    delays.set(one.id, Math.min(RIPPLE.max, Math.max(0, distance - nearest) * RIPPLE.perMetre));
  });
  return delays;
}

export function createLater<T>(): Later<T> {
  let waiting: Waiting<T>[] = [];
  return {
    add(delay: number, item: T): void {
      waiting.push({ item, left: Math.max(0, delay) });
    },
    take(dt: number): T[] {
      const due: T[] = [];
      const still: Waiting<T>[] = [];
      for (const entry of waiting) {
        entry.left -= dt;
        if (entry.left <= 0) due.push(entry.item);
        else still.push(entry);
      }
      waiting = still;
      return due;
    },
    drop(keep: (item: T) => boolean): void {
      waiting = waiting.filter((entry: Waiting<T>): boolean => keep(entry.item));
    },
    clear(): void {
      waiting = [];
    },
  };
}
