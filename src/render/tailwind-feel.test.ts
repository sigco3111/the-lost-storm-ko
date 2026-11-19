import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fallLook, glowTarget, killSparks, riseLook, stepGlow, TAILWIND_FEEL } from './tailwind-feel.ts';
import type { RiseLook } from './tailwind-feel.ts';

void test('each tier rises wider, brighter and with more sparks than the one before, and only the top tier shakes', (): void => {
  const looks: RiseLook[] = [1, 2, 3, 4, 5].map((tier: number): RiseLook => riseLook(tier, 5, false));
  for (let index: number = 1; index < looks.length; index += 1) {
    const before: RiseLook | undefined = looks[index - 1];
    const now: RiseLook | undefined = looks[index];
    assert.ok(before !== undefined && now !== undefined);
    assert.ok(now.radius > before.radius && now.light > before.light && now.sparks > before.sparks);
  }
  assert.deepEqual(looks.map((look: RiseLook): number => look.shake), [0, 0, 0, 0, TAILWIND_FEEL.topShake]);
});

void test('the softened setting dims every screen effect and never shakes', (): void => {
  const full: RiseLook = riseLook(5, 5, false);
  const soft: RiseLook = riseLook(5, 5, true);
  assert.equal(soft.shake, 0);
  assert.ok(soft.light < full.light && soft.sparks < full.sparks);
  assert.equal(soft.radius, full.radius);
  assert.ok(killSparks(5, true) < killSparks(5, false));
  assert.ok(glowTarget(5, 5, true) < glowTarget(5, 5, false));
});

void test('kills add sparks only while a tier holds, more at higher tiers', (): void => {
  assert.equal(killSparks(0, false), 0);
  assert.ok(killSparks(1, false) > 0);
  assert.ok(killSparks(5, false) > killSparks(1, false));
});

void test('a streak that reached the second tier falls softly, a short one passes without a mark', (): void => {
  assert.equal(fallLook(1, false), null);
  assert.ok(fallLook(2, false) !== null);
});

void test('the top-tier warmth glows only at the top tier and eases in and out, never jumping', (): void => {
  assert.equal(glowTarget(4, 5, false), 0);
  assert.ok(glowTarget(5, 5, false) > 0);
  const first: number = stepGlow(0, 1, 1 / 60);
  assert.ok(first > 0 && first < 0.1);
  let glow: number = 0;
  for (let frame: number = 0; frame < 600; frame += 1) glow = stepGlow(glow, 1, 1 / 60);
  assert.equal(glow, 1);
  const falling: number = stepGlow(1, 0, 1 / 60);
  assert.ok(falling < 1 && falling > 0.95);
});
