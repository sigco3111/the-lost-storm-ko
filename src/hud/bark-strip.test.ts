import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barkHold } from './bark-strip.ts';

const TURNS: number = 12;

interface Latch {
  readonly promise: Promise<void>;
  open(): void;
}

function latch(): Latch {
  const waiting: (() => void)[] = [];
  const promise: Promise<void> = new Promise<void>((resolve: () => void): void => {
    waiting.push(resolve);
  });
  return {
    promise,
    open(): void {
      for (const resolve of waiting) resolve();
    },
  };
}

function settles(promise: Promise<void>): Promise<boolean> {
  let later: Promise<boolean> = Promise.resolve(false);
  for (let turn: number = 0; turn < TURNS; turn += 1) later = later.then((value: boolean): boolean => value);
  return Promise.race([promise.then((): boolean => true), later]);
}

void test('a bark is held until it has been read and its voice has ended, whichever is later', async (): Promise<void> => {
  const read: Latch = latch();
  const spoken: Latch = latch();
  const hold: Promise<void> = barkHold(read.promise, spoken.promise);
  read.open();
  assert.equal(await settles(hold), false);
  spoken.open();
  assert.equal(await settles(hold), true);

  const quick: Latch = latch();
  const later: Promise<void> = barkHold(quick.promise, Promise.resolve());
  assert.equal(await settles(later), false);
  quick.open();
  assert.equal(await settles(later), true);
});

void test('a long line holds the bark until its voice ends, however long after the reading time that is', async (): Promise<void> => {
  const read: Latch = latch();
  const spoken: Latch = latch();
  const hold: Promise<void> = barkHold(read.promise, spoken.promise);
  read.open();
  assert.equal(await settles(hold), false);
  spoken.open();
  assert.equal(await settles(hold), true);
});
