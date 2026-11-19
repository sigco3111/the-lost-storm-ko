export interface GridMetrics {
  readonly cell: number;
  readonly gap: number;
}

export interface HeldLine {
  readonly text: string;
  readonly shown: boolean;
}

export interface EdgeFade {
  readonly top: boolean;
  readonly bottom: boolean;
}

export const STASH_GRID: GridMetrics = { cell: 44, gap: 4 };

const EDGE_SLACK: number = 1;

export function gridColumns(width: number, metrics: GridMetrics): number {
  return Math.max(1, Math.floor((width + metrics.gap) / (metrics.cell + metrics.gap)));
}

export function lastUsed(slots: readonly unknown[]): number {
  for (let index: number = slots.length - 1; index >= 0; index -= 1) {
    if (slots[index] !== null && slots[index] !== undefined) return index;
  }
  return -1;
}

export function stashRows(slots: readonly unknown[], columns: number): number {
  const total: number = Math.ceil(slots.length / Math.max(1, columns));
  if (total === 0) return 0;
  const used: number = lastUsed(slots);
  const wanted: number = used < 0 ? 1 : Math.floor(used / Math.max(1, columns)) + 2;
  return Math.min(total, wanted);
}

export function rowsHeight(rows: number, metrics: GridMetrics): number {
  return rows <= 0 ? 0 : rows * (metrics.cell + metrics.gap) - metrics.gap;
}

export function fitRows(available: number, rows: number, metrics: GridMetrics): number {
  const room: number = Math.floor((available + metrics.gap + EDGE_SLACK) / (metrics.cell + metrics.gap));
  return Math.max(Math.min(1, rows), Math.min(rows, room));
}

export function heldLine(next: string | null, held: string): HeldLine {
  return next === null || next === '' ? { text: held, shown: false } : { text: next, shown: true };
}

export function edgeFade(scrollTop: number, clientHeight: number, scrollHeight: number): EdgeFade {
  return { top: scrollTop > EDGE_SLACK, bottom: scrollTop + clientHeight < scrollHeight - EDGE_SLACK };
}
