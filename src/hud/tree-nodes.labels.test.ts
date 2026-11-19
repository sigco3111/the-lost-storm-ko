import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LabelBox } from './chart-view.ts';
import { cardSpot } from './tree-nodes.ts';
import type { CardRoom, CardSize, CardSpot, NodeSpot } from './tree-nodes.ts';

const ROOM: CardRoom = { width: 800, height: 600, edge: 10, gap: 8 };
const SIZE: CardSize = { width: 220, height: 120 };
const NODE: NodeSpot = { id: 'n', x: 400, y: 300, radius: 15 };

function covers(spot: CardSpot, label: LabelBox): boolean {
  return spot.x < label.x + label.halfWidth && spot.x + SIZE.width > label.x - label.halfWidth && spot.y < label.y + label.halfHeight && spot.y + SIZE.height > label.y - label.halfHeight;
}

void test('the card moves to another side of its place rather than cover a name', (): void => {
  const name: LabelBox = { x: 540, y: 300, halfWidth: 90, halfHeight: 12 };
  const spot: CardSpot = cardSpot(NODE, SIZE, [], ROOM, [name]);
  assert.equal(covers(spot, name), false);
});

void test('a place beside its own still matters more than a name, and with names on every side the card takes the fewest', (): void => {
  const below: NodeSpot = { id: 'b', x: 400, y: 346, radius: 15 };
  const above: NodeSpot = { id: 'a', x: 400, y: 254, radius: 15 };
  const left: NodeSpot = { id: 'l', x: 354, y: 300, radius: 15 };
  const name: LabelBox = { x: 540, y: 300, halfWidth: 90, halfHeight: 12 };
  const spot: CardSpot = cardSpot(NODE, SIZE, [below, above, left], ROOM, [name]);
  assert.ok(spot.x > NODE.x, 'the only side free of places is taken although a name lies there');
  const everywhere: readonly LabelBox[] = [name, { x: 260, y: 300, halfWidth: 90, halfHeight: 12 }, { x: 400, y: 160, halfWidth: 90, halfHeight: 12 }, { x: 260, y: 290, halfWidth: 60, halfHeight: 12 }];
  const fewest: CardSpot = cardSpot(NODE, SIZE, [], ROOM, everywhere);
  const covered: number = everywhere.filter((label: LabelBox): boolean => covers(fewest, label)).length;
  assert.ok(covered <= 1, `covers ${covered}`);
});
