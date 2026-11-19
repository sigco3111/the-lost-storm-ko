import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestScene } from '../../test/motion-support.ts';
import { MOTION_DT, placedProp, sceneZone } from '../../test/motion-support.ts';
import { armed, must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, DashDelivery, SkillDef, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { isWalkable, lineWalkable } from '../nav/grid.ts';
import { applyHit, offenceOf, targetsOf } from './combat.ts';
import { clearSpot, DASH, dashAim, isDashing, isInvulnerable, passesThrough, rollsSteady } from './dash.ts';
import { separateActors } from './movement.ts';
import { startSkill } from './skills.ts';
import { spawnPacks } from './monsters.ts';
import { stepWorld } from './step.ts';
import type { ActionState, Command, MonsterState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';
import { roadWorld, roadZone, SCENE_BASE } from '../../test/road-support.ts';
import { dummy, offset, shapeArena } from '../../test/shape-support.ts';
import { refreshPlayer } from './character.ts';

const content: Content = loadContent();
const base: ZoneDef = SCENE_BASE;
const roll: SkillDef = must(content.skills.get('dodge_roll'), 'dodge_roll');
const slot: number = content.player.skillBar.findIndex((entry): boolean => entry.skill === roll.id);
function dashOfRoll(): DashDelivery {
  if (roll.delivery.type !== 'dash') throw new Error('dodge_roll is not a dash');
  return roll.delivery;
}

const dash: DashDelivery = dashOfRoll();

const OPEN: readonly string[] = ['.......', '.......', '.......', '.......', '.......', '.......', '.......'];
const WALLED: readonly string[] = ['....   ', '....   ', '....   ', '....   ', '....   ', '....   ', '....   '];
const LIMITS = { tolerance: 0.05, settle: 3, shove: 0.2 } as const;

type Start = Extract<WorldEvent, { readonly type: 'skill_start' }>;

function scene(name: string, layout: TestScene): World {
  const world: World = armed(worldIn(content, content.world.start, 5));
  enterZone(world, sceneZone(base, `test_${name}`, layout), { type: 'start' });
  world.events = [];
  world.monsters = [];
  return world;
}

function rootOf(world: World): number {
  return world.player.root;
}

function rollToward(aim: Vec2): Command {
  return { type: 'skill', slot, aim, targetId: null };
}

function started(events: readonly WorldEvent[], actorId: number): Start | null {
  return events.find((event: WorldEvent): event is Start => event.type === 'skill_start' && event.actorId === actorId && event.skill.id === roll.id) ?? null;
}

function finish(world: World): Vec2[] {
  const trace: Vec2[] = [{ ...world.player.pos }];
  for (let step: number = 0; step < LIMITS.settle / MOTION_DT && world.player.action !== null; step += 1) {
    stepWorld(world, [], MOTION_DT);
    trace.push({ ...world.player.pos });
  }
  return trace;
}

function spawnAt(world: World, kind: string, at: Vec2): MonsterState {
  world.zone = { ...world.zone, packs: [{ x: at.x, z: at.z, members: [{ monster: kind, count: 1, mods: [] }], when: [] }] };
  spawnPacks(world);
  const monster: MonsterState = must(world.monsters.at(-1), kind);
  monster.pos = { x: at.x, z: at.z };
  monster.spawnTime = 0;
  return monster;
}

void test('the roll is a dash skill bound to Space on the skill bar', (): void => {
  assert.ok(slot >= 0);
  assert.deepEqual(content.player.skillBar[slot]?.bindings, ['Space']);
  assert.ok(dash.distance > 0 && dash.invulnerable > 0 && dash.invulnerable < dash.duration && roll.cooldown > 0);
  assert.equal(roll.windup, dash.duration);
});

void test('a roll starts on the frame of the key press and covers its full distance on open ground', (): void => {
  const world: World = scene('open', { tiles: OPEN, props: [], start: { x: 14, z: 14 } });
  const from: Vec2 = { ...world.player.pos };
  const events: WorldEvent[] = stepWorld(world, [rollToward({ x: from.x + 10, z: from.z })], MOTION_DT);
  assert.notEqual(started(events, world.player.id), null);
  assert.ok(world.player.pos.x > from.x);
  finish(world);
  assert.ok(Math.abs(world.player.pos.x - from.x - dash.distance) < LIMITS.tolerance, `${world.player.pos.x - from.x}`);
  assert.ok(Math.abs(world.player.pos.z - from.z) < LIMITS.tolerance);
});

void test('a roll into a wall stops at the wall and never ends inside it', (): void => {
  const world: World = scene('wall', { tiles: WALLED, props: [], start: { x: 13, z: 14 } });
  const from: Vec2 = { ...world.player.pos };
  stepWorld(world, [rollToward({ x: from.x + 10, z: from.z })], MOTION_DT);
  const trace: Vec2[] = finish(world);
  assert.ok(world.player.pos.x - from.x < dash.distance - 1);
  assert.ok(world.player.pos.x < 16);
  for (const pos of trace) assert.ok(isWalkable(world.grid, pos.x, pos.z));
});

void test('a roll at a prop slides along it without passing through or stopping inside', (): void => {
  const world: World = scene('prop', { tiles: OPEN, props: [placedProp('mossy_pillar', 14, 14)], start: { x: 10, z: 13.6 } });
  const from: Vec2 = { ...world.player.pos };
  stepWorld(world, [rollToward({ x: from.x + 10, z: from.z })], MOTION_DT);
  const trace: Vec2[] = finish(world);
  for (let index: number = 1; index < trace.length; index += 1) {
    const before: Vec2 = must(trace[index - 1], 'before');
    const after: Vec2 = must(trace[index], 'after');
    assert.ok(isWalkable(world.grid, after.x, after.z));
    assert.ok(lineWalkable(world.grid, before, after));
  }
});

void test('the hero cannot be targeted during the invulnerable start of the roll, and can be after it', (): void => {
  const world: World = scene('frames', { tiles: OPEN, props: [], start: { x: 8, z: 14 } });
  stepWorld(world, [rollToward({ x: 20, z: 14 })], MOTION_DT);
  let elapsed: number = MOTION_DT;
  while (elapsed + MOTION_DT < dash.invulnerable) {
    assert.ok(isInvulnerable(world.player));
    assert.deepEqual(targetsOf(world, { sourceId: 0, faction: 'unfinished' }), []);
    stepWorld(world, [], MOTION_DT);
    elapsed += MOTION_DT;
  }
  while (elapsed <= dash.invulnerable + MOTION_DT) {
    stepWorld(world, [], MOTION_DT);
    elapsed += MOTION_DT;
  }
  assert.equal(isInvulnerable(world.player), false);
  assert.deepEqual(targetsOf(world, { sourceId: 0, faction: 'unfinished' }), [world.player]);
});

void test('a second roll waits for the cooldown', (): void => {
  const world: World = scene('cooldown', { tiles: OPEN, props: [], start: { x: 6, z: 14 } });
  stepWorld(world, [rollToward({ x: 20, z: 14 })], MOTION_DT);
  finish(world);
  const early: WorldEvent[] = stepWorld(world, [rollToward({ x: 6, z: 14 })], MOTION_DT);
  assert.equal(started(early, world.player.id), null);
  assert.ok(early.some((event: WorldEvent): boolean => event.type === 'notice' && event.reason === 'on_cooldown'));
  for (let step: number = 0; step < roll.cooldown / MOTION_DT; step += 1) stepWorld(world, [], MOTION_DT);
  assert.notEqual(started(stepWorld(world, [rollToward({ x: 6, z: 14 })], MOTION_DT), world.player.id), null);
});

void test('the hero cannot roll while dead or stunned', (): void => {
  const dead: World = scene('dead', { tiles: OPEN, props: [], start: { x: 14, z: 14 } });
  dead.player.alive = false;
  assert.equal(started(stepWorld(dead, [rollToward({ x: 20, z: 14 })], MOTION_DT), dead.player.id), null);
  const stunned: World = scene('stunned', { tiles: OPEN, props: [], start: { x: 14, z: 14 } });
  stunned.player.stagger = 1;
  const from: Vec2 = { ...stunned.player.pos };
  assert.equal(started(stepWorld(stunned, [rollToward({ x: 20, z: 14 })], MOTION_DT), stunned.player.id), null);
  assert.deepEqual(stunned.player.pos, from);
});

void test('a roll cuts the recovery of an attack but waits out its wind-up', (): void => {
  const world: World = scene('cancel', { tiles: OPEN, props: [], start: { x: 8, z: 14 } });
  stepWorld(world, [{ type: 'skill', slot: 0, aim: { x: 4, z: 14 }, targetId: null }], MOTION_DT);
  assert.equal(world.player.action?.phase, 'windup');
  const pressed: WorldEvent[] = stepWorld(world, [rollToward({ x: 20, z: 14 })], MOTION_DT);
  assert.equal(started(pressed, world.player.id), null);
  let rolledAt: string | null = null;
  for (let step: number = 0; step < 60 && rolledAt === null; step += 1) {
    const events: WorldEvent[] = stepWorld(world, [], MOTION_DT);
    if (started(events, world.player.id) !== null) rolledAt = events.some((event: WorldEvent): boolean => event.type === 'skill_impact') ? 'impact' : 'later';
  }
  assert.equal(rolledAt, 'impact');

  const again: World = scene('cancel_recovery', { tiles: OPEN, props: [], start: { x: 8, z: 14 } });
  stepWorld(again, [{ type: 'skill', slot: 0, aim: { x: 4, z: 14 }, targetId: null }], MOTION_DT);
  while (again.player.action?.phase === 'windup') stepWorld(again, [], MOTION_DT);
  assert.equal(again.player.action?.phase, 'recovery');
  assert.notEqual(started(stepWorld(again, [rollToward({ x: 20, z: 14 })], MOTION_DT), again.player.id), null);
  assert.equal(again.player.action.skill.id, roll.id);
});

void test('a roll passes through a monster standing in its way', (): void => {
  const world: World = scene('through', { tiles: OPEN, props: [], start: { x: 10, z: 14 } });
  const monster: MonsterState = spawnAt(world, 'mended', { x: 12.5, z: 14 });
  const from: Vec2 = { ...world.player.pos };
  const stood: Vec2 = { ...monster.pos };
  stepWorld(world, [rollToward({ x: 20, z: 14 })], MOTION_DT);
  while (isDashing(world.player)) stepWorld(world, [], MOTION_DT);
  assert.ok(Math.hypot(monster.pos.x - stood.x, monster.pos.z - stood.z) < LIMITS.shove, `monster shoved to ${monster.pos.x}, ${monster.pos.z}`);
  finish(world);
  assert.ok(world.player.pos.x > monster.pos.x, `${world.player.pos.x} vs ${monster.pos.x}`);
  assert.ok(Math.abs(world.player.pos.x - from.x - dash.distance) < LIMITS.tolerance);
});

void test('the roll passes through and stays steady by its data, and a dash without those fields does neither', (): void => {
  assert.equal(dash.passThrough, true);
  assert.equal(dash.steady, true);
  const world: World = scene('fields', { tiles: OPEN, props: [], start: { x: 10, z: 14 } });
  startSkill(world, world.player, roll, { x: 1, z: 0 });
  assert.equal(passesThrough(world.player), true);
  assert.equal(rollsSteady(world.player), true);
  const action: ActionState = must(world.player.action, 'rolling');
  world.player.action = { ...action, skill: { ...roll, delivery: { ...dash, passThrough: false, steady: false } } };
  assert.equal(isDashing(world.player), true);
  assert.equal(passesThrough(world.player), false);
  assert.equal(rollsSteady(world.player), false);
});

void test('a rolling hero passes through a monster walking into him without shoving it, where a plain dash would', (): void => {
  const world: World = scene('crowd', { tiles: OPEN, props: [], start: { x: 10, z: 14 } });
  const monster: MonsterState = spawnAt(world, 'mended', { x: 10.4, z: 14 });
  const into: ReadonlyMap<MonsterState, Vec2> = new Map<MonsterState, Vec2>([[monster, { x: -0.1, z: 0 }]]);
  startSkill(world, world.player, roll, { x: 1, z: 0 });
  monster.motion = 'stride';
  const stood: Vec2 = { ...monster.pos };
  separateActors(world, MOTION_DT, into);
  assert.deepEqual(monster.pos, stood);
  const action: ActionState = must(world.player.action, 'rolling');
  world.player.action = { ...action, skill: { ...roll, delivery: { ...dash, passThrough: false } } };
  separateActors(world, MOTION_DT, into);
  assert.ok(Math.hypot(monster.pos.x - stood.x, monster.pos.z - stood.z) > LIMITS.tolerance / 10, 'a plain dash still shoves');
});

void test('a roll that ends inside a monster settles the hero on clear ground, leaving the monster where it stood', (): void => {
  const world: World = scene('landing', { tiles: OPEN, props: [], start: { x: 8, z: 14 } });
  const from: Vec2 = { ...world.player.pos };
  const placed: MonsterState = spawnAt(world, 'mended', { x: from.x + dash.distance, z: from.z });
  world.monsters = [{ ...placed, def: { ...placed.def, moveSpeed: 0, aggroRadius: 0 } }];
  const monster: MonsterState = must(world.monsters[0], 'standing monster');
  const stood: Vec2 = { ...monster.pos };
  stepWorld(world, [rollToward({ x: from.x + 20, z: from.z })], MOTION_DT);
  while (isDashing(world.player)) stepWorld(world, [], MOTION_DT);
  const gap: number = Math.hypot(world.player.pos.x - monster.pos.x, world.player.pos.z - monster.pos.z);
  assert.ok(gap >= world.player.radius + monster.radius, `hero ${gap.toFixed(2)} m from the monster`);
  assert.ok(isWalkable(world.grid, world.player.pos.x, world.player.pos.z));
  assert.ok(Math.hypot(monster.pos.x - stood.x, monster.pos.z - stood.z) < LIMITS.shove);
});

void test('the nearest clear spot lies ahead of the roll first, and nowhere when the ground is walled in', (): void => {
  const world: World = scene('spot', { tiles: OPEN, props: [], start: { x: 14, z: 14 } });
  const crowd = [{ pos: { x: 14, z: 14 }, radius: 0.5 }];
  const spot: Vec2 = must(clearSpot(world.grid, { x: 14, z: 14 }, { x: 1, z: 0 }, 0.4, crowd), 'a clear spot');
  assert.ok(spot.x > 14.9 && Math.abs(spot.z - 14) < 1e-9, `${spot.x}, ${spot.z}`);
  assert.deepEqual(clearSpot(world.grid, { x: 10, z: 10 }, { x: 1, z: 0 }, 0.4, crowd), { x: 10, z: 10 });
  const walled: World = scene('spot_walled', { tiles: WALLED, props: [], start: { x: 13, z: 14 } });
  assert.equal(clearSpot(walled.grid, { x: 40, z: 40 }, { x: 1, z: 0 }, 0.4, []), null);
});

void test('a hit after the immune start of the roll hurts but neither knocks, roots nor holds the hero, and does once the roll is over', (): void => {
  const world: World = scene('steady', { tiles: OPEN, props: [], start: { x: 8, z: 14 } });
  const blow: SkillDef = { ...must(content.skills.get('taker_snatch'), 'taker_snatch'), knockback: 6, root: 0.9, hold: 0.5 };
  const foe: MonsterState = spawnAt(world, 'mended', { x: 4, z: 14 });
  world.player.knock = { x: 3, z: 0 };
  stepWorld(world, [rollToward({ x: 20, z: 14 })], MOTION_DT);
  assert.deepEqual(world.player.knock, { x: 0, z: 0 });
  while (isInvulnerable(world.player)) stepWorld(world, [], MOTION_DT);
  assert.equal(isDashing(world.player), true);
  const life: number = world.player.life;
  assert.equal(applyHit(world, offenceOf(foe), world.player, blow, { x: 1, z: 0 }), true);
  assert.ok(world.player.life < life);
  assert.deepEqual(world.player.knock, { x: 0, z: 0 });
  assert.equal(rootOf(world), 0);
  finish(world);
  world.player.rootGrace = 0;
  applyHit(world, offenceOf(foe), world.player, blow, { x: 1, z: 0 });
  assert.ok(Math.hypot(world.player.knock.x, world.player.knock.z) > 0);
  assert.ok(rootOf(world) > 0);
});

void test('with the cursor on the hero, the roll follows the path the hero is walking', (): void => {
  const world: World = scene('aim', { tiles: OPEN, props: [], start: { x: 14, z: 14 } });
  const ahead: Vec2 = { x: 14, z: 20 };
  assert.deepEqual(dashAim(world.player, { x: world.player.pos.x + DASH.aimDeadZone / 2, z: world.player.pos.z }, [ahead]), ahead);
  stepWorld(world, [{ type: 'move', held: false, dest: { x: 14, z: 24 } }], MOTION_DT);
  const from: Vec2 = { ...world.player.pos };
  stepWorld(world, [rollToward({ ...world.player.pos })], MOTION_DT);
  finish(world);
  assert.ok(world.player.pos.z - from.z > dash.distance - 1);
});

void test('a monster whose skill is a dash rolls with the same code', (): void => {
  const world: World = scene('monster', { tiles: OPEN, props: [], start: { x: 6, z: 14 } });
  const monster: MonsterState = spawnAt(world, 'mended', { x: 10, z: 14 });
  world.monsters = [{ ...monster, def: { ...monster.def, skill: roll.id }, aggro: true }];
  const roller: MonsterState = must(world.monsters[0], 'roller');
  let from: Vec2 | null = null;
  for (let step: number = 0; step < 240 && from === null; step += 1) {
    const before: Vec2 = { ...roller.pos };
    if (started(stepWorld(world, [], MOTION_DT), roller.id) !== null) from = before;
  }
  const origin: Vec2 = must(from, 'the monster rolled');
  assert.ok(isDashing(roller));
  for (let step: number = 0; step < 60 && isDashing(roller); step += 1) stepWorld(world, [], MOTION_DT);
  assert.ok(Math.hypot(roller.pos.x - origin.x, roller.pos.z - origin.z) > dash.distance - 1);
});

void test('a roll through deep water covers only the water\'s share of its distance', (): void => {
  const world: World = armed(roadWorld(roadZone({ tiles: ['ssssssss', 'ssssssss', 'ssssssss', 'ssssssss'], playerStart: { x: 4, z: 8 } })));
  const from: Vec2 = { ...world.player.pos };
  stepWorld(world, [rollToward({ x: from.x + 10, z: from.z })], MOTION_DT);
  finish(world);
  assert.ok(Math.abs(world.player.pos.x - from.x - dash.distance * 0.5) < LIMITS.tolerance, `${world.player.pos.x - from.x}`);
});

const SPIN = {
  skill: 'cleave_millwheel',
  dt: 1 / 60,
  frozen: 1000,
} as const;

function spinner(): World {
  const world: World = shapeArena([]);
  world.player.learned.push(SPIN.skill);
  world.player.bar = [SPIN.skill, null, null, null, null, 'dodge_roll'];
  refreshPlayer(world);
  world.player.mana = world.player.stats.maxMana;
  return world;
}

function frozen(world: World, at: Vec2): MonsterState {
  const monster: MonsterState = dummy(world, at);
  monster.spawnTime = SPIN.frozen;
  return monster;
}

function spin(world: World, aim: Vec2, seconds: number): void {
  stepWorld(world, [{ type: 'hold', slot: 0, down: true }, { type: 'skill', slot: 0, aim, targetId: null }], SPIN.dt);
  for (let step: number = 1; step < Math.round(seconds / SPIN.dt); step += 1) {
    world.player.mana = world.player.stats.maxMana;
    stepWorld(world, [{ type: 'steer', aim }], SPIN.dt);
  }
}

function shifted(monster: MonsterState, from: Vec2): number {
  return Math.hypot(monster.pos.x - from.x, monster.pos.z - from.z);
}

void test('a spinning hero glides through a monster in her way and leaves it where it stood', (): void => {
  const world: World = spinner();
  const monster: MonsterState = frozen(world, offset(1.2, 0));
  const stood: Vec2 = { x: monster.pos.x, z: monster.pos.z };
  spin(world, offset(6, 0), 0.8);
  assert.equal(world.player.action?.phase, 'channel');
  assert.ok(passesThrough(world.player));
  assert.ok(world.player.pos.x > monster.pos.x + 0.5, `hero at ${world.player.pos.x}, monster at ${monster.pos.x}`);
  assert.ok(shifted(monster, stood) < 1e-6, `monster moved ${shifted(monster, stood)}`);
});

void test('a hero spinning on the spot inside a monster never moves it, and steps clear of it herself when the spin ends', (): void => {
  const world: World = spinner();
  const monster: MonsterState = frozen(world, offset(0.3, 0));
  const stood: Vec2 = { x: monster.pos.x, z: monster.pos.z };
  spin(world, { x: world.player.pos.x, z: world.player.pos.z }, 1);
  assert.ok(shifted(monster, stood) < 1e-6, `monster moved ${shifted(monster, stood)} while she spun`);
  stepWorld(world, [{ type: 'hold', slot: 0, down: false }], SPIN.dt);
  for (let step: number = 0; step < Math.round(1 / SPIN.dt); step += 1) stepWorld(world, [], SPIN.dt);
  assert.equal(world.player.action, null);
  const gap: number = Math.hypot(world.player.pos.x - monster.pos.x, world.player.pos.z - monster.pos.z);
  assert.ok(gap >= world.player.radius + monster.radius - 1e-6, `gap ${gap}`);
  assert.ok(shifted(monster, stood) < 1e-6, `monster moved ${shifted(monster, stood)} after the spin`);
  assert.ok(isWalkable(world.grid, world.player.pos.x, world.player.pos.z));
});

void test('a spinning hero is never invulnerable: monsters can target her and their hits land as hard as on a hero standing still', (): void => {
  const blow: SkillDef = { ...must(content.skills.get('cleave'), 'cleave'), id: 'test_blow', damage: { type: 'physical', weaponPercent: 0, flatMin: 7, flatMax: 7 } };
  const struck = (spinning: boolean): number => {
    const world: World = spinner();
    const monster: MonsterState = frozen(world, offset(1, 0));
    if (spinning) {
      spin(world, { x: world.player.pos.x, z: world.player.pos.z }, 0.5);
      assert.equal(world.player.action?.phase, 'channel');
      assert.ok(!isInvulnerable(world.player));
      assert.ok(targetsOf(world, offenceOf(monster)).includes(world.player));
    }
    const life: number = world.player.life;
    assert.ok(applyHit(world, { ...offenceOf(monster), damageMin: 0, damageMax: 0 }, world.player, blow, { x: -1, z: 0 }));
    return life - world.player.life;
  };
  const standing: number = struck(false);
  assert.ok(standing >= 1);
  assert.equal(struck(true), standing);
});
