import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { createRng } from '../rng.ts';
import type { Rng } from '../rng.ts';
import { createArena } from './arena.ts';
import { ACTION_HEADS, RL } from './contract.ts';
import type { Duel, DuelSeat } from './duel.ts';
import type { DuelReplay, DuelReplayer, KeptReplay } from './duel-replay.ts';
import { createDuelReplayer, duelReplayerDone, duelReplayTick, readKeptReplay, replayDuel } from './duel-replay.ts';
import type { Pool, PoolStep } from './pool.ts';
import { createPool, stepPool } from './pool.ts';
import { recordReplay } from './replay.ts';

const CONTENT: Content = loadContent();
const LIMITS = { decisions: 3000, ticks: 40000 } as const;

function randomActions(rng: Rng, seats: number): Int32Array {
  const actions: Int32Array = new Int32Array(seats * RL.actionParts);
  for (let seat: number = 0; seat < seats; seat += 1) ACTION_HEADS.forEach((choices: number, part: number): void => {
    actions[seat * RL.actionParts + part] = rng.int(0, choices - 1);
  });
  return actions;
}

function keptDuel(seed: number): DuelReplay {
  const pool: Pool = createPool(CONTENT, { seed, envs: 2, duels: 1, jitter: 0.2, waves: 1, keepEvery: 1, levels: [] });
  const rng: Rng = createRng(seed);
  for (let decision: number = 0; decision < LIMITS.decisions; decision += 1) {
    const step: PoolStep = stepPool(pool, randomActions(rng, 2));
    const found: KeptReplay | undefined = step.keep.find((replay: KeptReplay): boolean => replay.situation === 'duel');
    if (found !== undefined && found.situation === 'duel') return found;
  }
  throw new Error('no duel finished');
}

function outcomes(duel: Duel): string[] {
  return duel.seats.map((seat: DuelSeat): string => seat.outcome);
}

function totals(duel: Duel): number[] {
  return duel.seats.map((seat: DuelSeat): number => Math.round(seat.total * 1000) / 1000);
}

void test('a duel kept by the pool plays back to the same ending for both seats', (): void => {
  const replay: DuelReplay = keptDuel(73);
  assert.equal(replay.seats.length, 2);
  const again: Duel = replayDuel(CONTENT, replay);
  assert.deepEqual(outcomes(again), replay.seats.map((seat): string => seat.outcome));
  assert.deepEqual(totals(again), replay.seats.map((seat): number => seat.total));
});

void test('a duel replayed tick by tick lands on the same fight as decision by decision', (): void => {
  const replay: DuelReplay = keptDuel(79);
  const whole: Duel = replayDuel(CONTENT, replay);
  const replayer: DuelReplayer = createDuelReplayer(CONTENT, replay);
  for (let tick: number = 0; tick < LIMITS.ticks && !duelReplayerDone(replayer); tick += 1) duelReplayTick(replayer);
  assert.ok(duelReplayerDone(replayer));
  assert.equal(replayer.duel.world.time, whole.world.time);
  assert.deepEqual(replayer.duel.seats.map((seat: DuelSeat) => seat.hero.pos), whole.seats.map((seat: DuelSeat) => seat.hero.pos));
  assert.deepEqual(outcomes(replayer.duel), outcomes(whole));
  assert.deepEqual(totals(replayer.duel), totals(whole));
  assert.equal(replayer.duel.decisions, whole.decisions);
  assert.deepEqual(duelReplayTick(replayer), []);
});

void test('a saved replay is read back as the duel or the arena it was', (): void => {
  const duel: DuelReplay = keptDuel(83);
  assert.deepEqual(readKeptReplay(JSON.parse(JSON.stringify(duel))), duel);
  assert.throws((): KeptReplay => readKeptReplay({ ...duel, seats: [{ actions: [[1, 2]], outcome: 'won', total: 0 }] }));
  const [first, second] = duel.seats;
  assert.ok(first !== undefined && second !== undefined);
  assert.throws((): KeptReplay => readKeptReplay({ ...duel, seats: [first] }), /2 seats/);
  assert.throws((): KeptReplay => readKeptReplay({ ...duel, seats: [first, { ...second, actions: [] }] }), /same number/);
  const arena = recordReplay(createArena(CONTENT, { seed: 81, jitter: 0, waves: 1 }), [[0, 0, 0, 0]], 'test');
  const { situation: _situation, ...older } = arena;
  assert.deepEqual(readKeptReplay(JSON.parse(JSON.stringify(older))), arena);
});
