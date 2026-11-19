import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContentError } from './read.ts';
import { zoneScatter } from './parse-scatter.ts';

const OPEN = { type: 'open', props: ['pebble'], count: 40, clump: 3, spread: 0.8, size: { least: 0.5, most: 1.2 }, clear: 0.3 } as const;
const AROUND = { type: 'around', props: ['chip'], anchors: ['wall'], each: 4, spread: 1.5, size: { least: 0.8, most: 1 } } as const;
const CLIFF = { type: 'cliff', props: ['scree'], side: 'foot', step: 2.5, drop: 1.2, cover: 0.6, tuck: 0.4, size: { least: 0.7, most: 1.3 } } as const;

void test('scatter reads open ground cover and cover heaped around named props', (): void => {
  assert.deepEqual(zoneScatter(OPEN, 'zone.scatter[0]'), OPEN);
  assert.deepEqual(zoneScatter(AROUND, 'zone.scatter[1]'), AROUND);
});

void test('scatter reads cover laid along the feet and the rims of cliffs', (): void => {
  assert.deepEqual(zoneScatter(CLIFF, 'zone.scatter[2]'), CLIFF);
  assert.deepEqual(zoneScatter({ ...CLIFF, side: 'rim' }, 'zone.scatter[2]'), { ...CLIFF, side: 'rim' });
  assert.throws(() => zoneScatter({ ...CLIFF, side: 'middle' }, 'zone.scatter[2]'), ContentError);
  assert.throws(() => zoneScatter({ ...CLIFF, cover: 1.5 }, 'zone.scatter[2]'), ContentError);
  assert.throws(() => zoneScatter({ ...CLIFF, step: 0 }, 'zone.scatter[2]'), ContentError);
});

void test('scatter needs a prop, a known type and a size range that runs upwards', (): void => {
  assert.throws(() => zoneScatter({ ...OPEN, props: [] }, 'zone.scatter[0]'), ContentError);
  assert.throws(() => zoneScatter({ ...OPEN, type: 'heaped' }, 'zone.scatter[0]'), ContentError);
  assert.throws(() => zoneScatter({ ...OPEN, size: { least: 1.2, most: 0.5 } }, 'zone.scatter[0]'), ContentError);
  assert.throws(() => zoneScatter({ ...AROUND, spread: 0 }, 'zone.scatter[1]'), ContentError);
  assert.throws(() => zoneScatter({ ...OPEN, clump: 0 }, 'zone.scatter[0]'), ContentError);
});
