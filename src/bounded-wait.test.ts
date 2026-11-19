import assert from 'node:assert/strict';
import test from 'node:test';
import type { FakeClock, FakeTimers } from '../test/backend-support.ts';
import { createFakeClock, createFakeTimers, settle } from '../test/backend-support.ts';
import type { FrameSource } from './bounded-wait.ts';
import { BOUNDED_WAIT, framesWithin, nextFrameWithin, within } from './bounded-wait.ts';

interface HeldFrames extends FrameSource {
  readonly waiting: () => number;
  run(): void;
}

function heldFrames(): HeldFrames {
  let queued: (() => void)[] = [];
  return {
    request(callback: () => void): void {
      queued.push(callback);
    },
    waiting: (): number => queued.length,
    run(): void {
      const due: (() => void)[] = queued;
      queued = [];
      for (const callback of due) callback();
    },
  };
}

function tracked(promise: Promise<unknown>): { readonly done: () => boolean } {
  let done: boolean = false;
  void promise.then((): boolean => {
    done = true;
    return done;
  });
  return { done: (): boolean => done };
}

void test('frames that never arrive still end the wait once the real-time bound passes', async (): Promise<void> => {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const frames: HeldFrames = heldFrames();
  const wait = tracked(framesWithin(frames, timers.timers, 2, BOUNDED_WAIT.frameMs));
  await settle();
  assert.equal(wait.done(), false);
  await timers.advance(BOUNDED_WAIT.frameMs);
  assert.equal(wait.done(), false);
  await timers.advance(BOUNDED_WAIT.frameMs);
  assert.equal(wait.done(), true);
  assert.equal(timers.pending(), 0);
});

void test('frames that arrive in time end the wait at once and leave no timer behind', async (): Promise<void> => {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const frames: HeldFrames = heldFrames();
  const wait = tracked(framesWithin(frames, timers.timers, 2, BOUNDED_WAIT.frameMs));
  frames.run();
  await settle();
  frames.run();
  await settle();
  assert.equal(wait.done(), true);
  assert.equal(timers.pending(), 0);
});

void test('a frame that arrives after the bound changes nothing and the wait has already ended', async (): Promise<void> => {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const frames: HeldFrames = heldFrames();
  const wait = tracked(nextFrameWithin(frames, timers.timers, BOUNDED_WAIT.frameMs));
  await timers.advance(BOUNDED_WAIT.frameMs);
  assert.equal(wait.done(), true);
  assert.equal(frames.waiting(), 1);
  frames.run();
  await settle();
  assert.equal(timers.pending(), 0);
});

void test('work that never finishes is given up on at the bound and reported as unfinished', async (): Promise<void> => {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const never: Promise<void> = new Promise<void>((): void => undefined);
  const results: boolean[] = [];
  void within(never, timers.timers, BOUNDED_WAIT.readyMs).then((finished: boolean): void => void results.push(finished));
  await timers.advance(BOUNDED_WAIT.readyMs - 1);
  assert.deepEqual(results, []);
  await timers.advance(1);
  assert.deepEqual(results, [false]);
});

void test('work that finishes or fails in time ends the wait as finished and cancels the bound', async (): Promise<void> => {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const results: boolean[] = [];
  void within(Promise.resolve(), timers.timers, BOUNDED_WAIT.readyMs).then((finished: boolean): void => void results.push(finished));
  void within(Promise.reject(new Error('warm failed')), timers.timers, BOUNDED_WAIT.readyMs).then((finished: boolean): void => void results.push(finished));
  await settle();
  assert.deepEqual(results, [true, true]);
  assert.equal(timers.pending(), 0);
});
