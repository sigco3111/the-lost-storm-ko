import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import type { Bat, BatEvent, Colony } from './bat-colony.ts';
import { BAT_COLONY, createColony, refuge, settleRoosts, stepColony } from './bat-colony.ts';
import type { BatKind, LifeGroup } from './life-kinds.ts';
import type { Hero } from './life-motion.ts';

const DT: number = 1 / 60;
const FAR: Hero = { x: 500, z: 500 };
const BAT: BatKind = { form: 'bat', id: 'bat', size: 0.38, colour: '#1d1714', membrane: '#5a3f33', glow: 0.4, beat: 0.5, bob: 0.06, wake: 7, stir: 9, speed: 5.5, flapRate: 9, jitter: 1.1, jitterRate: 3.2, arc: 1.2, hop: 0.6, most: 4, cross: 20, reach: 45, shuffle: 6, rest: 12 };

function roost(x: number, z: number, count: number): LifeGroup {
  return { kind: 'bat', x, y: 3, z, count, spread: 0.9, habit: 'perch' };
}

function colonyOf(groups: readonly LifeGroup[], slope: number = 0.1): Colony {
  const colony: Colony = createColony(BAT, groups, 1);
  settleRoosts(colony, (x: number): number => x * slope);
  return colony;
}

function run(colony: Colony, hero: Hero, stirs: readonly Hero[], seconds: number, from: number = 0): BatEvent[] {
  const events: BatEvent[] = [];
  for (let time: number = from; time < from + seconds; time += DT) events.push(...stepColony(colony, hero, stirs, time, DT));
  return events;
}

function at(colony: Colony, index: number): Bat[] {
  return colony.bats.filter((bat: Bat): boolean => bat.roost === index);
}

void test('bats hang at their roost height on the floor below, still, until the hero comes near', (): void => {
  const colony: Colony = colonyOf([roost(10, 0, 4), roost(40, 0, 3)]);
  const before: string = JSON.stringify(colony.bats.map((bat: Bat): number[] => [bat.pos.x, bat.pos.y, bat.pos.z]));
  for (const bat of at(colony, 0)) assert.ok(Math.abs(bat.pos.y - (1 + 3)) <= BAT_COLONY.hangLow + 1e-9);
  const events: BatEvent[] = run(colony, FAR, [], 4);
  assert.equal(events.length, 0);
  assert.equal(JSON.stringify(colony.bats.map((bat: Bat): number[] => [bat.pos.x, bat.pos.y, bat.pos.z])), before);
  assert.ok(colony.bats.every((bat: Bat): boolean => bat.mode === 'hanging'));
});

void test('the hero walking under a cluster sends a few of it fluttering off to another roost, where they hang again', (): void => {
  const colony: Colony = colonyOf([roost(10, 0, 4), roost(40, 0, 3)]);
  const events: BatEvent[] = run(colony, { x: 11, z: 2 }, [], DT * 2);
  const stirred: BatEvent = must(events[0], 'disturbed');
  assert.deepEqual(stirred, { type: 'bats-disturbed', x: 10, y: 4, z: 0, count: 2 });
  assert.equal(at(colony, 1).length, 5);
  assert.equal(at(colony, 0).length, 2);
  run(colony, { x: 11, z: 2 }, [], BAT.rest - 1, DT * 2);
  for (const bat of at(colony, 1)) {
    assert.equal(bat.mode, 'hanging');
    assert.ok(Math.hypot(bat.pos.x - 40, bat.pos.z) < 3);
  }
});

void test('a flight wanders off the straight line between the roosts, dips as it drops off, and stays loose rather than wild', (): void => {
  const colony: Colony = colonyOf([roost(0, 0, 1), roost(30, 0, 1)], 0);
  run(colony, { x: 0, z: 1 }, [], DT);
  const bat: Bat = must(at(colony, 1).find((one: Bat): boolean => one.mode === 'flying'), 'flyer');
  const startY: number = bat.pos.y;
  let widest: number = 0;
  let lowest: number = startY;
  for (let time: number = 0; time < 8 && bat.mode === 'flying'; time += DT) {
    stepColony(colony, FAR, [], time, DT);
    widest = Math.max(widest, Math.abs(bat.pos.z - (bat.from.z + (bat.to.z - bat.from.z) * bat.along)));
    lowest = Math.min(lowest, bat.pos.y);
  }
  assert.equal(bat.mode, 'hanging');
  assert.ok(widest > BAT.jitter * 0.3);
  assert.ok(widest < BAT.jitter * (1 + BAT_COLONY.bend) + 2);
  assert.ok(lowest < startY - BAT_COLONY.drop * 0.3);
});

void test('a fight under a roost stirs it and a fight elsewhere does not, and a stirred roost settles before it can be stirred again', (): void => {
  const colony: Colony = colonyOf([roost(10, 0, 4), roost(40, 0, 3), roost(70, 0, 3)]);
  assert.equal(run(colony, FAR, [{ x: 70, z: 30 }], 1).length, 0);
  const first: BatEvent[] = run(colony, FAR, [{ x: 12, z: 3 }], 1);
  assert.equal(first.filter((event: BatEvent): boolean => event.type === 'bats-disturbed').length, 1);
  assert.equal(run(colony, FAR, [{ x: 12, z: 3 }], BAT.rest - 2, 1).filter((event: BatEvent): boolean => event.type === 'bats-disturbed').length, 0);
  assert.equal(run(colony, FAR, [{ x: 12, z: 3 }], 3, BAT.rest).filter((event: BatEvent): boolean => event.type === 'bats-disturbed').length, 1);
});

void test('bats fly away from the hero, never to a roost beside him', (): void => {
  const colony: Colony = colonyOf([roost(10, 0, 3), roost(20, 0, 3), roost(45, 0, 3)]);
  assert.equal(refuge(colony, 0, { x: 18, z: 0 }, 0), 2);
  assert.equal(refuge(colony, 0, { x: 18, z: 0 }, 0.99), 2);
});

void test('now and then a lone bat crosses to another roost on its own, rarely and never as a swarm', (): void => {
  const colony: Colony = colonyOf([roost(0, 0, 4), roost(30, 0, 4), roost(30, 30, 4)]);
  const events: BatEvent[] = run(colony, FAR, [], 240);
  const crossings: number = events.filter((event: BatEvent): boolean => event.type === 'bat-flyby').length;
  assert.ok(crossings >= 4, `crossings ${crossings}`);
  assert.ok(crossings <= 30, `crossings ${crossings}`);
  assert.ok(events.every((event: BatEvent): boolean => event.type === 'bat-flyby'));
});

void test('a cluster shuffles now and then while it hangs, with a brief half-open flutter', (): void => {
  const colony: Colony = colonyOf([roost(0, 0, 3), roost(30, 0, 3)]);
  let fluttered: number = 0;
  for (let time: number = 0; time < 20; time += DT) {
    stepColony(colony, FAR, [], time, DT);
    fluttered += colony.bats.filter((bat: Bat): boolean => bat.mode === 'hanging' && bat.flap > 0 && bat.flap < 1).length > 0 ? 1 : 0;
  }
  assert.ok(fluttered > 0);
  assert.ok(fluttered < (20 / DT) * 0.8);
});

void test('the low setting keeps no bats', (): void => {
  assert.equal(createColony(BAT, [roost(0, 0, 4)], 0.3).bats.length, 0);
});
