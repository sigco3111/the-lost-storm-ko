import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadZone } from '../../test/road-support.ts';
import type { ZoneDef } from '../content/types.ts';
import { nearestSurface, surfaceAt } from './ground-surface.ts';

const VENTED: ZoneDef = roadZone({ cellSize: 2, tiles: ['ssssssss', 'ssssssvs', 'ssssssss', 'vsssssss', ' sssssss'], floors: { s: 'scorched_stone', v: 'vent_bed' } });

void test('the surface under a point is the floor its tile names, and nothing past the edge of the map', (): void => {
  assert.equal(surfaceAt(VENTED, 13, 3), 'vent_bed');
  assert.equal(surfaceAt(VENTED, 3, 3), 'scorched_stone');
  assert.equal(surfaceAt(VENTED, 1, 9), null);
  assert.equal(surfaceAt(VENTED, -1, 3), null);
  assert.equal(surfaceAt(VENTED, 3, 40), null);
});

void test('the nearest cell of a listed surface is found at its centre, and the closer of two wins', (): void => {
  assert.deepEqual(nearestSurface(VENTED, ['vent_bed'], { x: 11, z: 3 }, 10), { x: 13, z: 3 });
  assert.deepEqual(nearestSurface(VENTED, ['vent_bed'], { x: 3, z: 6 }, 10), { x: 1, z: 7 });
});

void test('a surface out of reach, or not listed, is not found', (): void => {
  assert.equal(nearestSurface(VENTED, ['vent_bed'], { x: 7, z: 5 }, 4), null);
  assert.equal(nearestSurface(VENTED, ['lava_bed'], { x: 13, z: 3 }, 20), null);
});
