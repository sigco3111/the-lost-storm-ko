import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Bot } from '../sim/bot.ts';
import { botStep, createBot } from '../sim/bot.ts';
import { createWorld } from '../sim/world/create.ts';
import type { World } from '../sim/world/types.ts';
import { must } from '../test/support.ts';
import { forkBot, forkWorld } from './simulate-fork.ts';
import { POLICIES, planFor } from './simulate-policies.ts';
import type { BuildPolicy, SkillPolicy } from './simulate-policies.ts';
import { CONTENT, playOpening } from './simulate-run.ts';

const FORK = { seed: 3, steps: 600 } as const;

interface Snapshot {
  readonly time: number;
  readonly zone: string;
  readonly player: string;
  readonly monsters: string;
  readonly rng: number;
  readonly glitchRng: number;
}

function snapshot(world: World): Snapshot {
  return {
    time: world.time,
    zone: world.zone.id,
    player: JSON.stringify({ pos: world.player.pos, life: world.player.life, xp: world.player.xp, level: world.player.level, inventory: world.player.inventory }),
    monsters: JSON.stringify(world.monsters.map((monster): readonly unknown[] => [monster.id, monster.def.id, monster.pos, monster.life, monster.alive])),
    rng: world.rng.state(),
    glitchRng: world.glitch.rng.state(),
  };
}

function opened(skill: SkillPolicy, build: BuildPolicy): Bot {
  const world: World = createWorld(CONTENT, { seed: FORK.seed, save: null, opening: true });
  const bot: Bot = createBot(world, skill.habits, null, planFor(skill, build));
  assert.equal(playOpening(bot, skill), true);
  return bot;
}

void test('a forked world plays on exactly as the original does, and playing the fork leaves the original untouched', (): void => {
  const skill: SkillPolicy = must(POLICIES.skills.get('average'), 'average play');
  const build: BuildPolicy = must(POLICIES.builds.get('mixed'), 'mixed build');
  const bot: Bot = opened(skill, build);
  const fork: Bot = forkBot(bot, skill.habits, planFor(skill, build));
  assert.deepEqual(snapshot(fork.world), snapshot(bot.world));
  const before: Snapshot = snapshot(bot.world);
  for (let step: number = 0; step < FORK.steps; step += 1) botStep(fork, []);
  assert.deepEqual(snapshot(bot.world), before);
  assert.notDeepEqual(snapshot(fork.world), before);
  for (let step: number = 0; step < FORK.steps; step += 1) botStep(bot, []);
  assert.deepEqual(snapshot(fork.world), snapshot(bot.world));
});

void test('a forked world keeps the shared content and its own random streams', (): void => {
  const world: World = createWorld(CONTENT, { seed: FORK.seed, save: null, opening: true });
  const fork: World = forkWorld(world);
  assert.equal(fork.content, world.content);
  assert.notEqual(fork.rng, world.rng);
  assert.notEqual(fork.player, world.player);
  assert.equal(fork.rng.next(), world.rng.next());
  assert.equal(fork.glitch.rng.next(), world.glitch.rng.next());
});
