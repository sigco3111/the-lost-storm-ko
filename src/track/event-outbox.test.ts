import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EVENTS_PROTOCOL } from '../backend/api.ts';
import type { PlayerEventBody } from '../backend/api.ts';
import { EVENT_OUTBOX, emptyEventOutbox, eventRetryDelay, eventsAnswered, eventsDue, queuedEvents, takeEvents } from './event-outbox.ts';
import type { EventHeader, EventOutbox, TakenEvents } from './event-outbox.ts';

const HEADER: EventHeader = { play: 'ab'.repeat(16), build: 'b1', device: 'desktop' };

function event(at: number): PlayerEventBody {
  return { kind: 'panel', at, zone: 'hideout', fields: { panel: 'inventory' } };
}

function filled(count: number): EventOutbox {
  return queuedEvents(emptyEventOutbox(0), Array.from({ length: count }, (_unused: unknown, index: number): PlayerEventBody => event(index)));
}

function take(box: EventOutbox, now: number): TakenEvents {
  const taken: TakenEvents | null = takeEvents(box, HEADER, now);
  assert.ok(taken !== null);
  return taken;
}

void test('the first batch is due at once, the next only after the gap, and a final one at any time', (): void => {
  const box: EventOutbox = filled(3);
  assert.equal(eventsDue(emptyEventOutbox(0), 0, false), false);
  assert.equal(eventsDue(box, 0, false), true);
  const taken: TakenEvents = take(box, 1000);
  assert.equal(eventsDue(taken.box, 1000, false), false);
  const idle: EventOutbox = { ...taken.box, sending: [] };
  assert.equal(eventsDue(idle, 1001, false), false);
  assert.equal(eventsDue(idle, 1001, true), true);
  assert.equal(eventsDue(idle, 1000 + EVENT_OUTBOX.gapMs, false), true);
});

void test('a batch carries the header and at most the protocol limit, and a sent batch leaves the queue', (): void => {
  const box: EventOutbox = filled(EVENTS_PROTOCOL.maxEvents + 5);
  const taken: TakenEvents = take(box, 0);
  const parsed: unknown = JSON.parse(taken.batch.text);
  assert.ok(typeof parsed === 'object' && parsed !== null);
  assert.equal(Reflect.get(parsed, 'play'), HEADER.play);
  assert.equal(taken.batch.sent.length, EVENTS_PROTOCOL.maxEvents);
  const after: EventOutbox = eventsAnswered(taken.box, taken.batch, { kind: 'sent' }, 10);
  assert.equal(after.queue.length, 5);
  assert.equal(after.sending.length, 0);
});

void test('a final flush sends what arrived after the batch in flight, and the two answers each clear their own events', (): void => {
  const first: TakenEvents = take(filled(2), 0);
  const grown: EventOutbox = queuedEvents(first.box, [event(50), event(51)]);
  assert.equal(eventsDue(grown, 10, false), false);
  assert.equal(eventsDue(grown, 10, true), true);
  const second: TakenEvents = take(grown, 10);
  assert.deepEqual(
    second.batch.sent.map((sent: PlayerEventBody): number => sent.at),
    [50, 51],
  );
  assert.equal(eventsDue(second.box, 20, true), false);
  const afterSecond: EventOutbox = eventsAnswered(second.box, second.batch, { kind: 'sent' }, 30);
  assert.deepEqual(
    afterSecond.queue.map((left: PlayerEventBody): number => left.at),
    [0, 1],
  );
  const afterBoth: EventOutbox = eventsAnswered(afterSecond, first.batch, { kind: 'sent' }, 40);
  assert.equal(afterBoth.queue.length, 0);
  assert.equal(afterBoth.sending.length, 0);
});

void test('the queue keeps the newest events and counts what it dropped', (): void => {
  const box: EventOutbox = filled(EVENT_OUTBOX.queued + 7);
  assert.equal(box.queue.length, EVENT_OUTBOX.queued);
  assert.equal(box.dropped, 7);
  assert.equal(box.queue[0]?.at, 7);
});

void test('a failure backs off, a refused token goes anonymous once, and a refusal stops for good', (): void => {
  const taken: TakenEvents = take(filled(2), 0);
  const retried: EventOutbox = eventsAnswered(taken.box, taken.batch, { kind: 'retry', afterMs: null }, 100);
  assert.equal(retried.queue.length, 2);
  assert.equal(retried.retryAt, 100 + eventRetryDelay(1));
  assert.equal(eventsDue(retried, 100, false), false);
  assert.equal(eventsDue(retried, 100, true), true);
  const anonymous: EventOutbox = eventsAnswered(taken.box, taken.batch, { kind: 'anonymous' }, 100);
  assert.equal(anonymous.anonymous, true);
  assert.equal(eventsDue(anonymous, 100, false), true);
  const again: TakenEvents = take(anonymous, 100);
  assert.equal(again.batch.anonymous, true);
  assert.equal(eventsAnswered(again.box, again.batch, { kind: 'anonymous' }, 200).stopped, true);
  const stopped: EventOutbox = eventsAnswered(taken.box, taken.batch, { kind: 'stop' }, 100);
  assert.equal(stopped.stopped, true);
  assert.equal(queuedEvents(stopped, [event(9)]).queue.length, 0);
  assert.equal(eventRetryDelay(20), EVENT_OUTBOX.maxBackoffMs);
});

void test('the hourly cap holds batches back until the hour turns', (): void => {
  const capped: EventOutbox = { ...filled(1), sentThisHour: EVENT_OUTBOX.perHour };
  assert.equal(eventsDue(capped, 10, true), false);
  assert.equal(eventsDue(capped, EVENT_OUTBOX.hourMs, true), true);
});
