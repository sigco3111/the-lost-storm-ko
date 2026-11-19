import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFields } from '../../sim/content/read.ts';
import { createHarness, makeSave, PLAY_STALE_MS } from '../../test/backend-support.ts';
import type { Harness, RecordedRequest } from '../../test/backend-support.ts';
import { must } from '../../test/support.ts';
import type { Backend } from './backend.ts';
import { SAVE_KEY } from './local.ts';
import { TIMING } from './remote.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';
import type { Play } from './play.ts';
import { createPlay, PLAY, playId } from './play.ts';

const URL_A: string = 'http://localhost:8787';

function puts(harness: Harness): readonly { readonly play: unknown; readonly claim: unknown; readonly status: string }[] {
  return harness.server.requests
    .filter((entry: RecordedRequest): boolean => entry.method === 'PUT')
    .map((entry: RecordedRequest): { readonly play: unknown; readonly claim: unknown; readonly status: string } => {
      assert.ok(isFields(entry.body));
      return { play: entry.body['play'], claim: entry.body['claim'], status: 'sent' };
    });
}

function storedLevel(harness: Harness): unknown {
  const parsed: unknown = JSON.parse(must(harness.store.read(SAVE_KEY), 'the local save'));
  assert.ok(isFields(parsed));
  return parsed['level'];
}

async function playing(harness: Harness, play: Play, level: number): Promise<Backend> {
  const backend: Backend = harness.open(undefined, play);
  await backend.load();
  backend.save(makeSave(level, 0));
  await harness.timers.advance(1000);
  return backend;
}

void test('a play id is a fixed-length hex string drawn from the random source', (): void => {
  const id: string = playId((): number => 0.5);
  assert.equal(id.length, PLAY.idLength);
  assert.match(id, /^[0-9a-f]+$/);
  assert.notEqual(playId(Math.random), playId(Math.random));
  assert.match(playId((): number => 1), /^f+$/);
});

void test('a page claims with its first write and only stamps its id after that', (): void => {
  const play: Play = createPlay('page-a');
  assert.deepEqual(play.stamp(), { id: 'page-a', claim: true });
  play.claimed();
  assert.deepEqual(play.stamp(), { id: 'page-a', claim: false });
});

void test('being replaced tells every listener once, and a listener that comes late hears at once', (): void => {
  const play: Play = createPlay('page-a');
  const heard: string[] = [];
  play.onReplaced((): void => void heard.push('first'));
  play.replace();
  play.replace();
  play.onReplaced((): void => void heard.push('late'));
  assert.deepEqual(heard, ['first', 'late']);
  assert.equal(play.replaced(), true);
});

void test('the newest window claims the character; the older one is refused, stops saving and leaves the save alone', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const older: Play = createPlay('older');
  const newer: Play = createPlay('newer');
  const first: Backend = await playing(harness, older, 3);
  assert.equal(older.replaced(), false);
  await playing(harness, newer, 4);
  assert.equal(storedLevel(harness), 4);
  first.save(makeSave(5, 0));
  await harness.timers.advance(TIMING.routinePushMs);
  assert.equal(older.replaced(), true);
  assert.equal(must(harness.server.accounts[0], 'the account').save?.level, 4);
  first.save(makeSave(6, 0));
  await harness.timers.advance(5000);
  assert.equal(storedLevel(harness), 5);
  assert.equal(must(harness.server.accounts[0], 'the account').save?.level, 4);
  assert.deepEqual(
    puts(harness).map((put: { readonly play: unknown; readonly claim: unknown }): string => `${String(put.play)}:${String(put.claim)}`),
    ['older:true', 'newer:true', 'older:false'],
  );
});

void test('a replaced window that was told over the live socket sends nothing more, even with its socket gone', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const older: Play = createPlay('older');
  const backend: Backend = await playing(harness, older, 3);
  const sent: number = puts(harness).length;
  older.replace();
  backend.save(makeSave(7, 0));
  backend.flush();
  await harness.timers.advance(60_000);
  assert.equal(puts(harness).length, sent);
  assert.equal(storedLevel(harness), 3);
});

void test('the window that took the character back claims again and the other one is the one refused', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const first: Play = createPlay('first');
  const second: Play = createPlay('second');
  await playing(harness, first, 3);
  const other: Backend = await playing(harness, second, 4);
  const again: Play = createPlay('first-reloaded');
  await playing(harness, again, 5);
  other.save(makeSave(6, 0));
  await harness.timers.advance(TIMING.routinePushMs);
  assert.equal(second.replaced(), true);
  assert.equal(again.replaced(), false);
  assert.equal(must(harness.server.accounts[0], 'the account').save?.level, 5);
});

void test('a client that sends no play id is never refused, so older pages keep saving', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await playing(harness, createPlay('new-page'), 3);
  const old: Backend = harness.open();
  await old.load();
  old.save(makeSave(8, 0));
  await harness.timers.advance(1000);
  assert.equal(must(harness.server.accounts[0], 'the account').save?.level, 8);
});

void test('playing here again after being refused takes the newer cloud copy, never the copy of the refused window', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const older: Play = createPlay('older');
  const first: Backend = await playing(harness, older, 3);
  await playing(harness, createPlay('newer'), 4);
  first.save(makeSave(9, 0));
  await harness.timers.advance(TIMING.routinePushMs);
  assert.equal(older.replaced(), true);
  const reloaded: Backend = harness.open(undefined, createPlay('older-reloaded'));
  assert.equal((await reloaded.load())?.level, 4);
  await harness.timers.advance(5000);
  assert.equal(must(harness.server.accounts[0], 'the account').save?.level, 4);
});

void test('a window replaced over the live socket clears its pending flag and leaves the revision of the other window alone', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const older: Play = createPlay('older');
  const first: Backend = await playing(harness, older, 3);
  await playing(harness, createPlay('newer'), 4);
  const before: SyncRecord = must(parseSyncRecord(harness.store.read(SYNC_KEY), URL_A), 'the record');
  harness.store.write(SYNC_KEY, JSON.stringify({ ...JSON.parse(must(harness.store.read(SYNC_KEY), 'the record')), pending: true }));
  older.replace();
  first.save(makeSave(9, 0));
  const after: SyncRecord = must(parseSyncRecord(harness.store.read(SYNC_KEY), URL_A), 'the record');
  assert.equal(after.pending, false);
  assert.equal(after.revision, before.revision);
  assert.equal(storedLevel(harness), 4);
});

function leaves(harness: Harness): readonly unknown[] {
  return harness.server.requests.filter((entry: RecordedRequest): boolean => entry.method === 'POST' && entry.path === '/v1/play/leave').map((entry: RecordedRequest): unknown => entry.body);
}

void test('a tab closed and a new one opened at once: the closed tab leaves and the new one plays with no card', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const closed: Play = createPlay('closed');
  const tab: Backend = await playing(harness, closed, 3);
  tab.leave();
  await harness.timers.advance(0);
  assert.deepEqual(leaves(harness), [{ play: 'closed' }]);
  const opened: Play = createPlay('opened');
  const next: Backend = await playing(harness, opened, 4);
  next.save(makeSave(5, 0));
  await harness.timers.advance(TIMING.routinePushMs);
  assert.equal(opened.replaced(), false);
  assert.equal(must(harness.server.accounts[0], 'the account').save?.level, 5);
});

void test('a tab killed before it could leave does not stop the page opened after it', async (): Promise<void> => {
  const harness: Harness = createHarness();
  await playing(harness, createPlay('killed'), 3);
  const opened: Play = createPlay('opened');
  const next: Backend = await playing(harness, opened, 4);
  next.save(makeSave(5, 0));
  await harness.timers.advance(TIMING.routinePushMs);
  assert.equal(opened.replaced(), false);
  assert.equal(must(harness.server.accounts[0], 'the account').save?.level, 5);
});

void test('a reload leaves as the old page and plays as the new one, which saves again with no claim', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const before: Backend = await playing(harness, createPlay('before-reload'), 3);
  before.leave();
  const after: Play = createPlay('after-reload');
  const reloaded: Backend = await playing(harness, after, 4);
  reloaded.save(makeSave(5, 0));
  await harness.timers.advance(TIMING.routinePushMs);
  assert.equal(after.replaced(), false);
  assert.deepEqual(
    puts(harness).map((put: { readonly play: unknown; readonly claim: unknown }): string => `${String(put.play)}:${String(put.claim)}`),
    ['before-reload:true', 'after-reload:true', 'after-reload:false'],
  );
});

void test('a page leaves only once it has claimed and only while it is not replaced, and an offline page sends nothing', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const fresh: Play = createPlay('fresh');
  const unclaimed: Backend = harness.open(undefined, fresh);
  await unclaimed.load();
  unclaimed.leave();
  const older: Play = createPlay('older');
  const first: Backend = await playing(harness, older, 3);
  older.replace();
  first.leave();
  const offline: Backend = harness.open('', createPlay('offline'));
  offline.leave();
  await harness.timers.advance(0);
  assert.deepEqual(leaves(harness), []);
});

void test('a claim older than the stale window blocks no save, and the newer progress that was saved stays', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const quiet: Play = createPlay('quiet');
  await playing(harness, quiet, 4);
  const earlier: Play = createPlay('earlier');
  earlier.claimed();
  const back: Backend = harness.open(undefined, earlier);
  await back.load();
  back.save(makeSave(5, 0));
  await harness.timers.advance(1000);
  assert.equal(earlier.replaced(), true);
  assert.equal(must(harness.server.accounts[0], 'the account').save?.level, 4);
  const later: Play = createPlay('later');
  later.claimed();
  harness.clock.now += PLAY_STALE_MS;
  const afterQuiet: Backend = harness.open(undefined, later);
  await afterQuiet.load();
  afterQuiet.save(makeSave(6, 0));
  await harness.timers.advance(1000);
  assert.equal(later.replaced(), false);
  assert.equal(must(harness.server.accounts[0], 'the account').save?.level, 6);
});
