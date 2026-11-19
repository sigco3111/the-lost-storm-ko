export const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;

export function unlockOnInput(target: EventTarget, unlock: () => void, done: () => boolean): void {
  const listening: AbortController = new AbortController();
  const heard = (): void => {
    unlock();
    if (done()) listening.abort();
  };
  for (const type of UNLOCK_EVENTS) target.addEventListener(type, heard, { capture: true, passive: true, signal: listening.signal });
}
