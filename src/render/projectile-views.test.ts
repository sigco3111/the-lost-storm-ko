import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color } from 'three';
import type { BoltShape } from './projectile-views.ts';
import { boltShape, PROJECTILE_VIEWS, tintCore } from './projectile-views.ts';

void test('a bright shot is drawn full size and full glow, a dim one slimmer, shorter and dimmer', (): void => {
  assert.deepEqual(boltShape('bolt', 1), { glow: 1, girth: 1, length: 1 });
  assert.deepEqual(boltShape('bolt', 3), boltShape('bolt', 1));
  const dim: BoltShape = boltShape('bolt', 0);
  assert.deepEqual(dim, { glow: PROJECTILE_VIEWS.dimFrom, girth: PROJECTILE_VIEWS.slimFrom, length: PROJECTILE_VIEWS.shortFrom });
  const half: BoltShape = boltShape('bolt', 0.5);
  assert.ok(half.girth > dim.girth && half.girth < 1);
});

void test('an orb shrinks evenly in every direction', (): void => {
  const orb: BoltShape = boltShape('orb', 0.2);
  assert.equal(orb.length, orb.girth);
  assert.ok(orb.girth < 1);
});

void test('a tinted core keeps its hue and peaks at the tint level scaled by the shot light', (): void => {
  const core: Color = tintCore(new Color(0.5, 0.25, 1), 0.5);
  assert.ok(Math.abs(core.b - PROJECTILE_VIEWS.tintPeak * 0.5) < 1e-9);
  assert.ok(Math.abs(core.r / core.b - 0.5) < 1e-9 && Math.abs(core.g / core.b - 0.25) < 1e-9);
  assert.equal(tintCore(new Color(0, 0, 0), 1).r, 0);
});
