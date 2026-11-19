import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PhoneLayout, PhoneScreen, Rect } from './phone-layout.ts';
import { layoutRects, overlaps, PHONE, phoneLayout } from './phone-layout.ts';

const SCREENS: readonly PhoneScreen[] = [
  { width: 390, height: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  { width: 390, height: 664, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 844, height: 390, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { width: 375, height: 667, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 667, height: 375, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 360, height: 640, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 320, height: 568, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 568, height: 320, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
  { width: 932, height: 430, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
];

const same = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

void test('a boss line on a phone stands clear of every button, globe, map and plate at every phone size', (): void => {
  for (const screen of SCREENS) {
    for (let skills = 0; skills <= 6; skills += 1) {
      for (let flasks = 0; flasks <= 2; flasks += 1) {
        const layout: PhoneLayout = phoneLayout(screen, { skills, flasks, menu: 6 });
        for (const { name, rect } of layoutRects(layout)) {
          if (name === 'toast') continue;
          assert.equal(overlaps(layout.bark, rect), false, `bark × ${name} at ${screen.width}x${screen.height} with ${skills} skills, ${flasks} flasks`);
        }
      }
    }
  }
});

void test('a boss line takes its own row above the toast where there is room, and shares the toast row where there is not', (): void => {
  for (const screen of SCREENS) {
    const layout: PhoneLayout = phoneLayout(screen, { skills: 5, flasks: 2, menu: 6 });
    const above: boolean = layout.bark.y + layout.bark.h + PHONE.gap === layout.toast.y && layout.bark.h === PHONE.barkHeight;
    assert.ok(above || same(layout.bark, layout.toast), `${screen.width}x${screen.height}`);
  }
  const landscape: PhoneLayout = phoneLayout({ width: 844, height: 390, safe: { top: 0, right: 0, bottom: 21, left: 0 } }, { skills: 5, flasks: 2, menu: 6 });
  assert.equal(overlaps(landscape.bark, landscape.toast), false);
});
