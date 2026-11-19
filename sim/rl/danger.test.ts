import assert from 'node:assert/strict';
import { test } from 'node:test';
import { botInDanger } from '../bot.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { stepWorld } from '../world/step.ts';
import type { Arena } from './arena.ts';
import { createArena } from './arena.ts';
import { MOVE_CHOICES, RL } from './contract.ts';
import { dangerAround } from './danger.ts';

const CONTENT: Content = loadContent();
const WAIT = { ticks: 900 } as const;

void test('an empty arena holds no danger in any direction', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 5, jitter: 0, waves: 1 });
  arena.world.monsters = [];
  assert.deepEqual(dangerAround(arena.world, arena.world.player), Array.from({ length: MOVE_CHOICES }, (): number => 0));
});

void test('a blow winding up on the hero shows as danger where the hero stands', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 6, jitter: 0, waves: 1 });
  let warned: boolean = false;
  for (let tick: number = 0; tick < WAIT.ticks && arena.world.player.alive && !warned; tick += 1) {
    stepWorld(arena.world, [], RL.tick);
    warned = botInDanger(arena.world, arena.world.player.pos);
  }
  assert.ok(warned, 'no monster ever wound up a blow on the hero');
  const danger: number[] = dangerAround(arena.world, arena.world.player);
  assert.equal(danger[0], 1);
  assert.ok(danger.every((value: number): boolean => value >= 0 && value <= 1));
});
