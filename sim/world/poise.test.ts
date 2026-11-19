import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { dummy, offset, shapeArena } from '../../test/shape-support.ts';
import { must } from '../../test/support.ts';
import type { RecoveryDef } from '../content/combat-types.ts';
import type { SkillDef } from '../content/types.ts';
import { refreshPlayer } from './character.ts';
import { applyHit, offenceOf } from './combat.ts';
import { heroShare, holdScale, pushShare, steadiness, stepRecovery } from './poise.ts';
import { startSkill } from './skills.ts';
import { stepWorld } from './step.ts';
import type { Command, MonsterState, PlayerState, World, WorldEvent } from './types.ts';

function withKnockback(monster: MonsterState, knockback: number): MonsterState {
  return { ...monster, def: { ...monster.def, poise: { ...monster.def.poise, knockback } } };
}

void test('steadiness is the share of a shove a monster takes, and the hero always takes his own', (): void => {
  const world: World = shapeArena([]);
  const monster: MonsterState = withKnockback(dummy(world, offset(1, 0)), 0.4);
  assert.equal(steadiness(monster), 0.4);
  assert.equal(steadiness(world.player), 1);
});

void test('two bodies split a push evenly unless one is immune to knockback, which never gives', (): void => {
  const world: World = shapeArena([]);
  const light: MonsterState = withKnockback(dummy(world, offset(1, 0)), 1);
  const heavy: MonsterState = withKnockback(dummy(world, offset(2, 0)), 0.25);
  const rooted: MonsterState = withKnockback(dummy(world, offset(3, 0)), 0);
  assert.equal(pushShare(light, heavy), 0.5);
  assert.equal(pushShare(light, rooted), 1);
  assert.equal(pushShare(rooted, light), 0);
  assert.equal(pushShare(rooted, rooted), 0.5);
  assert.equal(heroShare(light), 0);
  assert.equal(heroShare(rooted), 1);
});

const LOCK = {
  dt: 1 / 30,
  seconds: 10,
  gap: 1.6,
  life: 1e9,
  pooledShare: 2 / 3,
  eachShare: 0.5,
  heldShare: 0.25,
  monsters: ['wolf', 'rat', 'spider', 'unfinished_taker', 'unfinished_borrower', 'unfinished_brute', 'unfinished_thrower'],
  skills: ['cleave_millwheel', 'cleave', 'squall', 'standing_storm', 'quarrel', 'storm_bolt'],
} as const;

interface Bout {
  readonly hits: number;
  readonly held: number;
}

interface BoutRow {
  readonly kind: string;
  readonly fought: Bout;
  readonly idle: Bout;
}

function bout(skill: string, kind: string, attacking: boolean): Bout {
  const world: World = arena(1);
  const player: PlayerState = world.player;
  if (!player.learned.includes(skill)) player.learned.push(skill);
  player.bar = [skill, null, null, null, null, 'dodge_roll'];
  refreshPlayer(world);
  const monster: MonsterState = place(world, kind, { x: ARENA_CENTRE.x + LOCK.gap, z: ARENA_CENTRE.z });
  monster.maxLife = LOCK.life;
  let hits: number = 0;
  let held: number = 0;
  for (let step: number = 0; step < Math.round(LOCK.seconds / LOCK.dt); step += 1) {
    player.life = player.maxLife;
    player.mana = player.stats.maxMana;
    monster.life = LOCK.life;
    const commands: Command[] = attacking ? [{ type: 'hold', slot: 0, down: true }, { type: 'steer', aim: { x: player.pos.x, z: player.pos.z } }] : [];
    if (attacking && player.action === null) commands.push({ type: 'skill', slot: 0, aim: { x: monster.pos.x, z: monster.pos.z }, targetId: monster.id });
    hits += stepWorld(world, commands, LOCK.dt).filter((event: WorldEvent): boolean => event.type === 'damage' && event.targetId === player.id).length;
    if (monster.stagger > 0 || monster.motion === 'knocked') held += LOCK.dt;
  }
  return { hits, held: held / LOCK.seconds };
}

for (const skill of LOCK.skills) {
  void test(`a monster beside a hero who keeps using ${skill} for ten seconds gets most of its attacks off`, (): void => {
    const rows: BoutRow[] = LOCK.monsters.map((kind: string): BoutRow => ({ kind, fought: bout(skill, kind, true), idle: bout(skill, kind, false) }));
    const fought: number = rows.reduce((sum: number, row: BoutRow): number => sum + row.fought.hits, 0);
    const idle: number = rows.reduce((sum: number, row: BoutRow): number => sum + row.idle.hits, 0);
    const table: string = rows.map((row: BoutRow): string => `${row.kind} ${row.fought.hits}/${row.idle.hits} held ${Math.round(row.fought.held * 100)}%`).join(', ');
    assert.ok(fought >= idle * LOCK.pooledShare, `${fought} of ${idle} hits: ${table}`);
    for (const row of rows) {
      assert.ok(row.fought.hits >= row.idle.hits * LOCK.eachShare, `${row.kind}: ${table}`);
      assert.ok(row.fought.held <= LOCK.heldShare, `${row.kind} held: ${table}`);
    }
  });
}

function phaseOf(monster: MonsterState): string | null {
  return monster.action?.phase ?? null;
}

function struck(world: World, monster: MonsterState, skill: SkillDef): WorldEvent[] {
  world.events = [];
  applyHit(world, offenceOf(world.player), monster, skill, { x: 1, z: 0 });
  return world.events;
}

function shove(id: string, stagger: number, knockback: number): SkillDef {
  return { ...must(ARENA_CONTENT.skills.get('cleave'), 'cleave'), id, stagger, knockback };
}

void test('the first stagger of a fight lands in full: the hit shows, the monster flinches and loses the attack it was winding up', (): void => {
  const world: World = arena(2);
  const monster: MonsterState = place(world, 'wolf', { x: ARENA_CENTRE.x + LOCK.gap, z: ARENA_CENTRE.z });
  startSkill(world, monster, must(world.content.skills.get(monster.def.skill), 'wolf skill'), { x: -1, z: 0 });
  const events: WorldEvent[] = struck(world, monster, shove('test_flinch', 0.2, 0));
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'damage' && event.targetId === monster.id));
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'skill_interrupt' && event.actorId === monster.id));
  assert.equal(monster.stagger, 0.2);
  assert.equal(monster.action, null);
});

void test('a held monster shrugs off further staggers and shoves until it recovers, and longer the more it was held', (): void => {
  const recovery: RecoveryDef = ARENA_CONTENT.world.recovery;
  const world: World = arena(3);
  const monster: MonsterState = place(world, 'wolf', { x: ARENA_CENTRE.x + LOCK.gap, z: ARENA_CENTRE.z });
  struck(world, monster, shove('test_light', 0.1, 0));
  const light: number = monster.recovery.guard;
  assert.ok(Math.abs(light - (0.1 + recovery.window + recovery.perHeld * 0.1)) < 1e-9, `guard ${light}`);
  monster.stagger = 0;
  const events: WorldEvent[] = struck(world, monster, shove('test_shove', 0.4, 12));
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'damage' && event.targetId === monster.id));
  assert.equal(monster.stagger, 0);
  assert.equal(monster.knock.x, 0);
  const other: MonsterState = place(world, 'wolf', { x: ARENA_CENTRE.x - LOCK.gap, z: ARENA_CENTRE.z });
  struck(world, other, shove('test_heavy', 0.4, 0));
  assert.ok(other.recovery.guard > light, `${other.recovery.guard} after a long hold, ${light} after a short one`);
});

void test('once its guard and strain have faded, a monster is held in full again', (): void => {
  const world: World = arena(4);
  const monster: MonsterState = place(world, 'wolf', { x: ARENA_CENTRE.x + LOCK.gap, z: ARENA_CENTRE.z });
  struck(world, monster, shove('test_light', 0.2, 0));
  stepRecovery(world, monster, monster.recovery.guard + monster.recovery.strain / world.content.world.recovery.fade);
  assert.equal(monster.recovery.guard, 0);
  assert.equal(monster.recovery.strain, 0);
  monster.stagger = 0;
  struck(world, monster, shove('test_light', 0.2, 0));
  assert.equal(monster.stagger, 0.2);
});

void test('a monster that was interrupted gets its next windup off, even when its guard has lapsed', (): void => {
  const world: World = arena(5);
  const monster: MonsterState = place(world, 'wolf', { x: ARENA_CENTRE.x + LOCK.gap, z: ARENA_CENTRE.z });
  const pounce: SkillDef = must(world.content.skills.get(monster.def.skill), 'wolf skill');
  startSkill(world, monster, pounce, { x: -1, z: 0 });
  struck(world, monster, shove('test_light', 0.1, 0));
  assert.equal(monster.action, null);
  monster.recovery.guard = 0;
  monster.stagger = 0;
  startSkill(world, monster, pounce, { x: -1, z: 0 });
  const events: WorldEvent[] = struck(world, monster, shove('test_light', 0.1, 0));
  assert.ok(!events.some((event: WorldEvent): boolean => event.type === 'skill_interrupt'));
  assert.equal(phaseOf(monster), 'windup');
});

void test('a monster that starts an attack while it recovers stays steady until the attack lands', (): void => {
  const world: World = arena(6);
  const monster: MonsterState = place(world, 'wolf', { x: ARENA_CENTRE.x + LOCK.gap, z: ARENA_CENTRE.z });
  monster.recovery.guard = 0.05;
  const pounce: SkillDef = must(world.content.skills.get(monster.def.skill), 'wolf skill');
  startSkill(world, monster, pounce, { x: -1, z: 0 });
  assert.ok(monster.recovery.guard >= pounce.windup, `guard ${monster.recovery.guard}`);
});

void test('elites and bosses recover faster: a hold on them is shorter than on a plain monster', (): void => {
  const recovery: RecoveryDef = ARENA_CONTENT.world.recovery;
  const world: World = arena(7);
  const plain: MonsterState = place(world, 'wolf', { x: ARENA_CENTRE.x + LOCK.gap, z: ARENA_CENTRE.z });
  const elite: MonsterState = place(world, 'wolf', { x: ARENA_CENTRE.x - LOCK.gap, z: ARENA_CENTRE.z }, ['test_swift']);
  struck(world, plain, shove('test_light', 0.2, 0));
  struck(world, elite, shove('test_light', 0.2, 0));
  assert.equal(plain.stagger, 0.2);
  assert.ok(Math.abs(elite.stagger - 0.2 * recovery.elite) < 1e-9, `elite ${elite.stagger}`);
  const boss: MonsterState = { ...plain, def: must(ARENA_CONTENT.monsters.get('unfinished_colossus'), 'colossus') };
  assert.equal(holdScale(recovery, boss), recovery.boss);
  assert.ok(recovery.elite < 1 && recovery.boss < 1);
});
