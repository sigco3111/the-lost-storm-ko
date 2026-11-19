import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FakeClock, FakeTimers } from '../../test/backend-support.ts';
import { createFakeClock, createFakeTimers, settle } from '../../test/backend-support.ts';
import { waitWithin } from './warm-up.ts';

const CAP_MS: number = 6000;

interface Pending {
  readonly work: Promise<void>;
  finish(): void;
  fail(): void;
}

interface Settler {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

function pending(): Pending {
  const settlers: Settler[] = [];
  const work: Promise<void> = new Promise<void>((resolve: () => void, reject: (error: Error) => void): void => {
    settlers.push({ resolve, reject });
  });
  return {
    work,
    finish: (): void => {
      for (const settler of settlers) settler.resolve();
    },
    fail: (): void => {
      for (const settler of settlers) settler.reject(new Error('the rig never came'));
    },
  };
}

interface Watched {
  done(): boolean;
}

function watched(promise: Promise<void>): Watched {
  const state: { done: boolean } = { done: false };
  const follow = async (): Promise<void> => {
    await promise;
    state.done = true;
  };
  void follow();
  return { done: (): boolean => state.done };
}

void test('a zone waits for its bodies to load and lets the cap go as soon as they are in', async (): Promise<void> => {
  const clock: FakeClock = createFakeClock();
  const fake: FakeTimers = createFakeTimers(clock);
  const bodies: Pending = pending();
  const entry: Watched = watched(waitWithin(bodies.work, fake.timers, CAP_MS));
  await fake.advance(CAP_MS / 2);
  assert.equal(entry.done(), false);
  bodies.finish();
  await settle();
  assert.equal(entry.done(), true);
  assert.equal(fake.pending(), 0);
});

void test('bodies that outlast the cap never hold the zone past it', async (): Promise<void> => {
  const clock: FakeClock = createFakeClock();
  const fake: FakeTimers = createFakeTimers(clock);
  const bodies: Pending = pending();
  const entry: Watched = watched(waitWithin(bodies.work, fake.timers, CAP_MS));
  await fake.advance(CAP_MS - 1);
  assert.equal(entry.done(), false);
  await fake.advance(1);
  assert.equal(entry.done(), true);
  bodies.finish();
});

void test('a body load that fails opens the zone at once', async (): Promise<void> => {
  const clock: FakeClock = createFakeClock();
  const fake: FakeTimers = createFakeTimers(clock);
  const bodies: Pending = pending();
  const entry: Watched = watched(waitWithin(bodies.work, fake.timers, CAP_MS));
  bodies.fail();
  await settle();
  assert.equal(entry.done(), true);
  assert.equal(fake.pending(), 0);
});
