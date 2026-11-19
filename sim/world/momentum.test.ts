import assert from 'node:assert/strict';
import { isEmpty } from './press-buffer.ts';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { damageTo, dummy, offset, run, shapeArena, shapeSkill, SHAPE_DT } from '../../test/shape-support.ts';
import type { MomentumDef, MomentumSpend } from '../content/shape-types.ts';
import type { SkillDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { applyHit, kill, offenceOf } from './combat.ts';
import { momentumShare, momentumStep, spentSkill, steadied } from './momentum.ts';
import { channelInterval, spunSkill, turnRate } from './skills.ts';
import { stepWorld } from './step.ts';
import type { Command, MonsterState, ProjectileState, World, WorldEvent } from './types.ts';

const MOMENTUM_DEF: MomentumDef = { perHit: 1, cap: 10, grace: 0.5, drain: 10, steady: 3, manaPerHit: 0.5, lifePerHit: 0, tiers: [{ at: 4, turn: 1.25, reach: 1.2 }, { at: 8, turn: 1.5, reach: 1.4 }] };
const SPIN: SkillDef = { ...shapeSkill('test_wire'), id: 'test_spin', manaCost: 1, delivery: { type: 'nova', radius: 3, side: 'foes' }, press: { type: 'channel', interval: 0.2, max: 30, move: 1, passThrough: false, hint: null }, momentum: MOMENTUM_DEF };
const ROOTED: SkillDef = { ...SPIN, id: 'test_rooted_spin', press: { type: 'channel', interval: 0.2, max: 30, move: 0, passThrough: false, hint: null } };
const BLOW: SkillDef = { ...shapeSkill('test_wire'), id: 'test_blow', knockback: 12, root: 1, hold: 0.5, damage: { type: 'physical', weaponPercent: 0, flatMin: 3, flatMax: 3 } };
const HOLD: Command = { type: 'hold', slot: 0, down: true };

function spinner(skill: SkillDef = SPIN): World {
  const world: World = shapeArena([]);
  world.player.skills = [skill];
  world.player.stats = { ...world.player.stats, manaRegen: 0 };
  return world;
}

function startSpin(world: World, aim: { readonly x: number; readonly z: number }): void {
  stepWorld(world, [HOLD, { type: 'skill', slot: 0, aim, targetId: null }], SHAPE_DT);
}

interface Shaken {
  readonly rooted: boolean;
  readonly held: boolean;
  readonly knocked: boolean;
}

function shaken(world: World): Shaken {
  return { rooted: world.player.root > 0, held: world.player.tempo < 1, knocked: world.player.knock.x < 0 };
}

function ring(world: World, count: number, radius: number): MonsterState[] {
  return Array.from({ length: count }, (_unused: unknown, index: number): MonsterState => {
    const angle: number = (index / count) * Math.PI * 2;
    return dummy(world, offset(Math.cos(angle) * radius, Math.sin(angle) * radius));
  });
}

void test('a moving channel carries the hero toward the aim at full speed while it keeps turning, and a rooted one stays put', (): void => {
  const world: World = spinner();
  const from = { ...world.player.pos };
  startSpin(world, offset(9, 0));
  run(world, 0.5);
  assert.equal(world.player.action?.phase, 'channel');
  const covered: number = distance(from, world.player.pos);
  assert.ok(Math.abs(covered - world.player.stats.moveSpeed * 0.5) < 0.4, `covered ${covered}`);
  assert.ok(world.player.moving);
  const still: World = spinner(ROOTED);
  const start = { ...still.player.pos };
  startSpin(still, offset(9, 0));
  run(still, 0.5);
  assert.equal(still.player.action?.phase, 'channel');
  assert.ok(distance(start, still.player.pos) < 1e-6);
});

function turnGap(from: number, to: number): number {
  const full: number = Math.PI * 2;
  const delta: number = (((to - from) % full) + full) % full;
  return Math.min(delta, full - delta);
}

void test('a turning channel turns the hero with the spin, and when it ends she keeps the facing she turned to', (): void => {
  const world: World = spinner();
  startSpin(world, offset(0.3, 0));
  const aimed: number = world.player.facing;
  run(world, 0.45);
  const action = must(world.player.action, 'spinning');
  assert.equal(action.phase, 'channel');
  assert.ok(turnGap(world.player.facing, aimed) < 1e-9);
  assert.ok(action.turned > 0.5, `turned ${action.turned}`);
  const shown: number = world.player.facing + action.turned;
  const step: number = turnRate(world.player, action) * SHAPE_DT;
  stepWorld(world, [{ type: 'hold', slot: 0, down: false }], SHAPE_DT);
  assert.equal(world.player.action?.phase, 'recovery');
  assert.equal(world.player.action.turned, 0);
  assert.ok(turnGap(shown, world.player.facing) <= 2 * step + 1e-9, `gap ${turnGap(shown, world.player.facing)}`);
  const settled: number = world.player.facing;
  run(world, 1);
  assert.equal(world.player.action, null);
  assert.ok(turnGap(world.player.facing, settled) < 1e-9);
  const rooted: World = spinner(ROOTED);
  startSpin(rooted, offset(9, 0));
  run(rooted, 0.4);
  assert.equal(rooted.player.action?.turned, 0);
});

void test('a turn begun in the windup is kept when the press is let go before the spin starts, and when the hero falls mid-spin', (): void => {
  const tapped: World = spinner();
  startSpin(tapped, offset(0.3, 0));
  run(tapped, SPIN.windup * 0.8);
  const early = must(tapped.player.action, 'winding up');
  assert.equal(early.phase, 'windup');
  const aimed: number = tapped.player.facing;
  const turned: number = early.turned;
  assert.ok(turned > 0.2, `turned ${turned}`);
  const rest: number = turnRate(tapped.player, { ...early, phase: 'channel' }) * (SPIN.windup * 0.2 + 2 * SHAPE_DT);
  run(tapped, 1, [{ type: 'hold', slot: 0, down: false }]);
  assert.equal(tapped.player.action, null);
  const moved: number = turnGap(aimed, tapped.player.facing);
  assert.ok(moved >= turned - 1e-9 && moved <= turned + rest, `moved ${moved} turned ${turned} rest ${rest}`);
  const felled: World = spinner();
  startSpin(felled, offset(0.3, 0));
  run(felled, 0.4);
  const spun = must(felled.player.action, 'spinning');
  const facing: number = felled.player.facing + spun.turned;
  kill(felled, felled.player, { x: 1, z: 0 });
  assert.equal(felled.player.action, null);
  assert.ok(turnGap(facing, felled.player.facing) < 1e-9);
});

void test('steering, a walk or a move while spinning changes where the hero goes instead of waiting for the spin to end', (): void => {
  const world: World = spinner();
  startSpin(world, offset(0, 0));
  run(world, 0.2);
  stepWorld(world, [{ type: 'walk', held: true, dest: offset(0, 9) }], SHAPE_DT);
  assert.ok(isEmpty(world.player.buffered));
  run(world, 0.4);
  assert.ok(world.player.pos.z > offset(0, 0).z + 2);
  run(world, 0.4, [{ type: 'steer', aim: offset(-9, 0) }]);
  assert.ok(world.player.pos.x < offset(0, 0).x - 1);
  assert.equal(world.player.action?.phase, 'channel');
});

void test('every enemy struck feeds momentum up to the cap, and more momentum turns faster and reaches wider in steps', (): void => {
  const world: World = spinner();
  ring(world, 5, 2);
  startSpin(world, offset(0, 0));
  run(world, 0.25);
  assert.equal(world.player.momentum.skill, 'test_spin');
  assert.ok(world.player.momentum.value >= 5);
  run(world, 1.5);
  assert.equal(world.player.momentum.value, MOMENTUM_DEF.cap);
  assert.equal(momentumShare(world.player), 1);
  assert.deepEqual(momentumStep(MOMENTUM_DEF, 0), { turn: 1, reach: 1 });
  assert.deepEqual(momentumStep(MOMENTUM_DEF, 5), MOMENTUM_DEF.tiers[0]);
  assert.deepEqual(momentumStep(MOMENTUM_DEF, 10), MOMENTUM_DEF.tiers[1]);
  const fast: number = channelInterval(world.player, SPIN, 0.2);
  assert.ok(Math.abs(fast - 0.2 / 1.5) < 1e-9);
  const wide: SkillDef = spunSkill(world.player, SPIN);
  assert.ok(wide.delivery.type === 'nova' && Math.abs(wide.delivery.radius - 3 * 1.4) < 1e-9);
  world.player.momentum.value = 0;
  assert.equal(channelInterval(world.player, SPIN, 0.2), 0.2);
  assert.equal(spunSkill(world.player, SPIN), SPIN);
});

void test('a wide reach at full momentum strikes an enemy the plain turn would miss', (): void => {
  const world: World = spinner();
  const far: MonsterState = dummy(world, offset(0, 3.9));
  ring(world, 6, 1.5);
  startSpin(world, offset(0, 0));
  const early: WorldEvent[] = run(world, 0.1);
  assert.equal(damageTo(early, far.id).length, 0);
  const later: WorldEvent[] = run(world, 1.2);
  assert.ok(damageTo(later, far.id).length >= 1);
});

void test('above the steady mark the hero is not knocked back, rooted or held, but still takes the damage', (): void => {
  const world: World = spinner();
  const foe: MonsterState = dummy(world, offset(6, 0));
  world.player.momentum = { skill: 'test_spin', value: 5, quiet: 0 };
  assert.ok(steadied(world.player));
  const life: number = world.player.life;
  assert.ok(applyHit(world, offenceOf(foe), world.player, BLOW, { x: -1, z: 0 }));
  assert.equal(world.player.life, life - 3);
  assert.deepEqual(shaken(world), { rooted: false, held: false, knocked: false });
  world.player.momentum.value = 2;
  assert.ok(!steadied(world.player));
  applyHit(world, offenceOf(foe), world.player, BLOW, { x: -1, z: 0 });
  assert.deepEqual(shaken(world), { rooted: true, held: true, knocked: true });
});

void test('momentum holds for the grace after the last hit, then drains steadily, so running through empty ground loses it', (): void => {
  const world: World = spinner();
  world.player.momentum = { skill: 'test_spin', value: 8, quiet: 0 };
  run(world, 0.45);
  assert.equal(world.player.momentum.value, 8);
  run(world, 0.35);
  const draining: number = world.player.momentum.value;
  assert.ok(draining < 8 && draining > 4, `${draining}`);
  run(world, 1);
  assert.equal(world.player.momentum.value, 0);
  assert.ok(!steadied(world.player));
});

void test('momentum belongs to its skill: a skill that is no longer on the bar leaves none behind', (): void => {
  const world: World = spinner();
  world.player.momentum = { skill: 'test_spin', value: 8, quiet: 0 };
  world.player.skills = [shapeSkill('test_wire')];
  run(world, SHAPE_DT);
  assert.equal(world.player.momentum.value, 0);
  assert.equal(world.player.momentum.skill, null);
});

void test('each hit gives back mana, so spinning in a crowd pays for itself while spinning in empty air runs dry', (): void => {
  const crowd: World = spinner();
  ring(crowd, 4, 2);
  const full: number = crowd.player.mana;
  startSpin(crowd, offset(0, 0));
  run(crowd, 3);
  assert.equal(crowd.player.action?.phase, 'channel');
  assert.ok(crowd.player.mana >= full - 1, `${crowd.player.mana}`);
  const empty: World = spinner();
  empty.player.mana = 6;
  startSpin(empty, offset(0, 0));
  const events: WorldEvent[] = run(empty, 3);
  assert.equal(empty.player.action, null);
  assert.ok(events.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'no_mana'));
});

void test('a turn struck through a crowd numbers every enemy it hits', (): void => {
  const world: World = spinner();
  const foes: MonsterState[] = ring(world, 4, 2);
  startSpin(world, offset(0, 0));
  const events: WorldEvent[] = run(world, 0.25);
  for (const foe of foes) assert.ok(damageTo(events, foe.id).length >= 1);
  assert.ok(must(world.player.action, 'spin').skill.momentum !== null);
});

const SPEND: MomentumSpend = { damage: 0.1, area: 0.05, range: 0.05, stun: 0 };
const WAVE: SkillDef = { ...shapeSkill('test_wire'), id: 'test_wave', manaCost: 1, cooldown: 0, windup: 0.05, recovery: 0.05, delivery: { type: 'projectile', speed: 20, radius: 1, range: 6, pierce: 99, count: 1, spreadDegrees: 0, interval: 0 }, damage: { type: 'physical', weaponPercent: 0, flatMin: 10, flatMax: 10 }, shake: 0.2, hitStop: 0.04, spend: SPEND };

function launched(events: readonly WorldEvent[]): ProjectileState {
  const spawn: WorldEvent | undefined = events.find((event: WorldEvent): boolean => event.type === 'projectile_spawn');
  return must(spawn?.type === 'projectile_spawn' ? spawn.projectile : undefined, 'a launched wave');
}

void test('a spending skill grows with the momentum held: harder, wider and farther per point, and heavier to feel', (): void => {
  assert.equal(spentSkill(WAVE, 0, 0), WAVE);
  const full: SkillDef = spentSkill(WAVE, 10, 1);
  assert.ok(full.delivery.type === 'projectile');
  assert.ok(Math.abs(full.delivery.radius - 1.5) < 1e-9);
  assert.ok(Math.abs(full.delivery.range - 9) < 1e-9);
  assert.equal(full.damage.flatMin, 20);
  assert.ok(Math.abs(full.shake - 0.2 * Math.SQRT2) < 1e-9);
  assert.equal(full.spent, 1);
  assert.equal(full.stagger, WAVE.stagger);
  assert.equal(full.knockback, WAVE.knockback);
});

void test('a spending skill spends all the momentum the spin built, and from a cold start it is the plain skill', (): void => {
  const world: World = spinner();
  world.player.skills = [SPIN, WAVE];
  world.player.momentum = { skill: 'test_spin', value: 10, quiet: 0 };
  const hot: ProjectileState = launched(run(world, 0.2, [{ type: 'skill', slot: 1, aim: offset(0, 8), targetId: null }]));
  assert.equal(world.player.momentum.value, 0);
  assert.equal(hot.skill.spent, 1);
  assert.ok(hot.skill.delivery.type === 'projectile' && Math.abs(hot.skill.delivery.range - 9) < 1e-9);
  run(world, 1);
  const cold: ProjectileState = launched(run(world, 0.2, [{ type: 'skill', slot: 1, aim: offset(0, 8), targetId: null }]));
  assert.equal(cold.skill.spent, 0);
  assert.ok(cold.skill.delivery.type === 'projectile' && cold.skill.delivery.range === 6);
});

void test('a wave thrown with full momentum reaches an enemy the plain wave stops short of, and strikes it harder', (): void => {
  const plain: World = spinner();
  plain.player.skills = [SPIN, WAVE];
  const far: MonsterState = dummy(plain, offset(0, 10));
  assert.deepEqual(damageTo(run(plain, 1, [{ type: 'skill', slot: 1, aim: offset(0, 10), targetId: null }]), far.id), []);
  const charged: World = spinner();
  charged.player.skills = [SPIN, WAVE];
  charged.player.momentum = { skill: 'test_spin', value: 10, quiet: 0 };
  const reached: MonsterState = dummy(charged, offset(0, 10));
  const hits: number[] = damageTo(run(charged, 1, [{ type: 'skill', slot: 1, aim: offset(0, 10), targetId: null }]), reached.id);
  assert.equal(hits.length, 1);
  assert.ok((hits[0] ?? 0) > 10);
});

void test('a skill that spends momentum and stuns stuns longer the more momentum it spends, and a skill with no stun gains none', (): void => {
  const race: SkillDef = { ...shapeSkill('test_fork'), stun: 0.6, spend: { ...SPEND, stun: 0.9 } };
  const cap: number = 24;
  assert.equal(spentSkill(race, 0, 0).stun, 0.6);
  assert.ok(Math.abs(spentSkill(race, cap / 2, 0.5).stun - 1.05) < 1e-9);
  assert.ok(Math.abs(spentSkill(race, cap, 1).stun - 1.5) < 1e-9);
  assert.equal(spentSkill({ ...race, stun: 0 }, cap, 1).stun, 0);
});
