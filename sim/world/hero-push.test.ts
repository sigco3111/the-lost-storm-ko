import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { dummy, offset, shapeArena } from '../../test/shape-support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, MonsterDef, RigDef, SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { heroRig } from '../hero.ts';
import { applyHit, offenceOf } from './combat.ts';
import type { HeroPush, HitSide } from './hero-push.ts';
import { HERO_PUSH, heroPush, hitSide, pushOnHero, reelAnimation } from './hero-push.ts';
import { pushDistance } from './movement.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World } from './types.ts';

const content: Content = loadContent();
const DT: number = 1 / 60;
const FRICTION: number = 9;
const PUSH_SLACK: number = 0.25;

function speed(metres: number): number {
  return metres * FRICTION;
}

function monsterSkills(): readonly SkillDef[] {
  const ids: Set<string> = new Set<string>();
  for (const monster of content.monsters.values()) {
    const def: MonsterDef = monster;
    ids.add(def.skill);
  }
  return [...ids].map((id: string): SkillDef | undefined => content.skills.get(id)).filter((skill: SkillDef | undefined): skill is SkillDef => skill !== undefined);
}

void test('the side of a push is read against where the hero faces: shoved back is a hit on the front, shoved on is a hit from behind', (): void => {
  const facing: number = 0;
  assert.equal(hitSide({ x: 0, z: -3 }, facing), 'front');
  assert.equal(hitSide({ x: 0, z: 3 }, facing), 'back');
  const sides: readonly (HitSide | null)[] = [hitSide({ x: 3, z: 0 }, facing), hitSide({ x: -3, z: 0 }, facing)];
  assert.deepEqual(sides.toSorted((a: HitSide | null, b: HitSide | null): number => String(a).localeCompare(String(b))), ['left', 'right']);
  assert.equal(hitSide({ x: 0, z: 0 }, facing), null);
  assert.equal(hitSide({ x: 0, z: -3 }, Math.PI), 'back');
  assert.equal(hitSide({ x: 0.5, z: -3 }, facing), 'front');
});

void test('every push carries the hero its own distance; a light one is a flinch and a heavy one a reel', (): void => {
  const below: number = HERO_PUSH.reelFrom * 0.9;
  const above: number = HERO_PUSH.reelFrom * 1.1;
  const light: HeroPush = heroPush({ x: 0, z: -speed(below) }, 0);
  const heavy: HeroPush = heroPush({ x: 0, z: -speed(above) }, 0);
  assert.deepEqual(light, { reaction: 'flinch', side: 'front', travel: pushDistance({ x: 0, z: -speed(below) }) });
  assert.deepEqual(heavy, { reaction: 'reel', side: 'front', travel: pushDistance({ x: 0, z: -speed(above) }) });
  assert.ok(light.travel < HERO_PUSH.reelFrom && heavy.travel >= HERO_PUSH.reelFrom);
  for (const skill of monsterSkills()) {
    if (skill.knockback <= 0) continue;
    const push: HeroPush = heroPush({ x: skill.knockback, z: 0 }, 0);
    assert.equal(push.travel, pushDistance({ x: skill.knockback, z: 0 }), skill.id);
    assert.equal(push.reaction, push.travel >= HERO_PUSH.reelFrom ? 'reel' : 'flinch', skill.id);
  }
});

void test('a blow with no knockback asks for no reaction, and a heavy one on an unsteady hero asks for a reel from the side it came from', (): void => {
  const world: World = shapeArena([]);
  assert.equal(pushOnHero(world.player, 0, { x: 1, z: 0 }).reaction, 'none');
  world.player.facing = 0;
  const struck: HeroPush = pushOnHero(world.player, 11, { x: 0, z: -1 });
  assert.equal(struck.reaction, 'reel');
  assert.equal(struck.side, 'front');
  assert.ok(struck.travel >= HERO_PUSH.reelFrom);
});

void test('the heaviest blows of every monster carry the hero back about their push and ask for a reel', (): void => {
  const heavy: readonly SkillDef[] = monsterSkills().filter((skill: SkillDef): boolean => skill.knockback > 0).toSorted((a: SkillDef, b: SkillDef): number => b.knockback - a.knockback).slice(0, 6);
  for (const blow of heavy) {
    const world: World = shapeArena([]);
    world.player.invulnerable = 0;
    world.player.life = world.player.maxLife;
    const foe: MonsterState = dummy(world, offset(1, 0));
    const at: Vec2 = { ...world.player.pos };
    const life: number = world.player.life;
    const expected: HeroPush = pushOnHero(world.player, blow.knockback, { x: -1, z: 0 });
    applyHit(world, offenceOf(foe), world.player, { ...blow, root: 0, hold: 0 }, { x: -1, z: 0 });
    for (let step: number = 0; step < Math.round(1 / DT); step += 1) stepWorld(world, [], DT);
    const moved: number = Math.hypot(world.player.pos.x - at.x, world.player.pos.z - at.z);
    assert.ok(world.player.life < life, `${blow.id} did no damage`);
    assert.ok(world.player.pos.x < at.x, `${blow.id} did not carry the hero back`);
    assert.ok(Math.abs(moved - expected.travel) <= expected.travel * PUSH_SLACK, `${blow.id} moved ${moved} for a push of ${expected.travel}`);
    if (expected.travel >= HERO_PUSH.reelFrom) assert.equal(expected.reaction, 'reel', blow.id);
  }
});

void test('every playable hero has the reel clip a heavy blow plays', (): void => {
  for (const hero of content.player.heroes) {
    const rig: RigDef = must(content.rigs.get(heroRig(content, hero.id)), hero.rig);
    assert.ok(rig.clips.actions[HERO_PUSH.reelAnimation] !== undefined, `${rig.id} has no ${HERO_PUSH.reelAnimation}`);
  }
  assert.equal(reelAnimation('back'), `${HERO_PUSH.reelAnimation}_back`);
});
