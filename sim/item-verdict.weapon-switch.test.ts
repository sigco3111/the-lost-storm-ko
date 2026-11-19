import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, zoneOf } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import { emptyEquipment } from './items.ts';
import { buildOf, compareBuilds, itemVerdict, verdictNote, verdictParts, VERDICT } from './item-verdict.ts';
import type { Build, Verdict, VerdictSubject } from './item-verdict.ts';
import type { Threat } from './threat.ts';
import { threatNear } from './threat.ts';
import type { ItemInstance } from './world/types.ts';

const content: Content = loadContent();

const TURNING_TIDE: readonly string[] = ['blade_thunderhead', 'heavy_hands', 'blade_1', 'whetstone', 'blade_4', 'whirling_cleave', 'endless_turn', 'millstone', 'wind_downdraught', 'riptide', 'blade_millrace', 'blade_7', 'unbroken_rhythm', 'blade_8', 'blade_wind_far', 'wind_8', 'wind_9', 'racing_cloud', 'blade_12', 'blade_13', 'edge_without_rest', 'blade_9', 'wind_12', 'long_wake', 'deep_water'];

function item(uid: number, base: string, rarity: string, affixes: ItemInstance['affixes'], level: number): ItemInstance {
  return { uid, base, rarity, level, affixes, ledger: null };
}

const arbalest: ItemInstance = item(1, 'warden_arbalest', 'rare', [{ affix: 'honed', value: 0.14 }, { affix: 'cruel', value: 0.16 }, { affix: 'brimming', value: 33 }, { affix: 'clear', value: 1.5 }], 18);
const broadsword: ItemInstance = item(2, 'warden_broadsword', 'magic', [{ affix: 'jagged', value: 11 }, { affix: 'brimming', value: 15 }], 15);

function swordsman(allocated: readonly string[]): VerdictSubject {
  return {
    level: 22,
    equipped: { ...emptyEquipment(), weapon: broadsword, chest: item(3, 'saltworn_shirt', 'magic', [{ affix: 'hale', value: 16 }], 12), feet: item(4, 'warden_boots', 'common', [], 12) },
    allocated: [...allocated],
    bar: ['cleave', 'downdraught', 'millrace', null, null, 'dodge_roll'],
    changes: {},
  };
}

const threat: Threat = threatNear(content, ['ledger_hall_3'], zoneOf(content, 'ledger_hall_3'), 22);

void test('the owner case: the Honed Warden\'s Arbalest over a Turning Tide broadsword says the blade places and skills are what it costs', (): void => {
  const verdict: Verdict = must(itemVerdict(content, swordsman(TURNING_TIDE), threat, arbalest), 'verdict');
  assert.equal(verdict.scored, 'worse');
  assert.equal(verdict.kind, 'switch');
  assert.ok(verdict.damage < -VERDICT.clear);
  assert.ok(verdict.speed > VERDICT.sharpSpeed);
  const switched = must(verdict.switched, 'switch');
  assert.equal(switched.needs, 'a crossbow');
  assert.equal(switched.path, 'Turning Tide');
  assert.ok(switched.places > 0);
  assert.deepEqual(switched.becomes, [{ from: 'Millwheel', to: 'Fanned Quarrel' }]);
  assert.ok(switched.fresh > VERDICT.clear);
  assert.ok(verdictParts(verdict).includes('+17% attack speed'));
  assert.equal(verdictNote(verdict), `With a crossbow ${switched.places} Turning Tide places stop adding damage and Millwheel becomes Fanned Quarrel · +${Math.round(switched.fresh * 100)}% damage on an unspent tree`);
});

void test('the arbalest\'s toughness loss is the broadsword\'s life regeneration and nothing else', (): void => {
  const subject: VerdictSubject = swordsman(TURNING_TIDE);
  const before: Build = buildOf(content, subject, subject.equipped);
  const after: Build = buildOf(content, subject, { ...subject.equipped, weapon: arbalest });
  assert.ok(before.stats.lifeRegen - after.stats.lifeRegen > 4);
  assert.equal(after.stats.maxLife, before.stats.maxLife);
  assert.equal(after.stats.armour, before.stats.armour);
  assert.ok(compareBuilds(content, before, after, threat).toughness < -VERDICT.clear);
  assert.equal(compareBuilds(content, before, { ...after, stats: { ...after.stats, lifeRegen: before.stats.lifeRegen } }, threat).toughness, 0);
});

void test('on an unspent tree the arbalest\'s attack speed and crit make it better, and the note still says Cleave changes', (): void => {
  const verdict: Verdict = must(itemVerdict(content, swordsman([]), threat, arbalest), 'verdict');
  assert.equal(verdict.kind, 'better');
  assert.ok(verdict.damage > VERDICT.clear);
  assert.equal(must(verdict.switched, 'switch').places, 0);
  assert.match(verdictNote(verdict) ?? '', /^With a crossbow Cleave becomes Quarrel/);
});

void test('a weapon of the same kind is no switch', (): void => {
  const verdict: Verdict = must(itemVerdict(content, swordsman(TURNING_TIDE), threat, { ...broadsword, uid: 9, level: 20 }), 'verdict');
  assert.equal(verdict.switched, null);
  assert.notEqual(verdict.kind, 'switch');
});
