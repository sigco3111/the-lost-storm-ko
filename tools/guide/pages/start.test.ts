import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guideData } from '../data.ts';
import { controlRows, gateLevel, keyName } from './start.ts';

void test('key codes are written as the key a player presses', (): void => {
  assert.equal(keyName('KeyI'), 'I');
  assert.equal(keyName('Digit2'), '2');
  assert.equal(keyName('mouse_right'), 'Right mouse');
  assert.equal(keyName('AltLeft'), 'Alt');
});

void test('the controls list one key for each flask the game has', (): void => {
  const rows: readonly string[][] = controlRows(guideData());
  const flasks: readonly string[][] = rows.filter((row: readonly string[]): boolean => (row[0] ?? '').startsWith('Flask'));
  assert.equal(flasks.length, guideData().content.flasks.length);
});

void test('the gate level comes from the gate itself', (): void => {
  assert.ok(gateLevel(guideData()) > 1);
});
