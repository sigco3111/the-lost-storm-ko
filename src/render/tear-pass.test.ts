import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { TEAR_FRAGMENT, TEAR_PASS, TEAR_VERTEX } from './tear-pass.ts';

void test('the tear shader is safe, white comes in through bands that do not move, and every band reaches white', (): void => {
  for (const source of [TEAR_VERTEX, TEAR_FRAGMENT]) assert.deepEqual(unsafeGlsl(source), []);
  assert.match(TEAR_FRAGMENT, /float whiteBand = floor\(uv\.y \* [\d.]+\);/);
  assert.ok(TEAR_PASS.whiteSpread + TEAR_PASS.whiteSoft <= 1);
});
