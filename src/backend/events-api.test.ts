import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMemoryStore } from '../../test/backend-support.ts';
import type { FetchFn } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import { createEventsClient } from './events-api.ts';
import type { PerfOutcome } from './perf-api.ts';
import { serializeSyncRecord, SYNC_KEY } from './sync-record.ts';

const SERVER: string = 'http://localhost:8787';

interface Seen {
  readonly url: string;
  readonly authorization: string | null;
  readonly keepalive: boolean;
  readonly body: string;
}

function recording(status: number, seen: Seen[]): FetchFn {
  return (url: string, init: RequestInit): Promise<Response> => {
    const headers: Headers = new Headers(init.headers);
    seen.push({ url, authorization: headers.get('authorization'), keepalive: init.keepalive === true, body: typeof init.body === 'string' ? init.body : '' });
    return Promise.resolve(new Response('{}', { status }));
  };
}

function signedIn(): KeyValueStore {
  const store: KeyValueStore = createMemoryStore();
  store.write(SYNC_KEY, serializeSyncRecord({ serverUrl: SERVER, accountId: 'a1', token: 'tok-1', revision: 0, updatedAt: null, savedAt: null, pending: false, overwriteCloud: false }));
  return store;
}

void test('a batch goes to /v1/events with the token and keepalive, and as a guest without one', async (): Promise<void> => {
  const seen: Seen[] = [];
  const client = createEventsClient({ serverUrl: SERVER, store: signedIn(), fetch: recording(201, seen) });
  assert.deepEqual(await client.send('{"events":[]}', false), { kind: 'sent' });
  assert.deepEqual(await client.send('{"events":[]}', true), { kind: 'sent' });
  assert.deepEqual(
    seen.map((entry: Seen): [string, string | null, boolean] => [entry.url, entry.authorization, entry.keepalive]),
    [
      [`${SERVER}/v1/events`, 'Bearer tok-1', true],
      [`${SERVER}/v1/events`, null, true],
    ],
  );
});

void test('a server without the route turns a signed-in send anonymous, then stops, and a dead network retries', async (): Promise<void> => {
  const client = createEventsClient({ serverUrl: SERVER, store: signedIn(), fetch: recording(404, []) });
  assert.deepEqual(await client.send('{}', false), { kind: 'anonymous' });
  assert.deepEqual(await client.send('{}', true), { kind: 'stop' });
  const offline = createEventsClient({ serverUrl: SERVER, store: createMemoryStore(), fetch: (): Promise<Response> => Promise.reject(new Error('offline')) });
  const outcome: PerfOutcome = await offline.send('{}', false);
  assert.deepEqual(outcome, { kind: 'retry', afterMs: null });
});
