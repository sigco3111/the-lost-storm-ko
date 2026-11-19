import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { VfxRipple, VfxWave } from '../../sim/content/vfx-types.ts';
import { must } from '../../test/support.ts';
import { Color } from 'three';
import { crestRate, finished, GHOST_WAVE, hushed, mistLasts, poweredGlow, riseIn, rippleLevel, rippleReach } from './ghost-wave.ts';

const RIPPLE: VfxRipple = { delay: 1, strength: 0.5 };

void test('a wave front eases in over its rise and then holds', (): void => {
  assert.equal(riseIn(0), 0);
  assert.equal(riseIn(GHOST_WAVE.rise), 1);
  assert.equal(riseIn(5), 1);
  assert.ok(riseIn(GHOST_WAVE.rise / 2) > 0 && riseIn(GHOST_WAVE.rise / 2) < 1);
});

void test('an after-wave waits for its delay, then travels at the wave speed and fades along the path', (): void => {
  assert.equal(rippleReach(RIPPLE, 0.5, 10), -5);
  assert.equal(rippleReach(RIPPLE, 1.5, 10), 5);
  assert.equal(rippleLevel(RIPPLE, 0.9, 10, 12), 0);
  const near: number = rippleLevel(RIPPLE, 1 + GHOST_WAVE.rise, 10, 12);
  const far: number = rippleLevel(RIPPLE, 2, 10, 12);
  assert.ok(near > far && far > 0);
  assert.ok(near <= RIPPLE.strength);
  assert.equal(rippleLevel(RIPPLE, 1 + 1.2 + GHOST_WAVE.settle, 10, 12), 0);
});

void test('a wave is finished once its last after-wave has run the path and settled', (): void => {
  const look: VfxWave = { halfWidth: 1, depth: 1, mist: 0, swell: [1, 1], ripples: [{ delay: 0.5, strength: 0.4 }, RIPPLE], quiet: 5 };
  assert.equal(finished(look, 2.2, 10, 12), false);
  assert.equal(finished(look, 2.2 + GHOST_WAVE.settle + 0.01, 10, 12), true);
  assert.equal(finished({ ...look, quiet: 1.5 }, 1.5, 10, 12), true);
});

void test('every front fades out over the hush and is gone when the sound goes quiet', (): void => {
  const look: VfxWave = { halfWidth: 1, depth: 1, mist: 0, swell: [1, 1], ripples: [RIPPLE], quiet: 2 };
  assert.equal(hushed(look, 2 - GHOST_WAVE.hush), 1);
  assert.ok(hushed(look, 2 - GHOST_WAVE.hush / 2) > 0 && hushed(look, 2 - GHOST_WAVE.hush / 2) < 1);
  assert.equal(hushed(look, 2), 0);
});

void test('Ghost Wave leaves on the attack and its after-waves leave on the measured echoes, the last the faintest', (): void => {
  const wave: SkillDef = must(loadContent().skills.get('ghost_wave'), 'ghost_wave');
  const look: VfxWave = must(wave.vfx.wave, 'ghost wave look');
  assert.ok(wave.windup <= 0.15);
  const echoes: readonly number[] = [1.07, 1.35, 1.6, 1.8, 1.98];
  assert.deepEqual(look.ripples.map((ripple: VfxRipple): number => Math.round((ripple.delay + wave.windup) * 100) / 100), echoes);
  const strengths: number[] = look.ripples.map((ripple: VfxRipple): number => ripple.strength);
  assert.equal(Math.min(...strengths), strengths.at(-1));
  assert.ok(Math.max(...strengths) < Math.max(...look.swell));
  assert.ok(Math.abs(look.quiet + wave.windup - 2.3) < 0.01);
});

void test('mist left by a wave is gone by the time the wave falls quiet', (): void => {
  const look: VfxWave = { halfWidth: 1, depth: 1, mist: 10, swell: [1, 1], ripples: [RIPPLE], quiet: 2 };
  assert.equal(mistLasts(look, 0), GHOST_WAVE.mistLifeMax);
  assert.ok(Math.abs(mistLasts(look, 2 - GHOST_WAVE.mistLifeMax / 2) - GHOST_WAVE.mistLifeMax / 2) < 1e-9);
  assert.equal(mistLasts(look, 2), 0);
  assert.equal(mistLasts(look, 3), 0);
});

void test('a water wave throws more foam off its crest and glows brighter the more momentum went into it, and a dry wave keeps its plain glow', (): void => {
  const foam: Color = new Color(1, 1, 1);
  assert.equal(poweredGlow(null), GHOST_WAVE.glow);
  assert.ok(poweredGlow({ foam, power: 1 }) > poweredGlow({ foam, power: 0 }));
  assert.ok(crestRate({ foam, power: 1 }, 1) > crestRate({ foam, power: 0 }, 1));
  assert.equal(crestRate({ foam, power: 1 }, 0), 0);
});

void test('Millrace runs as a foam crest over deep water and leaves a thin wash behind it, fainter than the crest, with no haze', (): void => {
  const race: SkillDef = must(loadContent().skills.get('millrace'), 'millrace');
  const look: VfxWave = must(race.vfx.wave, 'millrace look');
  assert.ok(race.vfx.water !== null);
  assert.equal(look.mist, 0);
  assert.ok(look.ripples.length > 0);
  assert.ok(look.ripples.every((ripple: VfxRipple): boolean => ripple.strength < Math.max(...look.swell) / 2));
});
