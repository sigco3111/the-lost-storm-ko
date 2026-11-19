import type { Timers } from '../backend/backend.ts';
import { KEY_MOVE_HINT } from '../key-move-hint.ts';
import { el } from './dom.ts';
import keyMoveCss from './key-move-line.css?inline';

export const KEY_MOVE_LINE = {
  lineClass: 'key-move-line',
  shownClass: 'on',
  hudClass: 'key-move-on',
  showMs: 5000,
} as const;

export interface KeyMoveLine {
  show(): void;
}

export function createKeyMoveLine(parent: HTMLElement, hud: HTMLElement, timers: Timers): KeyMoveLine {
  el('style', '', parent).textContent = keyMoveCss;
  const line: HTMLDivElement = el('div', KEY_MOVE_LINE.lineClass, parent);
  line.setAttribute('role', 'status');
  line.textContent = KEY_MOVE_HINT.text;
  let cancel: (() => void) | null = null;
  const set = (on: boolean): void => {
    line.classList.toggle(KEY_MOVE_LINE.shownClass, on);
    hud.classList.toggle(KEY_MOVE_LINE.hudClass, on);
  };
  return {
    show(): void {
      cancel?.();
      set(true);
      cancel = timers.after(KEY_MOVE_LINE.showMs, (): void => {
        cancel = null;
        set(false);
      });
    },
  };
}
