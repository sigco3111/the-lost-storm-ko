import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import type { Arena } from './arena.ts';
import { arenaObservation, createArena } from './arena.ts';
import type { Action } from './contract.ts';
import { MOVE_CHOICES, RL, SELF_FEATURES, SKILL_CHOICES, USE_CHOICES } from './contract.ts';
import { dangerAround } from './danger.ts';
import type { Observation } from './observe.ts';
import { rememberDecision } from './recall.ts';

const CONTENT: Content = loadContent();

function selfValue(seen: Observation, name: string): number {
  return seen.obs[SELF_FEATURES.indexOf(name)] ?? Number.NaN;
}

function decisionRead(seen: Observation, prefix: string): Action {
  const pick = (head: string, choices: number): number => Array.from({ length: choices }, (_unused: unknown, index: number): number => selfValue(seen, `${prefix}${head}_${index}`)).indexOf(1);
  return { move: pick('move', MOVE_CHOICES), skill: pick('skill', SKILL_CHOICES), target: pick('target', RL.targets), use: pick('use', USE_CHOICES) };
}

void test('a fresh arena remembers two empty decisions', (): void => {
  const seen: Observation = arenaObservation(createArena(CONTENT, { seed: 13, jitter: 0, waves: 1 }));
  assert.deepEqual(decisionRead(seen, 'last1_'), { move: 0, skill: 0, target: 0, use: 0 });
  assert.deepEqual(decisionRead(seen, 'last2_'), { move: 0, skill: 0, target: 0, use: 0 });
});

void test('the hero sees its last two decisions, newest first', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 13, jitter: 0, waves: 1 });
  const older: Action = { move: 3, skill: 2, target: 1, use: 1 };
  const newer: Action = { move: 7, skill: 0, target: 4, use: 3 };
  rememberDecision(arena.recall, older);
  rememberDecision(arena.recall, newer);
  const seen: Observation = arenaObservation(arena);
  assert.deepEqual(decisionRead(seen, 'last1_'), newer);
  assert.deepEqual(decisionRead(seen, 'last2_'), older);
});

void test('the danger in each move direction is written in move order', (): void => {
  const arena: Arena = createArena(CONTENT, { seed: 13, jitter: 0, waves: 1 });
  const seen: Observation = arenaObservation(arena);
  const danger: number[] = dangerAround(arena.world, arena.world.player);
  for (let move: number = 0; move < MOVE_CHOICES; move += 1) assert.equal(selfValue(seen, `danger_${move}`), danger[move]);
});
