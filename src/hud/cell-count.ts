import { el, retrigger } from './dom.ts';

export type CountChange = 'none' | 'show' | 'hide' | 'tick';

export function countChange(shown: number, next: number): CountChange {
  if (shown === next) return 'none';
  if (next <= 1) return shown <= 1 ? 'none' : 'hide';
  return shown <= 1 ? 'show' : 'tick';
}

export function heldText(count: number, size: number): string {
  return `${count}개 보유 · ${size}개까지 겹침`;
}

const shownCounts: WeakMap<HTMLElement, number> = new WeakMap<HTMLElement, number>();

export function setCount(cell: HTMLElement, count: number): void {
  const shown: number = shownCounts.get(cell) ?? 0;
  const change: CountChange = countChange(shown, count);
  shownCounts.set(cell, count);
  if (change === 'none') return;
  const existing: Element | null = cell.querySelector(':scope > .cell-count');
  const badge: HTMLElement = existing instanceof HTMLElement ? existing : el('div', 'cell-count', cell);
  if (change === 'hide') {
    badge.classList.remove('shown');
    return;
  }
  badge.textContent = String(count);
  badge.classList.add('shown');
  if (change === 'tick') retrigger(badge, 'tick');
}
