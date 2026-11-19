import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { damageTo, dummy, offset, run, shapeArena, shapeSkill } from '../../test/shape-support.ts';
import type { SkillDef } from '../content/types.ts';
import { burnTicks, ignite, offenceOf } from './combat.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

interface Struck {
  readonly at: number;
  readonly amount: number;
  readonly burn: boolean;
}

function watchBurst(world: World, target: MonsterState, seconds: number): Struck[] {
  const step: number = 1 / 600;
  const struck: Struck[] = [];
  let clock: number = 0;
  const watch = (events: readonly WorldEvent[]): void => {
    for (const event of events) if (event.type === 'damage' && event.targetId === target.id) struck.push({ at: clock, amount: event.amount, burn: event.burn });
  };
  watch(stepWorld(world, [{ type: 'skill', slot: 0, aim: target.pos, targetId: null }], step));
  for (let index: number = 0; index < Math.round(seconds / step); index += 1) {
    clock += step;
    watch(stepWorld(world, [], step));
  }
  return struck;
}

void test('a burn ticks once per tick over its duration', (): void => {
  const fire: SkillDef = shapeSkill('fire_burst');
  const burn = must(fire.burn, 'fire burn');
  assert.equal(burnTicks(fire), Math.floor(burn.duration / burn.tick + 1e-9));
  assert.equal(burnTicks(shapeSkill('cleave')), 0);
});

void test('Fire Burst blasts the ground ahead the moment its windup ends, then the enemy it caught burns for a share of the hit on every tick', (): void => {
  const fire: SkillDef = shapeSkill('fire_burst');
  const burn = must(fire.burn, 'fire burn');
  const world: World = shapeArena(['fire_burst']);
  const target: MonsterState = dummy(world, offset(0, 4));
  const struck: Struck[] = watchBurst(world, target, 2);
  const blast: Struck = must(struck[0], 'blast');
  assert.equal(blast.burn, false);
  assert.ok(Math.abs(blast.at - fire.windup) < 0.01);
  const ticks: Struck[] = struck.filter((hit: Struck): boolean => hit.burn);
  assert.equal(ticks.length, burnTicks(fire));
  for (const [index, tick] of ticks.entries()) {
    assert.equal(tick.amount, Math.max(1, Math.round(blast.amount * burn.share)));
    assert.ok(Math.abs(tick.at - blast.at - (index + 1) * burn.tick) < 0.01);
  }
  assert.equal(target.burn, null);
});

void test('burning does not push, stagger or provoke a second burn of its own', (): void => {
  const world: World = shapeArena(['fire_burst']);
  const target: MonsterState = dummy(world, offset(0, 4));
  run(world, shapeSkill('fire_burst').windup + 0.2, [{ type: 'skill', slot: 0, aim: target.pos, targetId: null }]);
  const held = must(target.burn, 'burning');
  target.knock = { x: 0, z: 0 };
  target.stagger = 0;
  const later: WorldEvent[] = run(world, 0.6);
  assert.ok(damageTo(later, target.id).length >= 2);
  assert.deepEqual(target.knock, { x: 0, z: 0 });
  assert.equal(target.stagger, 0);
  assert.equal(later.filter((event: WorldEvent): boolean => event.type === 'burn').length, 0);
  assert.ok(held.ticksLeft < burnTicks(shapeSkill('fire_burst')));
});

void test('catching fire again refreshes the burn instead of stacking a second one', (): void => {
  const fire: SkillDef = shapeSkill('fire_burst');
  const world: World = shapeArena(['fire_burst']);
  const target: MonsterState = dummy(world, offset(0, 4));
  ignite(world, offenceOf(world.player), target, fire, 20);
  const first = must(target.burn, 'burning');
  first.ticksLeft = 1;
  ignite(world, offenceOf(world.player), target, fire, 10);
  const second = must(target.burn, 'still burning');
  assert.equal(second, first);
  assert.equal(second.ticksLeft, burnTicks(fire));
  assert.equal(second.perTick, Math.round(20 * must(fire.burn, 'burn').share));
});

void test('a burn can finish an enemy off, and then it stops', (): void => {
  const fire: SkillDef = shapeSkill('fire_burst');
  const world: World = shapeArena(['fire_burst']);
  const target: MonsterState = dummy(world, offset(0, 4));
  ignite(world, offenceOf(world.player), target, fire, 40);
  target.life = 1;
  const events: WorldEvent[] = run(world, 1.5);
  assert.equal(target.alive, false);
  assert.equal(target.burn, null);
  assert.equal(damageTo(events, target.id).length, 1);
  assert.equal(events.filter((event: WorldEvent): boolean => event.type === 'death').length, 1);
});

void test('a skill that does not burn leaves nothing burning', (): void => {
  const world: World = shapeArena(['cleave']);
  const target: MonsterState = dummy(world, offset(0, 1.2));
  run(world, 0.6, [{ type: 'skill', slot: 0, aim: target.pos, targetId: null }]);
  assert.equal(target.burn, null);
});
