import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalOrder, PICTURE_ARRIVE } from './item-picture.ts';

void test('late pictures are spread over a few steps by item, so a row never pops at once', (): void => {
  const orders: Set<number> = new Set<number>(Array.from({ length: 24 }, (_: unknown, uid: number): number => arrivalOrder(uid)));
  assert.equal(orders.size, PICTURE_ARRIVE.steps);
  for (const order of orders) assert.ok(order >= 0 && order < PICTURE_ARRIVE.steps);
  assert.equal(arrivalOrder(7), arrivalOrder(7));
});
