import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryStore } from '../../test/backend-support.ts';
import type { FetchFn } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import { createPerfClient, perfOutcome } from './perf-api.ts';
import { serializeSyncRecord, SYNC_KEY } from './sync-record.ts';

const SERVER: string = 'http://localhost:8787';
const offline: FetchFn = (): Promise<Response> => Promise.reject(new Error('offline'));

interface Seen {
  readonly url: string;
  readonly authorization: string | null;
  readonly keepalive: boolean;
  readonly body: string;
}

function recording(status: number, seen: Seen[], retryAfter: string | null = null): FetchFn {
  return (url: string, init: RequestInit): Promise<Response> => {
    const headers: Headers = new Headers(init.headers);
    seen.push({ url, authorization: headers.get('authorization'), keepalive: init.keepalive === true, body: typeof init.body === 'string' ? init.body : '' });
    return Promise.resolve(new Response('{}', { status, headers: retryAfter === null ? {} : { 'Retry-After': retryAfter } }));
  };
}

function signedIn(serverUrl: string): KeyValueStore {
  const store: KeyValueStore = createMemoryStore();
  store.write(SYNC_KEY, serializeSyncRecord({ serverUrl, accountId: 'a1', token: 'tok-1', revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false }));
  return store;
}

void test('answers become sent, retry, anonymous or stop', (): void => {
  assert.deepEqual(perfOutcome(201, null, true), { kind: 'sent' });
  assert.deepEqual(perfOutcome(429, '30', false), { kind: 'retry', afterMs: 30_000 });
  assert.deepEqual(perfOutcome(503, null, false), { kind: 'retry', afterMs: null });
  assert.deepEqual(perfOutcome(401, null, true), { kind: 'anonymous' });
  assert.deepEqual(perfOutcome(404, null, true), { kind: 'anonymous' });
  assert.deepEqual(perfOutcome(404, null, false), { kind: 'stop' });
  assert.deepEqual(perfOutcome(400, null, true), { kind: 'stop' });
  assert.deepEqual(perfOutcome(413, null, false), { kind: 'stop' });
});

void test('a report goes to the server with the play session token, kept alive past the page', async (): Promise<void> => {
  const seen: Seen[] = [];
  const client = createPerfClient({ serverUrl: SERVER, store: signedIn(SERVER), fetch: recording(201, seen) });
  assert.deepEqual(await client.send('{"a":1}', false), { kind: 'sent' });
  assert.deepEqual(seen, [{ url: `${SERVER}/v1/perf`, authorization: 'Bearer tok-1', keepalive: true, body: '{"a":1}' }]);
});

void test('a guest, a token from another server and an anonymous send carry no token', async (): Promise<void> => {
  const seen: Seen[] = [];
  await createPerfClient({ serverUrl: SERVER, store: createMemoryStore(), fetch: recording(201, seen) }).send('{}', false);
  await createPerfClient({ serverUrl: SERVER, store: signedIn('https://elsewhere.example'), fetch: recording(201, seen) }).send('{}', false);
  await createPerfClient({ serverUrl: SERVER, store: signedIn(SERVER), fetch: recording(201, seen) }).send('{}', true);
  assert.deepEqual(
    seen.map((request: Seen): string | null => request.authorization),
    [null, null, null],
  );
});

void test('a network failure is a retry, never an error', async (): Promise<void> => {
  assert.deepEqual(await createPerfClient({ serverUrl: SERVER, store: createMemoryStore(), fetch: offline }).send('{}', false), { kind: 'retry', afterMs: null });
});
