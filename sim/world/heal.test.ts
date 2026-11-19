import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CENTRE, arena, place } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { SkillMend } from '../content/mend-types.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { alliesOf, healActor, isAlly, mendAllies, mendAmount } from './heal.ts';
import type { MendPulse } from './heal.ts';
import { startSkill } from './skills.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World, WorldEvent } from './types.ts';

const content: Content = loadContent();
const pulse: SkillDef = must(content.skills.get('mending_pulse'), 'mending_pulse');
const mend: SkillMend = must(pulse.mend, 'mending_pulse mend');
const DT: number = 1 / 60;
const HERO_SIDE = { sourceId: 0, faction: null } as const;

type Heal = Extract<WorldEvent, { readonly type: 'heal' }>;

function heals(events: readonly WorldEvent[]): Heal[] {
  return events.filter((event: WorldEvent): event is Heal => event.type === 'heal');
}

function at(x: number, z: number): { readonly x: number; readonly z: number } {
  return { x: ARENA_CENTRE.x + x, z: ARENA_CENTRE.z + z };
}

function hurt(monster: MonsterState, share: number): MonsterState {
  monster.life = monster.maxLife * share;
  return monster;
}

function pulseAt(world: World, radius: number): MendPulse {
  return { skill: pulse, mend, origin: { x: world.player.pos.x, z: world.player.pos.z }, radius };
}

function scene(): { readonly world: World; readonly warden: MonsterState; readonly foe: MonsterState } {
  const world: World = arena(5);
  const warden: MonsterState = hurt(place(world, 'warden_patrol', at(2, 0)), 0.3);
  const foe: MonsterState = hurt(place(world, 'mended', at(-2, 0)), 0.3);
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  world.player.life = 10;
  world.events = [];
  return { world, warden, foe };
}

void test('the hero and the friendly wardens are allies of the hero; a hostile monster is not', (): void => {
  const { world, warden, foe } = scene();
  const side = { ...HERO_SIDE, sourceId: world.player.id };
  assert.ok(isAlly(world, side, world.player));
  assert.ok(isAlly(world, side, warden));
  assert.ok(!isAlly(world, side, foe));
  assert.deepEqual(alliesOf(world, side).map((actor): number => actor.id), [world.player.id, warden.id]);
  warden.alive = false;
  assert.ok(!isAlly(world, side, warden));
});

void test('a warden that mends counts the hero as its ally, because the wardens regard the player as friendly', (): void => {
  const { world, warden, foe } = scene();
  const wardenSide = { sourceId: warden.id, faction: warden.def.faction };
  assert.ok(isAlly(world, wardenSide, world.player));
  assert.ok(isAlly(world, wardenSide, warden));
  assert.ok(!isAlly(world, wardenSide, foe));
});

void test('a pulse gives each ally inside it its flat life plus its share of that ally\'s most life, and leaves the hostile monster alone', (): void => {
  const { world, warden, foe } = scene();
  const foeLife: number = foe.life;
  const wardenLife: number = warden.life;
  const healed: number = mendAllies(world, { ...HERO_SIDE, sourceId: world.player.id }, pulseAt(world, 6));
  assert.equal(healed, 2);
  assert.equal(world.player.life, 10 + Math.round(mend.flat + mend.lifeShare * world.player.maxLife));
  assert.equal(warden.life, wardenLife + mendAmount(mend, warden));
  assert.equal(foe.life, foeLife);
  assert.deepEqual(
    heals(world.events).map((event: Heal): readonly [number, number, number, string] => [event.sourceId, event.targetId, event.amount, event.skill.id]),
    [
      [world.player.id, world.player.id, mendAmount(mend, world.player), 'mending_pulse'],
      [world.player.id, warden.id, mendAmount(mend, warden), 'mending_pulse'],
    ],
  );
  assert.ok(heals(world.events).every((event: Heal): boolean => event.wanted === event.amount));
});

void test('an ally past the edge of the pulse is not healed; one whose body reaches the edge is', (): void => {
  const { world, warden } = scene();
  const wardenLife: number = warden.life;
  warden.pos = at(3 + warden.radius + 0.05, 0);
  assert.equal(mendAllies(world, { ...HERO_SIDE, sourceId: world.player.id }, pulseAt(world, 3)), 1);
  assert.equal(warden.life, wardenLife);
  warden.pos = at(3 + warden.radius - 0.05, 0);
  assert.equal(mendAllies(world, { ...HERO_SIDE, sourceId: world.player.id }, pulseAt(world, 3)), 2);
  assert.ok(warden.life > wardenLife);
});

void test('a heal never lifts life past the most; the event tells what was given and what was offered, and a full ally is not counted', (): void => {
  const { world, warden } = scene();
  world.player.life = world.player.maxLife - 3;
  warden.life = warden.maxLife;
  assert.equal(mendAllies(world, { ...HERO_SIDE, sourceId: world.player.id }, pulseAt(world, 6)), 1);
  assert.equal(world.player.life, world.player.maxLife);
  assert.equal(warden.life, warden.maxLife);
  const given: Heal = must(heals(world.events)[0], 'heal on the hero');
  assert.equal(heals(world.events).length, 1);
  assert.equal(given.targetId, world.player.id);
  assert.equal(given.amount, 3);
  assert.equal(given.wanted, mendAmount(mend, world.player));
  assert.deepEqual(given.pos, world.player.pos);
});

void test('the dead are not healed and nothing heals for zero', (): void => {
  const { world, warden } = scene();
  warden.alive = false;
  const life: number = warden.life;
  assert.equal(healActor(world, world.player.id, warden, 50, pulse), 0);
  assert.equal(healActor(world, world.player.id, world.player, 0, pulse), 0);
  assert.equal(warden.life, life);
  assert.deepEqual(heals(world.events), []);
});

void test('casting Mending Pulse heals the hero and the warden beside them, spends its mana, and its impact counts the allies it healed', (): void => {
  const { world, warden, foe } = scene();
  const foeLife: number = foe.life;
  world.player.mana = world.player.stats.maxMana;
  startSkill(world, world.player, pulse, { x: 1, z: 0 });
  assert.equal(world.player.mana, world.player.stats.maxMana - pulse.manaCost);
  const events: WorldEvent[] = [...world.events];
  for (let step: number = 0; step < 120 && world.player.action !== null; step += 1) events.push(...stepWorld(world, [], DT));
  const impact = must(events.find((event: WorldEvent): event is Extract<WorldEvent, { readonly type: 'skill_impact' }> => event.type === 'skill_impact' && event.skill.id === 'mending_pulse'), 'pulse impact');
  const healed: readonly number[] = heals(events).map((event: Heal): number => event.targetId);
  assert.deepEqual(healed, [world.player.id, warden.id]);
  assert.equal(impact.hits, 2);
  assert.ok(foe.life <= foeLife);
  assert.ok(!events.some((event: WorldEvent): boolean => event.type === 'damage' && event.skill.id === 'mending_pulse'));
});
