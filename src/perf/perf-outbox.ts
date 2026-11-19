import { PERF_PROTOCOL } from '../backend/api.ts';
import type { PerfDevice, PerfFactsBody, PerfReportBody, PerfTier, PerfWindowBody } from '../backend/api.ts';
import type { PerfOutcome } from '../backend/perf-api.ts';

export const PERF_OUTBOX = {
  gapMs: 20_000,
  finalGapMs: 5_000,
  queued: 12,
  maxChars: 8192,
  backoffMs: 30_000,
  maxBackoffMs: 600_000,
  perHour: 100,
  hourMs: 3_600_000,
} as const;

export interface PerfHeader {
  readonly play: string;
  readonly build: string;
  readonly device: PerfDevice;
  readonly tier: PerfTier;
}

export interface PerfOutbox {
  readonly queue: readonly PerfWindowBody[];
  readonly factsSent: boolean;
  readonly anonymous: boolean;
  readonly busy: boolean;
  readonly stopped: boolean;
  readonly lastAt: number | null;
  readonly retryAt: number;
  readonly failures: number;
  readonly hourStart: number;
  readonly sentThisHour: number;
}

export interface PerfBatch {
  readonly text: string;
  readonly sent: readonly PerfWindowBody[];
  readonly facts: boolean;
  readonly anonymous: boolean;
}

export interface Taken {
  readonly box: PerfOutbox;
  readonly batch: PerfBatch;
}

export function emptyOutbox(now: number): PerfOutbox {
  return { queue: [], factsSent: false, anonymous: false, busy: false, stopped: false, lastAt: null, retryAt: -Infinity, failures: 0, hourStart: now, sentThisHour: 0 };
}

export function queued(box: PerfOutbox, window: PerfWindowBody): PerfOutbox {
  if (box.stopped) return box;
  const queue: readonly PerfWindowBody[] = [...box.queue, window];
  return { ...box, queue: queue.slice(Math.max(0, queue.length - PERF_OUTBOX.queued)) };
}

function withinHour(box: PerfOutbox, now: number): boolean {
  return now - box.hourStart >= PERF_OUTBOX.hourMs || box.sentThisHour < PERF_OUTBOX.perHour;
}

export function due(box: PerfOutbox, now: number, final: boolean): boolean {
  if (box.stopped || box.busy || box.queue.length === 0 || !withinHour(box, now)) return false;
  if (now < box.retryAt) return false;
  return box.lastAt === null || now - box.lastAt >= (final ? PERF_OUTBOX.finalGapMs : PERF_OUTBOX.gapMs);
}

function bodyOf(header: PerfHeader, windows: readonly PerfWindowBody[], facts: PerfFactsBody | null): PerfReportBody {
  return facts === null ? { ...header, windows } : { ...header, facts, windows };
}

export function takeBatch(box: PerfOutbox, header: PerfHeader, facts: PerfFactsBody | null, now: number): Taken | null {
  const sendFacts: PerfFactsBody | null = box.factsSent ? null : facts;
  let count: number = Math.min(box.queue.length, PERF_PROTOCOL.maxWindows);
  let text: string = JSON.stringify(bodyOf(header, box.queue.slice(0, count), sendFacts));
  while (text.length > PERF_OUTBOX.maxChars && count > 1) {
    count -= 1;
    text = JSON.stringify(bodyOf(header, box.queue.slice(0, count), sendFacts));
  }
  if (count === 0 || text.length > PERF_OUTBOX.maxChars) return null;
  const freshHour: boolean = now - box.hourStart >= PERF_OUTBOX.hourMs;
  return {
    box: { ...box, busy: true, lastAt: now, hourStart: freshHour ? now : box.hourStart, sentThisHour: (freshHour ? 0 : box.sentThisHour) + 1 },
    batch: { text, sent: box.queue.slice(0, count), facts: sendFacts !== null, anonymous: box.anonymous },
  };
}

export function retryDelay(failures: number): number {
  return Math.min(PERF_OUTBOX.maxBackoffMs, PERF_OUTBOX.backoffMs * 2 ** Math.max(0, failures - 1));
}

export function answered(box: PerfOutbox, batch: PerfBatch, outcome: PerfOutcome, now: number): PerfOutbox {
  const idle: PerfOutbox = { ...box, busy: false };
  if (outcome.kind === 'sent') return { ...idle, queue: box.queue.filter((window: PerfWindowBody): boolean => !batch.sent.includes(window)), factsSent: box.factsSent || batch.facts, failures: 0, retryAt: -Infinity };
  if (outcome.kind === 'retry') {
    const failures: number = box.failures + 1;
    return { ...idle, failures, retryAt: now + Math.max(outcome.afterMs ?? 0, retryDelay(failures)) };
  }
  if (outcome.kind === 'anonymous' && !batch.anonymous) return { ...idle, anonymous: true, lastAt: null };
  return { ...idle, stopped: true, queue: [] };
}
