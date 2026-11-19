import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActionDef } from './bindings.ts';
import { actionTable } from './bindings.ts';
import { DEFAULT_SETTINGS, describePreset, mergeSettings, PRESETS, readMovement, readSettings } from './settings.ts';

const TABLE: readonly ActionDef[] = actionTable([
  { name: 'Cleave', bindings: ['mouse_left'] },
  { name: 'Thunderclap', bindings: ['KeyQ'] },
], { flasks: 2, ladder: true });

void test('missing or broken text reads as the defaults', (): void => {
  assert.deepEqual(readSettings(null, TABLE), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings('{nope', TABLE), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings('[1,2]', TABLE), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings('7', TABLE), DEFAULT_SETTINGS);
});

void test('a good record reads back', (): void => {
  const text: string = JSON.stringify({ graphics: { quality: 'low', showFps: true, lensWater: false, streakEffects: false }, controls: { inventory: ['KeyB'] } });
  const read = readSettings(text, TABLE);
  assert.equal(read.graphics.quality, 'low');
  assert.equal(read.graphics.showFps, true);
  assert.equal(read.graphics.lensWater, false);
  assert.equal(read.graphics.streakEffects, false);
  assert.deepEqual(read.controls, { inventory: ['KeyB'] });
});

void test('each bad field falls back on its own', (): void => {
  const read = readSettings(JSON.stringify({ graphics: { quality: 'ultra', showFps: 'yes', lensWater: 0, streakEffects: 'off' }, controls: { inventory: 'KeyB', tree: [1] } }), TABLE);
  assert.equal(read.graphics.quality, 'high');
  assert.equal(read.graphics.showFps, false);
  assert.equal(read.graphics.lensWater, true);
  assert.equal(read.graphics.streakEffects, true);
  assert.deepEqual(read.controls, {});
});

void test('merging replaces only what changed', (): void => {
  const next = mergeSettings(DEFAULT_SETTINGS, { graphics: { quality: 'medium', showFps: false, lensWater: true, streakEffects: true } });
  assert.equal(next.graphics.quality, 'medium');
  assert.equal(next.controls, DEFAULT_SETTINGS.controls);
});

void test('presets get cheaper from high to low', (): void => {
  const { low, medium, high } = PRESETS;
  assert.ok(low.pixelRatioCap < medium.pixelRatioCap && medium.pixelRatioCap < high.pixelRatioCap);
  assert.ok(low.lights < medium.lights && medium.lights < high.lights);
  assert.ok(low.effectsDensity < medium.effectsDensity && medium.effectsDensity < high.effectsDensity);
  assert.equal(low.shadows, false);
  assert.equal(low.bloom, false);
  assert.ok(describePreset(high).includes('2048'));
});

void test('how the hero moves reads back, and anything else reads as a click', (): void => {
  assert.equal(readSettings(JSON.stringify({ movement: 'keys' }), TABLE).movement, 'keys');
  assert.equal(readMovement(JSON.stringify({ movement: 'keys' })), 'keys');
  for (const text of [null, '{nope', '7', JSON.stringify({ movement: 'stick' }), JSON.stringify({ graphics: {} })]) {
    assert.equal(readMovement(text), 'click');
    assert.equal(readSettings(text, TABLE).movement, 'click');
  }
  assert.equal(mergeSettings(DEFAULT_SETTINGS, { movement: 'keys' }).movement, 'keys');
  assert.equal(mergeSettings({ ...DEFAULT_SETTINGS, movement: 'keys' }, { controls: {} }).movement, 'keys');
});

void test('held skills read back as hold or toggle, default hold, and survive a merge of other fields', (): void => {
  assert.equal(readSettings(null, TABLE).heldSkills, 'hold');
  assert.equal(readSettings(JSON.stringify({ heldSkills: 'toggle' }), TABLE).heldSkills, 'toggle');
  assert.equal(readSettings(JSON.stringify({ heldSkills: 'spin' }), TABLE).heldSkills, 'hold');
  assert.equal(readSettings(JSON.stringify({ graphics: { quality: 'low' } }), TABLE).heldSkills, 'hold');
  const toggled = mergeSettings(DEFAULT_SETTINGS, { heldSkills: 'toggle' });
  assert.equal(mergeSettings(toggled, { graphics: { quality: 'low', showFps: true, lensWater: true, streakEffects: true } }).heldSkills, 'toggle');
});

