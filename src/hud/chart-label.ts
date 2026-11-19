import type { FrameLabel, FrameTargets } from './chart-frame.ts';
import type { ChartPoint } from './chart-model.ts';
import type { WeaponGroup } from '../../sim/content/types.ts';
import { el, label } from './dom.ts';
import { familyRow } from './weapon-family.ts';

export interface NameView extends FrameLabel {
  measure(): void;
  mark(state: string, on: boolean): void;
}

export function createNameView(host: HTMLElement, text: string, tint: string, at: ChartPoint, family: WeaponGroup | null, className: string = 'chart-path-name', pins: boolean = true): NameView {
  const name: HTMLDivElement = el('div', className, host);
  label('chart-path-title', text, name);
  if (family !== null) familyRow(family, 'chart-path-family', family.name, name);
  name.style.setProperty('--tint', tint);
  let half: ChartPoint = { x: 0, y: 0 };
  let pinnedNow: boolean = false;
  let transformNow: string = '';
  return {
    at,
    pins,
    get halfWidth(): number {
      return half.x;
    },
    get halfHeight(): number {
      return half.y;
    },
    measure(): void {
      half = { x: name.offsetWidth / 2, y: name.offsetHeight / 2 };
    },
    mark(state: string, on: boolean): void {
      name.classList.toggle(state, on);
    },
    place(transform: string, pinned: boolean): void {
      if (transform !== transformNow) {
        transformNow = transform;
        name.style.transform = transform;
      }
      if (pinned !== pinnedNow) {
        pinnedNow = pinned;
        name.classList.toggle('pinned', pinned);
      }
    },
  };
}

export function createFrameTargets(board: HTMLElement, labels: readonly NameView[]): FrameTargets {
  return {
    labels,
    moveBoard: (transform: string): void => {
      board.style.transform = transform;
    },
  };
}
