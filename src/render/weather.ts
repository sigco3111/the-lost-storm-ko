import type { LightningKinds, ZoneLightning } from '../../sim/content/road-types.ts';
import type { StrikeKind, StrikePlan, StrikeSample } from './lightning.ts';
import { LIGHTNING, planStrike, sampleStrike } from './lightning.ts';

export const WEATHER = {
  deferral: 0.25,
  softPerSecond: 1,
  window: 1.15,
  forkShow: 0.12,
  swing: 0.2,
  margin: 0.01,
} as const;

export interface FlashLimiter {
  limit(value: number, now: number, most: number): number;
}

function dropBefore(times: number[], after: number): void {
  let kept: number = 0;
  for (const time of times) {
    if (time > after) {
      times[kept] = time;
      kept += 1;
    }
  }
  times.length = kept;
}

export function createFlashLimiter(): FlashLimiter {
  let trough: number = 0;
  let last: number = 0;
  let climbing: boolean = false;
  const times: number[] = [];
  return {
    limit(value: number, now: number, most: number): number {
      dropBefore(times, now - 1);
      const held: boolean = times.length >= most && !(climbing && value >= last);
      const shown: number = held ? Math.min(value, trough + WEATHER.swing - WEATHER.margin) : value;
      if (climbing && shown >= last) trough = shown;
      else {
        climbing = false;
        trough = Math.min(trough, shown);
      }
      if (shown - trough >= WEATHER.swing) {
        times.push(now);
        climbing = true;
        trough = shown;
      }
      last = shown;
      return shown;
    },
  };
}

export interface SkyFlash {
  readonly amount: number;
  readonly sheet: number;
  readonly dirX: number;
  readonly dirZ: number;
  readonly cool: number;
  readonly dip: number;
}

export interface Thunder {
  readonly kind: StrikeKind;
  readonly distance: number;
  readonly loudness: number;
}

export interface ForkBolt {
  readonly shown: number;
  readonly angle: number;
  readonly seed: number;
}

export interface Weather {
  update(dt: number): void;
  strike(power: number): void;
  pulse(power: number): void;
  setLightning(lightning: ZoneLightning | null): void;
  setSoft(soft: boolean): void;
  takeThunder(): Thunder[];
  readonly flash: number;
  readonly light: SkyFlash;
  readonly bolt: ForkBolt;
}

interface Waiting {
  readonly kind: StrikeKind;
  readonly power: number;
}

interface Running {
  readonly plan: StrikePlan;
  readonly start: number;
  thundered: boolean;
}

const DARK: SkyFlash = { amount: 0, sheet: 0, dirX: 0, dirZ: 0, cool: 0, dip: 0 };

export function pickKind(kinds: LightningKinds, roll: number): StrikeKind {
  const total: number = kinds.sheet + kinds.near + kinds.fork;
  const at: number = roll * total;
  if (at < kinds.sheet) return 'sheet';
  if (at < kinds.sheet + kinds.near) return 'near';
  return 'fork';
}

function isDark(light: SkyFlash, dip: number): boolean {
  return Object.is(light.amount, DARK.amount) && Object.is(light.sheet, DARK.sheet) && Object.is(light.dirX, DARK.dirX) && Object.is(light.dirZ, DARK.dirZ) && Object.is(light.cool, DARK.cool) && Object.is(light.dip, dip);
}

export function createWeather(random: () => number = Math.random): Weather {
  let now: number = 0;
  let lightning: ZoneLightning | null = null;
  let untilStrike: number = Number.POSITIVE_INFINITY;
  let clustered: number = 0;
  let soft: boolean = false;
  const running: Running[] = [];
  const deepTimes: number[] = [];
  let thunder: Thunder[] = [];
  let waiting: Waiting[] = [];
  const limiter: FlashLimiter = createFlashLimiter();
  let light: SkyFlash = DARK;
  let flash: number = 0;
  let bolt: ForkBolt = { shown: 0, angle: 0, seed: 0 };

  const budget = (): number => {
    dropBefore(deepTimes, now - WEATHER.window);
    return (soft ? WEATHER.softPerSecond : LIGHTNING.deepPerSecond) - deepTimes.length;
  };

  const begin = (kind: StrikeKind, power: number, start: number): void => {
    const plan: StrikePlan = planStrike(kind, random, { soft, power, budget: budget() });
    running.push({ plan, start, thundered: false });
    for (const time of plan.deepTimes) deepTimes.push(start + time);
    if (kind === 'fork') bolt = { shown: 0, angle: plan.angle, seed: random() };
  };

  const nextWait = (zone: ZoneLightning): number => {
    if (clustered + 1 < zone.cluster.most && random() < zone.cluster.chance) {
      clustered += 1;
      return zone.cluster.min + random() * (zone.cluster.max - zone.cluster.min);
    }
    clustered = 0;
    return zone.min + random() * (zone.max - zone.min);
  };

  const sampleAll = (): void => {
    let best: Running | null = null;
    let bestSample: StrikeSample = { light: 0, stroke: 0, dip: 0 };
    let dip: number = 0;
    let fork: number = 0;
    for (const entry of running) {
      const sample: StrikeSample = sampleStrike(entry.plan, now - entry.start);
      dip = Math.max(dip, sample.dip);
      if (entry.plan.kind === 'fork') fork = Math.max(fork, sample.stroke);
      if (sample.light > bestSample.light) {
        best = entry;
        bestSample = sample;
      }
    }
    flash = limiter.limit(soft ? Math.min(bestSample.light, LIGHTNING.softPeak) : bestSample.light, now, soft ? WEATHER.softPerSecond : LIGHTNING.deepPerSecond);
    const shown: number = fork > WEATHER.forkShow ? Math.min(1, fork * 1.5) : 0;
    if (!Object.is(bolt.shown, shown)) bolt = { ...bolt, shown };
    if (best === null) {
      if (!isDark(light, dip)) light = { ...DARK, dip };
      return;
    }
    const cool: number = bestSample.light > 0 ? bestSample.stroke / bestSample.light : 0;
    light = { amount: flash, sheet: best.plan.sheet, dirX: Math.cos(best.plan.angle), dirZ: Math.sin(best.plan.angle), cool, dip };
  };

  return {
    get flash(): number {
      return flash;
    },
    get light(): SkyFlash {
      return light;
    },
    get bolt(): ForkBolt {
      return bolt;
    },
    strike(power: number): void {
      waiting.push({ kind: 'moment', power });
    },
    pulse(power: number): void {
      waiting.push({ kind: 'pulse', power });
    },
    setLightning(next: ZoneLightning | null): void {
      lightning = next;
      clustered = 0;
      untilStrike = next === null ? Number.POSITIVE_INFINITY : next.first;
    },
    setSoft(next: boolean): void {
      soft = next;
    },
    takeThunder(): Thunder[] {
      const taken: Thunder[] = thunder;
      thunder = [];
      return taken;
    },
    update(dt: number): void {
      now += dt;
      untilStrike -= dt;
      if (waiting.length > 0) {
        const held: Waiting[] = [];
        for (const entry of waiting) {
          if (budget() > 0) begin(entry.kind, entry.power, now - dt);
          else held.push(entry);
        }
        waiting = held.slice(0, 1);
      }
      if (untilStrike <= 0 && lightning !== null) {
        if (budget() <= 0) untilStrike = WEATHER.deferral;
        else {
          begin(pickKind(lightning.kinds, random()), 1, now + untilStrike);
          untilStrike = nextWait(lightning);
        }
      }
      for (const entry of running) {
        if (entry.thundered || entry.plan.distance <= 0 || now - entry.start < entry.plan.thunderDelay) continue;
        entry.thundered = true;
        thunder.push({ kind: entry.plan.kind, distance: entry.plan.distance, loudness: Math.min(1, LIGHTNING.soundSpeed * 2 / entry.plan.distance) });
      }
      sampleAll();
      let kept: number = 0;
      for (const entry of running) {
        if (now - entry.start < Math.max(entry.plan.end, entry.plan.thunderDelay)) {
          running[kept] = entry;
          kept += 1;
        }
      }
      running.length = kept;
    },
  };
}
