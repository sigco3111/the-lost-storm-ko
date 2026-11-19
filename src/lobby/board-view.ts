import type { BoardRow, Ranking } from '../backend/api.ts';
import { arrange, el, setClass, setFlag, setText } from '../hud/dom.ts';
import { rankText, rankValueText } from './lobby-model.ts';

export interface BoardView {
  render(rows: readonly BoardRow[], you: string | null, by: Ranking): void;
}

interface RowParts {
  readonly item: HTMLLIElement;
  readonly rank: HTMLSpanElement;
  readonly dot: HTMLSpanElement;
  readonly name: HTMLSpanElement;
  readonly place: HTMLSpanElement;
  readonly account: HTMLSpanElement;
  readonly level: HTMLSpanElement;
}

export const BOARD_MOTION: { readonly leaveMs: number } = { leaveMs: 520 };

export const PICK: { readonly className: string; readonly keys: readonly string[] } = { className: 'profile-pick', keys: ['Enter', 'Space'] };

export function listenForPicks(list: HTMLElement, names: ReadonlyMap<Element, string>, pick: (name: string) => void): void {
  const chosen = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null;
    const row: Element | null = target.closest(`.${PICK.className}`);
    return row === null ? null : (names.get(row) ?? null);
  };
  list.addEventListener('click', (event: MouseEvent): void => {
    const name: string | null = chosen(event.target);
    if (name !== null) pick(name);
  });
  list.addEventListener('keydown', (event: KeyboardEvent): void => {
    if (!PICK.keys.includes(event.code)) return;
    const name: string | null = chosen(event.target);
    if (name === null) return;
    event.preventDefault();
    pick(name);
  });
}

function makeRow(list: HTMLOListElement): RowParts {
  const item: HTMLLIElement = el('li', 'board-row entering', list);
  const rank: HTMLSpanElement = el('span', 'board-rank', item);
  const dot: HTMLSpanElement = el('span', 'board-dot', item);
  const who: HTMLSpanElement = el('span', 'board-who', item);
  const name: HTMLSpanElement = el('span', 'board-name', who);
  const account: HTMLSpanElement = el('span', 'board-account', who);
  const place: HTMLSpanElement = el('span', 'board-place', item);
  const level: HTMLSpanElement = el('span', 'board-level', item);
  return { item, rank, dot, name, place, account, level };
}

function fill(parts: RowParts, row: BoardRow, you: string | null, by: Ranking, animate: boolean, pickable: boolean): void {
  setText(parts.rank, rankText(row.rank), animate);
  setText(parts.name, row.name, false);
  setText(parts.place, row.furthest, animate);
  setText(parts.level, rankValueText(row, by), animate);
  setText(parts.account, row.account ?? '', false);
  setFlag(parts.item, 'data-account', row.account !== null);
  const tabIndex: number = row.account === null && !pickable ? -1 : 0;
  setClass(parts.item, PICK.className, pickable);
  if (parts.item.tabIndex !== tabIndex) parts.item.tabIndex = tabIndex;
  setClass(parts.dot, 'on', row.online);
  setClass(parts.item, 'you', row.name === you);
}

export function createBoardView(list: HTMLOListElement, slots: number, pick: ((name: string) => void) | null): BoardView {
  const rows: Map<string, RowParts> = new Map<string, RowParts>();
  const names: Map<Element, string> = new Map<Element, string>();
  if (pick !== null) listenForPicks(list, names, pick);
  const blanks: HTMLLIElement[] = [];

  for (let index: number = 0; index < slots; index += 1) blanks.push(el('li', 'board-row blank', list));

  const leave = (parts: RowParts, top: number): void => {
    parts.item.classList.add('leaving');
    parts.item.style.top = `${top}px`;
    window.setTimeout((): void => {
      parts.item.remove();
    }, BOARD_MOTION.leaveMs);
  };

  return {
    render(next: readonly BoardRow[], you: string | null, by: Ranking): void {
      const shown: readonly BoardRow[] = next.slice(0, slots);
      const before: Map<HTMLLIElement, number> = new Map<HTMLLIElement, number>();
      for (const parts of rows.values()) before.set(parts.item, parts.item.offsetTop);
      const keep: Set<string> = new Set<string>(shown.map((row: BoardRow): string => row.name));
      for (const [name, parts] of rows) {
        if (keep.has(name)) continue;
        rows.delete(name);
        names.delete(parts.item);
        leave(parts, before.get(parts.item) ?? 0);
      }
      const arrived: RowParts[] = [];
      const order: HTMLLIElement[] = [];
      for (const row of shown) {
        const existing: RowParts | undefined = rows.get(row.name);
        const parts: RowParts = existing ?? makeRow(list);
        if (existing === undefined) arrived.push(parts);
        rows.set(row.name, parts);
        names.set(parts.item, row.name);
        fill(parts, row, you, by, existing !== undefined, pick !== null);
        order.push(parts.item);
      }
      blanks.forEach((blank: HTMLLIElement, index: number): void => {
        setClass(blank, 'filled', index < shown.length);
      });
      arrange(list, [...order, ...blanks]);
      const slid: RowParts[] = [];
      for (const parts of rows.values()) {
        const from: number | undefined = before.get(parts.item);
        const delta: number = from === undefined ? 0 : from - parts.item.offsetTop;
        if (delta === 0) continue;
        parts.item.classList.add('flip');
        parts.item.style.transform = `translateY(${delta}px)`;
        slid.push(parts);
      }
      if (slid.length === 0 && arrived.length === 0) return;
      list.getBoundingClientRect();
      for (const parts of slid) {
        parts.item.classList.remove('flip');
        parts.item.style.transform = '';
      }
      for (const parts of arrived) parts.item.classList.remove('entering');
    },
  };
}
