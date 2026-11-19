import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillDef } from '../../sim/content/types.ts';
import type { Vec2 } from '../../sim/math.ts';
import { breaker, breakerHeading, lap, lapSpot, poolOf, splash, surge, swell, swirlHeading, whirl, WATER_LOOK } from './water-look.ts';
import type { WaterKit } from './water-look.ts';

const content: Content = loadContent();

interface Recorded {
  readonly sprays: number[];
  readonly rings: number[];
  readonly kit: WaterKit;
}

function recorder(): Recorded {
  const sprays: number[] = [];
  const rings: number[] = [];
  return { sprays, rings, kit: { spray: (_x: number, _y: number, _z: number, _color: Color, count: number): void => { sprays.push(count); }, ring: (_x: number, _z: number, radius: number): void => { rings.push(radius); } } };
}

void test('a rip current lies as a deep pool, a shadow skill keeps its shadow and a plain skill has no pool', (): void => {
  const still: SkillDef = must(content.skills.get('riptide_wake'), 'riptide_wake');
  assert.ok(still.vfx.water !== null);
  assert.deepEqual(poolOf(still.vfx), { color: still.vfx.water.deep, strength: still.vfx.water.depth });
  const umbra: SkillDef = must(content.skills.get('umbra'), 'umbra');
  assert.deepEqual(poolOf(umbra.vfx), umbra.vfx.shadow);
  assert.equal(poolOf(must(content.skills.get('cleave'), 'cleave').vfx), null);
});

void test('a lap stays inside the pool and lays a small ripple with a few drops', (): void => {
  const center: Vec2 = { x: 3, z: -2 };
  for (const share of [0, 0.3, 1]) {
    const spot: Vec2 = lapSpot(center, 4, 1.1, share);
    assert.ok(Math.hypot(spot.x - center.x, spot.z - center.z) <= 4 * WATER_LOOK.lapReach + 1e-9);
  }
  const seen: Recorded = recorder();
  lap(seen.kit, center, 4, new Color(1, 1, 1), (): number => 0.5);
  assert.deepEqual(seen.sprays, [WATER_LOOK.lapDrops]);
  assert.equal(seen.rings.length, 1);
  const ripple: number | undefined = seen.rings[0];
  assert.ok(ripple !== undefined && ripple >= WATER_LOOK.lapRingMin && ripple <= WATER_LOOK.lapRingMax);
});

void test('a splash throws its drops up from where the water strikes, more of them for a wave thrown with momentum', (): void => {
  const seen: Recorded = recorder();
  splash(seen.kit, { x: 0, z: 0 }, new Color(1, 1, 1), 0);
  splash(seen.kit, { x: 0, z: 0 }, new Color(1, 1, 1), 1);
  assert.deepEqual(seen.sprays, [WATER_LOOK.splashDrops, Math.round(WATER_LOOK.splashDrops * (1 + WATER_LOOK.splashGain))]);
  assert.deepEqual(seen.rings, []);
});

void test('a pulse of a water pool swells out as one faint ring inside the pool, with no drops', (): void => {
  const seen: Recorded = recorder();
  swell(seen.kit, { x: 0, z: 0 }, 4, new Color(1, 1, 1));
  assert.deepEqual(seen.rings, [4 * WATER_LOOK.swellReach]);
  assert.deepEqual(seen.sprays, []);
});

void test('a whirlpool turns its foam inward and around, never straight out', (): void => {
  for (const angle of [0, 1, 2.5, 4, 6]) {
    const heading: number = swirlHeading(angle);
    const outward: number = Math.sin(angle) * Math.sin(heading) + Math.cos(angle) * Math.cos(heading);
    assert.ok(outward < 0, `foam at ${String(angle)} heads outward`);
  }
  const seen: Recorded = recorder();
  whirl(seen.kit, { x: 0, z: 0 }, 5, 10, new Color(1, 1, 1), (): number => 0.5);
  assert.equal(seen.sprays.length, WATER_LOOK.swirlMotes);
});

void test('a whirlpool that pulls under throws one fountain of drops from its middle', (): void => {
  const seen: Recorded = recorder();
  surge(seen.kit, { x: 0, z: 0 }, new Color(1, 1, 1));
  assert.deepEqual(seen.sprays, [WATER_LOOK.surgeDrops]);
});

void test('a breaker lays one crest at its full reach and throws its drops out all round', (): void => {
  const seen: Recorded = recorder();
  breaker(seen.kit, { x: 0, z: 0 }, 5, new Color(1, 1, 1));
  assert.deepEqual(seen.rings, [5]);
  assert.equal(seen.sprays.length, WATER_LOOK.breakerDrops);
  let sumX: number = 0;
  let sumZ: number = 0;
  for (let index: number = 0; index < WATER_LOOK.breakerDrops; index += 1) {
    const heading: Vec2 = breakerHeading(index);
    assert.ok(Math.abs(Math.hypot(heading.x, heading.z) - 1) < 1e-9);
    sumX += heading.x;
    sumZ += heading.z;
  }
  assert.ok(Math.abs(sumX) < 1e-9 && Math.abs(sumZ) < 1e-9);
});
