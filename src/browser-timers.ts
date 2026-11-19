import type { Timers } from './backend/backend.ts';
import type { FrameSource } from './bounded-wait.ts';
import type { FrameClock, FrameScheduler } from './frame-loop.ts';

export function createBrowserTimers(): Timers {
  return {
    after: (ms: number, task: () => void): (() => void) => {
      const handle: number = window.setTimeout(task, ms);
      return (): void => {
        window.clearTimeout(handle);
      };
    },
  };
}

export function createBrowserFrames(): FrameSource {
  return {
    request: (callback: () => void): void => {
      requestAnimationFrame((): void => callback());
    },
  };
}

export function createBrowserScheduler(): FrameScheduler {
  return {
    request: (callback: (now: number) => void): void => {
      requestAnimationFrame(callback);
    },
  };
}

export function createBrowserFrameClock(): FrameClock {
  return { timers: createBrowserTimers(), now: (): number => performance.now() };
}
