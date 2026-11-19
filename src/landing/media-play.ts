export interface PlayState {
  readonly onScreen: boolean;
  readonly tabHidden: boolean;
  readonly reducedMotion: boolean;
}

export const MEDIA = {
  nearMargin: '400px 0px',
  slowConnections: ['slow-2g', '2g', '3g'],
  playShare: 0.35,
  shownClass: 'shown',
  onClass: 'on',
  reducedQuery: '(prefers-reduced-motion: reduce)',
} as const;

export function shouldPlay(state: PlayState): boolean {
  return state.onScreen && !state.tabHidden && !state.reducedMotion;
}

export function shouldStream(reduced: boolean, sparing: boolean, connection?: string): boolean {
  return !reduced && !sparing && !MEDIA.slowConnections.some((slow: string): boolean => slow === connection);
}

export function fillSources(video: HTMLVideoElement): boolean {
  let filled: boolean = false;
  for (const source of video.querySelectorAll<HTMLSourceElement>('source[data-src]')) {
    const src: string = source.dataset['src'] ?? '';
    if (src === '') continue;
    source.src = src;
    source.removeAttribute('data-src');
    filled = true;
  }
  if (filled) video.load();
  return filled;
}

export function reducedMotion(): boolean {
  return window.matchMedia(MEDIA.reducedQuery).matches;
}

interface ReaderConnection {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

function hasConnection(value: unknown): value is { readonly connection: ReaderConnection } {
  return typeof value === 'object' && value !== null && 'connection' in value && typeof value.connection === 'object' && value.connection !== null;
}

export function saveData(): boolean {
  return hasConnection(navigator) && navigator.connection.saveData === true;
}

export function connectionType(): string | undefined {
  return hasConnection(navigator) ? navigator.connection.effectiveType : undefined;
}

export function syncPlayback(video: HTMLVideoElement, state: PlayState): void {
  if (shouldPlay(state)) {
    video.play().catch((): void => undefined);
    return;
  }
  video.pause();
}
