import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentError } from '../../sim/content/read.ts';
import measuredFile from './measured.json' with { type: 'json' };
import { readMeasured } from './measures.ts';

void test('the measured file reads back whole', (): void => {
  const measured = readMeasured(measuredFile);
  assert.ok(measured.builds.length > 0);
  for (const build of measured.builds) assert.equal(build.steady.levels.length, build.careless.levels.length);
});

void test('a measured file with a hole in it is refused', (): void => {
  assert.throws((): unknown => readMeasured({ fingerprint: 'x', runs: 1 }), ContentError);
});
