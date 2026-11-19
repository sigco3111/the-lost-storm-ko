import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import type { ZoneDef, ZonePack } from '../sim/content/types.ts';
import { createRng } from '../sim/rng.ts';
import { monsterScale } from '../sim/world/monster-scale.ts';
import type { Equipment } from '../sim/world/types.ts';
import type { ArmPlan, HeroSheet, PlaceFoes, PlaceRow } from './act-scaling.ts';
import { ACT_SCALING, clearZone, hitShare, placeFoes, scalingTables, typicalGear } from './act-scaling.ts';
import { CONTENT } from './simulate-run.ts';

function pack(monster: string, count: number, level: number, rank?: string): ZonePack {
  return { x: 0, z: 0, members: [{ monster, count, mods: [] }], when: [], level, ...(rank === undefined ? {} : { rank }) };
}

function zoneWith(packs: readonly ZonePack[]): ZoneDef {
  return { ...must(CONTENT.zones.get('under_hall'), 'under_hall'), packs };
}

const STAFF: ArmPlan = { arm: { name: 'staff', build: 'stormcaller', kinds: ['staff'] }, weights: { dps: 1, toughness: 1, mobility: 0 }, focus: null, route: [] };

void test('a hit share is the hit left after armour over the hero life', (): void => {
  const hero: HeroSheet = { life: 1000, reduction: 0.5, dps: 1 };
  assert.equal(hitShare(100, hero), 0.05);
  assert.equal(hitShare(10, { life: 0, reduction: 0, dps: 0 }), 1);
});

void test('ordinary foes are weighted by count at their pack level and a boss is reported apart', (): void => {
  const taker = must(CONTENT.monsters.get('unfinished_taker'), 'taker');
  const keeper = must(CONTENT.monsters.get('ledger_keeper'), 'keeper');
  const foes: PlaceFoes = placeFoes(CONTENT, zoneWith([pack('unfinished_taker', 3, 12), pack('ledger_keeper', 1, 30)]));
  const at12: number = monsterScale(CONTENT.world.scaling, 12).damage;
  assert.equal(foes.lowest, 12);
  assert.equal(foes.highest, 30);
  assert.ok(Math.abs(foes.ordinaryHit - ((taker.damageMin + taker.damageMax) / 2) * at12) < 1e-9);
  assert.ok(foes.eliteHit > foes.ordinaryHit);
  assert.ok(Math.abs(must(foes.bossHit, 'boss hit') - ((keeper.damageMin + keeper.damageMax) / 2) * monsterScale(CONTENT.world.scaling, 30).damage) < 1e-9);
});

void test('clearing a zone gains levels, and fewer when the hero arrives far above it', (): void => {
  const zone: ZoneDef = zoneWith(Array.from({ length: 20 }, (): ZonePack => pack('unfinished_taker', 4, 10)));
  const near = clearZone(CONTENT, zone, 9);
  const above = clearZone(CONTENT, zone, 25);
  assert.ok(near.levelsGained >= 1);
  assert.ok(near.level > 9);
  assert.equal(above.levelsGained, 0);
});

void test('a named magic pack is worth more experience than the same pack as normal', (): void => {
  const normal = clearZone(CONTENT, zoneWith([pack('unfinished_taker', 4, 10, 'normal')]), 9);
  const magic = clearZone(CONTENT, zoneWith([pack('unfinished_taker', 4, 10, 'magic')]), 9);
  assert.ok(magic.xp > normal.xp);
});

void test('typical gear repeats for a seed and holds a weapon of the arm', (): void => {
  const model = { dropsPerLevel: 2, lowestShare: ACT_SCALING.gear.lowestShare };
  const first: Equipment = typicalGear(CONTENT, STAFF, 6, createRng(3), model);
  const again: Equipment = typicalGear(CONTENT, STAFF, 6, createRng(3), model);
  assert.deepEqual(first, again);
  const weapon = must(first.weapon, 'weapon');
  assert.equal(CONTENT.itemBases.get(weapon.base)?.weaponKind, 'staff');
});

void test('the tables carry one line per place in each table', (): void => {
  const foes: PlaceFoes = { lowest: 9, highest: 13, ordinaryHit: 60, eliteHit: 90, bossHit: null, ordinaryLife: 400 };
  const row: PlaceRow = { place: { name: 'Hourfall Caves', zone: 'under_hall', arrival: 9 }, foes, arms: [{ arm: 'staff', hero: { life: 1000, reduction: 0.5, dps: 200 }, ordinaryShare: 0.03, eliteShare: 0.045, bossShare: null, killSeconds: 2 }], leaves: { level: 12, xp: 0, levelsGained: 3 } };
  const text: string = scalingTables([row]);
  assert.match(text, /\| Hourfall Caves \| 9-13 \| 9 \| 60 \| 90 \| - \| 1000 \| 50\.0% \| 3\.0% \| 4\.5% \| - \| 12 \(\+3\) \|/);
  assert.match(text, /\| Hourfall Caves \| 1000 \/ 50\.0% \/ 3\.0% \/ 2\.0 \|/);
});
