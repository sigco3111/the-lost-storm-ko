export const BROWSER_NOTICES = {
  webgl: '이 브라우저는 게임을 그릴 수 없다. WebGL 2가 필요하다. 최신 Chrome, Edge, Firefox, Safari를 쓰거나 하드웨어 가속을 켜라.',
  old: '이 브라우저는 게임을 실행하기에 너무 오래됐다. 업데이트하거나 최신 Chrome, Edge, Firefox, Safari를 써라.',
  stopped: '폭풍을 끝까지 불러오지 못했다. 새로고침하면 대부분 해결된다.',
  reload: '새로고침',
} as const;

export const RETRY = {
  key: 'the-lost-storm.retried',
  mark: '1',
  started: 'started',
} as const;

export interface RetryStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BrowserProbe {
  readonly webgl2: boolean;
  readonly modernArrays: boolean;
}

export class UnsupportedBrowser extends Error {}

export function unsupportedReason(probe: BrowserProbe): string | null {
  if (!probe.modernArrays) return BROWSER_NOTICES.old;
  if (!probe.webgl2) return BROWSER_NOTICES.webgl;
  return null;
}

export function probeBrowser(scope: object, arrays: object): BrowserProbe {
  return { webgl2: 'WebGL2RenderingContext' in scope, modernArrays: ['toSorted', 'toReversed', 'findLast', 'at'].every((name: string): boolean => name in arrays) };
}

export function failureText(error: unknown): string {
  return error instanceof UnsupportedBrowser ? error.message : BROWSER_NOTICES.stopped;
}

export function reloadHelps(error: unknown): boolean {
  return !(error instanceof UnsupportedBrowser);
}

export function createdOrUnsupported<T>(create: () => T): T {
  try {
    return create();
  } catch {
    throw new UnsupportedBrowser(BROWSER_NOTICES.webgl);
  }
}

export function sessionStore(scope: { readonly sessionStorage: RetryStore }): RetryStore | null {
  try {
    return scope.sessionStorage;
  } catch {
    return null;
  }
}

export function claimRetry(store: RetryStore | null): boolean {
  if (store === null) return false;
  try {
    if (store.getItem(RETRY.key) !== null) return false;
    store.setItem(RETRY.key, RETRY.mark);
    return true;
  } catch {
    return false;
  }
}

export function clearRetry(store: RetryStore | null): void {
  try {
    store?.removeItem(RETRY.key);
  } catch {
    return;
  }
}
