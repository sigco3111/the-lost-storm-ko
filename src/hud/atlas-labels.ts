export const LABEL_PLACING = {
  sides: ['below', 'right', 'left', 'above'],
  hiddenCost: 1000,
  strayCost: 12,
  crowdCost: 6,
  facingCost: 40,
  searchSteps: 40000,
  toward: { below: { x: 0, y: 1 }, above: { x: 0, y: -1 }, right: { x: 1, y: 0 }, left: { x: -1, y: 0 } },
} as const;

export type ShownSide = (typeof LABEL_PLACING.sides)[number];
export type LabelSide = ShownSide | 'hidden';

export interface LabelBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface LabelOffset {
  readonly x: number;
  readonly y: number;
}

export interface LabelSpot {
  readonly x: number;
  readonly y: number;
  readonly reach: number;
  readonly width: number;
  readonly height: number;
  readonly keep: number;
}

export interface LabelRoom {
  readonly bounds: LabelBox;
  readonly gap: number;
  readonly margin: number;
  readonly clear: number;
}

interface Choice {
  readonly owner: number;
  readonly side: LabelSide;
  readonly cost: number;
  readonly box: LabelBox | null;
}

interface Search {
  readonly spots: readonly LabelSpot[];
  readonly order: readonly number[];
  readonly choices: readonly (readonly Choice[])[];
  readonly picked: (Choice | null)[];
  best: readonly Choice[];
  bestCost: number;
  steps: number;
}

export function labelOffset(spot: LabelSpot, side: ShownSide, gap: number): LabelOffset {
  const toward: LabelOffset = LABEL_PLACING.toward[side];
  return { x: toward.x * (spot.reach + gap + spot.width / 2), y: toward.y * (spot.reach + gap + spot.height / 2) };
}

export function labelBox(spot: LabelSpot, side: ShownSide, gap: number): LabelBox {
  const offset: LabelOffset = labelOffset(spot, side, gap);
  const x: number = spot.x + offset.x;
  const y: number = spot.y + offset.y;
  return { left: x - spot.width / 2, top: y - spot.height / 2, right: x + spot.width / 2, bottom: y + spot.height / 2 };
}

export function nodeBox(spot: LabelSpot): LabelBox {
  return { left: spot.x - spot.reach, top: spot.y - spot.reach, right: spot.x + spot.reach, bottom: spot.y + spot.reach };
}

export function boxesMeet(a: LabelBox, b: LabelBox, margin: number): boolean {
  return a.left < b.right + margin && b.left < a.right + margin && a.top < b.bottom + margin && b.top < a.bottom + margin;
}

export function boxGap(a: LabelBox, b: LabelBox): number {
  return Math.hypot(Math.max(0, a.left - b.right, b.left - a.right), Math.max(0, a.top - b.bottom, b.top - a.bottom));
}

export function nodeGap(box: LabelBox, spot: LabelSpot): number {
  return Math.hypot(Math.max(0, box.left - spot.x, spot.x - box.right), Math.max(0, box.top - spot.y, spot.y - box.bottom)) - spot.reach;
}

export function strays(box: LabelBox, own: number, spots: readonly LabelSpot[], room: LabelRoom): boolean {
  return spots.some((other: LabelSpot, index: number): boolean => index !== own && nodeGap(box, other) < room.gap + room.clear);
}

function inside(box: LabelBox, bounds: LabelBox, margin: number): boolean {
  return box.left >= bounds.left + margin && box.top >= bounds.top + margin && box.right <= bounds.right - margin && box.bottom <= bounds.bottom - margin;
}

function choicesFor(spots: readonly LabelSpot[], index: number, room: LabelRoom, nodes: readonly LabelBox[]): Choice[] {
  const spot: LabelSpot | undefined = spots[index];
  if (spot === undefined) return [];
  const choices: Choice[] = [];
  LABEL_PLACING.sides.forEach((side: ShownSide, rank: number): void => {
    const box: LabelBox = labelBox(spot, side, room.gap);
    if (!inside(box, room.bounds, room.margin)) return;
    if (nodes.some((node: LabelBox): boolean => boxesMeet(box, node, room.margin))) return;
    choices.push({ owner: index, side, cost: rank + (strays(box, index, spots, room) ? LABEL_PLACING.strayCost : 0), box });
  });
  choices.push({ owner: index, side: 'hidden', cost: LABEL_PLACING.hiddenCost * spot.keep, box: null });
  return choices;
}

function clash(a: Choice, b: Choice, margin: number): boolean {
  return a.box !== null && b.box !== null && boxesMeet(a.box, b.box, margin);
}

function crowds(a: Choice, b: Choice, clear: number): boolean {
  return a.box !== null && b.box !== null && boxGap(a.box, b.box) < clear;
}

function towards(choice: Choice, from: LabelSpot | undefined, to: LabelSpot | undefined): boolean {
  if (choice.side === 'hidden' || from === undefined || to === undefined) return false;
  const toward: LabelOffset = LABEL_PLACING.toward[choice.side];
  return toward.x * (to.x - from.x) + toward.y * (to.y - from.y) > 0;
}

function crowding(a: Choice, b: Choice, spots: readonly LabelSpot[], room: LabelRoom): number {
  if (!crowds(a, b, room.clear)) return 0;
  const facing: boolean = towards(a, spots[a.owner], spots[b.owner]) && towards(b, spots[b.owner], spots[a.owner]);
  return facing ? LABEL_PLACING.facingCost : LABEL_PLACING.crowdCost;
}

function clusters(choices: readonly (readonly Choice[])[], room: LabelRoom): number[][] {
  const owner: number[] = choices.map((_choice: readonly Choice[], index: number): number => index);
  const root = (index: number): number => {
    let at: number = index;
    while (owner[at] !== at) at = owner[at] ?? at;
    return at;
  };
  choices.forEach((mine: readonly Choice[], index: number): void => {
    choices.forEach((theirs: readonly Choice[], other: number): void => {
      if (other <= index) return;
      if (!mine.some((a: Choice): boolean => theirs.some((b: Choice): boolean => clash(a, b, room.margin) || crowds(a, b, room.clear)))) return;
      owner[root(other)] = root(index);
    });
  });
  const groups: Map<number, number[]> = new Map<number, number[]>();
  choices.forEach((_choice: readonly Choice[], index: number): void => {
    const key: number = root(index);
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  return [...groups.values()];
}

function cheapest(choices: readonly Choice[]): number {
  return Math.min(...choices.map((choice: Choice): number => choice.cost));
}

function explore(search: Search, depth: number, cost: number, room: LabelRoom): void {
  search.steps += 1;
  if (search.steps > LABEL_PLACING.searchSteps) return;
  if (depth === search.order.length) {
    if (cost < search.bestCost) {
      search.bestCost = cost;
      search.best = search.order.map((index: number): Choice => search.picked[index] ?? { owner: index, side: 'hidden', cost: 0, box: null });
    }
    return;
  }
  let floor: number = cost;
  for (const later of search.order.slice(depth)) floor += cheapest(search.choices[later] ?? []);
  if (floor >= search.bestCost) return;
  const index: number = search.order[depth] ?? 0;
  for (const choice of search.choices[index] ?? []) {
    const placed: Choice[] = search.order.slice(0, depth).flatMap((earlier: number): Choice[] => {
      const before: Choice | null = search.picked[earlier] ?? null;
      return before === null ? [] : [before];
    });
    if (placed.some((before: Choice): boolean => clash(before, choice, room.margin))) continue;
    const crowded: number = placed.reduce((sum: number, before: Choice): number => sum + crowding(before, choice, search.spots, room), 0);
    search.picked[index] = choice;
    explore(search, depth + 1, cost + choice.cost + crowded, room);
    search.picked[index] = null;
  }
}

export function placeLabels(spots: readonly LabelSpot[], room: LabelRoom): LabelSide[] {
  const nodes: LabelBox[] = spots.map(nodeBox);
  const choices: Choice[][] = spots.map((_spot: LabelSpot, index: number): Choice[] =>
    choicesFor(
      spots,
      index,
      room,
      nodes.filter((_node: LabelBox, other: number): boolean => other !== index),
    ),
  );
  const sides: LabelSide[] = spots.map((): LabelSide => 'hidden');
  for (const group of clusters(choices, room)) {
    const freedom = (index: number): number => choices[index]?.length ?? 0;
    const order: number[] = group.toSorted((a: number, b: number): number => (freedom(a) === freedom(b) ? a - b : freedom(a) - freedom(b)));
    const fallback: Choice[] = order.map((index: number): Choice => choices[index]?.at(-1) ?? { owner: index, side: 'hidden', cost: 0, box: null });
    const search: Search = {
      spots,
      order,
      choices,
      picked: spots.map((): Choice | null => null),
      best: fallback,
      bestCost: fallback.reduce((sum: number, choice: Choice): number => sum + choice.cost, 0) + 1,
      steps: 0,
    };
    explore(search, 0, 0, room);
    order.forEach((index: number, at: number): void => {
      sides[index] = search.best[at]?.side ?? 'hidden';
    });
  }
  return sides;
}
