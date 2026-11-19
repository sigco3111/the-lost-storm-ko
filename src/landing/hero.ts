import { connectionType, fillSources, MEDIA, reducedMotion, saveData, shouldStream, syncPlayback } from './media-play.ts';

export type HeroPick = 'man' | 'woman';

export const HERO = {
  fallback: 'man',
  startAfterLoadMs: 300,
} as const;

export function readPick(value: string | undefined): HeroPick {
  return value === 'woman' || value === 'man' ? value : HERO.fallback;
}

function fillStill(stage: HTMLElement, pick: HeroPick): void {
  const picture: HTMLElement | null = stage.querySelector<HTMLElement>(`[data-hero-still="${pick}"]`);
  if (picture === null) return;
  for (const source of picture.querySelectorAll<HTMLSourceElement>('source[data-srcset]')) {
    source.srcset = source.dataset['srcset'] ?? '';
    source.removeAttribute('data-srcset');
  }
  const img: HTMLImageElement | null = picture.querySelector<HTMLImageElement>('img[data-src]');
  if (img === null) return;
  img.src = img.dataset['src'] ?? '';
  img.removeAttribute('data-src');
}

function loopOf(stage: HTMLElement, pick: HeroPick): HTMLVideoElement | null {
  return stage.querySelector<HTMLVideoElement>(`video[data-hero-loop="${pick}"]`);
}

function afterLoad(start: () => void): void {
  const later = (): void => {
    window.setTimeout(start, HERO.startAfterLoadMs);
  };
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later, { once: true });
}

export function mountHero(stage: HTMLElement, picks: readonly HTMLButtonElement[]): void {
  const stream: boolean = shouldStream(reducedMotion(), saveData(), connectionType());
  let pick: HeroPick = readPick(stage.dataset['hero']);
  let onScreen: boolean = true;
  let started: boolean = false;

  const sync = (): void => {
    for (const choice of ['man', 'woman'] as const) {
      const video: HTMLVideoElement | null = loopOf(stage, choice);
      if (video !== null) syncPlayback(video, { onScreen: onScreen && choice === pick, tabHidden: document.hidden, reducedMotion: !stream });
    }
  };

  const startLoop = (choice: HeroPick): void => {
    const video: HTMLVideoElement | null = loopOf(stage, choice);
    if (video === null || !stream || !started) return;
    if (fillSources(video)) video.addEventListener('playing', (): void => video.classList.add(MEDIA.onClass), { once: true });
    sync();
  };

  const choose = (choice: HeroPick): void => {
    pick = choice;
    fillStill(stage, choice);
    stage.dataset['hero'] = choice;
    for (const button of picks) button.setAttribute('aria-pressed', String(readPick(button.dataset['pick']) === choice));
    startLoop(choice);
    sync();
  };

  for (const button of picks) {
    const choice: HeroPick = readPick(button.dataset['pick']);
    button.addEventListener('pointerenter', (): void => fillStill(stage, choice), { once: true });
    button.addEventListener('focus', (): void => fillStill(stage, choice), { once: true });
    button.addEventListener('click', (): void => choose(choice));
  }

  new IntersectionObserver((entries: IntersectionObserverEntry[]): void => {
    onScreen = entries.some((entry: IntersectionObserverEntry): boolean => entry.isIntersecting);
    sync();
  }).observe(stage);
  document.addEventListener('visibilitychange', sync);

  afterLoad((): void => {
    started = true;
    startLoop(pick);
  });
}
