function lockLandscape(): undefined {
  const orientation: unknown = Reflect.get(screen, 'orientation');
  if (orientation === null || typeof orientation !== 'object') return undefined;
  const lock: unknown = Reflect.get(orientation, 'lock');
  if (typeof lock !== 'function') return undefined;
  const locking: unknown = Reflect.apply(lock, orientation, ['landscape']);
  if (locking instanceof Promise) locking.catch(ignore);
  return undefined;
}

function ignore(): undefined {
  return undefined;
}

export function enterLandscapeFullscreen(): void {
  const root: HTMLElement = document.documentElement;
  if (document.fullscreenElement !== null || typeof root.requestFullscreen !== 'function') return;
  root.requestFullscreen({ navigationUI: 'hide' }).then(lockLandscape, ignore);
}
