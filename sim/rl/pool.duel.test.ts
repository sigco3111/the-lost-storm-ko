import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { LAYOUT, RL } from './contract.ts';
import type { EpisodeSummary, Pool, PoolStep } from './pool.ts';
import { createPool, poolObservations, stepPool } from './pool.ts';

const CONTENT: Content = loadContent();
const SEATS = { envs: 3, duels: 1, limit: 3000 } as const;

void test('a pool with a duel gives the duel two seats after the arenas, and both seats finish together', (): void => {
  const pool: Pool = createPool(CONTENT, { seed: 71, envs: SEATS.envs, duels: SEATS.duels, jitter: 0, waves: 1, keepEvery: 0, levels: [] });
  assert.deepEqual(pool.matches.map((match): string => match.kind), ['arena', 'duel']);
  const first: PoolStep = poolObservations(pool);
  assert.equal(first.obs.length, SEATS.envs * LAYOUT.size);
  const idle: Int32Array = new Int32Array(SEATS.envs * RL.actionParts);
  let duels: EpisodeSummary[] = [];
  let ended: PoolStep = first;
  for (let count: number = 0; count < SEATS.limit && duels.length === 0; count += 1) {
    ended = stepPool(pool, idle);
    duels = ended.finished.filter((episode: EpisodeSummary): boolean => episode.situation === 'duel');
  }
  assert.deepEqual(duels.map((episode: EpisodeSummary): number => episode.env), [1, 2]);
  assert.equal(ended.dones[1], 1);
  assert.equal(ended.dones[2], 1);
  assert.equal(pool.matches[1]?.kind, 'duel');
});

void test('a pool refuses more duels than its envs can seat', (): void => {
  assert.throws((): Pool => createPool(CONTENT, { seed: 72, envs: 1, duels: 1, jitter: 0, waves: 1, keepEvery: 0, levels: [] }));
});
