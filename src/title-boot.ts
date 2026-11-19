import { element } from './dom-element.ts';
import { markInput, wireFolds } from './title-screen.ts';
import { startLaunch } from './launch/launch.ts';
import type { Launch } from './launch/launch.ts';
import type { MobileBoot } from './mobile/mobile.ts';
import { bootMobile } from './mobile/mobile.ts';
import { mountBackdrops } from './dither/mount.ts';
import { createBrowserTimers } from './browser-timers.ts';
import { createOverlayManager, cssMotionMs } from './hud/overlays.ts';
import type { OverlayManager } from './hud/overlays.ts';
import { createStatusLine } from './title-status.ts';
import type { StatusLine } from './title-status.ts';

export interface TitleBootDeps {
  readonly lines: { current: StatusLine | null };
  readonly serverUrl: string | undefined;
  readonly build: string | undefined;
  readonly inPlay: () => boolean;
}

export interface TitleBoot {
  readonly canvas: HTMLCanvasElement;
  readonly title: HTMLDivElement;
  readonly status: HTMLParagraphElement;
  readonly enter: HTMLButtonElement;
  readonly reset: HTMLButtonElement;
  readonly vignette: HTMLDivElement;
  readonly statusLine: StatusLine;
  readonly placeLine: StatusLine;
  readonly mobile: MobileBoot;
  readonly overlayManager: OverlayManager;
  readonly launch: Launch;
}

export function bootTitle(deps: TitleBootDeps): TitleBoot {
  mountBackdrops();
  const canvas: HTMLCanvasElement = element('scene', HTMLCanvasElement);
  const title: HTMLDivElement = element('title', HTMLDivElement);
  const status: HTMLParagraphElement = element('title-status', HTMLParagraphElement);
  const enter: HTMLButtonElement = element('title-enter', HTMLButtonElement);
  const reset: HTMLButtonElement = element('title-reset', HTMLButtonElement);
  const vignette: HTMLDivElement = element('vignette', HTMLDivElement);
  const titlePlace: HTMLParagraphElement = element('title-place', HTMLParagraphElement);
  const statusLine: StatusLine = createStatusLine<HTMLSpanElement>(status, (): HTMLSpanElement => document.createElement('span'), createBrowserTimers());
  deps.lines.current = statusLine;
  const placeLine: StatusLine = createStatusLine<HTMLSpanElement>(titlePlace, (): HTMLSpanElement => document.createElement('span'), createBrowserTimers());

  const mobile: MobileBoot = bootMobile();
  markInput(document.body, mobile.touch);
  wireFolds([{ button: element('title-controls-open', HTMLButtonElement), panel: element('title-controls', HTMLDivElement) }, { button: element('title-credits-open', HTMLButtonElement), panel: element('title-credits', HTMLDivElement) }], element('title-foot', HTMLElement));
  const overlayManager: OverlayManager = createOverlayManager({ body: document.body, timers: createBrowserTimers(), motionMs: (): number => cssMotionMs(document.documentElement), inPlay: deps.inPlay });
  const launch: Launch = startLaunch({ serverUrl: deps.serverUrl, build: deps.build, device: mobile.touch ? 'phone' : 'desktop', hud: element('hud', HTMLDivElement), title: element('title', HTMLDivElement), onEnd: (): void => void overlayManager.send({ type: 'interrupt', cause: 'endcard' }), quiet: (): boolean => !overlayManager.hasTop() });
  return { canvas, title, status, enter, reset, vignette, statusLine, placeLine, mobile, overlayManager, launch };
}
