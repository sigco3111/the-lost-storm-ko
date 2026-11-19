import assert from 'node:assert/strict';
import { test } from 'node:test';
import { globeReadout } from './globe-readout.ts';

void test('a full pool with a fractional maximum never reads above the maximum', (): void => {
  assert.equal(globeReadout(512.4, 512.4), '512 / 512');
  assert.equal(globeReadout(0.4 + 512, 512.4), '512 / 512');
});

void test('a part-empty pool rounds the current value up so a living hero never reads zero', (): void => {
  assert.equal(globeReadout(0.2, 512), '1 / 512');
  assert.equal(globeReadout(100.01, 512), '101 / 512');
});

void test('an empty pool reads zero', (): void => {
  assert.equal(globeReadout(0, 512), '0 / 512');
});

void test('a value above the maximum is shown as the maximum', (): void => {
  assert.equal(globeReadout(600, 512), '512 / 512');
});

void test('a negative value or maximum reads zero', (): void => {
  assert.equal(globeReadout(-3, 100), '0 / 100');
  assert.equal(globeReadout(5, -1), '0 / 0');
});
