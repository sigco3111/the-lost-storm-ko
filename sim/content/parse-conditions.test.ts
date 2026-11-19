import assert from 'node:assert/strict';
import { test } from 'node:test';
import { condition } from './parse-conditions.ts';
import { ContentError } from './read.ts';

void test('a level condition reads its level and its not, and refuses a level of zero or none', (): void => {
  assert.deepEqual(condition({ type: 'level', atLeast: 8 }, 'gate'), { type: 'level', atLeast: 8, not: false });
  assert.deepEqual(condition({ type: 'level', atLeast: 3, not: true }, 'gate'), { type: 'level', atLeast: 3, not: true });
  assert.throws((): unknown => condition({ type: 'level', atLeast: 0 }, 'gate'), ContentError);
  assert.throws((): unknown => condition({ type: 'level' }, 'gate'), ContentError);
});

void test('a visited condition reads its zone and its not, and needs a zone', (): void => {
  assert.deepEqual(condition({ type: 'visited', zone: 'hideout' }, 'scene'), { type: 'visited', zone: 'hideout', not: false });
  assert.deepEqual(condition({ type: 'visited', zone: 'hideout', not: true }, 'scene'), { type: 'visited', zone: 'hideout', not: true });
  assert.throws((): unknown => condition({ type: 'visited' }, 'scene'), ContentError);
});

void test('a defeated condition reads its monster and its not, and needs a monster', (): void => {
  assert.deepEqual(condition({ type: 'defeated', monster: 'timekeeper_gatekeeper' }, 'pack'), { type: 'defeated', monster: 'timekeeper_gatekeeper', not: false });
  assert.deepEqual(condition({ type: 'defeated', monster: 'timekeeper_gatekeeper', not: true }, 'pack'), { type: 'defeated', monster: 'timekeeper_gatekeeper', not: true });
  assert.throws((): unknown => condition({ type: 'defeated' }, 'pack'), ContentError);
});
