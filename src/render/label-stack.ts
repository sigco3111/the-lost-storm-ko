import { LABEL_EDGE } from './label-edge.ts';

export const SETTLE = {
  downWeight: 4,
  hudStep: LABEL_EDGE.hudGap + 1,
} as const;

export interface LabelBox {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface LabelSpot {
  readonly x: number;
  readonly y: number;
}

export interface SettleView {
  readonly width: number;
  readonly height: number;
}

function centred(x: number, width: number, view: SettleView): number {
  const low: number = LABEL_EDGE.side + width / 2;
  const high: number = view.width - LABEL_EDGE.side - width / 2;
  return low > high ? view.width / 2 : Math.min(high, Math.max(low, x));
}

interface Settling {
  readonly gap: number;
  readonly view: SettleView;
  readonly placed: ScreenRect[];
  readonly blockers: readonly ScreenRect[];
  box: RankedBox;
  home: number;
  x: number;
  y: number;
  cost: number;
  found: boolean;
}

function clearAt(settling: Settling, x: number, y: number): boolean {
  const { box, gap }: Settling = settling;
  if (y - box.height < LABEL_EDGE.topClear || y > settling.view.height - LABEL_EDGE.side) return false;
  const left: number = x - box.width / 2;
  const top: number = y - box.height;
  const right: number = x + box.width / 2;
  for (const other of settling.placed) {
    if (left < other.right + gap && other.left - gap < right && top < other.bottom + gap && other.top - gap < y) return false;
  }
  for (const other of settling.blockers) {
    if (left < other.right + LABEL_EDGE.hudGap && other.left - LABEL_EDGE.hudGap < right && top < other.bottom + LABEL_EDGE.hudGap && other.top - LABEL_EDGE.hudGap < y) return false;
  }
  return true;
}

function consider(settling: Settling, x: number, y: number): void {
  const { box }: Settling = settling;
  const option: number = Math.abs(x - settling.home) + (y <= box.y ? box.y - y : (y - box.y) * SETTLE.downWeight);
  if (option < settling.cost && clearAt(settling, x, y)) {
    settling.cost = option;
    settling.x = x;
    settling.y = y;
    settling.found = true;
  }
}

function scanColumn(settling: Settling, raw: number): void {
  const { box, gap }: Settling = settling;
  const x: number = centred(raw, box.width, settling.view);
  consider(settling, x, box.y);
  for (const rect of settling.placed) {
    consider(settling, x, rect.top - gap);
    consider(settling, x, rect.bottom + gap + box.height);
  }
  for (const rect of settling.blockers) {
    consider(settling, x, rect.top - SETTLE.hudStep);
    consider(settling, x, rect.bottom + SETTLE.hudStep + box.height);
  }
}

function scanSides(settling: Settling, rects: readonly ScreenRect[]): void {
  const { box, gap }: Settling = settling;
  for (const rect of rects) {
    scanColumn(settling, rect.left - gap - box.width / 2 - LABEL_EDGE.hudGap);
    scanColumn(settling, rect.right + gap + box.width / 2 + LABEL_EDGE.hudGap);
  }
}

function homeFree(settling: Settling): boolean {
  settling.cost = Infinity;
  settling.found = false;
  scanColumn(settling, settling.home);
  return settling.found;
}

function sideFree(settling: Settling): boolean {
  scanSides(settling, settling.placed);
  scanSides(settling, settling.blockers);
  return settling.found;
}

function settleOne(settling: Settling): LabelSpot {
  const { box, view }: Settling = settling;
  if (homeFree(settling) || sideFree(settling)) return { x: settling.x, y: settling.y };
  return { x: settling.home, y: Math.min(view.height - LABEL_EDGE.side, Math.max(LABEL_EDGE.topClear + box.height, box.y)) };
}

export function settleLabels(boxes: readonly RankedBox[], gap: number, view: SettleView, blockers: readonly ScreenRect[]): Map<number, LabelSpot> {
  const ordered: RankedBox[] = boxes.toSorted((a: RankedBox, b: RankedBox): number => (a.rank !== b.rank ? b.rank - a.rank : a.y !== b.y ? b.y - a.y : a.id - b.id));
  const spots: Map<number, LabelSpot> = new Map<number, LabelSpot>();
  const first: RankedBox | undefined = ordered[0];
  if (first === undefined) return spots;
  const settling: Settling = { gap, view, placed: [], blockers, box: first, home: 0, x: 0, y: 0, cost: Infinity, found: false };
  for (const box of ordered) {
    settling.box = box;
    settling.home = centred(box.x, box.width, view);
    const spot: LabelSpot = settleOne(settling);
    settling.placed.push({ left: spot.x - box.width / 2, top: spot.y - box.height, right: spot.x + box.width / 2, bottom: spot.y });
    spots.set(box.id, spot);
  }
  return spots;
}

export interface RankedBox extends LabelBox {
  readonly rank: number;
}

export interface Folding {
  readonly folded: ReadonlySet<number>;
  readonly more: ReadonlyMap<number, number>;
}

export function foldPiles(boxes: readonly RankedBox[], reach: number, keep: number): Folding {
  const groupOf: Map<number, number> = new Map<number, number>();
  const find = (id: number): number => {
    let root: number = id;
    for (let next: number | undefined = groupOf.get(root); next !== undefined && next !== root; next = groupOf.get(root)) root = next;
    return root;
  };
  for (const box of boxes) groupOf.set(box.id, box.id);
  for (let index: number = 0; index < boxes.length; index += 1) {
    const a: RankedBox | undefined = boxes[index];
    if (a === undefined) continue;
    for (let other: number = index + 1; other < boxes.length; other += 1) {
      const b: RankedBox | undefined = boxes[other];
      if (b !== undefined && Math.hypot(a.x - b.x, a.y - b.y) <= reach) groupOf.set(find(a.id), find(b.id));
    }
  }
  const groups: Map<number, RankedBox[]> = new Map<number, RankedBox[]>();
  for (const box of boxes) {
    const root: number = find(box.id);
    const members: RankedBox[] | undefined = groups.get(root);
    if (members === undefined) groups.set(root, [box]);
    else members.push(box);
  }
  const folded: Set<number> = new Set<number>();
  const more: Map<number, number> = new Map<number, number>();
  for (const members of groups.values()) {
    if (members.length <= keep) continue;
    const ordered: RankedBox[] = members.toSorted((a: RankedBox, b: RankedBox): number => (b.rank === a.rank ? a.id - b.id : b.rank - a.rank));
    const hidden: RankedBox[] = ordered.slice(keep);
    for (const box of hidden) folded.add(box.id);
    const last: RankedBox | undefined = ordered[keep - 1];
    if (last !== undefined) more.set(last.id, hidden.length);
  }
  return { folded, more };
}
