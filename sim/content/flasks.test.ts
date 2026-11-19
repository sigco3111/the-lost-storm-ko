import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlaskDef } from './flasks.ts';
import { parseFlasks } from './flasks.ts';
import { ContentError } from './read.ts';

const GOOD = { id: 'red', name: 'Red', resource: 'life', amount: 50, share: 0.3, duration: 2, cooldown: 0.5, maxCharges: 20, chargesPerUse: 10, chargesPerKill: 2 } as const;

void test('a flask definition is read with every field', (): void => {
  const [red]: FlaskDef[] = parseFlasks([GOOD], 'flasks');
  assert.deepEqual(red, { ...GOOD, tiers: [] });
});

void test('bad flask definitions are rejected with where they went wrong', (): void => {
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, resource: 'rage' }], 'flasks'), ContentError);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, duration: 0 }], 'flasks'), ContentError);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, chargesPerUse: 30 }], 'flasks'), ContentError);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, chargesPerKill: -1 }], 'flasks'), ContentError);
  assert.throws((): FlaskDef[] => parseFlasks([GOOD, GOOD], 'flasks'), /duplicate id red/);
  assert.throws((): FlaskDef[] => parseFlasks({}, 'flasks'), ContentError);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, share: 1.5 }], 'flasks'), /share: expected a number from 0 to 1/);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, amount: -1 }], 'flasks'), /amount: expected a number of zero or more/);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, amount: 0, share: 0 }], 'flasks'), /amount: expected an amount or a share above zero/);
});

void test('a flask may restore only a share of the maximum, with no flat amount', (): void => {
  assert.deepEqual(parseFlasks([{ ...GOOD, amount: 0, share: 0.4 }], 'flasks'), [{ ...GOOD, amount: 0, share: 0.4, tiers: [] }]);
});

void test('flask charges are whole numbers, since a save keeps whole charges', (): void => {
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, chargesPerKill: 0.5 }], 'flasks'), /chargesPerKill: expected a whole number/);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, maxCharges: 20.5 }], 'flasks'), /maxCharges: expected a whole number/);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, chargesPerUse: 2.5 }], 'flasks'), /chargesPerUse: expected a whole number/);
});

const TIER = { level: 8, price: 100, amount: 60, share: 0.35, duration: 1.8, maxCharges: 20, chargesPerKill: 2 } as const;

void test('a flask lists its upgrade tiers in order, each with a level, a price and its numbers', (): void => {
  const second = { ...TIER, level: 14, price: 300, amount: 80, share: 0.4, maxCharges: 30, chargesPerKill: 3 };
  const [red]: FlaskDef[] = parseFlasks([{ ...GOOD, tiers: [TIER, second] }], 'flasks');
  assert.deepEqual(red?.tiers, [TIER, second]);
});

void test('a tier is never worse than the one before it and never cheaper or earlier', (): void => {
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, tiers: [{ ...TIER, amount: 40 }] }], 'flasks'), /tiers\[0\]\.amount: expected more than the tier before/);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, tiers: [{ ...TIER, share: 0.3 }] }], 'flasks'), /tiers\[0\]\.share/);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, tiers: [{ ...TIER, duration: 2.5 }] }], 'flasks'), /tiers\[0\]\.duration: expected at most the tier before/);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, tiers: [{ ...TIER, maxCharges: 15 }] }], 'flasks'), /tiers\[0\]\.maxCharges: expected at least the tier before/);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, tiers: [TIER, { ...TIER, amount: 70, share: 0.4 }] }], 'flasks'), /tiers\[1\]\.level/);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, tiers: [TIER, { ...TIER, level: 9, amount: 70, share: 0.4 }] }], 'flasks'), /tiers\[1\]\.price/);
  assert.throws((): FlaskDef[] => parseFlasks([{ ...GOOD, tiers: [{ ...TIER, price: 99.5 }] }], 'flasks'), /tiers\[0\]\.price: expected a whole number/);
});
