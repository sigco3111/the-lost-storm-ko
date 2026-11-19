import type { Content, ItemSlot, ModOp, StatId } from './content/types.ts';
import { ITEM_STATS } from './content/types.ts';
import { itemMods, slotOf } from './items.ts';
import { describeMod, isRatio, roundStat, statLabel } from './stat-text.ts';
import type { ItemInstance } from './world/types.ts';

export interface ReadingRow {
  readonly stat: StatId;
  readonly op: ModOp;
  readonly text: string;
  readonly delta: number | null;
  readonly deltaText: string | null;
}

export type Headline =
  | { readonly kind: 'damage'; readonly min: number; readonly max: number; readonly delta: number | null }
  | { readonly kind: 'stat'; readonly row: ReadingRow }
  | { readonly kind: 'none' };

export interface ReadingLine {
  readonly row: ReadingRow;
  readonly lost: boolean;
}

export interface ItemReading {
  readonly headline: Headline;
  readonly rows: readonly ReadingRow[];
  readonly lost: readonly ReadingRow[];
}

interface Total {
  readonly stat: StatId;
  readonly op: ModOp;
  value: number;
}

const ARMOUR_SLOTS: ReadonlySet<ItemSlot> = new Set<ItemSlot>(['head', 'chest', 'hands', 'legs', 'feet']);

function keyOf(stat: StatId, op: ModOp): string {
  return `${stat}:${op}`;
}

function orderOf(stat: StatId): number {
  const index: number = ITEM_STATS.findIndex((candidate: StatId): boolean => candidate === stat);
  return index === -1 ? ITEM_STATS.length : index;
}

function totals(content: Content, item: ItemInstance | null): Map<string, Total> {
  const sums: Map<string, Total> = new Map<string, Total>();
  if (item === null) return sums;
  for (const mod of itemMods(content, item)) {
    const key: string = keyOf(mod.stat, mod.op);
    const sum: Total | undefined = sums.get(key);
    if (sum === undefined) sums.set(key, { stat: mod.stat, op: mod.op, value: mod.value });
    else sum.value += mod.value;
  }
  return sums;
}

function signed(stat: StatId, op: ModOp, value: number): string {
  const sign: string = value < 0 ? '−' : '+';
  const size: number = Math.abs(value);
  return isRatio(stat, op) ? `${sign}${Math.round(size * 100)}%` : `${sign}${size}`;
}

function row(stat: StatId, op: ModOp, value: number, other: number | null, named: boolean): ReadingRow {
  const rounded: number = roundStat(stat, op, value);
  const delta: number | null = other === null ? null : roundStat(stat, op, value - other);
  return { stat, op, text: named ? statLabel(stat) : describeMod({ stat, op, value: rounded }), delta, deltaText: delta === null || delta === 0 ? null : signed(stat, op, delta) };
}

function byOrder(a: ReadingRow, b: ReadingRow): number {
  const order: number = orderOf(a.stat) - orderOf(b.stat);
  return order === 0 ? a.op.localeCompare(b.op) : order;
}

function valueOf(sums: Map<string, Total>, stat: StatId, op: ModOp): number {
  return sums.get(keyOf(stat, op))?.value ?? 0;
}

export function readItem(content: Content, item: ItemInstance, equipped: ItemInstance | null): ItemReading {
  const mine: Map<string, Total> = totals(content, item);
  const theirs: Map<string, Total> | null = equipped === null ? null : totals(content, equipped);
  const other = (stat: StatId, op: ModOp): number | null => (theirs === null ? null : valueOf(theirs, stat, op));
  const rows: ReadingRow[] = [...mine.values()]
    .filter((total: Total): boolean => total.stat !== 'damageMin' && total.stat !== 'damageMax')
    .map((total: Total): ReadingRow => row(total.stat, total.op, total.value, other(total.stat, total.op), false))
    .filter((candidate: ReadingRow): boolean => roundStat(candidate.stat, candidate.op, mine.get(keyOf(candidate.stat, candidate.op))?.value ?? 0) !== 0 || candidate.deltaText !== null)
    .toSorted(byOrder);
  const lost: ReadingRow[] =
    theirs === null
      ? []
      : [...theirs.values()]
          .filter((total: Total): boolean => !mine.has(keyOf(total.stat, total.op)) && total.stat !== 'damageMin' && total.stat !== 'damageMax')
          .map((total: Total): ReadingRow => row(total.stat, total.op, 0, total.value, true))
          .toSorted(byOrder);
  const slot: ItemSlot | null = slotOf(content, item);
  if (mine.has(keyOf('damageMin', 'add')) && mine.has(keyOf('damageMax', 'add'))) {
    const min: number = valueOf(mine, 'damageMin', 'add');
    const max: number = valueOf(mine, 'damageMax', 'add');
    const theirsAverage: number | null = theirs === null ? null : (valueOf(theirs, 'damageMin', 'add') + valueOf(theirs, 'damageMax', 'add')) / 2;
    return { headline: { kind: 'damage', min, max, delta: theirsAverage === null ? null : Math.round(((min + max) / 2 - theirsAverage) * 10) / 10 }, rows, lost };
  }
  const armour: ReadingRow | undefined = rows.find((candidate: ReadingRow): boolean => candidate.stat === 'armour' && candidate.op === 'add');
  if (slot !== null && ARMOUR_SLOTS.has(slot) && armour !== undefined) {
    return { headline: { kind: 'stat', row: armour }, rows: rows.filter((candidate: ReadingRow): boolean => candidate !== armour), lost };
  }
  const first: ReadingRow | undefined = rows[0];
  if (first === undefined) return { headline: { kind: 'none' }, rows, lost };
  return { headline: { kind: 'stat', row: first }, rows: rows.slice(1), lost };
}

export function readingLines(reading: ItemReading): readonly ReadingLine[] {
  const own: ReadingLine[] = reading.rows.map((entry: ReadingRow): ReadingLine => ({ row: entry, lost: false }));
  const lost: ReadingLine[] = reading.lost.map((entry: ReadingRow): ReadingLine => ({ row: entry, lost: true }));
  return [...own, ...lost].toSorted((a: ReadingLine, b: ReadingLine): number => byOrder(a.row, b.row));
}
