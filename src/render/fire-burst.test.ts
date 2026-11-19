import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { VfxBurn, VfxFlare } from '../../sim/content/vfx-types.ts';
import { must } from '../../test/support.ts';
import type { BurnClock } from './fire-burst.ts';
import { blastLevel, burnFade, FIRE, flareLevel, flaresCrossed, rekindle } from './fire-burst.ts';

const FLARES: readonly VfxFlare[] = [
  { at: 0.2, strength: 1 },
  { at: 0.5, strength: 0.4 },
];

void test('a flare jumps on its time and dies away, and two close flares never glow past full', (): void => {
  assert.equal(flareLevel(FLARES, 0.1), 0);
  assert.equal(flareLevel(FLARES, 0.2), 1);
  assert.ok(flareLevel(FLARES, 0.2 + FIRE.flareFade) < 0.4);
  assert.ok(flareLevel(FLARES, 0.5) >= 0.4);
  assert.equal(flareLevel([{ at: 0, strength: 0.8 }, { at: 0.01, strength: 0.8 }], 0.01), 1);
});

void test('each flare is crossed once, in the frame its time falls in', (): void => {
  assert.deepEqual(flaresCrossed(FLARES, 0, 0.2), [FLARES[0]]);
  assert.deepEqual(flaresCrossed(FLARES, 0.2, 0.49), []);
  assert.deepEqual(flaresCrossed(FLARES, 0.49, 0.6), [FLARES[1]]);
});

void test('the burn holds, then fades out to nothing at its end', (): void => {
  assert.equal(burnFade(-0.1, 1), 0);
  assert.equal(burnFade(0.2, 1), 1);
  assert.equal(burnFade(FIRE.fadeFrom, 1), 1);
  assert.ok(burnFade(0.8, 1) > 0 && burnFade(0.8, 1) < 1);
  assert.equal(burnFade(1, 1), 0);
  assert.equal(burnFade(0.5, 0), 0);
});

void test('catching fire again from the same skill keeps the burn and moves its end, and another skill starts a burn of its own', (): void => {
  const held: BurnClock = { skill: 'fire_burst', duration: 1.25, age: 1 };
  assert.deepEqual(rekindle(held, 'fire_burst', 1.25), { skill: 'fire_burst', duration: 2.25, age: 1 });
  assert.deepEqual(rekindle(held, 'wildfire', 0.8), { skill: 'wildfire', duration: 0.8, age: 0 });
  assert.deepEqual(rekindle(null, 'fire_burst', 1.25), { skill: 'fire_burst', duration: 1.25, age: 0 });
});

void test('the blast flashes at once and is mostly gone a few tenths later', (): void => {
  assert.equal(blastLevel(-1), 0);
  assert.equal(blastLevel(0), 1);
  assert.ok(blastLevel(0.3) < 0.1);
});

void test('Fire Burst blasts on the deepest hit and its flames flare on the crackles until the sound has died', (): void => {
  const fire: SkillDef = must(loadContent().skills.get('fire_burst'), 'fire_burst');
  const look: VfxBurn = must(fire.vfx.burn, 'fire burst look');
  assert.ok(fire.windup >= 0.25 && fire.windup <= 0.3);
  const delivery = fire.delivery;
  assert.ok(delivery.type === 'area');
  const duration: number = delivery.duration;
  assert.ok(Math.abs(fire.windup + duration - 1.58) < 0.05);
  const last: VfxFlare = must(look.flares.at(-1), 'last flare');
  assert.ok(last.at < duration);
  const strengths: number[] = look.flares.map((flare: VfxFlare): number => flare.strength);
  assert.ok((strengths[0] ?? 0) > last.strength);
  const burn = must(fire.burn, 'fire burn');
  assert.ok(burn.duration <= duration);
});
