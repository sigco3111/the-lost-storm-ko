import assert from 'node:assert/strict';
import test from 'node:test';
import type { RowList } from './row-order.ts';
import { placeRows } from './row-order.ts';

interface FakeList extends RowList<string> {
  readonly order: string[];
  readonly gone: Set<string>;
}

function fakeList(order: readonly string[], gone: readonly string[]): FakeList {
  const list: string[] = [...order];
  const leaving: Set<string> = new Set<string>(gone);
  return {
    order: list,
    gone: leaving,
    first: (): string | null => list[0] ?? null,
    next: (node: string): string | null => list[list.indexOf(node) + 1] ?? null,
    leaving: (node: string): boolean => leaving.has(node),
    insert: (node: string, before: string | null): void => {
      const at: number = list.indexOf(node);
      if (at >= 0) list.splice(at, 1);
      if (before === null) list.push(node);
      else list.splice(list.indexOf(before), 0, node);
    },
  };
}

void test('rows already in order are never moved, so their entrance does not replay', (): void => {
  const list: FakeList = fakeList(['a', 'b', 'c'], []);
  assert.equal(placeRows(list, ['a', 'b', 'c']), 0);
  assert.deepEqual(list.order, ['a', 'b', 'c']);
});

void test('a row fading out between kept rows does not make them move', (): void => {
  const list: FakeList = fakeList(['a', 'x', 'b', 'y'], ['x', 'y']);
  assert.equal(placeRows(list, ['a', 'b']), 0);
  assert.deepEqual(list.order, ['a', 'x', 'b', 'y']);
});

void test('a new row is placed where it belongs and only it moves', (): void => {
  const list: FakeList = fakeList(['a', 'c', 'n'], []);
  assert.equal(placeRows(list, ['a', 'n', 'c']), 1);
  assert.deepEqual(list.order, ['a', 'n', 'c']);
});

void test('a reordered list ends in the wanted order', (): void => {
  const list: FakeList = fakeList(['c', 'b', 'a'], []);
  placeRows(list, ['a', 'b', 'c']);
  assert.deepEqual(list.order, ['a', 'b', 'c']);
});
