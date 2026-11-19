import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { ACTION_HEADS, LAYOUT } from './contract.ts';
import type { DemoEpisode, Demonstration } from './demo.ts';
import { demonstrate } from './demo.ts';

const CONTENT: Content = loadContent();

void test('the bot plays an arena to its end and every decision is labelled with a legal action', (): void => {
  const episode: DemoEpisode = demonstrate(CONTENT, { seed: 51, jitter: 0, waves: 1 });
  assert.notEqual(episode.outcome, 'running');
  assert.ok(episode.samples.length > 0);
  for (const sample of episode.samples) {
    assert.equal(sample.obs.length, LAYOUT.size);
    const parts: number[] = [sample.action.move, sample.action.skill, sample.action.target, sample.action.use];
    parts.forEach((part: number, head: number): void => assert.ok(part >= 0 && part < (ACTION_HEADS[head] ?? 0)));
  }
  assert.ok(episode.samples.some((sample: Demonstration): boolean => sample.action.skill > 0), 'the bot attacks');
});
