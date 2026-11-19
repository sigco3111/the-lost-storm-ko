import { PERF_PROTOCOL } from '../backend/api.ts';
import type { PerfEnd, PerfWindowBody } from '../backend/api.ts';

export const FRAME_SAMPLER = {
  windowMs: 60_000,
  minFrames: 10,
  fineMs: 100,
  coarseStepMs: 10,
  coarseMaxMs: 1000,
  slowMs: 50,
  measureEveryMs: 1000,
  tenths: 10,
  hundredths: 100,
  quantiles: [0.5, 0.95, 0.99],
} as const;

export type PerfEvent = 'lost' | 'restored' | 'rearm' | 'offer';

export interface RenderSample {
  readonly draws: number;
  readonly triangles: number;
  readonly textures: number;
  readonly geometries: number;
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface FrameSampler {
  frame(now: number, live: boolean, zone: string, monsters: number): void;
  wantsMeasure(now: number): boolean;
  measured(sample: RenderSample): void;
  note(event: PerfEvent): void;
  hidden(): void;
  end(now: number, reason: PerfEnd): void;
}

const COARSE_BUCKETS: number = (FRAME_SAMPLER.coarseMaxMs - FRAME_SAMPLER.fineMs) / FRAME_SAMPLER.coarseStepMs;
const FINE_BUCKETS: number = FRAME_SAMPLER.fineMs + COARSE_BUCKETS + 1;
const OVERFLOW: number = FINE_BUCKETS - 1;
const EDGES: readonly number[] = PERF_PROTOCOL.histogramEdgesMs;

export function fineIndex(ms: number): number {
  if (ms < FRAME_SAMPLER.fineMs) return Math.max(0, Math.floor(ms));
  if (ms < FRAME_SAMPLER.coarseMaxMs) return FRAME_SAMPLER.fineMs + Math.floor((ms - FRAME_SAMPLER.fineMs) / FRAME_SAMPLER.coarseStepMs);
  return OVERFLOW;
}

function fineLow(index: number): number {
  return index < FRAME_SAMPLER.fineMs ? index : FRAME_SAMPLER.fineMs + (index - FRAME_SAMPLER.fineMs) * FRAME_SAMPLER.coarseStepMs;
}

function fineWidth(index: number): number {
  return index < FRAME_SAMPLER.fineMs ? 1 : FRAME_SAMPLER.coarseStepMs;
}

function protocolBucket(low: number): number {
  const found: number = EDGES.findIndex((edge: number): boolean => low < edge);
  return found === -1 ? EDGES.length : found;
}

function tenths(value: number): number {
  return Math.round(value * FRAME_SAMPLER.tenths) / FRAME_SAMPLER.tenths;
}

export function fineQuantile(fine: Uint32Array, frames: number, quantile: number, worst: number): number {
  const wanted: number = Math.max(1, Math.ceil(frames * quantile));
  let seen: number = 0;
  for (let index: number = 0; index < fine.length; index += 1) {
    seen += fine[index] ?? 0;
    if (seen >= wanted) return index === OVERFLOW ? worst : Math.min(worst, fineLow(index) + fineWidth(index) / 2);
  }
  return worst;
}

export function protocolHistogram(fine: Uint32Array): number[] {
  const histogram: number[] = Array.from({ length: EDGES.length + 1 }, (): number => 0);
  for (let index: number = 0; index < fine.length; index += 1) {
    const count: number = fine[index] ?? 0;
    if (count === 0) continue;
    const bucket: number = index === OVERFLOW ? EDGES.length : protocolBucket(fineLow(index));
    histogram[bucket] = (histogram[bucket] ?? 0) + count;
  }
  return histogram;
}

interface Events {
  lost: number;
  restored: number;
  rearm: number;
  offer: number;
}

const NO_RENDER: RenderSample = { draws: 0, triangles: 0, textures: 0, geometries: 0, width: 0, height: 0, pixelRatio: 0 };

export function createFrameSampler(emit: (window: PerfWindowBody) => void): FrameSampler {
  const fine: Uint32Array = new Uint32Array(FINE_BUCKETS);
  const over: Uint32Array = new Uint32Array(PERF_PROTOCOL.overMs.length);
  const events: Events = { lost: 0, restored: 0, rearm: 0, offer: 0 };
  let zone: string | null = null;
  let last: number | null = null;
  let frames: number = 0;
  let spent: number = 0;
  let worst: number = 0;
  let run: number = 0;
  let longestRun: number = 0;
  let monstersPeak: number = 0;
  let hiddenSeen: boolean = false;
  let draws: number = 0;
  let triangles: number = 0;
  let render: RenderSample = NO_RENDER;
  let measuredAt: number = -Infinity;

  const reset = (): void => {
    fine.fill(0);
    over.fill(0);
    frames = 0;
    spent = 0;
    worst = 0;
    run = 0;
    longestRun = 0;
    monstersPeak = 0;
    hiddenSeen = false;
    draws = 0;
    triangles = 0;
  };

  const close = (now: number, reason: PerfEnd): void => {
    const current: string | null = zone;
    if (current === null || frames < FRAME_SAMPLER.minFrames) {
      reset();
      return;
    }
    const [p50 = 0, p95 = 0, p99 = 0] = FRAME_SAMPLER.quantiles.map((quantile: number): number => tenths(fineQuantile(fine, frames, quantile, worst)));
    emit({
      at: Math.max(0, Math.round(now)),
      end: reason,
      zone: current,
      ms: Math.round(spent),
      frames,
      histogram: protocolHistogram(fine),
      p50,
      p95,
      p99,
      worst: tenths(worst),
      over: Array.from(over),
      stallMs: tenths(longestRun),
      monsters: monstersPeak,
      hidden: hiddenSeen || reason === 'hidden',
      draws,
      triangles,
      textures: render.textures,
      geometries: render.geometries,
      canvas: [render.width, render.height],
      pixelRatio: Math.round(render.pixelRatio * FRAME_SAMPLER.hundredths) / FRAME_SAMPLER.hundredths,
      lost: events.lost,
      restored: events.restored,
      rearms: events.rearm,
      offers: events.offer,
    });
    events.lost = 0;
    events.restored = 0;
    events.rearm = 0;
    events.offer = 0;
    reset();
  };

  return {
    frame(now: number, live: boolean, inZone: string, monsters: number): void {
      if (!live) {
        last = null;
        return;
      }
      if (zone !== inZone) {
        if (zone !== null) close(now, 'zone');
        zone = inZone;
      }
      const previous: number | null = last;
      last = now;
      if (monsters > monstersPeak) monstersPeak = monsters;
      if (previous === null) return;
      const ms: number = now - previous;
      if (ms <= 0) return;
      const bucket: number = fineIndex(ms);
      fine[bucket] = (fine[bucket] ?? 0) + 1;
      for (let index: number = 0; index < over.length; index += 1) if (ms > (PERF_PROTOCOL.overMs[index] ?? Infinity)) over[index] = (over[index] ?? 0) + 1;
      if (ms > worst) worst = ms;
      run = ms > FRAME_SAMPLER.slowMs ? run + ms : 0;
      if (run > longestRun) longestRun = run;
      frames += 1;
      spent += ms;
      if (spent >= FRAME_SAMPLER.windowMs) close(now, 'time');
    },
    wantsMeasure(now: number): boolean {
      if (last === null || now - measuredAt < FRAME_SAMPLER.measureEveryMs) return false;
      measuredAt = now;
      return true;
    },
    measured(sample: RenderSample): void {
      render = sample;
      if (sample.draws > draws) draws = sample.draws;
      if (sample.triangles > triangles) triangles = sample.triangles;
    },
    note(event: PerfEvent): void {
      events[event] += 1;
    },
    hidden(): void {
      hiddenSeen = true;
      last = null;
    },
    end(now: number, reason: PerfEnd): void {
      last = null;
      close(now, reason);
    },
  };
}
