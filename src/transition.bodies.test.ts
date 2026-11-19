import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FakeClock, FakeTimers } from '../test/backend-support.ts';
import { createFakeClock, createFakeTimers, settle } from '../test/backend-support.ts';
import { waitWithin } from './render/warm-up.ts';
import type { BuiltZone, Veil, ZoneTransition } from './transition.ts';
import { createZoneTransition, TRANSITION } from './transition.ts';

const BODIES_CAP_MS: number = 6000;
const FRAME_MS: number = TRANSITION.cleanFrameMs - 6;

interface Bodies {
  readonly loading: Promise<void>;
  arrive(): void;
  fail(): void;
}

interface Settler {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

function bodies(): Bodies {
  const settlers: Settler[] = [];
  const loading: Promise<void> = new Promise<void>((resolve: () => void, reject: (error: Error) => void): void => {
    settlers.push({ resolve, reject });
  });
  return {
    loading,
    arrive: (): void => {
      for (const settler of settlers) settler.resolve();
    },
    fail: (): void => {
      for (const settler of settlers) settler.reject(new Error('a rig never came'));
    },
  };
}

interface Run {
  readonly fake: FakeTimers;
  readonly log: string[];
  readonly transition: ZoneTransition;
  readonly errors: unknown[];
  frames(count: number): void;
}

function run(): Run {
  const clock: FakeClock = createFakeClock();
  const fake: FakeTimers = createFakeTimers(clock);
  const log: string[] = [];
  const errors: unknown[] = [];
  const veil: Veil = {
    cover: (): Promise<void> => Promise.resolve(),
    hold: (): Promise<void> => Promise.resolve(),
    lift: (): Promise<void> => {
      log.push('lift');
      return Promise.resolve();
    },
  };
  const transition: ZoneTransition = createZoneTransition({
    veil,
    timers: fake.timers,
    now: (): number => clock.now,
    onError: (error: unknown): void => {
      errors.push(error);
    },
    onReport: (): void => undefined,
  });
  return {
    fake,
    log,
    transition,
    errors,
    frames(count: number): void {
      for (let index: number = 0; index < count; index += 1) transition.frame(FRAME_MS);
    },
  };
}

function enter(zone: Run, load: Bodies): void {
  const ready: Promise<void> = waitWithin(load.loading, zone.fake.timers, BODIES_CAP_MS);
  zone.transition.begin((): Promise<BuiltZone> => Promise.resolve({ ready }), null, (): void => {
    zone.log.push('reveal');
  });
}

async function revealFrames(zone: Run): Promise<void> {
  zone.frames(TRANSITION.cleanFrames);
  await settle();
  zone.frames(TRANSITION.revealFrames);
  await settle();
}

void test('a zone whose bodies are still loading is drawn at once behind the veil, with the world held still', async (): Promise<void> => {
  const zone: Run = run();
  enter(zone, bodies());
  await settle();
  assert.equal(zone.transition.presenting, true);
  assert.equal(zone.transition.blocking, true);
  await revealFrames(zone);
  assert.deepEqual(zone.log, []);
});

void test('the veil stays until the bodies are in, then lifts after clean frames', async (): Promise<void> => {
  const zone: Run = run();
  const load: Bodies = bodies();
  enter(zone, load);
  await settle();
  await zone.fake.advance(BODIES_CAP_MS / 2);
  await revealFrames(zone);
  assert.deepEqual(zone.log, []);
  load.arrive();
  await settle();
  await revealFrames(zone);
  assert.deepEqual(zone.log, ['reveal', 'lift']);
  assert.equal(zone.transition.blocking, false);
});

void test('a rig that stays late lets the veil go at the cap, with its monsters already drawn on stand-ins', async (): Promise<void> => {
  const zone: Run = run();
  enter(zone, bodies());
  await settle();
  await zone.fake.advance(BODIES_CAP_MS - 1);
  assert.equal(zone.transition.presenting, true);
  await revealFrames(zone);
  assert.deepEqual(zone.log, []);
  await zone.fake.advance(1);
  await revealFrames(zone);
  assert.deepEqual(zone.log, ['reveal', 'lift']);
  assert.deepEqual(zone.errors, []);
});

void test('a body load that fails opens the zone without an error', async (): Promise<void> => {
  const zone: Run = run();
  const load: Bodies = bodies();
  enter(zone, load);
  load.fail();
  await settle();
  await revealFrames(zone);
  assert.deepEqual(zone.log, ['reveal', 'lift']);
  assert.deepEqual(zone.errors, []);
});
