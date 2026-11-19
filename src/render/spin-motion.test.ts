import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, ARENA_CENTRE } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import { shapeSkill } from '../../test/shape-support.ts';
import type { SkillDef } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
import type { SpinMotion, SpinRead, WakeDrop } from './spin-motion.ts';
import { createSpinMotion, readSpin, SPIN_MOTION, spinShown, stepSpinMotion } from './spin-motion.ts';

const DT: number = 1 / 60;
const SPIN: SkillDef = { ...shapeSkill('test_wire'), id: 'test_spin', animation: 'sweep', delivery: { type: 'nova', radius: 3, side: 'foes' }, press: { type: 'channel', interval: 0.25, max: 30, move: 1, passThrough: false, hint: null }, momentum: { perHit: 1, cap: 10, grace: 0.5, drain: 10, steady: 3, manaPerHit: 0, lifePerHit: 0, tiers: [{ at: 5, turn: 1.25, reach: 1.2 }] } };

function spinning(world: World): void {
  world.player.skills = [SPIN];
  world.player.action = { skill: SPIN, phase: 'channel', timeLeft: 0.2, windup: 0.1, recovery: 0.1, direction: { x: 0, z: 1 }, target: null, travelSpeed: 0, travelLeft: 0, slot: 0, elapsed: 0, goal: null, turned: 0 };
}

void test('the spin reads its turn rate, reach, momentum share and steadiness from the sim, and nothing while the hero is not spinning', (): void => {
  const world: World = arena(1);
  assert.deepEqual(readSpin(world.player), { spinning: false, turnSpeed: 0, turned: 0, share: 0, steady: false, reach: SPIN_MOTION.restReach, animation: null });
  spinning(world);
  const slow: SpinRead = readSpin(world.player);
  assert.ok(slow.spinning);
  assert.ok(Math.abs(slow.turnSpeed - (Math.PI * 2) / 0.25) < 1e-9);
  assert.equal(slow.reach, 3);
  assert.equal(slow.animation, 'sweep');
  world.player.momentum = { skill: 'test_spin', value: 6, quiet: 0 };
  const fast: SpinRead = readSpin(world.player);
  assert.ok(fast.turnSpeed > slow.turnSpeed);
  assert.ok(Math.abs(fast.reach - 3.6) < 1e-9);
  assert.equal(fast.share, 0.6);
  assert.ok(fast.steady);
});

void test('turn speed, reach and the momentum share ease toward the sim, never jumping in one frame', (): void => {
  const motion: SpinMotion = createSpinMotion();
  const read: SpinRead = { spinning: true, turnSpeed: 25, turned: 0, share: 1, steady: true, reach: 4, animation: 'sweep' };
  stepSpinMotion(motion, read, ARENA_CENTRE, DT);
  assert.ok(motion.speed.value > 0 && motion.speed.value < 25 * 0.5, `${motion.speed.value}`);
  assert.ok(motion.share.value > 0 && motion.share.value < 0.5);
  for (let frame: number = 0; frame < 120; frame += 1) stepSpinMotion(motion, read, ARENA_CENTRE, DT);
  assert.ok(Math.abs(motion.speed.value - 25) < 0.5);
  assert.ok(Math.abs(motion.reach.value - 4) < 0.05);
  assert.equal(spinShown(motion), 1);
  const stop: SpinRead = { ...read, spinning: false, turnSpeed: 0, share: 0, steady: false, animation: null };
  stepSpinMotion(motion, stop, ARENA_CENTRE, DT);
  assert.ok(motion.share.value > 0.5);
  assert.equal(motion.animation, null);
  for (let frame: number = 0; frame < 240; frame += 1) stepSpinMotion(motion, stop, ARENA_CENTRE, DT);
  assert.equal(spinShown(motion), 0);
});

void test('a wake is dropped behind the hero once he has spun far enough, from where the last one ended', (): void => {
  const motion: SpinMotion = createSpinMotion();
  const read: SpinRead = { spinning: true, turnSpeed: 25, turned: 0, share: 0.5, steady: false, reach: 3, animation: 'sweep' };
  const drops: WakeDrop[] = [];
  for (let frame: number = 0; frame < 60; frame += 1) {
    const drop: WakeDrop | null = stepSpinMotion(motion, read, { x: frame * 0.1, z: 0 }, DT);
    if (drop !== null) drops.push(drop);
  }
  assert.ok(drops.length >= 4 && drops.length <= 6, `${drops.length}`);
  drops.forEach((drop: WakeDrop, index: number): void => {
    assert.ok(drop.to.x - drop.from.x >= SPIN_MOTION.wakeEvery - 1e-9);
    if (index > 0) assert.equal(drop.from.x, drops[index - 1]?.to.x);
  });
  assert.equal(stepSpinMotion(motion, { ...read, spinning: false }, { x: 10, z: 0 }, DT), null);
});

void test('the drawn turn is the turn the sim has made, so the body stops where the sim says it faces', (): void => {
  const world: World = arena(1);
  spinning(world);
  must(world.player.action, 'spinning').turned = 1.2;
  assert.equal(readSpin(world.player).turned, 1.2);
  const motion: SpinMotion = createSpinMotion();
  stepSpinMotion(motion, readSpin(world.player), ARENA_CENTRE, DT);
  assert.equal(motion.angle, 1.2);
  world.player.action = null;
  stepSpinMotion(motion, readSpin(world.player), ARENA_CENTRE, DT);
  assert.equal(motion.angle, 0);
});
