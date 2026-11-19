import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IdleQueue } from './idle-queue.ts';
import { createIdleQueue } from './idle-queue.ts';

interface Slices {
  readonly schedule: (work: () => void) => void;
  run(): boolean;
}

function slices(): Slices {
  const waiting: (() => void)[] = [];
  return {
    schedule(work: () => void): void {
      waiting.push(work);
    },
    run(): boolean {
      const next: (() => void) | undefined = waiting.shift();
      if (next === undefined) return false;
      next();
      return true;
    },
  };
}

void test('each idle slice does one item, and nothing runs before the first slice', (): void => {
  const idle: Slices = slices();
  const done: Set<string> = new Set<string>();
  const order: string[] = [];
  const queue: IdleQueue<string> = createIdleQueue<string>((item: string): void => {
    order.push(item);
    done.add(item);
  }, (item: string): boolean => done.has(item), idle.schedule);
  queue.add('a');
  queue.add('b');
  queue.add('c');
  assert.deepEqual(order, []);
  assert.equal(idle.run(), true);
  assert.deepEqual(order, ['a']);
  assert.equal(idle.run(), true);
  assert.deepEqual(order, ['a', 'b']);
  assert.equal(idle.run(), true);
  assert.deepEqual(order, ['a', 'b', 'c']);
  assert.equal(idle.run(), false);
  assert.equal(queue.pending(), 0);
});

void test('an item already done, queued twice, or done before its slice comes is never worked again', (): void => {
  const idle: Slices = slices();
  const done: Set<string> = new Set<string>(['old']);
  const order: string[] = [];
  const queue: IdleQueue<string> = createIdleQueue<string>((item: string): void => {
    order.push(item);
    done.add(item);
  }, (item: string): boolean => done.has(item), idle.schedule);
  queue.add('old');
  queue.add('x');
  queue.add('x');
  queue.add('y');
  done.add('y');
  while (idle.run()) continue;
  assert.deepEqual(order, ['x']);
  queue.add('z');
  while (idle.run()) continue;
  assert.deepEqual(order, ['x', 'z']);
});
