import type { Timers } from './backend/backend.ts';

export const FRAME_LOOP = {
  fallbackMs: 200,
} as const;

function nothing(): void {}

export interface FrameScheduler {
  request(callback: (now: number) => void): void;
}

export interface FrameClock {
  readonly timers: Timers;
  now(): number;
}

export interface FrameLoop {
  rearm(): void;
}

export function runFrames(step: (now: number) => void, fault: (error: unknown) => void, scheduler: FrameScheduler, clock: FrameClock): FrameLoop {
  let faulted: boolean = false;
  let generation: number = 0;
  let cancelPending: () => void = nothing;
  const arm = (): void => {
    cancelPending();
    generation += 1;
    const mine: number = generation;
    const run = (now: number): void => {
      if (mine !== generation) return;
      generation += 1;
      cancelPending();
      tick(now);
    };
    cancelPending = clock.timers.after(FRAME_LOOP.fallbackMs, (): void => run(clock.now()));
    scheduler.request(run);
  };
  const tick = (now: number): void => {
    arm();
    try {
      step(now);
    } catch (error: unknown) {
      if (faulted) return;
      faulted = true;
      fault(error);
    }
  };
  arm();
  return { rearm: arm };
}
