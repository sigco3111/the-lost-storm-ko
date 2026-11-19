import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CharmDesign } from './charm-designs.ts';
import { BAIL, CHARM_DESIGNS } from './charm-designs.ts';
import type { Triangle } from './headgear-shapes.ts';

function built(design: CharmDesign): Triangle[] {
  const soup: Triangle[] = [];
  design.build(soup);
  return soup;
}

void test('every charm has its own piece name', (): void => {
  const pieces: string[] = CHARM_DESIGNS.map((design: CharmDesign): string => design.piece);
  assert.equal(new Set<string>(pieces).size, pieces.length);
});

void test('every charm hangs below its hang point from a bail ring that closes around the cord', (): void => {
  const reach: number = BAIL.radius + BAIL.tube + 1e-6;
  for (const design of CHARM_DESIGNS) {
    const corners = built(design).flatMap((triangle: Triangle) => triangle.corners);
    assert.ok(corners.length > 0, design.piece);
    const top: number = Math.max(...corners.map((corner) => corner.y));
    const bottom: number = Math.min(...corners.map((corner) => corner.y));
    assert.ok(top > BAIL.radius && top <= reach, `${design.piece} bail top ${top}`);
    assert.ok(bottom < -BAIL.drop, `${design.piece} hangs to ${bottom}`);
    assert.ok(corners.every((corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y) && Number.isFinite(corner.z)), design.piece);
  }
});
