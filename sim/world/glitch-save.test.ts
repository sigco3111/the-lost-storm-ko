import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readGlitchSave } from './glitch-save.ts';

void test('glitch progress and fired triggers read back, and anything broken falls back to the start', (): void => {
  assert.deepEqual(readGlitchSave({ progress: 3, fired: ['first', 4] }), { progress: 3, fired: ['first'] });
  assert.deepEqual(readGlitchSave({ progress: -1, fired: 'x' }), { progress: 0, fired: [] });
  assert.deepEqual(readGlitchSave(undefined), { progress: 0, fired: [] });
});

void test('an older save that still carries played seconds reads, and the seconds are dropped', (): void => {
  assert.deepEqual(readGlitchSave({ progress: 1, fired: ['old_trigger'], played: 125.5 }), { progress: 1, fired: ['old_trigger'] });
  assert.deepEqual(readGlitchSave({ progress: 2, fired: [], played: -4 }), { progress: 2, fired: [] });
});
