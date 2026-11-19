import { headers, PERF_PROTOCOL, retryAfterMs } from './api.ts';
import type { FetchFn } from './api.ts';
import type { KeyValueStore } from './backend.ts';
import { parseSyncRecord, SYNC_KEY } from './sync-record.ts';
import type { SyncRecord } from './sync-record.ts';

export const PERF_API = {
  requestMs: 10_000,
  tokenRefused: [401, 403, 404],
  tooMany: 429,
  serverError: 500,
} as const;

export type PerfOutcome = { readonly kind: 'sent' } | { readonly kind: 'retry'; readonly afterMs: number | null } | { readonly kind: 'anonymous' } | { readonly kind: 'stop' };

export interface PerfClient {
  send(text: string, anonymous: boolean): Promise<PerfOutcome>;
}

export interface PerfClientOptions {
  readonly serverUrl: string;
  readonly store: KeyValueStore;
  readonly fetch: FetchFn;
}

export function perfOutcome(status: number, retryAfter: string | null, withToken: boolean): PerfOutcome {
  if (status >= 200 && status < 300) return { kind: 'sent' };
  if (status === PERF_API.tooMany || status >= PERF_API.serverError) return { kind: 'retry', afterMs: retryAfterMs(retryAfter) };
  if (withToken && PERF_API.tokenRefused.some((refused: number): boolean => refused === status)) return { kind: 'anonymous' };
  return { kind: 'stop' };
}

export function createPerfClient(options: PerfClientOptions): PerfClient {
  return {
    send: async (text: string, anonymous: boolean): Promise<PerfOutcome> => {
      const record: SyncRecord | null = anonymous ? null : parseSyncRecord(options.store.read(SYNC_KEY), options.serverUrl);
      const sent: Record<string, string> = record === null ? { 'Content-Type': 'application/json' } : headers(record.token);
      try {
        const response: Response = await options.fetch(`${options.serverUrl}${PERF_PROTOCOL.path}`, { method: 'POST', headers: sent, body: text, keepalive: true, signal: AbortSignal.timeout(PERF_API.requestMs) });
        return perfOutcome(response.status, response.headers.get('retry-after'), record !== null);
      } catch {
        return { kind: 'retry', afterMs: null };
      }
    },
  };
}
