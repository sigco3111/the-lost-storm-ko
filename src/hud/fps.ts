import { el, setText } from './dom.ts';
import type { FrameMeter, FrameReading, FrameView } from './frame-meter.ts';
import { createFrameMeter, describeFrames, FRAME_METER } from './frame-meter.ts';

export interface FpsReadout {
  frame(now: number, view: FrameView): void;
  setVisible(visible: boolean): void;
  readInput(source: () => string): void;
}

export function createFpsReadout(parent: HTMLElement, tier: () => string): FpsReadout {
  const element: HTMLDivElement = el('div', 'hud-fps', parent);
  const rate: HTMLSpanElement = el('span', 'hud-fps-rate', element);
  const quality: HTMLSpanElement = el('span', 'hud-fps-tier', element);
  const input: HTMLSpanElement = el('span', 'hud-fps-input', element);
  let inputSource: (() => string) | null = null;
  const meter: FrameMeter = createFrameMeter();
  let visible: boolean = false;
  let shownAt: number = -Infinity;
  return {
    setVisible(next: boolean): void {
      visible = next;
      element.classList.toggle('shown', next);
    },
    readInput(source: () => string): void {
      inputSource = source;
    },
    frame(now: number, view: FrameView): void {
      meter.frame(now, view);
      if (!visible || now - shownAt < FRAME_METER.updateMs) return;
      if (inputSource !== null) setText(input, inputSource(), false);
      const reading: FrameReading | null = meter.reading(now);
      if (reading === null) return;
      shownAt = now;
      setText(rate, describeFrames(reading), false);
      setText(quality, tier(), false);
    },
  };
}
