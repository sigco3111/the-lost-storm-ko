import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CostLimit, TurnGate, FramePacer } from './paced-work.ts';
import { eachInTurn, turnGate, framesOf, workPaced } from './paced-work.ts';
import { settle } from '../../test/backend-support.ts';

interface FakePacer extends FramePacer {
  readonly frames: number[];
  spend(ms: number): void;
}

function fakePacer(): FakePacer {
  let clock: number = 0;
  let frame: number = 0;
  const frames: number[] = [];
  return {
    frames,
    now(): number {
      return clock;
    },
    next(): Promise<void> {
      frame += 1;
      clock += 16;
      return Promise.resolve();
    },
    spend(ms: number): void {
      clock += ms;
      frames.push(frame);
    },
  };
}

void test('paced work fills each frame up to its budget and carries the rest to the next frame', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  await workPaced([1, 2, 3, 4, 5, 6, 7], (): void => pacer.spend(2), pacer, 6);
  assert.deepEqual(pacer.frames, [0, 0, 0, 1, 1, 1, 2]);
});

void test('one item longer than the budget still runs, alone in its frame', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  await workPaced([10, 10, 1], (ms: number): void => pacer.spend(ms), pacer, 6);
  assert.deepEqual(pacer.frames, [0, 1, 2]);
});

void test('nothing to do waits for no frame', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  let waited: number = 0;
  await workPaced([], (): void => undefined, { now: (): number => pacer.now(), next: (): Promise<void> => { waited += 1; return pacer.next(); } }, 6);
  assert.equal(waited, 0);
});

void test('an unlimited budget does everything in the first frame', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  await workPaced([5, 5, 5, 5], (ms: number): void => pacer.spend(ms), pacer, Number.POSITIVE_INFINITY);
  assert.deepEqual(pacer.frames, [0, 0, 0, 0]);
});

void test('a cost limit ends a frame before the item that would pass it, even with time to spare', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  await workPaced([3, 3, 3, 5, 1], (): void => pacer.spend(0), pacer, 6, { perFrame: 6, cost: (size: number): number => size });
  assert.deepEqual(pacer.frames, [0, 0, 1, 2, 2]);
});

void test('one item costlier than the whole frame still runs, alone in its frame', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  await workPaced([9, 1], (): void => pacer.spend(0), pacer, 6, { perFrame: 6, cost: (size: number): number => size });
  assert.deepEqual(pacer.frames, [0, 1]);
});

void test('frames are cut by cost, keeping order and never leaving an empty frame', (): void => {
  const limit: CostLimit<number> = { perFrame: 6, cost: (size: number): number => size };
  assert.deepEqual(framesOf([2, 2, 2, 7, 1, 5, 1], limit), [[2, 2, 2], [7], [1, 5], [1]]);
  assert.deepEqual(framesOf([], limit), []);
});

void test('a frame gate lets work through until the frame budget is spent, then waits for the next frame', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  const gate: TurnGate = turnGate(pacer, 6);
  const done: number[] = await eachInTurn([1, 2, 3, 4, 5], gate, (item: number): number => {
    pacer.spend(4);
    return item * 10;
  });
  assert.deepEqual(done, [10, 20, 30, 40, 50]);
  assert.deepEqual(pacer.frames, [0, 0, 1, 1, 2]);
});

void test('loads that share a frame gate share one budget, so a frame holds no more of their work than one load alone', async (): Promise<void> => {
  const pacer: FakePacer = fakePacer();
  const gate: TurnGate = turnGate(pacer, 6);
  const work = (): void => {
    pacer.spend(4);
  };
  await Promise.all([eachInTurn([1, 2, 3], gate, work), eachInTurn([1, 2, 3], gate, work), eachInTurn([1, 2, 3], gate, work)]);
  const perFrame: Map<number, number> = new Map<number, number>();
  for (const frame of pacer.frames) perFrame.set(frame, (perFrame.get(frame) ?? 0) + 1);
  assert.equal(pacer.frames.length, 9);
  assert.ok([...perFrame.values()].every((count: number): boolean => count <= 2));
});

function finished(promise: Promise<void>): () => boolean {
  let done: boolean = false;
  void promise.then((): boolean => {
    done = true;
    return done;
  });
  return (): boolean => done;
}

void test('work the player is waiting for goes through a spent frame gate at once, lets the queued work through with it, and pacing comes back after', async (): Promise<void> => {
  let clock: number = 0;
  const pacer: FramePacer = { now: (): number => clock, next: (): Promise<void> => new Promise<void>((): void => undefined) };
  const gate: TurnGate = turnGate(pacer, 6);
  clock = 10;
  const queuedDone: () => boolean = finished(gate.turn());
  await settle();
  assert.equal(queuedDone(), false);
  const dressed: string = await gate.hurry(
    (async (): Promise<string> => {
      await gate.turn();
      return 'dressed';
    })(),
  );
  assert.equal(dressed, 'dressed');
  assert.equal(queuedDone(), true);
  clock = 30;
  const laterDone: () => boolean = finished(gate.turn());
  await settle();
  assert.equal(laterDone(), false);
});
