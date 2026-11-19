import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zoneFalls } from './parse-fall.ts';
import { ContentError } from './read.ts';

const FALL: Readonly<Record<string, unknown>> = { x: 274, z: 43, facingDegrees: 90, width: 2.4, surface: 'molten' };

void test('a zone with no falls has none', (): void => {
  assert.deepEqual(zoneFalls(undefined, 'zones[0].falls'), []);
});

void test('a fall reads where its lip is, which way it pours, how wide it is and what it pours', (): void => {
  assert.deepEqual(zoneFalls([FALL], 'zones[0].falls'), [FALL]);
});

void test('a fall with no width or no surface is rejected', (): void => {
  assert.throws((): unknown => zoneFalls([{ ...FALL, width: 0 }], 'zones[0].falls'), ContentError);
  assert.throws((): unknown => zoneFalls([{ ...FALL, surface: undefined }], 'zones[0].falls'), ContentError);
});
