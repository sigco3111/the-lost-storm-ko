import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Timers } from './backend/backend.ts';
import type { BuiltZone, Veil, ZoneTransition } from './transition.ts';
import { createZoneTransition, TRANSITION } from './transition.ts';

const BUILT: BuiltZone = { ready: Promise.resolve() };

interface Run {
  readonly transition: ZoneTransition;
  readonly log: string[];
  finishLift(): void;
  frames(count: number): void;
}

function settle(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setImmediate(resolve);
  });
}

function setUp(): Run {
  const log: string[] = [];
  const lifts: (() => void)[] = [];
  const veil: Veil = {
    cover(colour: string | null): Promise<void> {
      log.push(`cover ${colour ?? 'none'}`);
      return Promise.resolve();
    },
    hold(): Promise<void> {
      return Promise.resolve();
    },
    lift(): Promise<void> {
      log.push('lift');
      return new Promise<void>((resolve: () => void): void => void lifts.push(resolve));
    },
  };
  const timers: Timers = { after: (): (() => void) => (): void => undefined };
  const transition: ZoneTransition = createZoneTransition({ veil, timers, now: (): number => 0, onError: (error: unknown): void => assert.fail(String(error)), onReport: (): void => undefined });
  return {
    transition,
    log,
    finishLift(): void {
      for (const done of lifts.splice(0)) done();
    },
    frames(count: number): void {
      for (let index: number = 0; index < count; index += 1) transition.frame(TRANSITION.cleanFrameMs - 6);
    },
  };
}

function swapTo(run: Run, zone: string): () => Promise<BuiltZone> {
  return (): Promise<BuiltZone> => {
    run.log.push(`build ${zone}`);
    return Promise.resolve(BUILT);
  };
}

async function toLift(run: Run, rounds: number = 6): Promise<void> {
  if (rounds <= 0 || run.log.includes('lift')) return;
  await settle();
  run.frames(TRANSITION.cleanFrames + TRANSITION.revealFrames);
  await toLift(run, rounds - 1);
}

void test('a zone change that arrives while the veil is lifting is drawn once the lift ends, under a veil of its own', async (): Promise<void> => {
  const run: Run = setUp();
  run.transition.begin(swapTo(run, 'hideout'), '#000001', (): void => undefined);
  await toLift(run);
  assert.equal(run.transition.blocking, false);
  run.transition.begin(swapTo(run, 'hall_of_time'), '#000002', (): void => undefined);
  await settle();
  assert.deepEqual(run.log, ['cover #000001', 'build hideout', 'lift']);
  run.finishLift();
  await settle();
  await settle();
  assert.deepEqual(run.log, ['cover #000001', 'build hideout', 'lift', 'cover #000002', 'build hall_of_time']);
});

void test('of several changes that arrive during one lift, only the last is drawn', async (): Promise<void> => {
  const run: Run = setUp();
  run.transition.begin(swapTo(run, 'hideout'), null, (): void => undefined);
  await toLift(run);
  run.transition.begin(swapTo(run, 'between'), null, (): void => undefined);
  run.transition.begin(swapTo(run, 'hall_of_time'), null, (): void => undefined);
  run.finishLift();
  await settle();
  await settle();
  assert.deepEqual(run.log.filter((line: string): boolean => line.startsWith('build')), ['build hideout', 'build hall_of_time']);
});
