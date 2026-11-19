import { EVENTS_PROTOCOL } from '../backend/api.ts';
import type { EventBatchBody, PerfDevice, PlayerEventBody } from '../backend/api.ts';
import type { PerfOutcome } from '../backend/perf-api.ts';

export const EVENT_OUTBOX = {
  gapMs: 30_000,
  queued: 240,
  maxChars: 16_384,
  backoffMs: 30_000,
  maxBackoffMs: 600_000,
  perHour: 150,
  hourMs: 3_600_000,
} as const;

export interface EventHeader {
  readonly play: string;
  readonly build: string;
  readonly device: PerfDevice;
}

export interface EventOutbox {
  readonly queue: readonly PlayerEventBody[];
  readonly anonymous: boolean;
  readonly sending: readonly PlayerEventBody[];
  readonly stopped: boolean;
  readonly lastAt: number | null;
  readonly retryAt: number;
  readonly failures: number;
  readonly hourStart: number;
  readonly sentThisHour: number;
  readonly dropped: number;
}

export interface EventBatch {
  readonly text: string;
  readonly sent: readonly PlayerEventBody[];
  readonly anonymous: boolean;
}

export interface TakenEvents {
  readonly box: EventOutbox;
  readonly batch: EventBatch;
}

export function emptyEventOutbox(now: number): EventOutbox {
  return { queue: [], anonymous: false, sending: [], stopped: false, lastAt: null, retryAt: -Infinity, failures: 0, hourStart: now, sentThisHour: 0, dropped: 0 };
}

export function queuedEvents(box: EventOutbox, events: readonly PlayerEventBody[]): EventOutbox {
  if (box.stopped || events.length === 0) return box;
  const queue: readonly PlayerEventBody[] = [...box.queue, ...events];
  const over: number = Math.max(0, queue.length - EVENT_OUTBOX.queued);
  return { ...box, queue: queue.slice(over), dropped: box.dropped + over };
}

function withinHour(box: EventOutbox, now: number): boolean {
  return now - box.hourStart >= EVENT_OUTBOX.hourMs || box.sentThisHour < EVENT_OUTBOX.perHour;
}

function waiting(box: EventOutbox): readonly PlayerEventBody[] {
  return box.queue.filter((event: PlayerEventBody): boolean => !box.sending.includes(event));
}

export function eventsDue(box: EventOutbox, now: number, final: boolean): boolean {
  if (box.stopped || waiting(box).length === 0 || !withinHour(box, now)) return false;
  if (final) return true;
  if (box.sending.length > 0 || now < box.retryAt) return false;
  return box.lastAt === null || now - box.lastAt >= EVENT_OUTBOX.gapMs;
}

function batchText(header: EventHeader, events: readonly PlayerEventBody[]): string {
  const body: EventBatchBody = { ...header, events };
  return JSON.stringify(body);
}

export function takeEvents(box: EventOutbox, header: EventHeader, now: number): TakenEvents | null {
  const pending: readonly PlayerEventBody[] = waiting(box);
  let count: number = Math.min(pending.length, EVENTS_PROTOCOL.maxEvents);
  let text: string = batchText(header, pending.slice(0, count));
  while (text.length > EVENT_OUTBOX.maxChars && count > 1) {
    count = Math.max(1, Math.floor(count / 2));
    text = batchText(header, pending.slice(0, count));
  }
  if (count === 0 || text.length > EVENT_OUTBOX.maxChars) return null;
  const freshHour: boolean = now - box.hourStart >= EVENT_OUTBOX.hourMs;
  return {
    box: { ...box, sending: [...box.sending, ...pending.slice(0, count)], lastAt: now, hourStart: freshHour ? now : box.hourStart, sentThisHour: (freshHour ? 0 : box.sentThisHour) + 1 },
    batch: { text, sent: pending.slice(0, count), anonymous: box.anonymous },
  };
}

export function eventRetryDelay(failures: number): number {
  return Math.min(EVENT_OUTBOX.maxBackoffMs, EVENT_OUTBOX.backoffMs * 2 ** Math.max(0, failures - 1));
}

export function eventsAnswered(box: EventOutbox, batch: EventBatch, outcome: PerfOutcome, now: number): EventOutbox {
  const idle: EventOutbox = { ...box, sending: box.sending.filter((event: PlayerEventBody): boolean => !batch.sent.includes(event)) };
  if (outcome.kind === 'sent') return { ...idle, queue: box.queue.filter((event: PlayerEventBody): boolean => !batch.sent.includes(event)), failures: 0, retryAt: -Infinity };
  if (outcome.kind === 'retry') {
    const failures: number = box.failures + 1;
    return { ...idle, failures, retryAt: now + Math.max(outcome.afterMs ?? 0, eventRetryDelay(failures)) };
  }
  if (outcome.kind === 'anonymous' && !batch.anonymous) return { ...idle, anonymous: true, lastAt: null };
  return { ...idle, stopped: true, queue: [], sending: [] };
}
