import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PERF_PROTOCOL } from '../backend/api.ts';
import { buildId, countOrNull, hardwareText, unmasked } from './device-facts.ts';

void test('hardware strings keep printable ASCII only, trimmed and capped', (): void => {
  assert.equal(hardwareText('  Apple GPU '), 'Apple GPU');
  assert.equal(hardwareText('ANGLE (Intel®\nHD)'), 'ANGLE (IntelHD)');
  assert.equal(hardwareText('x'.repeat(500))?.length, PERF_PROTOCOL.hardwareChars);
  assert.equal(hardwareText(''), null);
  assert.equal(hardwareText(7), null);
});

void test('the masked WebKit strings are swapped for the unmasked ones when the browser gives them', (): void => {
  assert.equal(unmasked('WebKit WebGL', 'WebKit WebGL', (): string => 'Apple GPU'), 'Apple GPU');
  assert.equal(unmasked(null, 'WebKit WebGL', (): null => null), null);
  assert.equal(unmasked('Mali-G78', 'WebKit WebGL', (): string => 'unused'), 'Mali-G78');
});

void test('a build id and the browser counts are passed only when well formed', (): void => {
  assert.equal(buildId('9e8264c6'), '9e8264c6');
  assert.equal(buildId(undefined), '');
  assert.equal(buildId('bad build'), '');
  assert.equal(countOrNull(8), 8);
  assert.equal(countOrNull(0), null);
  assert.equal(countOrNull(undefined), null);
});
