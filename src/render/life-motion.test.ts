import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import type { BirdKind, CrawlerKind, LifeGroup, MothKind } from './life-kinds.ts';
import type { Creature, Hero } from './life-motion.ts';
import { lifeCount, spawnGroup, stepCreature } from './life-motion.ts';

const DT: number = 1 / 60;
const FAR: Hero = { x: 500, z: 500 };

const CROW: BirdKind = { form: 'bird', id: 'crow', size: 0.5, colour: '#333333', flee: 6, speed: 6, circleRadius: 6, circleHeight: 7, circleSpeed: 0.5, settle: 4, flapRate: 3 };
const SPIDER: CrawlerKind = { form: 'crawler', id: 'spider', size: 0.3, colour: '#222222', flee: 3, speed: 2.4, amble: 0.3, roam: 1.2, pause: 2, legs: 8, stride: 0.15 };
const MOTH: MothKind = { form: 'moth', id: 'moth', size: 0.12, colour: '#eeddbb', roam: 0.9, height: 1.5, speed: 0.6, flapRate: 13 };

function group(kind: string, count: number, habit: LifeGroup['habit'] = 'perch'): LifeGroup {
  return { kind, x: 0, y: 0, z: 0, count, spread: 1, habit };
}

function run(creature: Creature, hero: Hero, seconds: number, from: number = 0): number {
  let time: number = from;
  for (; time < from + seconds; time += DT) stepCreature(creature, hero, time, DT);
  return time;
}

function gap(creature: Creature, hero: Hero): number {
  return Math.hypot(creature.pos.x - hero.x, creature.pos.z - hero.z);
}

void test('the low setting turns small life off, a thinner setting keeps fewer, and every group keeps at least one', (): void => {
  assert.equal(lifeCount(6, 0.35), 0);
  assert.equal(lifeCount(6, 1), 6);
  assert.equal(lifeCount(6, 0.7), 4);
  assert.equal(lifeCount(1, 0.5), 1);
  assert.equal(spawnGroup(CROW, group('crow', 6), 0.35, 1).length, 0);
});

void test('a perched bird sits still until the hero comes near, then takes off and climbs', (): void => {
  const bird: Creature = must(spawnGroup(CROW, group('crow', 1), 1, 1)[0], 'bird');
  const start = { ...bird.pos };
  run(bird, FAR, 5);
  assert.equal(bird.birdMode, 'perched');
  assert.deepEqual(bird.pos, start);
  run(bird, { x: bird.pos.x + 1, z: bird.pos.z }, 2);
  assert.equal(bird.birdMode, 'flying');
  assert.ok(bird.pos.y > 1);
  assert.ok(bird.flap > 0);
});

void test('a bird that took off lands back on its perch once the hero has gone and it has circled a while', (): void => {
  const bird: Creature = must(spawnGroup(CROW, group('crow', 1), 1, 2)[0], 'bird');
  const home = { ...bird.home };
  const time: number = run(bird, { x: bird.pos.x, z: bird.pos.z + 1 }, 1);
  run(bird, FAR, CROW.settle + 20, time);
  assert.equal(bird.birdMode, 'perched');
  assert.deepEqual(bird.pos, home);
});

void test('a circling bird stays aloft around its centre and never lands', (): void => {
  const bird: Creature = must(spawnGroup(CROW, group('crow', 1, 'circle'), 1, 3)[0], 'bird');
  for (let time: number = 0; time < 30; time += DT) {
    stepCreature(bird, FAR, time, DT);
    assert.notEqual(bird.birdMode, 'perched');
  }
  assert.ok(bird.pos.y > CROW.circleHeight / 2);
  assert.ok(Math.hypot(bird.pos.x, bird.pos.z) < CROW.circleRadius * 2);
});

void test('a crawler wanders near its home, and scuttles away fast when the hero steps close', (): void => {
  const spider: Creature = must(spawnGroup(SPIDER, group('spider', 1), 1, 4)[0], 'spider');
  run(spider, FAR, 20);
  assert.ok(Math.hypot(spider.pos.x - spider.home.x, spider.pos.z - spider.home.z) <= SPIDER.roam * 3 + 1e-9);
  const hero: Hero = { x: spider.pos.x + 1, z: spider.pos.z };
  const before: number = gap(spider, hero);
  run(spider, hero, 1);
  assert.ok(gap(spider, hero) > before + SPIDER.speed * 0.5);
  run(spider, hero, 5);
  assert.notEqual(spider.crawlerMode, 'flee');
});

void test('a moth flutters within reach of its light and never stops beating its wings', (): void => {
  const moth: Creature = must(spawnGroup(MOTH, group('moth', 1), 1, 5)[0], 'moth');
  for (let time: number = 0; time < 20; time += DT) {
    const phase: number = moth.phase;
    stepCreature(moth, FAR, time, DT);
    assert.ok(moth.phase > phase);
    assert.ok(Math.hypot(moth.pos.x - moth.home.x, moth.pos.z - moth.home.z) <= MOTH.roam * 2);
    assert.ok(moth.pos.y > 0);
  }
});

void test('the same group always hatches the same creatures in the same places', (): void => {
  const first: Creature[] = spawnGroup(SPIDER, group('spider', 3), 1, 7);
  const second: Creature[] = spawnGroup(SPIDER, group('spider', 3), 1, 7);
  assert.deepEqual(first.map((one: Creature) => one.home), second.map((one: Creature) => one.home));
});
