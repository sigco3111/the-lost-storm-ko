import { warnInConsole } from './backend/console-log.ts';
import { createBrowserFrameClock, createBrowserScheduler, createBrowserTimers } from './browser-timers.ts';
import { runFrames } from './frame-loop.ts';
import type { FrameLoop } from './frame-loop.ts';
import type { WatchEffect } from './frame-watch.ts';
import { createStallNotice } from './hud/stall-notice.ts';
import type { StallNotice } from './hud/stall-notice.ts';
import { startStallWatch } from './stall-watch.ts';
import type { StallWatch } from './stall-watch.ts';

export interface FrameKeeperDeps {
  readonly hud: HTMLElement;
  frame(now: number): void;
  fault(error: unknown): void;
  inPlay(): boolean;
  hidden(): void;
  resumed(): void;
  noted(effect: WatchEffect): void;
}

export interface FrameKeeper {
  stepped(): void;
}

const WATCH_NOTES: Readonly<Record<WatchEffect, string>> = {
  rearm: 'The world stopped stepping in play; re-arming the frame loop',
  offer: 'The world is still not stepping; offering Resume',
  clear: 'The world is stepping again',
};

export function keepFrames(deps: FrameKeeperDeps): FrameKeeper {
  const rearm = (): void => {
    deps.resumed();
    loop.rearm();
  };
  const notice: StallNotice = createStallNotice(deps.hud, (): void => watch.resume());
  const watch: StallWatch = startStallWatch({
    timers: createBrowserTimers(),
    now: (): number => performance.now(),
    watching: (): boolean => deps.inPlay() && document.visibilityState === 'visible',
    rearm,
    offer: (): void => notice.show(),
    clear: (): void => notice.hide(),
    report: (effect: WatchEffect): void => {
      warnInConsole(WATCH_NOTES[effect]);
      deps.noted(effect);
    },
  });
  const loop: FrameLoop = runFrames((now: number): void => deps.frame(now), (error: unknown): void => deps.fault(error), createBrowserScheduler(), createBrowserFrameClock());
  document.addEventListener('visibilitychange', (): void => {
    if (document.hidden) {
      deps.hidden();
      return;
    }
    watch.reset();
    rearm();
  });
  return { stepped: (): void => watch.stepped() };
}
