import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { ARENA } from './arena.ts';
import { levelCount } from './curriculum.ts';
import { RL } from './contract.ts';
import type { EpisodeSummary, Match, Pool } from './pool.ts';
import { createPool, setLevels, stepPool } from './pool.ts';

const CONTENT: Content = loadContent();

function only(level: number): number[] {
  return Array.from({ length: levelCount() }, (_one: unknown, index: number): number => (index + ARENA.levels.min === level ? 1 : 0));
}

function heroLevels(pool: Pool): number[] {
  return pool.matches.map((match: Match): number => (match.kind === 'arena' ? match.arena.world.player.level : match.duel.world.player.level));
}

void test('level weights choose the level of every arena the pool opens, and can change while it runs', (): void => {
  const pool: Pool = createPool(CONTENT, { seed: 97, envs: 4, duels: 0, jitter: 0, waves: 1, keepEvery: 0, levels: only(7) });
  assert.deepEqual(heroLevels(pool), [7, 7, 7, 7]);
  assert.deepEqual(pool.matches.map((match: Match): number => (match.kind === 'arena' ? match.arena.level : match.duel.level)), [7, 7, 7, 7]);
  setLevels(pool, only(11));
  const fresh: Pool = createPool(CONTENT, { seed: 98, envs: 2, duels: 0, jitter: 0, waves: 1, keepEvery: 0, levels: [] });
  assert.equal(fresh.levels.length, 0);
  assert.deepEqual(pool.levels, only(11));
});

void test('a finished arena is counted at the level it was benched at, even if the hero levelled up in it', (): void => {
  const pool: Pool = createPool(CONTENT, { seed: 99, envs: 1, duels: 0, jitter: 0, waves: 1, keepEvery: 0, levels: only(5) });
  const match: Match | undefined = pool.matches[0];
  assert.ok(match !== undefined && match.kind === 'arena');
  match.arena.world.player.level = 9;
  match.arena.outcome = 'timeout';
  const step = stepPool(pool, new Int32Array(RL.actionParts));
  assert.deepEqual(step.finished.map((episode: EpisodeSummary): number => episode.level), [5]);
});
