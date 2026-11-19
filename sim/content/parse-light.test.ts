import assert from 'node:assert/strict';
import { test } from 'node:test';
import { propLight } from './parse-light.ts';
import { ContentError } from './read.ts';

void test('a prop with no light has none', (): void => {
  assert.equal(propLight(null, 'props[0].light'), null);
  assert.equal(propLight(undefined, 'props[0].light'), null);
});

void test('a flame reads its reach and lift, a glow has neither', (): void => {
  assert.deepEqual(propLight({ form: 'flame', color: '#ffa95a', intensity: 28, distance: 14, height: 0.4, decay: 2, reach: 0, lift: 1.6 }, 'props[0].light'), { form: 'flame', color: '#ffa95a', intensity: 28, distance: 14, height: 0.4, decay: 2, reach: 0, lift: 1.6 });
  assert.deepEqual(propLight({ form: 'glow', color: '#a48ad6', intensity: 10, distance: 7, height: 1.4, decay: 2 }, 'props[0].light'), { form: 'glow', color: '#a48ad6', intensity: 10, distance: 7, height: 1.4, decay: 2 });
});

void test('a light needs a known form, a decay, and a flame needs its reach and lift', (): void => {
  assert.throws((): unknown => propLight({ color: '#ffa95a', intensity: 28, distance: 14, height: 0.4, decay: 2 }, 'props[0].light'), ContentError);
  assert.throws((): unknown => propLight({ form: 'torch', color: '#ffa95a', intensity: 28, distance: 14, height: 0.4, decay: 2 }, 'props[0].light'), ContentError);
  assert.throws((): unknown => propLight({ form: 'glow', color: '#a48ad6', intensity: 10, distance: 7, height: 1.4 }, 'props[0].light'), ContentError);
  assert.throws((): unknown => propLight({ form: 'flame', color: '#ffa95a', intensity: 28, distance: 14, height: 0.4, decay: 2 }, 'props[0].light'), ContentError);
  assert.throws((): unknown => propLight({ form: 'glow', color: '#a48ad6', intensity: 10, distance: 7, height: 1.4, decay: -1 }, 'props[0].light'), ContentError);
});
