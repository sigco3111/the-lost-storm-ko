import type { ItemInstance, World } from '../../sim/world/types.ts';
import type { HudContext, PanelView } from './context.ts';
import { el, label, setText } from './dom.ts';
import type { ItemCell } from './item-cell.ts';
import { createItemCell, showItem } from './item-cell.ts';
import { promptText, use } from './prompts.ts';
import type { ScrollFade } from './scroll-fade.ts';
import { watchScrollFade } from './scroll-fade.ts';

const STASH = {
  hint: 'take',
} as const;

export function createStashPanel(parent: HTMLElement, context: HudContext): PanelView {
  const element: HTMLDivElement = el('div', 'hud-panel right beside trade-panel stash-panel', parent);
  element.dataset['tab'] = '보관함';
  element.addEventListener('contextmenu', (event: MouseEvent): void => {
    event.preventDefault();
  });
  const head: HTMLDivElement = el('div', 'trade-head', element);
  label('panel-title', '보관함', head);
  const tally: HTMLDivElement = label('trade-role', '', head);
  const scroll: HTMLDivElement = el('div', 'stash-scroll', element);
  const fade: ScrollFade = watchScrollFade(scroll);
  const grid: HTMLDivElement = el('div', 'inv-grid stash-grid', scroll);
  const cells: ItemCell[] = Array.from({ length: context.api.world.content.trade.stashSize }, (_: unknown, index: number): ItemCell => {
    const view: ItemCell = createItemCell(context, grid, (): string => promptText(context.api.touch, use(STASH.hint)));
    const take = (): void => {
      if (view.current === null) return;
      context.tooltip.hide();
      context.api.send({ type: 'trade', action: { type: 'unstash', index } });
    };
    view.cell.addEventListener('click', take);
    view.cell.addEventListener('contextmenu', take);
    return view;
  });

  return {
    element,
    refresh(): void {
      const world: World = context.api.world;
      let changed: boolean = false;
      for (const [index, view] of cells.entries()) {
        if (showItem(context, view, world.stash[index] ?? null)) changed = true;
      }
      const used: number = world.stash.filter((item: ItemInstance | null): boolean => item !== null).length;
      setText(tally, `${used} / ${world.stash.length}`, changed);
      if (changed) {
        context.tooltip.hide();
        fade.update();
      }
    },
  };
}
