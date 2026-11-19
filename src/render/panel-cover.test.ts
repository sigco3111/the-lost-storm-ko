import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, underPanel } from './panel-cover.ts';
import type { ScreenRect } from './label-stack.ts';

const panel: ScreenRect = { left: 800, top: 16, right: 1264, bottom: 640 };

void test('a label whose plate crosses an open panel is under it', (): void => {
  assert.equal(underPanel({ left: 760, top: 100, right: 860, bottom: 120 }, [panel]), true);
  assert.equal(underPanel({ left: 900, top: 300, right: 1000, bottom: 320 }, [panel]), true);
});

void test('a label beside a panel or with no panel open stays shown', (): void => {
  assert.equal(underPanel({ left: 600, top: 100, right: 800, bottom: 120 }, [panel]), false);
  assert.equal(underPanel({ left: 900, top: 640, right: 1000, bottom: 660 }, [panel]), false);
  assert.equal(underPanel({ left: 900, top: 300, right: 1000, bottom: 320 }, []), false);
});

void test('a label with no size is never counted as covered', (): void => {
  assert.equal(underPanel({ left: 900, top: 300, right: 900, bottom: 320 }, [panel]), false);
});

void test('any one of several panels covers a label', (): void => {
  const left: ScreenRect = { left: 16, top: 16, right: 420, bottom: 600 };
  assert.equal(underPanel({ left: 300, top: 200, right: 380, bottom: 220 }, [panel, left]), true);
});

void test('rectangles that only touch at an edge do not overlap', (): void => {
  assert.equal(overlaps({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 0, right: 20, bottom: 10 }), false);
  assert.equal(overlaps({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 9, top: 9, right: 20, bottom: 20 }), true);
});
