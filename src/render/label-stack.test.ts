import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createRng } from '../../sim/rng.ts';
import type { Rng } from '../../sim/rng.ts';
import { LABEL_EDGE } from './label-edge.ts';
import { foldPiles, settleLabels } from './label-stack.ts';
import type { LabelSpot, RankedBox, ScreenRect, SettleView } from './label-stack.ts';

const VIEW: SettleView = { width: 1280, height: 720 };

interface Crowd {
  readonly view: SettleView;
  readonly boxes: readonly RankedBox[];
  readonly blockers: readonly ScreenRect[];
}

function crowds(seed: number, count: number): Crowd[] {
  const rng: Rng = createRng(seed);
  return Array.from({ length: count }, (): Crowd => {
    const view: SettleView = rng.chance(0.3) ? { width: 844, height: 390 } : { width: 1280, height: 720 };
    const middle: { readonly x: number; readonly y: number } = { x: rng.range(0, view.width), y: rng.range(0, view.height) };
    const spread: number = rng.chance(0.5) ? 20 : 200;
    const boxes: RankedBox[] = Array.from({ length: rng.int(1, 40) }, (_: unknown, index: number): RankedBox => ({
      id: index + 1,
      x: rng.chance(0.2) ? Math.round(middle.x) : middle.x + rng.range(-spread, spread) / 2,
      y: rng.chance(0.2) ? Math.round(middle.y) : middle.y + rng.range(-spread, spread) / 2,
      width: rng.chance(0.3) ? 90 : rng.range(40, 200),
      height: rng.chance(0.5) ? 20 : rng.range(16, 26),
      rank: rng.int(0, 3),
    }));
    const blockers: ScreenRect[] = Array.from({ length: rng.int(0, 12) }, (): ScreenRect => {
      const left: number = rng.range(0, view.width);
      const top: number = rng.range(0, view.height);
      return { left, top, right: left + rng.range(20, 420), bottom: top + rng.range(10, 210) };
    });
    return { view, boxes, blockers };
  });
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function box(id: number, x: number, y: number, rank: number = 0): RankedBox {
  return { id, x, y, width: 80, height: 18, rank };
}

function settled(boxes: readonly RankedBox[], view: SettleView = VIEW, blockers: readonly ScreenRect[] = []): Map<number, ScreenRect> {
  const spots: Map<number, LabelSpot> = settleLabels(boxes, 2, view, blockers);
  const rects: Map<number, ScreenRect> = new Map<number, ScreenRect>();
  for (const entry of boxes) {
    const spot: LabelSpot | undefined = spots.get(entry.id);
    assert.ok(spot !== undefined, `${entry.id} has no spot`);
    rects.set(entry.id, { left: spot.x - entry.width / 2, top: spot.y - entry.height, right: spot.x + entry.width / 2, bottom: spot.y });
  }
  return rects;
}

function overlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function assertApart(rects: ReadonlyMap<number, ScreenRect>): void {
  for (const [a, first] of rects) {
    for (const [b, second] of rects) {
      if (a < b) assert.ok(!overlap(first, second), `${a} and ${b} overlap`);
    }
  }
}

function assertInView(rects: ReadonlyMap<number, ScreenRect>, view: SettleView): void {
  for (const [id, rect] of rects) {
    assert.ok(rect.left >= 0 && rect.right <= view.width && rect.top >= 0 && rect.bottom <= view.height, `${id} leaves the view`);
  }
}

void test('labels far apart are left where they are', (): void => {
  const spots: Map<number, LabelSpot> = settleLabels([box(1, 100, 300), box(2, 400, 300)], 2, VIEW, []);
  assert.deepEqual(spots.get(1), { x: 100, y: 300 });
  assert.deepEqual(spots.get(2), { x: 400, y: 300 });
});

void test('labels on the same spot stack upward without overlapping', (): void => {
  const rects = settled([box(1, 500, 400), box(2, 500, 400), box(3, 505, 404)]);
  assertApart(rects);
  for (const rect of rects.values()) assert.ok(rect.bottom <= 404);
});

void test('the rarest label keeps the place nearest its item', (): void => {
  const spots: Map<number, LabelSpot> = settleLabels([box(1, 500, 400, 0), box(2, 500, 400, 2)], 2, VIEW, []);
  assert.deepEqual(spots.get(2), { x: 500, y: 400 });
  assert.ok((spots.get(1)?.y ?? 400) < 400);
});

void test('a dozen labels dropped together never overlap and stay on screen', (): void => {
  const pile: RankedBox[] = Array.from({ length: 12 }, (_: unknown, index: number): RankedBox => ({ id: index + 1, x: 640 + (index % 4) * 7, y: 360 + (index % 3) * 5, width: 90 + (index % 5) * 20, height: 20, rank: index % 4 }));
  const rects = settled(pile);
  assertApart(rects);
  assertInView(rects, VIEW);
});

void test('a pile near the top of the screen spreads downward instead of off the edge', (): void => {
  const view: SettleView = { width: 844, height: 390 };
  const pile: RankedBox[] = Array.from({ length: 10 }, (_: unknown, index: number): RankedBox => box(index + 1, 420, 70, index % 3));
  const rects = settled(pile, view);
  assertApart(rects);
  assertInView(rects, view);
  assert.ok([...rects.values()].every((rect: ScreenRect): boolean => rect.top >= LABEL_EDGE.topClear));
});

void test('a pile at the side of the screen is pulled inside it', (): void => {
  const rects = settled([box(1, 4, 300), box(2, 1278, 300), box(3, 2, 300)]);
  assertApart(rects);
  assertInView(rects, VIEW);
});

void test('labels never settle under a HUD panel', (): void => {
  const panel: ScreenRect = { left: 400, top: 200, right: 900, bottom: 330 };
  const pile: RankedBox[] = Array.from({ length: 8 }, (_: unknown, index: number): RankedBox => box(index + 1, 640, 360, index % 2));
  const rects = settled(pile, VIEW, [panel]);
  assertApart(rects);
  for (const [id, rect] of rects) assert.ok(!overlap(rect, panel), `${id} is under the panel`);
});

void test('a pile of many labels keeps the three rarest and counts the rest on the last kept one', (): void => {
  const pile = Array.from({ length: 10 }, (_: unknown, index: number) => ({ id: index + 1, x: 400 + index * 6, y: 300 + (index % 3) * 4, width: 120, height: 20, rank: index === 4 ? 3 : index % 3 === 0 ? 2 : 1 }));
  const folding = foldPiles(pile, 36, 3);
  assert.equal(folding.folded.size, 7);
  assert.ok(!folding.folded.has(5));
  assert.ok(!folding.folded.has(1));
  assert.ok(!folding.folded.has(4));
  assert.deepEqual([...folding.more.entries()], [[4, 7]]);
});

void test('three or fewer labels together, or labels far apart, are never folded', (): void => {
  const few = [1, 2, 3].map((id: number) => ({ id, x: 400, y: 300 + id * 3, width: 120, height: 20, rank: 1 }));
  assert.equal(foldPiles(few, 36, 3).folded.size, 0);
  const apart = [1, 2, 3, 4, 5].map((id: number) => ({ id, x: id * 300, y: 300, width: 120, height: 20, rank: 1 }));
  const folding = foldPiles(apart, 36, 3);
  assert.equal(folding.folded.size, 0);
  assert.equal(folding.more.size, 0);
});

void test('three hundred crowded piles settle exactly where they always have', (): void => {
  const spots = crowds(7, 300).map((crowd: Crowd) => Array.from(settleLabels(crowd.boxes, 2, crowd.view, crowd.blockers)));
  assert.equal(digest(spots), '5c0b29fca284e931a6f3bcc8933bd275a5c5749f381fcb2b98b55c37872e941c');
});

void test('three hundred crowded piles fold exactly as they always have', (): void => {
  const folds = crowds(7, 300).map((crowd: Crowd) => {
    const folding = foldPiles(crowd.boxes, 36, 3);
    return [[...folding.folded], [...folding.more]];
  });
  assert.equal(digest(folds), '03243493200bdc13e70d9f06d9b109c0bec163c2b97b5faa591464fb5b77acb7');
});
