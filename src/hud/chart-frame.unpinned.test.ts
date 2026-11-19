import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AtlasFrame, AtlasView } from './atlas-view.ts';
import { labelTransform, writeView } from './chart-frame.ts';
import type { FrameLabel, FrameTargets } from './chart-frame.ts';

const FRAME: AtlasFrame = { width: 1400, height: 700, mapWidth: 1500, mapHeight: 1400 };
const VIEW: AtlasView = { x: 750, y: 700, scale: 1 };

interface Placed {
  readonly transform: string;
  readonly pinned: boolean;
}

function label(at: { readonly x: number; readonly y: number }, pins: boolean, writes: Placed[]): FrameLabel {
  return { at, halfWidth: 60, halfHeight: 10, pins, place: (transform: string, pinned: boolean): void => void writes.push({ transform, pinned }) };
}

function targets(labels: readonly FrameLabel[]): FrameTargets {
  return { labels, moveBoard: (): void => undefined };
}

void test('a name that does not pin stays where its place is and is flagged when that place is off the frame', (): void => {
  const writes: Placed[] = [];
  writeView(targets([label({ x: 1450, y: 1300 }, false, writes)]), VIEW, FRAME, 52);
  assert.deepEqual(writes, [{ transform: labelTransform({ x: 1400, y: 950, halfWidth: 60, halfHeight: 10 }), pinned: true }]);
});

void test('a name on the frame that does not pin is not flagged', (): void => {
  const writes: Placed[] = [];
  writeView(targets([label({ x: 750, y: 700 }, false, writes)]), VIEW, FRAME, 52);
  assert.equal(writes[0]?.pinned, false);
});

void test('a name that does not pin never pushes a pinned name aside', (): void => {
  const alone: Placed[] = [];
  writeView(targets([label({ x: 1450, y: 1300 }, true, alone)]), VIEW, FRAME, 52);
  const beside: Placed[] = [];
  writeView(targets([label({ x: 1450, y: 1300 }, true, beside), label({ x: 1450, y: 1300 }, false, [])]), VIEW, FRAME, 52);
  assert.deepEqual(beside, alone);
});
