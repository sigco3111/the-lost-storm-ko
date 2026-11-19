import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BatShape } from './bat-look.ts';
import { BAT_LOOK, batShape } from './bat-look.ts';

interface Corner {
  readonly x: number;
  readonly z: number;
  readonly limb: number;
  readonly tone: number;
}

function corners(shape: BatShape): Corner[] {
  return Array.from(shape.limbs, (limb: number, index: number): Corner => ({ x: shape.positions[index * 3] ?? 0, z: shape.positions[index * 3 + 2] ?? 0, limb, tone: shape.tones[index] ?? 0 }));
}

void test('a bat is a small dark body between two wide wings, so it reads as a bat from above', (): void => {
  const all: Corner[] = corners(batShape());
  const body: Corner[] = all.filter((corner: Corner): boolean => corner.limb === 0);
  const span: number = Math.max(...all.map((corner: Corner): number => Math.abs(corner.x)));
  const bodyWidth: number = Math.max(...body.map((corner: Corner): number => Math.abs(corner.x)));
  assert.ok(span > bodyWidth * 8);
  assert.ok(body.every((corner: Corner): boolean => corner.tone === 0));
  assert.equal(all.filter((corner: Corner): boolean => corner.x > 0).length, all.filter((corner: Corner): boolean => corner.x < 0).length);
});

void test('the wing membrane is lighter than the bones and its trailing edge is scalloped between the fingers', (): void => {
  const membrane: Corner[] = corners(batShape()).filter((corner: Corner): boolean => corner.tone === 1);
  assert.ok(membrane.length > 0);
  const wing = BAT_LOOK.wing;
  for (const [index, valley] of wing.valleys.entries()) {
    const outer: readonly number[] = index === 0 ? wing.tip : (wing.fingers[index - 1] ?? wing.tip);
    const inner: readonly number[] = wing.fingers[index] ?? wing.attach;
    const along: number = Math.hypot(valley[0] - wing.wrist[0], valley[2] - wing.wrist[2]);
    assert.ok(along < Math.hypot((outer[0] ?? 0) - wing.wrist[0], (outer[2] ?? 0) - wing.wrist[2]));
    assert.ok(along < Math.hypot((inner[0] ?? 0) - wing.wrist[0], (inner[2] ?? 0) - wing.wrist[2]));
  }
});

void test('the outer wing bends further than the inner wing, and the body does not flap', (): void => {
  const all: Corner[] = corners(batShape());
  const tipBend: number = Math.max(...all.map((corner: Corner): number => corner.limb));
  const inner: Corner[] = all.filter((corner: Corner): boolean => corner.limb > 0 && Math.abs(corner.x) < BAT_LOOK.bend.from);
  assert.ok(Math.abs(tipBend - BAT_LOOK.bend.outer) < 1e-6);
  assert.ok(inner.every((corner: Corner): boolean => corner.limb === 1));
});
