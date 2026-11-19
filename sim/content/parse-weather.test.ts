import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_HERO_LIGHT, DEFAULT_WEATHER, LIGHTNING_CLUSTER, LIGHTNING_KINDS, zoneHeroLight, zoneWeather } from './parse-weather.ts';
import { ContentError } from './read.ts';

void test('a zone with no weather keeps the default storm overhead and no rain', (): void => {
  assert.deepEqual(zoneWeather(undefined, 'zone.weather'), DEFAULT_WEATHER);
});

void test('weather reads lightning timing, rain, wet ground and a mist wall', (): void => {
  const read = zoneWeather({ lightning: { first: 1.2, min: 5, max: 11 }, rain: 0.8, wet: 0.6, mistWall: { from: { x: 0, z: 4 }, to: { x: 0, z: 40 }, height: 9 } }, 'zone.weather');
  assert.deepEqual(read, { lightning: { first: 1.2, min: 5, max: 11, cluster: LIGHTNING_CLUSTER, kinds: LIGHTNING_KINDS }, rain: 0.8, wet: 0.6, mistWall: { from: { x: 0, z: 4 }, to: { x: 0, z: 40 }, height: 9 }, embers: 0 });
  assert.deepEqual(zoneWeather({ lightning: null, rain: 0, wet: 0, mistWall: null }, 'zone.weather'), { lightning: null, rain: 0, wet: 0, mistWall: null, embers: 0 });
  assert.equal(zoneWeather({ lightning: null, rain: 0, wet: 0, mistWall: null, embers: 0.6 }, 'zone.weather').embers, 0.6);
  assert.throws((): unknown => zoneWeather({ lightning: null, rain: 0, wet: 0, mistWall: null, embers: 2 }, 'zone.weather'), ContentError);
});

void test('weather rejects rain past full and strikes that wait less at most than at least', (): void => {
  assert.throws((): unknown => zoneWeather({ lightning: null, rain: 1.5, wet: 0, mistWall: null }, 'zone.weather'), ContentError);
  assert.throws((): unknown => zoneWeather({ lightning: { first: 0, min: 9, max: 4 }, rain: 0, wet: 0, mistWall: null }, 'zone.weather'), ContentError);
});

void test('lightning reads its clusters and the weights of its kinds, and keeps strikes in a cluster apart', (): void => {
  const read = zoneWeather({ lightning: { first: 1, min: 5, max: 9, cluster: { chance: 0.5, most: 2, min: 1.5, max: 2.5 }, kinds: { sheet: 1, near: 0, fork: 2 } }, rain: 0, wet: 0, mistWall: null }, 'zone.weather');
  assert.deepEqual(read.lightning, { first: 1, min: 5, max: 9, cluster: { chance: 0.5, most: 2, min: 1.5, max: 2.5 }, kinds: { sheet: 1, near: 0, fork: 2 } });
  assert.throws((): unknown => zoneWeather({ lightning: { first: 1, min: 5, max: 9, cluster: { chance: 0.5, most: 2, min: 0.2, max: 2.5 } }, rain: 0, wet: 0, mistWall: null }, 'zone.weather'), ContentError);
  assert.throws((): unknown => zoneWeather({ lightning: { first: 1, min: 5, max: 9, kinds: { sheet: 0, near: 0, fork: 0 } }, rain: 0, wet: 0, mistWall: null }, 'zone.weather'), ContentError);
});

void test('a zone with no hero light keeps the default glow, and a dark zone reads its own strength, radius and rim', (): void => {
  assert.deepEqual(zoneHeroLight(undefined, 'zone.heroLight'), DEFAULT_HERO_LIGHT);
  assert.deepEqual(zoneHeroLight({ strength: 26, radius: 15, rim: 0.3 }, 'zone.heroLight'), { strength: 26, radius: 15, height: DEFAULT_HERO_LIGHT.height, falloff: DEFAULT_HERO_LIGHT.falloff, rim: 0.3 });
  assert.deepEqual(zoneHeroLight({ strength: 12, radius: 22, height: 7, falloff: 1, rim: 0.3 }, 'zone.heroLight'), { strength: 12, radius: 22, height: 7, falloff: 1, rim: 0.3 });
  assert.throws((): unknown => zoneHeroLight({ strength: 26, radius: 0, rim: 0.3 }, 'zone.heroLight'), ContentError);
  assert.throws((): unknown => zoneHeroLight({ strength: -1, radius: 15, rim: 0 }, 'zone.heroLight'), ContentError);
});
