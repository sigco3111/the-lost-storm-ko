import { EVENTS_PROTOCOL, headers } from './api.ts';
import type { FetchFn } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import { PERF_API, perfOutcome } from './perf-api.ts';
import type { PerfOutcome } from './perf-api.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export interface EventsClient {
  send(text: string, anonymous: boolean): Promise<PerfOutcome>;
}

export interface EventsClientOptions {
  readonly serverUrl: string;
  readonly store: KeyValueStore;
  readonly fetch: FetchFn;
}

export function createEventsClient(options: EventsClientOptions): EventsClient {
  return {
    send: async (text: string, anonymous: boolean): Promise<PerfOutcome> => {
      const record: SyncRecord | null = anonymous ? null : parseSyncRecord(options.store.read(SYNC_KEY), options.serverUrl);
      const sent: Record<string, string> = record === null ? { 'Content-Type': 'application/json' } : headers(record.token);
      try {
        const response: Response = await options.fetch(`${options.serverUrl}${EVENTS_PROTOCOL.path}`, { method: 'POST', headers: sent, body: text, keepalive: true, signal: AbortSignal.timeout(PERF_API.requestMs) });
        return perfOutcome(response.status, response.headers.get('retry-after'), record !== null);
      } catch {
        return { kind: 'retry', afterMs: null };
      }
    },
  };
}
