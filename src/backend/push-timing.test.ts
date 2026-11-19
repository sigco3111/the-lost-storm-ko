import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHarness, makeSave, settle } from '../../test/backend-support.ts';
import type { Harness, ServerAccount } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import type { Backend } from './backend.ts';
import { PUSH, pushWhen } from './push-timing.ts';
import { TIMING } from './remote.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

const URL_A: string = 'http://localhost:8787';

function account(harness: Harness): ServerAccount {
  return must(harness.server.accounts[0], 'the server account');
}

function record(harness: Harness): SyncRecord {
  return must(parseSyncRecord(harness.store.read(SYNC_KEY), URL_A), 'the sync record');
}

async function synced(harness: Harness, level: number): Promise<Backend> {
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(level, 0));
  await harness.timers.advance(PUSH.firstMs);
  return backend;
}

void test('an urgent save or the first push of a page goes before the routine gap; a claimed page waits it', (): void => {
  assert.deepEqual(pushWhen(true, true), { kind: 'now' });
  assert.deepEqual(pushWhen(true, false), { kind: 'now' });
  assert.deepEqual(pushWhen(false, false), { kind: 'after', ms: PUSH.firstMs });
  assert.deepEqual(pushWhen(false, true), { kind: 'after', ms: PUSH.routineMs });
  assert.ok(PUSH.firstMs < PUSH.routineMs);
  assert.equal(TIMING.pushGapMs, PUSH.firstMs);
  assert.equal(TIMING.routinePushMs, PUSH.routineMs);
});

async function saveEvery(harness: Harness, backend: Backend, xps: readonly number[], gapMs: number): Promise<void> {
  const [xp, ...rest] = xps;
  if (xp === undefined) return;
  backend.save(makeSave(2, xp));
  await harness.timers.advance(gapMs);
  await saveEvery(harness, backend, rest, gapMs);
}

void test('the first push of a page goes after the short gap, because it claims the character', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = harness.open();
  await backend.load();
  backend.save(makeSave(2, 0));
  await harness.timers.advance(TIMING.pushGapMs - 1);
  assert.equal(harness.server.count('PUT', '/v1/save'), 0);
  await harness.timers.advance(1);
  assert.equal(harness.server.count('PUT', '/v1/save'), 1);
});

void test('routine saves after the first push wait the routine gap and go up as one push of the newest save', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  await saveEvery(harness, backend, [1, 2, 3, 4, 5], 2000);
  assert.equal(harness.server.count('PUT', '/v1/save'), 1);
  assert.equal(record(harness).pending, true);
  await harness.timers.advance(TIMING.routinePushMs - 10_000);
  assert.equal(harness.server.count('PUT', '/v1/save'), 2);
  assert.equal(account(harness).save?.xp, 5);
  assert.equal(record(harness).pending, false);
});

void test('an urgent save inside the routine gap pushes at once and leaves no routine push behind', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  backend.save(makeSave(2, 7));
  await harness.timers.advance(2000);
  assert.equal(harness.server.count('PUT', '/v1/save'), 1);
  backend.save(makeSave(3, 0), { urgent: true });
  await settle();
  await settle();
  assert.equal(harness.server.count('PUT', '/v1/save'), 2);
  assert.equal(account(harness).save?.level, 3);
  assert.equal(harness.timers.pending(), 0);
});

void test('an urgent save made while a push is in flight goes up right after it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  backend.save(makeSave(2, 3));
  const release: () => void = harness.server.holdNext();
  await harness.timers.advance(TIMING.routinePushMs);
  backend.save(makeSave(3, 0), { urgent: true });
  release();
  await settle();
  await settle();
  await harness.timers.advance(0);
  assert.equal(harness.server.count('PUT', '/v1/save'), 3);
  assert.equal(account(harness).save?.level, 3);
});

void test('a routine save made while a push is in flight waits the routine gap after it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  backend.save(makeSave(2, 3));
  const release: () => void = harness.server.holdNext();
  await harness.timers.advance(TIMING.routinePushMs);
  backend.save(makeSave(2, 4));
  release();
  await settle();
  await settle();
  assert.equal(harness.timers.nextDelay(), TIMING.routinePushMs);
});

void test('hiding or closing the page sends a waiting routine save at once', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  backend.save(makeSave(2, 8));
  backend.flush();
  await settle();
  await settle();
  assert.equal(account(harness).save?.xp, 8);
  assert.equal(harness.timers.pending(), 0);
});

void test('an urgent save while the server is down keeps the retry backoff', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 2);
  harness.server.goDown();
  backend.save(makeSave(2, 1));
  await harness.timers.advance(TIMING.routinePushMs);
  assert.equal(harness.timers.nextDelay(), TIMING.retryBaseMs);
  const sent: number = harness.server.requests.length;
  backend.save(makeSave(3, 0), { urgent: true });
  await settle();
  assert.equal(harness.server.requests.length, sent);
  assert.equal(harness.timers.nextDelay(), TIMING.retryBaseMs);
  harness.server.comeUp();
  await harness.timers.advance(TIMING.retryBaseMs);
  assert.equal(account(harness).save?.level, 3);
});
