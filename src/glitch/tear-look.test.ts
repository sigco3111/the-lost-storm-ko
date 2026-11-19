import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TearLook } from './tear-look.ts';
import { CALM_LOOK, hudTear, portalTear } from './tear-look.ts';

void test('the HUD tears with the picture and is still at rest', (): void => {
  const torn = hudTear(portalTear(false));
  assert.ok(torn.tear > 0 && torn.split > 0);
  assert.deepEqual(hudTear(CALM_LOOK), { split: 0, tear: 0 });
});

void test('going through a portal tears the screen hard, and only whitens it when glitches are gentle', (): void => {
  const torn: TearLook = portalTear(false);
  assert.ok(torn.tear > 0 && torn.split > 0 && torn.blocks > 0);
  const gentle: TearLook = portalTear(true);
  assert.equal(gentle.tear, 0);
  assert.equal(gentle.split, 0);
  assert.equal(gentle.banded, false);
  assert.ok(gentle.white > 0 && gentle.white < 1);
});
