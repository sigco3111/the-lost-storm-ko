import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AtlasFrame, AtlasView } from './atlas-view.ts';
import { writeView } from './chart-frame.ts';
import type { FrameLabel } from './chart-frame.ts';
import { labelsOverlap } from './chart-view.ts';
import type { LabelBox } from './chart-view.ts';

const FRAME: AtlasFrame = { width: 1400, height: 700, mapWidth: 1500, mapHeight: 1400 };
const VIEW: AtlasView = { x: 750, y: 700, scale: 1 };

function label(at: { readonly x: number; readonly y: number }, pins: boolean, hidden: boolean[]): FrameLabel {
  return { at, halfWidth: 80, halfHeight: 12, pins, place: (_transform: string, flagged: boolean): void => void hidden.push(flagged) };
}

void test('a specialty name that would lie on an arm name is hidden, and one clear of it shows', (): void => {
  const arm: boolean[] = [];
  const onTop: boolean[] = [];
  const clear: boolean[] = [];
  const shown: readonly LabelBox[] = writeView({ labels: [label({ x: 750, y: 700 }, true, arm), label({ x: 790, y: 708 }, false, onTop), label({ x: 750, y: 900 }, false, clear)], moveBoard: (): void => undefined }, VIEW, FRAME, 52);
  assert.deepEqual([arm, onTop, clear], [[false], [true], [false]]);
  assert.equal(shown.length, 2);
});

void test('of two specialty names that would overlap, the first shows and the second hides', (): void => {
  const first: boolean[] = [];
  const second: boolean[] = [];
  writeView({ labels: [label({ x: 700, y: 650 }, false, first), label({ x: 720, y: 655 }, false, second)], moveBoard: (): void => undefined }, VIEW, FRAME, 52);
  assert.deepEqual([first, second], [[false], [true]]);
});

void test('no two names writeView shows overlap, however the view is zoomed', (): void => {
  const spots: readonly { readonly x: number; readonly y: number }[] = [
    { x: 700, y: 640 },
    { x: 760, y: 650 },
    { x: 690, y: 700 },
    { x: 820, y: 720 },
    { x: 100, y: 100 },
    { x: 120, y: 110 },
    { x: 1400, y: 1300 },
  ];
  for (const scale of [0.4, 0.8, 1, 1.6, 2.5, 4]) {
    const labels: FrameLabel[] = spots.map((at, index: number): FrameLabel => label(at, index % 2 === 0, []));
    const shown: readonly LabelBox[] = writeView({ labels, moveBoard: (): void => undefined }, { x: 750, y: 700, scale }, FRAME, 52);
    shown.forEach((box: LabelBox, index: number): void => {
      for (const other of shown.slice(index + 1)) assert.equal(labelsOverlap(box, other), false, `scale ${scale}`);
    });
  }
});
