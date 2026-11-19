import assert from 'node:assert/strict';
import test from 'node:test';
import type { FakeClock, FakeTimers } from '../test/backend-support.ts';
import { createFakeClock, createFakeTimers } from '../test/backend-support.ts';
import type { FrameClock, FrameLoop, FrameScheduler } from './frame-loop.ts';
import { FRAME_LOOP, runFrames } from './frame-loop.ts';

interface ManualFrames extends FrameScheduler {
  readonly waiting: () => number;
  run(now: number): void;
  drop(): void;
}

function manualFrames(): ManualFrames {
  let queued: ((now: number) => void)[] = [];
  return {
    request(callback: (now: number) => void): void {
      queued.push(callback);
    },
    waiting: (): number => queued.length,
    run(now: number): void {
      const due: ((now: number) => void)[] = queued;
      queued = [];
      for (const callback of due) callback(now);
    },
    drop(): void {
      queued = [];
    },
  };
}

interface Rig {
  readonly frames: ManualFrames;
  readonly timers: FakeTimers;
  readonly clock: FakeClock;
  readonly ran: number[];
  readonly faults: unknown[];
  readonly loop: FrameLoop;
}

function rig(failOn: readonly number[] = []): Rig {
  const frames: ManualFrames = manualFrames();
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const frameClock: FrameClock = { timers: timers.timers, now: (): number => clock.now };
  const ran: number[] = [];
  const faults: unknown[] = [];
  const loop: FrameLoop = runFrames(
    (now: number): void => {
      ran.push(now);
      if (failOn.includes(now)) throw new Error(`frame ${now}`);
    },
    (error: unknown): void => {
      faults.push(error);
    },
    frames,
    frameClock,
  );
  return { frames, timers, clock, ran, faults, loop };
}

async function beats(loop: Rig, count: number): Promise<void> {
  if (count <= 0) return;
  await loop.timers.advance(FRAME_LOOP.fallbackMs);
  await beats(loop, count - 1);
}

void test('a frame that throws reports the fault once and the next frames still run', (): void => {
  const loop: Rig = rig([2, 3]);
  for (const now of [1, 2, 3, 4]) loop.frames.run(now);
  assert.deepEqual(loop.ran, [1, 2, 3, 4]);
  assert.equal(loop.faults.length, 1);
  const first: unknown = loop.faults[0];
  assert.ok(first instanceof Error && first.message === 'frame 2');
});

void test('frames that never throw never report a fault and run once per frame', (): void => {
  const loop: Rig = rig();
  for (const now of [1, 2, 3]) loop.frames.run(now);
  assert.equal(loop.ran.length, 3);
  assert.equal(loop.faults.length, 0);
});

void test('when animation frames never arrive, as in a hidden tab, the loop still runs on the fallback timer', async (): Promise<void> => {
  const loop: Rig = rig();
  await beats(loop, 5);
  assert.equal(loop.ran.length, 5);
  assert.equal(loop.ran[4], loop.clock.now);
});

void test('a frame that arrives late, after the fallback already ran, does not run the step twice', async (): Promise<void> => {
  const loop: Rig = rig();
  await loop.timers.advance(FRAME_LOOP.fallbackMs);
  assert.equal(loop.ran.length, 1);
  loop.frames.run(loop.clock.now);
  assert.equal(loop.ran.length, 2);
  assert.equal(loop.timers.pending(), 1);
});

void test('frames that arrive in time cancel the fallback, so a visible tab steps once per frame', async (): Promise<void> => {
  const loop: Rig = rig();
  loop.frames.run(16);
  loop.frames.run(32);
  assert.equal(loop.timers.pending(), 1);
  await loop.timers.advance(FRAME_LOOP.fallbackMs - 1);
  assert.deepEqual(loop.ran, [16, 32]);
});

void test('re-arming a loop whose frames were lost starts it again, and only one chain runs after', async (): Promise<void> => {
  const loop: Rig = rig();
  loop.frames.run(1);
  loop.frames.drop();
  loop.loop.rearm();
  loop.loop.rearm();
  loop.frames.run(2);
  assert.deepEqual(loop.ran, [1, 2]);
  assert.equal(loop.frames.waiting(), 1);
  await loop.timers.advance(FRAME_LOOP.fallbackMs);
  assert.equal(loop.ran.length, 3);
});
