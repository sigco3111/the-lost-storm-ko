import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, SkillDef } from '../content/types.ts';
import { must } from '../../test/support.ts';
import type { Arena } from './arena.ts';
import { arenaContext, createArena } from './arena.ts';
import { ENTITY_FEATURES, LAYOUT, MOVE_CHOICES, RL, SELF_FEATURES, SKILL_CHOICES, SLOT_FEATURES } from './contract.ts';
import type { Observation } from './observe.ts';
import { observe } from './observe.ts';

const CONTENT: Content = loadContent();

function slotValue(seen: Observation, slot: number, name: string): number {
  return seen.obs[SELF_FEATURES.length + slot * SLOT_FEATURES.length + SLOT_FEATURES.indexOf(name)] ?? Number.NaN;
}

function entityValue(seen: Observation, index: number, name: string): number {
  return seen.obs[SELF_FEATURES.length + RL.slots * SLOT_FEATURES.length + index * ENTITY_FEATURES.length + ENTITY_FEATURES.indexOf(name)] ?? Number.NaN;
}

void test('an arena observation fills the whole layout with finite numbers', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 11, jitter: 0.2, waves: 1 });
  const seen: Observation = observe(arena.world, arenaContext(arena), arena.world.player);
  assert.equal(seen.obs.length, LAYOUT.size);
  assert.equal(seen.mask.length, LAYOUT.mask);
  assert.ok(seen.obs.every((value: number): boolean => Number.isFinite(value) && Math.abs(value) <= RL.clip));
});

void test('the targets come first among the things the hero sees, nearest first', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 12, jitter: 0, waves: 1 });
  const seen: Observation = observe(arena.world, arenaContext(arena), arena.world.player);
  assert.ok(seen.view.targets.length > 0);
  seen.view.targets.forEach((monster, index: number): void => {
    const shown = seen.view.seen[index];
    assert.ok(shown !== undefined && shown.type === 'monster' && shown.monster === monster);
    assert.equal(entityValue(seen, index, 'hostile'), 1);
  });
  const gaps: number[] = seen.view.targets.map((monster): number => entityValue(seen, seen.view.targets.indexOf(monster), 'dist'));
  assert.deepEqual(gaps, gaps.toSorted((a: number, b: number): number => a - b));
});

void test('a skill reaches the model through its numbers, so a buff shows up without a new input', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 13, jitter: 0, waves: 1 });
  const player = arena.world.player;
  const basic: SkillDef = must(player.skills[0], 'basic attack');
  const before: Observation = observe(arena.world, arenaContext(arena), arena.world.player);
  player.skills[0] = { ...basic, damage: { ...basic.damage, weaponPercent: basic.damage.weaponPercent * 2 }, cooldown: basic.cooldown + 3 };
  const after: Observation = observe(arena.world, arenaContext(arena), arena.world.player);
  assert.ok(Math.abs(slotValue(after, 0, 'weapon_percent') - slotValue(before, 0, 'weapon_percent') * 2) < 1e-5);
  assert.ok(slotValue(after, 0, 'cooldown') > slotValue(before, 0, 'cooldown'));
  assert.equal(slotValue(after, 0, 'present'), 1);
});

void test('the mask allows doing nothing and refuses empty skill slots and missing targets', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 14, jitter: 0, waves: 1 });
  const seen: Observation = observe(arena.world, arenaContext(arena), arena.world.player);
  assert.equal(seen.mask[0], 1);
  assert.equal(seen.mask[MOVE_CHOICES], 1);
  arena.world.player.skills.forEach((skill: SkillDef | null, slot: number): void => {
    if (skill === null) assert.equal(seen.mask[MOVE_CHOICES + 1 + slot], 0);
  });
  const targetsAt: number = MOVE_CHOICES + SKILL_CHOICES;
  for (let target: number = 0; target < RL.targets; target += 1) assert.equal(seen.mask[targetsAt + target], target === 0 || target < seen.view.targets.length ? 1 : 0);
});
