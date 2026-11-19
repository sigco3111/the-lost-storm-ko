import { arrange, el, setAttr, setClass, setText } from '../hud/dom.ts';
import { listenForPicks, PICK } from './board-view.ts';
import { arrivalsText, moreText, onlineText, presentLevelText } from './lobby-model.ts';
import type { PresentRow, PresentView } from './lobby-model.ts';

export interface OnlineList {
  show(count: number, view: PresentView | null): void;
  close(): void;
  isOpen(): boolean;
}

export const ONLINE_LIST: { readonly leaveMs: number; readonly closeKey: string; readonly label: string } = {
  leaveMs: 520,
  closeKey: 'Escape',
  label: '접속 중인 이들',
};

interface RowParts {
  readonly item: HTMLLIElement;
  readonly name: HTMLSpanElement;
  readonly place: HTMLSpanElement;
  readonly level: HTMLSpanElement;
}

function makeRow(list: HTMLOListElement, pickable: boolean): RowParts {
  const item: HTMLLIElement = el('li', 'present-row entering', list);
  if (pickable) {
    item.classList.add(PICK.className);
    item.tabIndex = 0;
  }
  el('span', 'board-dot on', item);
  const name: HTMLSpanElement = el('span', 'present-name', item);
  const place: HTMLSpanElement = el('span', 'present-place', item);
  const level: HTMLSpanElement = el('span', 'present-level', item);
  return { item, name, place, level };
}

function fill(parts: RowParts, row: PresentRow, animate: boolean): void {
  setText(parts.name, row.name, false);
  setText(parts.place, row.furthest, animate);
  setText(parts.level, presentLevelText(row.level), animate);
  setClass(parts.item, 'you', row.own);
}

export function createOnlineList(head: HTMLElement, panel: HTMLElement, pick: ((name: string) => void) | null): OnlineList {
  const button: HTMLButtonElement = el('button', 'lobby-online', head);
  button.type = 'button';
  button.disabled = true;
  button.setAttribute('aria-expanded', 'false');
  el('i', 'lobby-online-dot', button);
  const count: HTMLSpanElement = el('span', 'lobby-online-count', button);
  const sheet: HTMLDivElement = el('div', 'lobby-present', panel);
  sheet.setAttribute('role', 'region');
  sheet.setAttribute('aria-label', ONLINE_LIST.label);
  const body: HTMLDivElement = el('div', 'present-body', sheet);
  const list: HTMLOListElement = el('ol', 'present-list', body);
  const more: HTMLDivElement = el('div', 'present-note', body);
  const arrivals: HTMLDivElement = el('div', 'present-note', body);
  const rows: Map<string, RowParts> = new Map<string, RowParts>();
  const names: Map<Element, string> = new Map<Element, string>();
  if (pick !== null) listenForPicks(list, names, pick);
  let open: boolean = false;
  let listable: boolean = false;

  const setOpen = (next: boolean): void => {
    open = next && listable;
    setClass(sheet, 'open', open);
    setClass(button, 'open', open);
    setAttr(button, 'aria-expanded', open ? 'true' : 'false');
  };

  const leave = (parts: RowParts, top: number): void => {
    parts.item.classList.add('leaving');
    parts.item.style.top = `${top}px`;
    window.setTimeout((): void => {
      parts.item.remove();
    }, ONLINE_LIST.leaveMs);
  };

  const render = (view: PresentView): void => {
    const before: Map<HTMLLIElement, number> = new Map<HTMLLIElement, number>();
    for (const parts of rows.values()) before.set(parts.item, parts.item.offsetTop);
    const keep: Set<string> = new Set<string>(view.rows.map((row: PresentRow): string => row.name));
    for (const [name, parts] of rows) {
      if (keep.has(name)) continue;
      rows.delete(name);
      names.delete(parts.item);
      leave(parts, before.get(parts.item) ?? 0);
    }
    const arrived: RowParts[] = [];
    const order: HTMLLIElement[] = [];
    for (const row of view.rows) {
      const existing: RowParts | undefined = rows.get(row.name);
      const parts: RowParts = existing ?? makeRow(list, pick !== null);
      if (existing === undefined) arrived.push(parts);
      rows.set(row.name, parts);
      names.set(parts.item, row.name);
      fill(parts, row, existing !== undefined && open);
      order.push(parts.item);
    }
    arrange(list, order);
    if (view.more > 0) setText(more, moreText(view.more), open);
    setClass(more, 'shown', view.more > 0);
    if (view.visitors > 0) setText(arrivals, arrivalsText(view.visitors), open);
    setClass(arrivals, 'shown', view.visitors > 0);
    const slid: RowParts[] = [];
    for (const parts of rows.values()) {
      const from: number | undefined = before.get(parts.item);
      const delta: number = from === undefined ? 0 : from - parts.item.offsetTop;
      if (delta === 0) continue;
      parts.item.classList.add('flip');
      parts.item.style.transform = `translateY(${delta}px)`;
      slid.push(parts);
    }
    const target: number = list.offsetHeight + more.offsetHeight + arrivals.offsetHeight;
    sheet.style.setProperty('--present-height', `${target}px`);
    sheet.getBoundingClientRect();
    for (const parts of slid) {
      parts.item.classList.remove('flip');
      parts.item.style.transform = '';
    }
    for (const parts of arrived) parts.item.classList.remove('entering');
  };

  button.addEventListener('click', (): void => {
    setOpen(!open);
  });

  document.addEventListener(
    'pointerdown',
    (event: PointerEvent): void => {
      if (!open || !(event.target instanceof Node)) return;
      if (button.contains(event.target) || sheet.contains(event.target)) return;
      setOpen(false);
    },
    { capture: true },
  );

  window.addEventListener(
    'keydown',
    (event: KeyboardEvent): void => {
      if (!open || event.code !== ONLINE_LIST.closeKey) return;
      setOpen(false);
      event.stopImmediatePropagation();
    },
    { capture: true },
  );

  return {
    show(total: number, view: PresentView | null): void {
      setClass(button, 'shown', total > 0);
      setText(count, onlineText(total), true);
      listable = view !== null && total > 0;
      button.disabled = !listable;
      setClass(button, 'listable', listable);
      if (view !== null) render(view);
      if (!listable) setOpen(false);
    },
    close(): void {
      setOpen(false);
    },
    isOpen(): boolean {
      return open;
    },
  };
}
