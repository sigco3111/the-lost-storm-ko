export interface RowList<N> {
  first(): N | null;
  next(node: N): N | null;
  leaving(node: N): boolean;
  insert(node: N, before: N | null): void;
}

function kept<N>(list: RowList<N>, node: N | null): N | null {
  let current: N | null = node;
  while (current !== null && list.leaving(current)) current = list.next(current);
  return current;
}

export function placeRows<N>(list: RowList<N>, rows: readonly N[]): number {
  let moved: number = 0;
  let previous: N | null = null;
  for (const row of rows) {
    const slot: N | null = kept(list, previous === null ? list.first() : list.next(previous));
    if (slot !== row) {
      list.insert(row, slot);
      moved += 1;
    }
    previous = row;
  }
  return moved;
}

export function domRows(holder: HTMLElement, leavingClass: string): RowList<Element> {
  return {
    first: (): Element | null => holder.firstElementChild,
    next: (node: Element): Element | null => node.nextElementSibling,
    leaving: (node: Element): boolean => node.classList.contains(leavingClass),
    insert: (node: Element, before: Element | null): void => {
      holder.insertBefore(node, before);
    },
  };
}
