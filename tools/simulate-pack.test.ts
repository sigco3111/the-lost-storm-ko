import assert from 'node:assert/strict';
import { test } from 'node:test';
import { packFoe, packLabel, packMembers, packMix } from './simulate-pack.ts';

void test('a pack of one kind takes the pack size, and a mix names its own counts', (): void => {
  assert.deepEqual(packMembers({ monster: 'wolf', count: 4 }), [{ monster: 'wolf', count: 4 }]);
  assert.equal(packFoe({ monster: 'wolf', count: 4 }), '4 wolf');
  assert.deepEqual(packMembers({ monster: 'wolf:3+spider:1', count: 4 }), [
    { monster: 'wolf', count: 3 },
    { monster: 'spider', count: 1 },
  ]);
  assert.equal(packFoe({ monster: 'rat:10+crawler', count: 2 }), '10 rat + 2 crawler');
});

void test('one pack is named by its members, and packs spread in a line say how many and how far apart', (): void => {
  assert.equal(packLabel({ monster: 'wolf', count: 4, groups: 1, gap: 8 }), '4 wolf');
  assert.equal(packLabel({ monster: 'wolf', count: 4, groups: 3, gap: 16 }), '3 packs of 4 wolf, 16 m apart');
});

void test('a mix is ids joined by plus, each with an optional whole count', (): void => {
  for (const good of ['wolf', 'wolf:3+spider:1', 'rat:12+crawler']) assert.ok(packMix(good), good);
  for (const bad of ['wolf:0', 'wolf+', 'wolf:x', '+wolf', 'wolf:1.5']) assert.equal(packMix(bad), false, bad);
});
