import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxesMeet, labelBox, nodeBox, placeLabels } from './atlas-labels.ts';
import type { LabelBox, LabelRoom, LabelSide, LabelSpot, ShownSide } from './atlas-labels.ts';

const ROOM: LabelRoom = { bounds: { left: 0, top: 0, right: 1000, bottom: 600 }, gap: 6, margin: 4, clear: 0 };
const OWNED: LabelRoom = { ...ROOM, clear: 24 };

function spot(x: number, y: number, width: number = 80, keep: number = 1): LabelSpot {
  return { x, y, reach: 19, width, height: 16, keep };
}

function overlaps(spots: readonly LabelSpot[], sides: readonly LabelSide[], room: LabelRoom): string[] {
  const boxes: { readonly name: string; readonly box: LabelBox }[] = spots.map((each: LabelSpot, index: number): { readonly name: string; readonly box: LabelBox } => ({ name: `node ${index}`, box: nodeBox(each) }));
  sides.forEach((side: LabelSide, index: number): void => {
    const each: LabelSpot | undefined = spots[index];
    if (side === 'hidden' || each === undefined) return;
    const box: LabelBox = labelBox(each, side, room.gap);
    assert.ok(box.left >= room.bounds.left && box.top >= room.bounds.top && box.right <= room.bounds.right && box.bottom <= room.bounds.bottom, `label ${index} leaves the room`);
    boxes.push({ name: `label ${index}`, box });
  });
  const found: string[] = [];
  boxes.forEach((a, index: number): void => {
    for (const b of boxes.slice(index + 1)) if (boxesMeet(a.box, b.box, 0)) found.push(`${a.name} meets ${b.name}`);
  });
  return found;
}

function stacked(keep: readonly number[]): LabelSpot[] {
  return keep.map((each: number, index: number): LabelSpot => spot(500, 300 + index * 70, 900, each));
}

void test('a lone label sits below its node', (): void => {
  assert.deepEqual(placeLabels([spot(500, 300)], ROOM), ['below']);
});

void test('a label that would leave the room takes the next free side', (): void => {
  assert.deepEqual(placeLabels([spot(500, 580)], ROOM), ['right']);
  assert.deepEqual(placeLabels([spot(960, 580)], ROOM), ['left']);
  assert.deepEqual(placeLabels([spot(500, 590, 990)], ROOM), ['above']);
});

void test('two nodes stacked closely put their labels where neither meets the other', (): void => {
  const spots: LabelSpot[] = [spot(500, 300), spot(500, 345)];
  const sides: LabelSide[] = placeLabels(spots, ROOM);
  assert.deepEqual(sides, ['right', 'below']);
  assert.deepEqual(overlaps(spots, sides, ROOM), []);
});

void test('a chain of close nodes gets labels that never meet a label, a node or the edge', (): void => {
  const spots: LabelSpot[] = [spot(655, 410, 150), spot(555, 395, 70), spot(455, 365, 70), spot(375, 305, 120), spot(465, 265, 70), spot(560, 280, 70), spot(655, 255, 170), spot(750, 280, 70), spot(845, 265, 70), spot(935, 300, 100), spot(800, 390, 130), spot(790, 560, 160), spot(380, 470, 150)];
  const room: LabelRoom = { ...ROOM, bounds: { left: 0, top: 0, right: 1600, bottom: 1000 } };
  const sides: LabelSide[] = placeLabels(spots, room);
  assert.ok(!sides.includes('hidden'));
  assert.deepEqual(overlaps(spots, sides, room), []);
  assert.deepEqual(placeLabels(spots, room), sides);
});

void test('when no side is free the label with the least to keep is hidden', (): void => {
  const room: LabelRoom = { ...ROOM, bounds: { left: 0, top: 270, right: 1000, bottom: 470 } };
  assert.deepEqual(placeLabels(stacked([3, 1, 1]), room), ['below', 'below', 'hidden']);
  assert.deepEqual(placeLabels(stacked([1, 1, 3]), room), ['below', 'hidden', 'above']);
  assert.deepEqual(overlaps(stacked([1, 1, 3]), ['below', 'hidden', 'above'], room), []);
});

void test('a label is never placed over another node', (): void => {
  const spots: LabelSpot[] = [spot(500, 300), spot(500, 350, 20)];
  const sides: LabelSide[] = placeLabels(spots, ROOM);
  const shown: ShownSide | 'hidden' = sides[0] ?? 'hidden';
  assert.notEqual(shown, 'below');
  assert.deepEqual(overlaps(spots, sides, ROOM), []);
});

void test('two labels never face each other in the gap between their nodes', (): void => {
  const room: LabelRoom = { ...OWNED, bounds: { ...OWNED.bounds, bottom: 430 } };
  const spots: LabelSpot[] = [spot(500, 300, 60), spot(500, 400, 990)];
  assert.deepEqual(placeLabels(spots, { ...room, clear: 0 }), ['below', 'above']);
  assert.deepEqual(placeLabels(spots, room), ['right', 'above']);
});

void test('a label sits nearer its own node than any other by the clear distance', (): void => {
  const spots: LabelSpot[] = [spot(500, 300, 60), spot(560, 345, 60)];
  assert.deepEqual(placeLabels(spots, ROOM), ['below', 'below']);
  assert.deepEqual(placeLabels(spots, OWNED), ['left', 'below']);
});
