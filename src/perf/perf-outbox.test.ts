import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PERF_PROTOCOL } from '../backend/api.ts';
import type { PerfFactsBody, PerfWindowBody } from '../backend/api.ts';
import { answered, due, emptyOutbox, PERF_OUTBOX, queued, retryDelay, takeBatch } from './perf-outbox.ts';
import type { PerfHeader, PerfOutbox, Taken } from './perf-outbox.ts';

const HEADER: PerfHeader = { play: 'ab'.repeat(16), build: 'b1', device: 'phone', tier: 'mobile' };
const FACTS: PerfFactsBody = { quality: 'low', lensWater: false, dpr: 3, viewport: [390, 844], touch: true, cores: 6, memoryGb: null, gpuVendor: 'Apple Inc.', gpuRenderer: 'Apple GPU' };

function window(at: number): PerfWindowBody {
  return { at, end: 'time', zone: 'hideout', ms: 60_000, frames: 3600, histogram: [0, 0, 0, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], p50: 16.5, p95: 16.5, p99: 16.5, worst: 17, over: [0, 0, 0, 0], stallMs: 0, monsters: 0, hidden: false, draws: 1, triangles: 1, textures: 1, geometries: 1, canvas: [1, 1], pixelRatio: 1, lost: 0, restored: 0, rearms: 0, offers: 0 };
}

function filled(count: number): PerfOutbox {
  let box: PerfOutbox = emptyOutbox(0);
  for (let index: number = 0; index < count; index += 1) box = queued(box, window(index));
  return box;
}

function take(box: PerfOutbox, now: number): Taken {
  const taken: Taken | null = takeBatch(box, HEADER, FACTS, now);
  assert.ok(taken !== null);
  return taken;
}

function sentFacts(taken: Taken): unknown {
  const parsed: unknown = JSON.parse(taken.batch.text);
  assert.ok(typeof parsed === 'object' && parsed !== null);
  return Reflect.get(parsed, 'facts');
}

void test('nothing is due with an empty queue, and a first window is due at once', (): void => {
  assert.equal(due(emptyOutbox(0), 0, false), false);
  assert.equal(due(filled(1), 0, false), true);
});

void test('a batch carries at most six windows and the device facts until a send is accepted', (): void => {
  const first: Taken = take(filled(8), 100);
  assert.equal(first.batch.sent.length, PERF_PROTOCOL.maxWindows);
  assert.equal(first.batch.facts, true);
  assert.deepEqual(sentFacts(first), FACTS);
  assert.equal(due(first.box, 100, true), false);
  const after: PerfOutbox = answered(first.box, first.batch, { kind: 'sent' }, 200);
  assert.deepEqual(after.queue.map((sent: PerfWindowBody): number => sent.at), [6, 7]);
  assert.equal(due(after, 100 + PERF_OUTBOX.gapMs - 1, false), false);
  assert.equal(due(after, 100 + PERF_OUTBOX.gapMs, false), true);
  const second: Taken = take(after, 100 + PERF_OUTBOX.gapMs);
  assert.equal(second.batch.facts, false);
  assert.equal(sentFacts(second), undefined);
});

void test('a final send on hiding the page skips the usual gap but not a burst', (): void => {
  const taken: Taken = take(filled(1), 0);
  const sent: PerfOutbox = answered(taken.box, taken.batch, { kind: 'sent' }, 0);
  assert.equal(sent.queue.length, 0);
  const waiting: PerfOutbox = queued(sent, window(9));
  assert.equal(due(waiting, PERF_OUTBOX.finalGapMs - 1, true), false);
  assert.equal(due(waiting, PERF_OUTBOX.finalGapMs, true), true);
  assert.equal(due(waiting, PERF_OUTBOX.finalGapMs, false), false);
});

void test('the queue keeps only the newest windows and a batch fits the size cap', (): void => {
  const box: PerfOutbox = filled(PERF_OUTBOX.queued + 5);
  assert.equal(box.queue.length, PERF_OUTBOX.queued);
  assert.equal(box.queue[0]?.at, 5);
  assert.ok(take(box, 0).batch.text.length <= PERF_OUTBOX.maxChars);
});

void test('network errors and busy servers back off and keep the windows; refusals stop the page', (): void => {
  const taken: Taken = take(filled(2), 0);
  const failed: PerfOutbox = answered(taken.box, taken.batch, { kind: 'retry', afterMs: null }, 1000);
  assert.equal(failed.queue.length, 2);
  assert.equal(due(failed, 1000 + retryDelay(1) - 1, false), false);
  assert.equal(due(failed, 1000 + retryDelay(1), false), true);
  const told: PerfOutbox = answered(taken.box, taken.batch, { kind: 'retry', afterMs: 120_000 }, 1000);
  assert.equal(told.retryAt, 121_000);
  assert.equal(retryDelay(30), PERF_OUTBOX.maxBackoffMs);
  assert.equal(due(failed, 1000 + retryDelay(1) - 1, true), false);
  const stopped: PerfOutbox = answered(taken.box, taken.batch, { kind: 'stop' }, 1000);
  assert.equal(due(queued(stopped, window(5)), 1_000_000, true), false);
});

void test('a token the server will not take is dropped once, then a second refusal stops the page', (): void => {
  const taken: Taken = take(filled(1), 0);
  const anonymous: PerfOutbox = answered(taken.box, taken.batch, { kind: 'anonymous' }, 10);
  assert.equal(anonymous.anonymous, true);
  assert.equal(due(anonymous, 10, false), true);
  const again: Taken = take(anonymous, 10);
  assert.equal(again.batch.anonymous, true);
  assert.equal(answered(again.box, again.batch, { kind: 'anonymous' }, 20).stopped, true);
});

void test('no more than the hourly budget is sent in an hour', (): void => {
  let box: PerfOutbox = emptyOutbox(0);
  let now: number = 0;
  for (let sent: number = 0; sent < PERF_OUTBOX.perHour; sent += 1) {
    box = queued(box, window(sent));
    const taken: Taken = take(box, now);
    box = answered(taken.box, taken.batch, { kind: 'sent' }, now);
    now += PERF_OUTBOX.finalGapMs;
  }
  box = queued(box, window(0));
  assert.equal(due(box, now, true), false);
  assert.equal(due(box, PERF_OUTBOX.hourMs, true), true);
});

void test('a window queued while a batch is out is kept even when the queue trims from the front', (): void => {
  const full: PerfOutbox = filled(PERF_OUTBOX.queued);
  const taken: Taken = take(full, 0);
  const grown: PerfOutbox = queued(taken.box, window(99));
  assert.equal(grown.queue.length, PERF_OUTBOX.queued);
  const after: PerfOutbox = answered(grown, taken.batch, { kind: 'sent' }, 10);
  assert.deepEqual(
    after.queue.map((left: PerfWindowBody): number => left.at),
    [6, 7, 8, 9, 10, 11, 99],
  );
});

void test('a batch sent before the facts could be read leaves the facts for the next batch', (): void => {
  const early: Taken | null = takeBatch(filled(1), HEADER, null, 0);
  assert.ok(early !== null);
  assert.equal(sentFacts(early), undefined);
  const after: PerfOutbox = queued(answered(early.box, early.batch, { kind: 'sent' }, 10), window(5));
  const next: Taken = take(after, PERF_OUTBOX.gapMs + 10);
  assert.equal(next.batch.facts, true);
  assert.deepEqual(sentFacts(next), FACTS);
});
