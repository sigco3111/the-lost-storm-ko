import assert from 'node:assert/strict';
import { test } from 'node:test';
import { skinOf } from './character-loader.ts';

void test('a white rig skin leaves the look tint on worn skin as it was', (): void => {
  assert.equal(skinOf('#ffffff', '#ffffff'), '#ffffff');
  assert.equal(skinOf('#c08060', '#ffffff'), '#c08060');
});

void test('a rig skin colours the worn skin, and a darker look tint darkens it further', (): void => {
  assert.equal(skinOf('#ffffff', '#8a8578'), '#8a8578');
  assert.equal(skinOf('#000000', '#8a8578'), '#000000');
  const both: number = Number.parseInt(skinOf('#808080', '#8a8578').slice(1, 3), 16);
  assert.ok(both < 0x8a && both > 0, `the red channel ${both} should sit below the skin alone`);
});
