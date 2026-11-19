export type NumberKind = 'plain' | 'crit' | 'hurt' | 'burn' | 'gold' | 'heal';

export const NUMBER_CROWD = {
  mergeWindow: 0.25,
  crowdCap: 12,
  quietFrom: 6,
} as const;

export interface LiveNumber {
  readonly key: number | null;
  readonly kind: NumberKind;
  readonly age: number;
  readonly retiring: boolean;
}

export interface IncomingNumber {
  readonly key: number | null;
  readonly kind: NumberKind;
}

export type NumberPlan =
  | { readonly type: 'merge'; readonly index: number }
  | { readonly type: 'new'; readonly retire: readonly number[]; readonly quiet: boolean };

const CROWDS: Readonly<Record<NumberKind, boolean>> = { plain: true, burn: true, crit: false, hurt: false, gold: false, heal: false };

const MERGES: Readonly<Record<NumberKind, boolean>> = { plain: true, burn: true, hurt: true, crit: false, gold: false, heal: true };

export function joinsCrowd(kind: NumberKind): boolean {
  return CROWDS[kind];
}

function mergeTarget(live: readonly LiveNumber[], incoming: IncomingNumber): number {
  if (incoming.key === null || !MERGES[incoming.kind]) return -1;
  return live.findIndex((number: LiveNumber): boolean => !number.retiring && number.key === incoming.key && number.kind === incoming.kind && number.age < NUMBER_CROWD.mergeWindow);
}

export function planNumber(live: readonly LiveNumber[], incoming: IncomingNumber): NumberPlan {
  const index: number = mergeTarget(live, incoming);
  if (index >= 0) return { type: 'merge', index };
  if (!joinsCrowd(incoming.kind)) return { type: 'new', retire: [], quiet: false };
  const crowd: number[] = live
    .map((number: LiveNumber, at: number): number => (number.retiring || !joinsCrowd(number.kind) ? -1 : at))
    .filter((at: number): boolean => at >= 0)
    .toSorted((a: number, b: number): number => (live[b]?.age ?? 0) - (live[a]?.age ?? 0));
  const over: number = Math.max(0, crowd.length - NUMBER_CROWD.crowdCap + 1);
  const retire: number[] = crowd.slice(0, over);
  return { type: 'new', retire, quiet: crowd.length - retire.length >= NUMBER_CROWD.quietFrom };
}
