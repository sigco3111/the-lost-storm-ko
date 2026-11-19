import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinsCrowd, planNumber } from './number-crowd.ts';

void test('a heal on the same ally soon after another grows that green number, and heals never thin out the damage crowd', (): void => {
  assert.deepEqual(planNumber([{ key: 4, kind: 'heal', age: 0.1, retiring: false }], { key: 4, kind: 'heal' }), { type: 'merge', index: 0 });
  assert.equal(planNumber([{ key: 4, kind: 'plain', age: 0.1, retiring: false }], { key: 4, kind: 'heal' }).type, 'new');
  assert.ok(!joinsCrowd('heal'));
});
