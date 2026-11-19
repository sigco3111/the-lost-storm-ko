import type { ScreenRect } from './label-stack.ts';

export const PANEL_COVER = {
  openClass: 'open',
  panels: ['hud-panel', 'hud-dialogue', 'hideout-chat'],
  labels: '.exit-label, .npc-label, .loot-label, .player-label, .damage-number',
  coveredClass: 'under-panel',
} as const;

export function overlaps(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function underPanel(plate: ScreenRect, panels: readonly ScreenRect[]): boolean {
  if (plate.right <= plate.left || plate.bottom <= plate.top) return false;
  return panels.some((panel: ScreenRect): boolean => overlaps(plate, panel));
}

export interface PanelCover {
  cover(): void;
}

function rectOf(element: Element): ScreenRect {
  const box: DOMRect = element.getBoundingClientRect();
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
}

function isPanel(element: Element): boolean {
  return PANEL_COVER.panels.some((name: string): boolean => element.classList.contains(name));
}

function openPanels(opened: HTMLCollectionOf<Element>): ScreenRect[] {
  const panels: ScreenRect[] = [];
  for (const panel of opened) {
    if (!isPanel(panel)) continue;
    const rect: ScreenRect = rectOf(panel);
    if (rect.right > rect.left && rect.bottom > rect.top && getComputedStyle(panel).visibility !== 'hidden') panels.push(rect);
  }
  return panels;
}

export function createPanelCover(root: HTMLElement): PanelCover {
  const hidden: Set<Element> = new Set<Element>();
  const opened: HTMLCollectionOf<Element> = document.getElementsByClassName(PANEL_COVER.openClass);
  return {
    cover(): void {
      const panels: ScreenRect[] = openPanels(opened);
      if (panels.length === 0 && hidden.size === 0) return;
      for (const label of hidden) {
        if (!label.isConnected) hidden.delete(label);
      }
      for (const label of root.querySelectorAll(PANEL_COVER.labels)) {
        const covered: boolean = panels.length > 0 && underPanel(rectOf(label.firstElementChild ?? label), panels);
        if (covered === hidden.has(label)) continue;
        label.classList.toggle(PANEL_COVER.coveredClass, covered);
        if (covered) hidden.add(label);
        else hidden.delete(label);
      }
    },
  };
}
