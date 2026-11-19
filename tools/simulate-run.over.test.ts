import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Measurement } from '../sim/measure.ts';
import { runJob } from './simulate-run.ts';
import type { Job } from './simulate-run.ts';
import { POLICIES } from './simulate-policies.ts';

const OVER = {
  hero: 25,
  zone: 20,
  minutes: 1,
  seed: 1,
} as const;

void test('a hero over a zone far above the opening still plays the opening at its own level, then fights in the fixed zone', (): void => {
  const job: Job = { scenario: { kind: 'over', hero: OVER.hero, zone: OVER.zone, minutes: OVER.minutes }, skill: 'average', build: 'mixed', seed: OVER.seed, danger: 1, toughness: 1 };
  const stream: readonly Measurement[] = runJob(job, POLICIES);
  const end: Measurement | undefined = stream.at(-1);
  assert.ok(end !== undefined && end.kind === 'end');
  assert.equal(end.reason, 'done');
  assert.ok(stream.some((entry: Measurement): boolean => entry.kind === 'kill'), 'the hero kills something in the fixed zone');
});
