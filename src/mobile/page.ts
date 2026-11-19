import type { DeviceFacts } from './quality.ts';

export const PAGE = {
  scrollable: '.hud-panel, .pause-card, #title',
} as const;

export function readDeviceFacts(): DeviceFacts {
  const memory: unknown = Reflect.get(navigator, 'deviceMemory');
  const cores: number = navigator.hardwareConcurrency;
  return {
    search: window.location.search,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    shortSide: Math.min(window.innerWidth, window.innerHeight),
    longSide: Math.max(window.innerWidth, window.innerHeight),
    deviceMemory: typeof memory === 'number' && memory > 0 ? memory : null,
    cores: cores > 0 ? cores : null,
  };
}

function stop(event: Event): void {
  event.preventDefault();
}

export function holdPageStill(): void {
  document.addEventListener('gesturestart', stop);
  document.addEventListener('gesturechange', stop);
  document.addEventListener('gestureend', stop);
  document.addEventListener('dblclick', stop);
  document.addEventListener(
    'touchmove',
    (event: TouchEvent): void => {
      const target: EventTarget | null = event.target;
      if (target instanceof Element && target.closest(PAGE.scrollable) !== null) return;
      event.preventDefault();
    },
    { passive: false },
  );
}
