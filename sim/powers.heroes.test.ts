import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARENA_CONTENT, arena } from '../test/arena-support.ts';
import { must } from '../test/support.ts';
import type { SkillDef } from './content/types.ts';
import { generateItem, slotOf } from './items.ts';
import { buffMods, firePowers } from './powers.ts';
import { createRng } from './rng.ts';
import type { ItemInstance, PlayerState, World } from './world/types.ts';

const POWER = { base: 'quietshot', uid: 7, level: 5, seed: 1 } as const;

function joined(world: World): PlayerState {
  const apart: PlayerState = arena(POWER.seed, ARENA_CONTENT).player;
  const hero: PlayerState = { ...apart, id: world.nextId };
  world.nextId += 1;
  world.heroes.push(hero);
  return hero;
}

function wearOn(hero: PlayerState): void {
  const made: ItemInstance = must(generateItem(ARENA_CONTENT, createRng(POWER.uid), POWER.uid, POWER.level, POWER.base, null), POWER.base);
  hero.equipped[must(slotOf(ARENA_CONTENT, made), POWER.base)] = made;
}

void test('a second hero fires its own powers and the primary hero gains nothing', (): void => {
  const world: World = arena(POWER.seed, ARENA_CONTENT);
  const second: PlayerState = joined(world);
  wearOn(second);
  const roll: SkillDef = must(ARENA_CONTENT.skills.get('dodge_roll'), 'dodge roll');
  assert.ok(!firePowers(world, world.player, { on: 'use', skill: roll, target: null, at: world.player.pos }));
  assert.ok(firePowers(world, second, { on: 'use', skill: roll, target: null, at: second.pos }));
  assert.equal(buffMods(second.powers).length, 1);
  assert.equal(buffMods(world.player.powers).length, 0);
});
