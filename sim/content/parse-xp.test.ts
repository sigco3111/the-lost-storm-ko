import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { XpAfter } from './xp-types.ts';
import { xpAfter } from './parse-xp.ts';

void test('a curve with no second growth reads as none', (): void => {
  assert.equal(xpAfter(undefined, 'xp.after'), null);
});

void test('a second growth reads its level and rate and refuses a part level or a rate of zero', (): void => {
  assert.deepEqual(xpAfter({ from: 9, growth: 1.2 }, 'xp.after'), { from: 9, growth: 1.2 });
  assert.throws((): XpAfter | null => xpAfter({ from: 9.5, growth: 1.2 }, 'xp.after'), /whole level/);
  assert.throws((): XpAfter | null => xpAfter({ from: 9, growth: 0 }, 'xp.after'), /xp\.after/);
});
