import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must } from '../../test/support.ts';
import type { Command } from '../world/types.ts';
import { commandsFor } from './act.ts';
import type { Action } from './contract.ts';
import { NO_ACTION } from './contract.ts';
import type { Duel, DuelSeat, DuelStep } from './duel.ts';
import { createDuel, DUEL, duelObservation, duelRunning, stepDuel } from './duel.ts';
import { REWARD } from './reward.ts';

const CONTENT: Content = loadContent();
const LIMIT = { decisions: 2000 } as const;
const STRIKE: Action = { move: 0, skill: 1, target: 0, use: 0 };

function seat(duel: Duel, index: number): DuelSeat {
  return must(duel.seats[index], `seat ${index}`);
}

function orders(duel: Duel, actions: readonly Action[]): Command[][] {
  return duel.seats.map((one: DuelSeat, index: number): Command[] => commandsFor(duel.world, actions[index] ?? NO_ACTION, duelObservation(duel, one).view));
}

void test('a duel seats two heroes in rival parties, apart, each seeing the other as its one target', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 5, jitter: 0 });
  const [first, second] = [seat(duel, 0), seat(duel, 1)];
  assert.equal(first.hero, duel.world.player);
  assert.equal(duel.world.heroes.length, 2);
  assert.notEqual(first.hero.party, second.hero.party);
  assert.notEqual(first.hero.id, second.hero.id);
  assert.ok(Math.hypot(first.hero.pos.x - second.hero.pos.x, first.hero.pos.z - second.hero.pos.z) > 1);
  assert.deepEqual(duelObservation(duel, first).view.targets, [second.hero]);
  assert.deepEqual(duelObservation(duel, second).view.targets, [first.hero]);
});

void test('the hero who fells the other wins the duel and its win reward, and the fallen one has died', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 6, jitter: 0 });
  seat(duel, 1).hero.life = 1;
  let step: DuelStep = { rewards: [], done: false, events: [] };
  let gained: number = 0;
  for (let count: number = 0; count < LIMIT.decisions && duelRunning(duel); count += 1) {
    step = stepDuel(duel, orders(duel, [STRIKE, NO_ACTION]));
    gained = step.rewards[0] ?? 0;
  }
  assert.equal(step.done, true);
  assert.equal(seat(duel, 0).outcome, 'won');
  assert.equal(seat(duel, 1).outcome, 'died');
  assert.ok(gained >= REWARD.win);
  assert.ok(seat(duel, 1).total < 0);
});

void test('a duel in which nobody falls ends for both heroes when its time runs out', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 7, jitter: 0 });
  for (let count: number = 0; count < LIMIT.decisions && duelRunning(duel); count += 1) stepDuel(duel, orders(duel, [NO_ACTION, NO_ACTION]));
  assert.deepEqual(duel.seats.map((one: DuelSeat): string => one.outcome), ['timeout', 'timeout']);
  assert.ok(duel.world.time - duel.start >= DUEL.timeLimit);
});

void test('a duel takes one list of commands per seat', (): void => {
  const duel: Duel = createDuel(CONTENT, { seed: 8, jitter: 0 });
  assert.throws((): DuelStep => stepDuel(duel, [[]]));
});
