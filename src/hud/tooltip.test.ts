import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Box, Measure, Size } from './tooltip.ts';
import { measureOnce, tooltipSpot } from './tooltip.ts';

const VIEW: Box = { left: 0, top: 0, right: 1440, bottom: 900 };

void test('beside a panel on the right the tooltip opens to its left, so the panel stays in view', (): void => {
  const panel: Box = { left: 1110, top: 30, right: 1430, bottom: 530 };
  const spot = tooltipSpot(1190, 350, 300, 280, VIEW, panel);
  assert.ok(spot.left + 300 <= panel.left);
  assert.equal(spot.top, 366);
});

void test('beside a panel on the left the tooltip opens to its right', (): void => {
  const panel: Box = { left: 10, top: 30, right: 330, bottom: 530 };
  assert.ok(tooltipSpot(200, 350, 300, 280, VIEW, panel).left >= panel.right);
});

void test('away from any panel it follows the pointer and flips at the screen edge', (): void => {
  assert.deepEqual(tooltipSpot(100, 100, 300, 200, VIEW, null), { left: 116, top: 116 });
  assert.deepEqual(tooltipSpot(1300, 800, 300, 200, VIEW, null), { left: 984, top: 584 });
});

void test('the tooltip reads its size once and reuses it on every move until it is cleared', (): void => {
  const reads: Size[] = [{ width: 300, height: 200 }, { width: 320, height: 240 }];
  let count: number = 0;
  const size: Measure = measureOnce((): Size => {
    const next: Size = reads[count] ?? { width: 0, height: 0 };
    count += 1;
    return next;
  });
  assert.deepEqual(size.get(), { width: 300, height: 200 });
  assert.deepEqual(size.get(), { width: 300, height: 200 });
  assert.equal(count, 1);
  size.clear();
  assert.deepEqual(size.get(), { width: 320, height: 240 });
  assert.equal(count, 2);
});

void test('a size the tooltip is told of replaces the measured one without reading it again', (): void => {
  let count: number = 0;
  const size: Measure = measureOnce((): Size => {
    count += 1;
    return { width: 300, height: 200 };
  });
  assert.deepEqual(size.get(), { width: 300, height: 200 });
  size.set({ width: 310, height: 260 });
  assert.deepEqual(size.get(), { width: 310, height: 260 });
  assert.equal(count, 1);
});
