import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTION_HEADS, LAYOUT, MOVE_CHOICES, RL, SKILL_CHOICES } from './contract.ts';
import { allowedAction } from './demo.ts';

void test('a bot choice the mask forbids is turned into the head\'s no-op', (): void => {
  const mask: Uint8Array = new Uint8Array(LAYOUT.mask).fill(1);
  const useAt: number = MOVE_CHOICES + SKILL_CHOICES + RL.targets;
  mask[useAt + 1] = 0;
  mask[MOVE_CHOICES + 3] = 0;
  assert.deepEqual(allowedAction({ move: 4, skill: 3, target: 2, use: 1 }, mask), { move: 4, skill: 0, target: 2, use: 0 });
  assert.equal(ACTION_HEADS.reduce((sum: number, choices: number): number => sum + choices, 0), LAYOUT.mask);
});
