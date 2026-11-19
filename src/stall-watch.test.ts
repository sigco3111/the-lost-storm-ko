import assert from 'node:assert/strict';
import test from 'node:test';
import type { FakeClock, FakeTimers } from '../test/backend-support.ts';
import { createFakeClock, createFakeTimers } from '../test/backend-support.ts';
import { FRAME_WATCH } from './frame-watch.ts';
import type { StallWatch } from './stall-watch.ts';
import { startStallWatch } from './stall-watch.ts';

interface Watched {
  readonly watch: StallWatch;
  readonly timers: FakeTimers;
  readonly calls: string[];
  readonly flags: { watching: boolean };
}

function watched(): Watched {
  const clock: FakeClock = createFakeClock();
  const timers: FakeTimers = createFakeTimers(clock);
  const calls: string[] = [];
  const flags: { watching: boolean } = { watching: true };
  const watch: StallWatch = startStallWatch({
    timers: timers.timers,
    now: (): number => clock.now,
    watching: (): boolean => flags.watching,
    rearm: (): void => void calls.push('rearm'),
    offer: (): void => void calls.push('offer'),
    clear: (): void => void calls.push('clear'),
    report: (): void => undefined,
  });
  return { watch, timers, calls, flags };
}

async function seconds(rig: Watched, ms: number, stepping: boolean): Promise<void> {
  if (ms <= 0) return;
  if (stepping) rig.watch.stepped();
  await rig.timers.advance(FRAME_WATCH.checkMs);
  await seconds(rig, ms - FRAME_WATCH.checkMs, stepping);
}

void test('frames that never arrive in play re-arm the loop, then offer the resume line', async (): Promise<void> => {
  const rig: Watched = watched();
  await seconds(rig, FRAME_WATCH.stallMs, false);
  assert.deepEqual(rig.calls, ['rearm']);
  await seconds(rig, FRAME_WATCH.stallMs, false);
  assert.deepEqual(rig.calls, ['rearm', 'offer']);
  await seconds(rig, FRAME_WATCH.stallMs * 4, false);
  assert.deepEqual(rig.calls, ['rearm', 'offer']);
});

void test('frames that arrive late, once re-armed, put the watch back to quiet with no line shown', async (): Promise<void> => {
  const rig: Watched = watched();
  await seconds(rig, FRAME_WATCH.stallMs, false);
  await seconds(rig, FRAME_WATCH.stallMs * 3, true);
  assert.deepEqual(rig.calls, ['rearm']);
});

void test('a stepping world in a visible tab never touches the loop', async (): Promise<void> => {
  const rig: Watched = watched();
  await seconds(rig, 60000, true);
  assert.deepEqual(rig.calls, []);
});

void test('a hidden tab is never a stall, and coming back starts the count again', async (): Promise<void> => {
  const rig: Watched = watched();
  rig.flags.watching = false;
  await seconds(rig, 300000, false);
  rig.flags.watching = true;
  rig.watch.reset();
  await seconds(rig, FRAME_WATCH.stallMs - FRAME_WATCH.checkMs, false);
  assert.deepEqual(rig.calls, []);
});

void test('resume hides the line and re-arms; if that brings the world back the line stays away', async (): Promise<void> => {
  const rig: Watched = watched();
  await seconds(rig, FRAME_WATCH.stallMs * 2, false);
  rig.watch.resume();
  assert.deepEqual(rig.calls, ['rearm', 'offer', 'clear', 'rearm']);
  await seconds(rig, FRAME_WATCH.stallMs * 3, true);
  assert.deepEqual(rig.calls, ['rearm', 'offer', 'clear', 'rearm']);
});

void test('the watch keeps checking on its own timer, so it still runs when no frame ever comes', async (): Promise<void> => {
  const rig: Watched = watched();
  assert.equal(rig.timers.pending(), 1);
  await seconds(rig, FRAME_WATCH.checkMs * 10, false);
  assert.equal(rig.timers.pending(), 1);
});
