import { connectionType, fillSources, MEDIA, reducedMotion, saveData, shouldStream, syncPlayback } from './media-play.ts';

function showWhenDecoded(video: HTMLVideoElement, poster: string): void {
  const still: HTMLImageElement = new Image();
  still.src = poster;
  const show = (): void => video.classList.add(MEDIA.shownClass);
  still.decode().then(show, show);
}

function mountClip(video: HTMLVideoElement, stream: boolean): void {
  let onScreen: boolean = false;
  let near: boolean = false;
  const sync = (): void => syncPlayback(video, { onScreen, tabHidden: document.hidden, reducedMotion: !stream });
  let streaming: boolean = false;
  const arrive = (): void => {
    if (near) return;
    near = true;
    const poster: string = video.dataset['poster'] ?? '';
    if (poster !== '') {
      video.poster = poster;
      showWhenDecoded(video, poster);
    }
    if (!stream) video.classList.add(MEDIA.shownClass);
  };
  const begin = (): void => {
    arrive();
    if (streaming || !stream) return;
    streaming = true;
    fillSources(video);
    video.addEventListener('playing', (): void => video.classList.add(MEDIA.shownClass), { once: true });
  };
  new IntersectionObserver(
    (entries: IntersectionObserverEntry[], observer: IntersectionObserver): void => {
      if (!entries.some((entry: IntersectionObserverEntry): boolean => entry.isIntersecting)) return;
      arrive();
      observer.disconnect();
    },
    { rootMargin: MEDIA.nearMargin },
  ).observe(video);
  if (!stream) return;
  new IntersectionObserver(
    (entries: IntersectionObserverEntry[]): void => {
      if (entries.some((entry: IntersectionObserverEntry): boolean => entry.isIntersecting)) begin();
      onScreen = entries.some((entry: IntersectionObserverEntry): boolean => entry.isIntersecting && entry.intersectionRatio >= MEDIA.playShare);
      sync();
    },
    { threshold: [0, MEDIA.playShare, 1] },
  ).observe(video);
  document.addEventListener('visibilitychange', sync);
}

export function mountClips(root: ParentNode): void {
  const stream: boolean = shouldStream(reducedMotion(), saveData(), connectionType());
  for (const video of root.querySelectorAll<HTMLVideoElement>('video.clip-video')) mountClip(video, stream);
}
