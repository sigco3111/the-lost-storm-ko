import type { Timers } from './backend/backend.ts';

export const BOUNDED_WAIT = {
  frameMs: 250,
  settleMs: 1500,
  readyMs: 4000,
} as const;

export interface FrameSource {
  request(callback: () => void): void;
}

export function within(work: Promise<unknown>, timers: Timers, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve: (finished: boolean) => void): void => {
    let done: boolean = false;
    const finish = (finished: boolean): void => {
      if (done) return;
      done = true;
      cancel();
      resolve(finished);
    };
    const cancel: () => void = timers.after(ms, (): void => finish(false));
    work.then(
      (): void => finish(true),
      (): void => finish(true),
    );
  });
}

export function nextFrameWithin(frames: FrameSource, timers: Timers, ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    let done: boolean = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      cancel();
      resolve();
    };
    const cancel: () => void = timers.after(ms, finish);
    frames.request(finish);
  });
}

export async function framesWithin(frames: FrameSource, timers: Timers, count: number, ms: number): Promise<void> {
  if (count <= 0) return;
  await nextFrameWithin(frames, timers, ms);
  await framesWithin(frames, timers, count - 1, ms);
}
