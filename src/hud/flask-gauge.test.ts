import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlaskReading } from './flask-gauge.ts';
import { flaskCue, flaskGauge, flaskTicks, flaskUses, sameGauge } from './flask-gauge.ts';

void test('a full flask counts every whole use it holds', (): void => {
  assert.equal(flaskUses({ charges: 30, chargesPerUse: 10 }), 3);
});

void test('a part-filled use does not count until it is whole', (): void => {
  assert.equal(flaskUses({ charges: 13, chargesPerUse: 10 }), 1);
  assert.equal(flaskUses({ charges: 9.99, chargesPerUse: 10 }), 0);
});

void test('an empty flask counts zero', (): void => {
  assert.equal(flaskUses({ charges: 0, chargesPerUse: 8 }), 0);
});

void test('a flask with no cost per use counts zero rather than dividing by it', (): void => {
  assert.equal(flaskUses({ charges: 30, chargesPerUse: 0 }), 0);
});

const FULL: FlaskReading = { charges: 30, maxCharges: 30, chargesPerUse: 10, restoring: false };

void test('a gauge shows the share of charges left as the liquid level and the whole drinks as pips', (): void => {
  assert.deepEqual(flaskGauge(FULL), { level: 1, uses: 3, maxUses: 3, empty: false, restoring: false });
  const drunk = flaskGauge({ ...FULL, charges: 20, restoring: true });
  assert.ok(Math.abs(drunk.level - 2 / 3) < 0.01);
  assert.equal(drunk.uses, 2);
  assert.equal(drunk.restoring, true);
});

void test('a flask with charges below one drink is empty but still shows the liquid it has', (): void => {
  const gauge = flaskGauge({ ...FULL, charges: 9 });
  assert.equal(gauge.empty, true);
  assert.equal(gauge.uses, 0);
  assert.ok(Math.abs(gauge.level - 0.3) < 1e-9);
  assert.equal(flaskGauge({ ...FULL, charges: 0 }).level, 0);
});

void test('the level is rounded to a step so a gauge is not repainted for a change nobody can see', (): void => {
  assert.equal(sameGauge(flaskGauge({ ...FULL, charges: 25.001 }), flaskGauge({ ...FULL, charges: 25 })), true);
  assert.equal(sameGauge(flaskGauge({ ...FULL, charges: 27 }), flaskGauge(FULL)), false);
  assert.equal(sameGauge(null, flaskGauge(FULL)), false);
});

void test('fewer charges than before is a drink, more is a refill, and the first reading is neither', (): void => {
  assert.equal(flaskCue(null, FULL), null);
  assert.equal(flaskCue(FULL, { ...FULL, charges: 20 }), 'drank');
  assert.equal(flaskCue({ ...FULL, charges: 20 }, { ...FULL, charges: 23 }), 'gained');
  assert.equal(flaskCue(FULL, { ...FULL, restoring: true }), null);
});

void test('a flask has one tick per whole use, each at the level that use ends on', (): void => {
  assert.deepEqual(flaskTicks(30, 10), [10 / 30, 20 / 30, 1]);
  const mana: readonly number[] = flaskTicks(30, 8);
  assert.equal(mana.length, 3);
  assert.equal(mana[2], 24 / 30);
});

void test('a flask with no capacity or no cost per use has no ticks', (): void => {
  assert.deepEqual(flaskTicks(0, 10), []);
  assert.deepEqual(flaskTicks(30, 0), []);
});
