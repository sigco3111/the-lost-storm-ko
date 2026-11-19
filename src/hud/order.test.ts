import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moves } from './order.ts';
import type { Move } from './order.ts';

function apply(current: readonly string[], plan: readonly Move<string>[]): readonly string[] {
  const list: string[] = [...current];
  for (const step of plan) {
  const from: number = list.indexOf(step.item);
  if (from >= 0) list.splice(from, 1);
  const at: number = step.before === null ? list.length : list.indexOf(step.before);
  list.splice(at, 0, step.item);
  }
  return list;
}

void test('plans nothing when the order already matches', (): void => {
  assert.deepEqual(moves(['a', 'b', 'c'], ['a', 'b', 'c']), []);
  assert.deepEqual(moves([], []), []);
});

void test('plans nothing for a prefix that already matches', (): void => {
  assert.deepEqual(moves(['a', 'b', 'c'], ['a', 'b']), []);
});

void test('moves only the item that is out of place', (): void => {
  const plan: readonly Move<string>[] = moves(['a', 'b', 'c', 'd'], ['a', 'c', 'b', 'd']);
  assert.equal(plan.length, 1);
  assert.deepEqual(apply(['a', 'b', 'c', 'd'], plan), ['a', 'c', 'b', 'd']);
});

void test('places new items in front of the item they displace', (): void => {
  const plan: readonly Move<string>[] = moves(['a', 'c'], ['a', 'b', 'c']);
  assert.deepEqual(plan, [{ item: 'b', before: 'c' }]);
  assert.deepEqual(apply(['a', 'c'], plan), ['a', 'b', 'c']);
});

void test('appends new items at the end with no anchor', (): void => {
  const plan: readonly Move<string>[] = moves(['a'], ['a', 'b']);
  assert.deepEqual(plan, [{ item: 'b', before: null }]);
});

void test('reaches the desired order from any starting order', (): void => {
  const start: readonly string[] = ['d', 'a', 'e', 'b', 'c'];
  const wanted: readonly string[] = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(apply(start, moves(start, wanted)), wanted);
  const reversed: readonly string[] = wanted.toReversed();
  assert.deepEqual(apply(wanted, moves(wanted, reversed)), reversed);
});
