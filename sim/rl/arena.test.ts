import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, MonsterDef, SkillDef } from '../content/types.ts';
import { isWalkable } from '../nav/grid.ts';
import { createRng } from '../rng.ts';
import { fightZones } from '../world/moments.ts';
import { must } from '../../test/support.ts';
import type { Arena } from './arena.ts';
import { ARENA, arenaPool, arenaRunning, createArena, heroSkills, jitterContent, stepArena } from './arena.ts';
import { RL } from './contract.ts';
import { hostileMonster } from './observe.ts';

const CONTENT: Content = loadContent();

void test('the same seed builds the same arena', (): void => {
  const first: Arena = createArena(CONTENT, { seed: 31, jitter: 0.2, waves: 2 });
  const again: Arena = createArena(CONTENT, { seed: 31, jitter: 0.2, waves: 2 });
  assert.deepEqual(again.world.player.bar, first.world.player.bar);
  assert.equal(again.world.player.level, first.world.player.level);
  assert.deepEqual(again.world.monsters.map((monster): string => monster.def.id), first.world.monsters.map((monster): string => monster.def.id));
});

void test('an arena opens with a hostile wave, the basic attack and the roll', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 32, jitter: 0, waves: 1 });
  const player = arena.world.player;
  assert.equal(arena.wave, 1);
  assert.ok(arena.world.monsters.length > 0);
  assert.ok(arena.world.monsters.every((monster): boolean => hostileMonster(arena.world, monster) && monster.aggro));
  assert.equal(player.bar[ARENA.basicSlot], CONTENT.player.skillBook[0]?.skill);
  assert.equal(player.bar[ARENA.rollSlot], CONTENT.player.skillBook[1]?.skill);
  assert.ok(player.level >= ARENA.levels.min && player.level <= ARENA.levels.max);
});

void test('the arena stands in the first fight zone, on its own ground, with none of its own packs', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 34, jitter: 0, waves: 1 });
  const world = arena.world;
  assert.equal(world.zone.id, fightZones(CONTENT)[0]);
  assert.deepEqual(world.zone.packs, []);
  assert.ok(isWalkable(world.grid, world.player.pos.x, world.player.pos.z));
  assert.ok(world.monsters.every((monster): boolean => arena.lives.has(monster.id)));
});

void test('the arena pool holds no bosses, summoners, fixed pieces or sleepers', (): void => {
  const pool: MonsterDef[] = arenaPool(CONTENT);
  assert.ok(pool.length > 0);
  assert.ok(pool.every((monster: MonsterDef): boolean => monster.boss === null && monster.summon === null && monster.behaviour.type !== 'fixed' && monster.dormant === null));
});

void test('every skill a hero can learn is a real skill', (): void => {
  const skills: string[] = heroSkills(CONTENT);
  assert.ok(skills.length > 2);
  assert.ok(skills.every((skill: string): boolean => CONTENT.skills.has(skill)));
});

void test('jitter moves every number by at most its spread and leaves names alone', (): void => {
  const spread: number = 0.2;
  const played: Content = jitterContent(CONTENT, createRng(5), spread);
  for (const [id, skill] of CONTENT.skills) {
    const moved: SkillDef = must(played.skills.get(id), id);
    assert.equal(moved.name, skill.name);
    if (skill.cooldown > 0) assert.ok(Math.abs(moved.cooldown / skill.cooldown - 1) <= spread + 1e-9);
  }
  for (const [id, monster] of CONTENT.monsters) {
    const moved: MonsterDef = must(played.monsters.get(id), id);
    assert.ok(Math.abs(moved.life / monster.life - 1) <= spread + 1e-9);
  }
  assert.equal(jitterContent(CONTENT, createRng(5), 0), CONTENT);
});

void test('standing still in the arena ends the episode within its time limit', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 33, jitter: 0, waves: 1 });
  const limit: number = Math.ceil(ARENA.timeLimit / (RL.tick * RL.ticksPerDecision)) + 1;
  for (let step: number = 0; step < limit && arenaRunning(arena); step += 1) stepArena(arena, []);
  assert.notEqual(arena.outcome, 'running');
  assert.ok(arena.decisions <= limit);
});
