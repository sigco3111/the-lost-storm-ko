import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { RecoveryDef } from '../content/combat-types.ts';
import type { SkillDef } from '../content/types.ts';
import { applyHit, offenceOf } from './combat.ts';
import { stepWorld } from './step.ts';
import { leechScale, stunMonster, stunned, stunScale } from './stun.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const DT: number = 1 / 60;
const RECOVERY: RecoveryDef = ARENA_CONTENT.world.recovery;
const claw: SkillDef = must(ARENA_CONTENT.skills.get('mended_rhythm'), 'claw');
const AT = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + 3 } as const;

function windingUp(monster: MonsterState): void {
  monster.action = { skill: claw, phase: 'windup', timeLeft: 0.5, windup: 1, recovery: 1, direction: { x: 0, z: -1 }, target: null, travelSpeed: 0, travelLeft: 0, slot: null, elapsed: 0.5, goal: null, turned: 0 };
}

function stepFor(world: World, seconds: number): void {
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) stepWorld(world, [], DT);
}

void test('a stun holds a monster still for its whole length, breaks its windup and is told to the renderer', (): void => {
  const world: World = arena(1);
  const monster: MonsterState = place(world, 'test_shambler', AT);
  windingUp(monster);
  assert.equal(stunMonster(world, monster, 1.2), 1.2);
  assert.equal(stunned(monster), true);
  assert.equal(monster.action, null);
  assert.ok(world.events.some((event: WorldEvent): boolean => event.type === 'stun' && event.monsterId === monster.id && event.duration === 1.2));
  assert.ok(world.events.some((event: WorldEvent): boolean => event.type === 'skill_interrupt' && event.actorId === monster.id));
  const pos = { x: monster.pos.x, z: monster.pos.z };
  stepFor(world, 1.1);
  assert.equal(stunned(monster), true);
  assert.deepEqual(monster.pos, pos);
  stepFor(world, 0.2);
  assert.equal(stunned(monster), false);
});

void test('a stunned monster cannot be stunned again until the stun and its rest have passed', (): void => {
  const world: World = arena(2);
  const monster: MonsterState = place(world, 'test_shambler', AT);
  assert.ok(stunMonster(world, monster, 1) > 0);
  stepFor(world, 1 + RECOVERY.stunRest - 0.2);
  assert.equal(stunMonster(world, monster, 1), 0);
  assert.equal(stunned(monster), false);
  stepFor(world, 0.3);
  assert.ok(stunMonster(world, monster, 1) > 0);
  assert.equal(stunned(monster), true);
});

void test('rares, magic monsters and bosses take a shortened stun, and a boss keeps its windup', (): void => {
  const world: World = arena(3);
  const plain: MonsterState = place(world, 'test_shambler', AT);
  const swift: MonsterState = place(world, 'test_shambler', { x: AT.x + 3, z: AT.z }, ['test_swift']);
  const boss: MonsterState = place(world, 'unfinished_colossus', { x: AT.x - 4, z: AT.z + 2 });
  assert.equal(stunScale(RECOVERY, plain), 1);
  assert.ok(RECOVERY.stunElite < 1 && RECOVERY.stunBoss < RECOVERY.stunElite);
  assert.ok(Math.abs(stunMonster(world, swift, 1.5) - 1.5 * RECOVERY.stunElite) < 1e-9);
  windingUp(boss);
  assert.ok(Math.abs(stunMonster(world, boss, 1.5) - 1.5 * RECOVERY.stunBoss) < 1e-9);
  assert.equal(boss.action?.phase, 'windup');
  assert.equal(leechScale(RECOVERY, plain), 1);
  assert.equal(leechScale(RECOVERY, swift), RECOVERY.leechElite);
  assert.equal(leechScale(RECOVERY, boss), RECOVERY.leechBoss);
});

void test('a skill with a stun stuns what it strikes and nothing that its hit kills', (): void => {
  const world: World = arena(4);
  const monster: MonsterState = place(world, 'test_shambler', AT);
  const skill: SkillDef = { ...claw, stun: 0.8 };
  applyHit(world, { ...offenceOf(world.player), critChance: 0 }, monster, skill, { x: 0, z: 1 });
  assert.equal(stunned(monster), true);
  const doomed: MonsterState = place(world, 'test_shambler', { x: AT.x + 3, z: AT.z });
  doomed.life = 1;
  world.events = [];
  applyHit(world, { ...offenceOf(world.player), critChance: 0 }, doomed, skill, { x: 0, z: 1 });
  assert.equal(doomed.alive, false);
  assert.equal(world.events.some((event: WorldEvent): boolean => event.type === 'stun'), false);
});
