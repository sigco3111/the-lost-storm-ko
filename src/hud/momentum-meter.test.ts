import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena } from '../../test/arena-support.ts';
import { shapeSkill } from '../../test/shape-support.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
import type { MomentumMeterState, MomentumReading } from './momentum-meter.ts';
import { createMeterState, readMomentum } from './momentum-meter.ts';

const DT: number = 1 / 60;
const SPIN: SkillDef = { ...shapeSkill('test_wire'), id: 'test_spin', press: { type: 'channel', interval: 0.25, max: 30, move: 1, passThrough: false, hint: null }, momentum: { perHit: 1, cap: 20, grace: 0.5, drain: 10, steady: 4, manaPerHit: 0, lifePerHit: 0, tiers: [{ at: 5, turn: 1.2, reach: 1.1 }, { at: 10, turn: 1.4, reach: 1.2 }] } };

void test('the meter stays hidden for a hero with no momentum skill', (): void => {
  const world: World = arena(1);
  const state: MomentumMeterState = createMeterState();
  let reading: MomentumReading = readMomentum(state, world.player, DT);
  for (let frame: number = 0; frame < 30; frame += 1) reading = readMomentum(state, world.player, DT);
  assert.deepEqual(reading, { fill: 0, shown: 0, steady: 0, steps: [] });
});

void test('the meter eases toward the momentum and its steady glow, marks each step, and never jumps in one frame', (): void => {
  const world: World = arena(1);
  world.player.skills = [SPIN];
  world.player.momentum = { skill: 'test_spin', value: 20, quiet: 0 };
  const state: MomentumMeterState = createMeterState();
  const first: MomentumReading = readMomentum(state, world.player, DT);
  assert.ok(first.fill > 0 && first.fill < 0.5, `${first.fill}`);
  assert.ok(first.shown > 0 && first.shown < 0.5);
  assert.deepEqual(first.steps, [0.25, 0.5]);
  let reading: MomentumReading = first;
  for (let frame: number = 0; frame < 120; frame += 1) reading = readMomentum(state, world.player, DT);
  assert.ok(reading.fill > 0.98 && reading.shown > 0.98 && reading.steady > 0.98);
  world.player.momentum.value = 0;
  const after: MomentumReading = readMomentum(state, world.player, DT);
  assert.ok(after.fill > 0.5 && after.shown > 0.5);
});
