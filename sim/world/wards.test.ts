import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, withoutGlitches, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { WardDef } from '../content/scene-types.ts';
import type { Content, MonsterDef, SkillDef } from '../content/types.ts';
import { distance } from '../math.ts';
import { mayStrike, playerMayStrike } from './factions.ts';
import { stepMonster } from './monsters.ts';
import { stepEchoes } from './skills.ts';
import { targetsOf } from './combat.ts';
import { monsterLevel, spawnMonster } from './spawn.ts';
import type { MonsterState, NpcState, World } from './types.ts';
import type { WardState } from './wards.ts';
import { keepOutOfWards, lowerWard, raiseWard, stepWards, strikeCrosses, wardStrength } from './wards.ts';

const content: Content = loadContent();
const DT: number = 1 / 30;
const WARD: WardDef = { radius: 4, rise: 0.5, fall: 0.5, lifetime: 10, admits: ['player'], stopsStrikes: true, grace: 2 };

function world(): World {
  const made: World = withoutGlitches(worldIn(content, 'hideout', 3));
  made.monsters = [];
  made.events = [];
  return made;
}

function owner(at: World): NpcState {
  return must(at.npcs[0], 'someone to raise the ward');
}

function foe(at: World, x: number, z: number): MonsterState {
  const def: MonsterDef = must(content.monsters.get('unfinished_brute'), 'a brute');
  const monster: MonsterState = spawnMonster(at, def, at.nextPackId, { x, z }, { summonerId: null, scatter: 0, revived: false, level: monsterLevel(at) });
  at.nextPackId += 1;
  monster.spawnTime = 0;
  return monster;
}

function steps(at: World, seconds: number): void {
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) stepWards(at, DT);
}

void test('a ward rises over its rise time, stands, and once lowered fades over its fall time, holds nothing back through its grace and is gone', (): void => {
  const at: World = world();
  const ward: WardState = raiseWard(at, WARD, owner(at), at.player.pos);
  assert.deepEqual(at.wards, [ward]);
  steps(at, WARD.rise / 2);
  assert.ok(wardStrength(ward) > 0.3 && wardStrength(ward) < 0.7);
  steps(at, WARD.rise);
  assert.equal(wardStrength(ward), 1);
  lowerWard(ward);
  steps(at, WARD.fall / 2);
  assert.ok(wardStrength(ward) > 0.3 && wardStrength(ward) < 0.7);
  steps(at, WARD.fall);
  assert.equal(wardStrength(ward), 0);
  assert.deepEqual(at.wards, [ward]);
  assert.equal(strikeCrosses(at, ward.pos, { x: ward.pos.x + WARD.radius * 2, z: ward.pos.z }), false);
  steps(at, WARD.grace);
  assert.deepEqual(at.wards, []);
});

void test('a ward cannot outlast its lifetime or its owner', (): void => {
  const at: World = world();
  const timed: WardState = raiseWard(at, WARD, owner(at), at.player.pos);
  steps(at, WARD.lifetime - DT);
  assert.equal(timed.lowering, null);
  steps(at, DT * 2);
  assert.notEqual(timed.lowering, null);
  const kept: WardState = raiseWard(at, WARD, owner(at), at.player.pos);
  at.npcs = at.npcs.filter((npc: NpcState): boolean => npc.id !== kept.ownerId);
  steps(at, WARD.fall + WARD.grace + DT * 2);
  assert.ok(!at.wards.includes(kept));
});

void test('a strike crosses a ward that stops strikes only when one end is inside and the other outside', (): void => {
  const at: World = world();
  const centre = { x: at.player.pos.x, z: at.player.pos.z };
  raiseWard(at, WARD, owner(at), centre);
  const inside = { x: centre.x + 1, z: centre.z };
  const outside = { x: centre.x + WARD.radius + 1, z: centre.z };
  const far = { x: centre.x - WARD.radius - 1, z: centre.z };
  assert.equal(strikeCrosses(at, inside, outside), true);
  assert.equal(strikeCrosses(at, outside, inside), true);
  assert.equal(strikeCrosses(at, inside, centre), false);
  assert.equal(strikeCrosses(at, outside, far), false);
  at.wards = [];
  raiseWard(at, { ...WARD, stopsStrikes: false }, owner(at), centre);
  assert.equal(strikeCrosses(at, inside, outside), false);
});

void test('nothing outside a ward may strike the hero inside it, the hero inside may strike nothing outside, and both outside fight as before', (): void => {
  const at: World = world();
  const centre = { x: at.player.pos.x, z: at.player.pos.z };
  const brute: MonsterState = foe(at, centre.x + WARD.radius + 1.5, centre.z);
  assert.ok(playerMayStrike(at, brute));
  raiseWard(at, WARD, owner(at), centre);
  assert.equal(playerMayStrike(at, brute), false);
  assert.ok(!targetsOf(at, { sourceId: brute.id, faction: brute.def.faction }).includes(at.player));
  at.player.pos = { x: centre.x + WARD.radius + 0.5, z: centre.z };
  assert.ok(playerMayStrike(at, brute));
  assert.ok(targetsOf(at, { sourceId: brute.id, faction: brute.def.faction }).includes(at.player));
});

void test('a ward keeps out every side it does not admit, pushed back to its edge, and lets in a side it admits', (): void => {
  const at: World = world();
  const centre = { x: at.player.pos.x, z: at.player.pos.z };
  const brute: MonsterState = foe(at, centre.x + 1, centre.z);
  const ward: WardState = raiseWard(at, WARD, owner(at), centre);
  keepOutOfWards(at);
  assert.ok(Math.abs(distance(brute.pos, ward.pos) - (WARD.radius + brute.radius)) < 1e-6);
  at.wards = [];
  brute.pos = { x: centre.x + 1, z: centre.z };
  raiseWard(at, { ...WARD, admits: ['player', 'monster'] }, owner(at), centre);
  keepOutOfWards(at);
  assert.ok(Math.abs(distance(brute.pos, centre) - 1) < 1e-6);
});

function heroIn(at: World, centre: { readonly x: number; readonly z: number }): void {
  at.player.pos = { x: centre.x, z: centre.z };
  at.player.intent = { type: 'idle' };
  at.player.path = [];
}

function live(at: World, seconds: number): void {
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) {
    for (const monster of at.monsters) stepMonster(at, monster, DT);
    keepOutOfWards(at);
    stepWards(at, DT);
    at.events = [];
  }
}

function heroTaken(at: World, monster: MonsterState): boolean {
  return mayStrike(at, { sourceId: monster.id, faction: monster.def.faction }, at.player);
}

void test('a monster that had the hero lets him go once he stands in a ward and walks back to where it lives', (): void => {
  const at: World = world();
  const centre = { x: at.player.pos.x, z: at.player.pos.z };
  heroIn(at, centre);
  const brute: MonsterState = foe(at, centre.x + WARD.radius + 6, centre.z);
  brute.pos = { x: centre.x + WARD.radius + 1, z: centre.z };
  brute.aggro = true;
  brute.foeId = at.player.id;
  raiseWard(at, { ...WARD, lifetime: 60 }, owner(at), centre);
  live(at, 8);
  assert.equal(brute.aggro, false);
  assert.ok(distance(brute.pos, brute.home) < 1.5);
});

void test('monsters near a ward as it lowers cannot take the hero for its fall and grace, but one he hurts may answer at once', (): void => {
  const at: World = world();
  const centre = { x: at.player.pos.x, z: at.player.pos.z };
  heroIn(at, centre);
  const near: MonsterState = foe(at, centre.x + WARD.radius + 0.5, centre.z);
  const hurt: MonsterState = foe(at, centre.x - WARD.radius - 0.5, centre.z);
  const far: MonsterState = foe(at, centre.x + WARD.radius + near.def.aggroRadius + 4, centre.z);
  const ward: WardState = raiseWard(at, WARD, owner(at), centre);
  steps(at, WARD.rise + DT);
  lowerWard(ward);
  steps(at, DT);
  const calmed: readonly number[] = ward.calmed ?? [];
  assert.ok(calmed.includes(near.id));
  assert.ok(calmed.includes(hurt.id));
  assert.ok(!calmed.includes(far.id));
  steps(at, WARD.fall);
  assert.equal(strikeCrosses(at, near.pos, at.player.pos), false);
  near.calm += WARD.fall + DT * 2;
  hurt.calm = 0;
  assert.equal(heroTaken(at, near), false);
  assert.equal(heroTaken(at, hurt), true);
  assert.equal(heroTaken(at, far), true);
  steps(at, WARD.grace);
  assert.deepEqual(at.wards, []);
  assert.equal(heroTaken(at, near), true);
});

void test('the hero inside a ward is sheltered from every strike of a side it keeps out, even one loosed inside it by a monster that has since fallen or gone', (): void => {
  const at: World = world();
  const centre = { x: at.player.pos.x, z: at.player.pos.z };
  heroIn(at, centre);
  const fallen: MonsterState = foe(at, centre.x + 1, centre.z);
  const faction: string = fallen.def.faction;
  raiseWard(at, WARD, owner(at), centre);
  fallen.alive = false;
  assert.equal(mayStrike(at, { sourceId: fallen.id, faction }, at.player), false);
  at.monsters = [];
  assert.equal(mayStrike(at, { sourceId: fallen.id, faction }, at.player), false);
  at.player.pos = { x: centre.x + WARD.radius + 1, z: centre.z };
  assert.equal(mayStrike(at, { sourceId: fallen.id, faction }, at.player), true);
});

void test('a ward that does not admit the hero pushes the hero back to its edge as it does a monster', (): void => {
  const at: World = world();
  const centre = { x: at.player.pos.x, z: at.player.pos.z };
  heroIn(at, { x: centre.x + 1, z: centre.z });
  const ward: WardState = raiseWard(at, { ...WARD, admits: ['monster'] }, owner(at), centre);
  keepOutOfWards(at);
  assert.ok(Math.abs(distance(at.player.pos, ward.pos) - (WARD.radius + at.player.radius)) < 1e-6);
});

void test('a strike loosed from inside a ward cannot land outside it after its striker has stepped out', (): void => {
  const at: World = world();
  const centre = { x: at.player.pos.x, z: at.player.pos.z };
  const brute: MonsterState = foe(at, centre.x + WARD.radius + 2, centre.z);
  raiseWard(at, WARD, owner(at), centre);
  const loosed = { x: centre.x + 1, z: centre.z };
  heroIn(at, { x: centre.x + WARD.radius + 1, z: centre.z });
  assert.equal(mayStrike(at, { sourceId: at.player.id, faction: null }, brute), true);
  assert.equal(mayStrike(at, { sourceId: at.player.id, faction: null, from: loosed }, brute), false);
});

void test('an echo of a strike loosed inside a ward cannot land outside it after its striker has stepped out', (): void => {
  const echoAt = (origin: { readonly x: number; readonly z: number }): number => {
    const at: World = world();
    const centre = { x: at.player.pos.x, z: at.player.pos.z };
    const brute: MonsterState = foe(at, centre.x + WARD.radius + 0.6, centre.z);
    raiseWard(at, WARD, owner(at), centre);
    heroIn(at, { x: centre.x + WARD.radius + 3, z: centre.z + 3 });
    const cleave: SkillDef = must(content.skills.get('cleave'), 'cleave');
    at.echoes = [{ ownerId: at.player.id, team: 'player', faction: null, skill: cleave, origin: { x: centre.x + origin.x, z: centre.z + origin.z }, direction: { x: 1, z: 0 }, target: { ...brute.pos }, damageMin: 5, damageMax: 5, damagePercent: 0, critChance: 0, critMultiplier: 1, timeLeft: DT }];
    const life: number = brute.life;
    stepEchoes(at, DT * 2);
    return life - brute.life;
  };
  assert.ok(echoAt({ x: WARD.radius + 0.2, z: 0 }) > 0, 'loosed outside, it lands');
  assert.equal(echoAt({ x: WARD.radius - 0.4, z: 0 }), 0);
});
