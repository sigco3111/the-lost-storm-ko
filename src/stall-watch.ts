import type { Timers } from './backend/backend.ts';
import type { WatchEffect, WatchSignal, WatchState } from './frame-watch.ts';
import { FRAME_WATCH, nextWatch, startWatch } from './frame-watch.ts';

export interface StallWatchDeps {
  readonly timers: Timers;
  now(): number;
  watching(): boolean;
  rearm(): void;
  offer(): void;
  clear(): void;
  report(effect: WatchEffect): void;
}

export interface StallWatch {
  stepped(): void;
  resume(): void;
  reset(): void;
}

export function startStallWatch(deps: StallWatchDeps): StallWatch {
  let state: WatchState = startWatch(deps.now());
  const apply = (signal: WatchSignal): void => {
    const next = nextWatch(state, signal);
    state = next.state;
    for (const effect of next.effects) {
      deps.report(effect);
      switch (effect) {
        case 'rearm':
          deps.rearm();
          break;
        case 'offer':
          deps.offer();
          break;
        case 'clear':
          deps.clear();
          break;
      }
    }
  };
  const check = (): void => {
    apply({ type: 'check', at: deps.now(), watching: deps.watching() });
    deps.timers.after(FRAME_WATCH.checkMs, check);
  };
  deps.timers.after(FRAME_WATCH.checkMs, check);
  return {
    stepped: (): void => {
      if (state.phase === 'quiet') state = startWatch(deps.now());
      else apply({ type: 'stepped', at: deps.now() });
    },
    resume: (): void => apply({ type: 'resume', at: deps.now() }),
    reset: (): void => apply({ type: 'check', at: deps.now(), watching: false }),
  };
}
