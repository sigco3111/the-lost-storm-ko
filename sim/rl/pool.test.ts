import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { LAYOUT, RL } from './contract.ts';
import type { Pool, PoolStep } from './pool.ts';
import { createPool, poolObservations, stepPool } from './pool.ts';

const CONTENT: Content = loadContent();
const ENVS: number = 3;

void test('a pool gives one observation and mask per arena', (): void => {
  const pool: Pool = createPool(CONTENT, { seed: 61, envs: ENVS, duels: 0, jitter: 0, waves: 1, keepEvery: 0, levels: [] });
  const first: PoolStep = poolObservations(pool);
  assert.equal(first.obs.length, ENVS * LAYOUT.size);
  assert.equal(first.mask.length, ENVS * LAYOUT.mask);
  const step: PoolStep = stepPool(pool, new Int32Array(ENVS * RL.actionParts));
  assert.equal(step.rewards.length, ENVS);
  assert.throws((): PoolStep => stepPool(pool, new Int32Array(1)));
});

void test('a finished arena reports its episode, keeps a replay and starts afresh', (): void => {
  const pool: Pool = createPool(CONTENT, { seed: 62, envs: 1, duels: 0, jitter: 0, waves: 1, keepEvery: 1, levels: [] });
  const idle: Int32Array = new Int32Array(RL.actionParts);
  const limit: number = 2000;
  let step: PoolStep = poolObservations(pool);
  for (let count: number = 0; count < limit && step.finished.length === 0; count += 1) step = stepPool(pool, idle);
  assert.equal(step.finished.length, 1);
  assert.equal(step.dones[0], 1);
  assert.equal(step.keep.length, 1);
  const fresh = must(pool.matches.at(0), 'arena');
  assert.ok(fresh.kind === 'arena');
  assert.equal(fresh.arena.decisions, 0);
  assert.equal(fresh.arena.options.seed, 63);
});
