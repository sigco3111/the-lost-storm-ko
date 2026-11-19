import type { KeyValueStore } from '../backend/backend.ts';
import { el } from '../hud/dom.ts';
import { createBrowserStore } from '../storage.ts';
import { TITLE_SCREEN } from '../title-screen.ts';
import { rotateHintShows, TOUCH } from './touch-map.ts';

const ROTATE_HTML: string = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="10" y="4" width="12" height="24" rx="2"/><path d="M14.5 24.5h3"/></svg><div><b>Turn your phone sideways</b><span>The storm needs room.</span></div>';

export function startRotateHint(): void {
  const rotate: HTMLDivElement = el('div', 'tc-rotate', document.body);
  rotate.setAttribute('role', 'status');
  rotate.innerHTML = ROTATE_HTML;
  const portrait: MediaQueryList = window.matchMedia('(orientation: portrait)');
  let portraitSince: number = performance.now();
  const seenStore: KeyValueStore = createBrowserStore();
  let rotateDismissed: boolean = seenStore.read(TOUCH.rotateSeenKey) !== null;
  let rotateShown: boolean = false;
  let rotateTimer: number | undefined;
  const showRotate = (): void => {
    const shownFor: number = performance.now() - portraitSince;
    const on: boolean = rotateHintShows(portrait.matches, shownFor, rotateDismissed, document.body.classList.contains(TITLE_SCREEN.playingClass));
    rotate.classList.toggle('on', on);
    if (on && !rotateShown) {
      rotateShown = true;
      seenStore.write(TOUCH.rotateSeenKey, '1');
    }
    if (!on && rotateShown) rotateDismissed = true;
    window.clearTimeout(rotateTimer);
    if (on) rotateTimer = window.setTimeout(showRotate, TOUCH.rotateHintMs - shownFor);
  };
  portrait.addEventListener('change', (): void => {
    portraitSince = performance.now();
    showRotate();
  });
  rotate.addEventListener('pointerdown', (): void => {
    rotateDismissed = true;
    showRotate();
  });
  let wasPlaying: boolean = document.body.classList.contains(TITLE_SCREEN.playingClass);
  new MutationObserver((): void => {
    const playing: boolean = document.body.classList.contains(TITLE_SCREEN.playingClass);
    if (playing === wasPlaying) return;
    wasPlaying = playing;
    portraitSince = performance.now();
    showRotate();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  showRotate();
}
