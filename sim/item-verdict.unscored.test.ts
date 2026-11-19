import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, zoneOf } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import { emptyEquipment } from './items.ts';
import { buildOf, compareBuilds, itemVerdict, verdictNote, verdictParts, VERDICT } from './item-verdict.ts';
import type { Build, Verdict, VerdictSubject } from './item-verdict.ts';
import { computeStats } from './stats.ts';
import type { Threat } from './threat.ts';
import { mixThreat, threatNear } from './threat.ts';
import type { ItemInstance } from './world/types.ts';

const content: Content = loadContent();

function item(uid: number, base: string, rarity: string, affixes: ItemInstance['affixes'], level: number): ItemInstance {
  return { uid, base, rarity, level, affixes, ledger: null };
}

const breeches: ItemInstance = item(1, 'gyre_stitched_breeches', 'stormtouched', [{ affix: 'sturdy', value: 0.1 }, { affix: 'grounded', value: 0.09 }, { affix: 'hearthwarm', value: 0.16 }], 17);
const chausses: ItemInstance = item(2, 'mailed_chausses', 'magic', [{ affix: 'sturdy', value: 0.13 }], 14);

function owner(legs: ItemInstance): VerdictSubject {
  return {
    level: 22,
    equipped: {
      ...emptyEquipment(),
      weapon: item(3, 'the_millwheel', 'stormtouched', [], 16),
      legs,
      chest: item(4, 'saltworn_shirt', 'magic', [{ affix: 'hale', value: 16 }], 12),
      head: item(5, 'wayfarer_hood', 'common', [], 16),
      feet: item(6, 'warden_boots', 'common', [], 12),
      hands: item(7, 'warden_gloves', 'common', [], 16),
    },
    allocated: [],
    bar: ['cleave', null, null, null, null, 'dodge_roll'],
    changes: {},
  };
}

function nearThe(zone: string): Threat {
  return threatNear(content, [zone], zoneOf(content, zone), 22);
}

void test('the owner case: the Gyre-Stitched Breeches over the Sturdy Mailed Chausses are a trade, not worse, on the road to the Inner Hall', (): void => {
  const subject: VerdictSubject = owner(chausses);
  assert.equal(Math.round(buildOf(content, subject, subject.equipped).stats.maxLife), 444);
  const verdict: Verdict = must(itemVerdict(content, subject, nearThe('ledger_hall_3'), breeches), 'verdict');
  assert.equal(verdict.scored, 'worse');
  assert.equal(verdict.kind, 'trade');
  assert.equal(Math.round(verdict.toughness * 100), -13);
  assert.ok(verdict.move > VERDICT.move);
  assert.deepEqual(verdict.gained, { name: 'Millwheel', count: 2, of: 3 });
  assert.equal(verdict.lost, null);
  assert.deepEqual(verdictParts(verdict), ['+8% movement speed', '−13% toughness', 'Millwheel power, 2/3 worn']);
  assert.equal(verdictNote(verdict), 'Storm and frost hit hardest in the Inner Hall: −11% toughness there');
});

void test('the owner case standing in the Inner Hall: the resistances count against its own mix and the verdict is still a trade', (): void => {
  const subject: VerdictSubject = owner(chausses);
  const verdict: Verdict = must(itemVerdict(content, subject, nearThe('ledger_court'), breeches), 'verdict');
  const road: Verdict = must(itemVerdict(content, subject, nearThe('ledger_hall_3'), breeches), 'verdict');
  assert.equal(verdict.kind, 'trade');
  assert.ok(verdict.toughness > road.here + VERDICT.clear);
  assert.equal(must(road.peaks[0], 'peak').toughness, verdict.toughness);
  assert.deepEqual(verdict.against, []);
  assert.equal(verdictNote(verdict), 'Storm and frost hit hardest here');
});

void test('the resistances are worth their share: the same swap with the armour and life kept is better in the Inner Hall', (): void => {
  const subject: VerdictSubject = owner(chausses);
  const before: Build = buildOf(content, subject, subject.equipped);
  const resisted: Build = { ...before, stats: computeStats(content, subject.level, subject.equipped, subject.allocated, [{ stat: 'stormResist', op: 'add', value: 0.09 }, { stat: 'frostResist', op: 'add', value: 0.16 }]) };
  const verdict: Verdict = compareBuilds(content, before, resisted, nearThe('ledger_court'));
  assert.equal(verdict.kind, 'better');
  assert.ok(verdict.toughness > VERDICT.clear);
});

void test('movement speed alone makes an item better and losing it alone makes one worse', (): void => {
  const subject: VerdictSubject = owner(chausses);
  const before: Build = buildOf(content, subject, subject.equipped);
  const physical: Threat = mixThreat({ physical: 1, storm: 0, frost: 0 });
  const faster: Verdict = compareBuilds(content, before, { ...before, stats: { ...before.stats, moveSpeed: before.stats.moveSpeed * 1.05 } }, physical);
  assert.equal(faster.scored, 'same');
  assert.equal(faster.kind, 'better');
  assert.deepEqual(verdictParts(faster), ['+5% movement speed']);
  const slower: Verdict = compareBuilds(content, before, { ...before, stats: { ...before.stats, moveSpeed: before.stats.moveSpeed * 0.95 } }, physical);
  assert.equal(slower.kind, 'worse');
});

void test('taking off a legendary for plain armour that scores better is a trade that names the power it loses', (): void => {
  const subject: VerdictSubject = owner(breeches);
  const verdict: Verdict = must(itemVerdict(content, subject, nearThe('ledger_hall_3'), chausses), 'verdict');
  assert.equal(verdict.scored, 'better');
  assert.equal(verdict.lost, 'Millwheel');
  assert.equal(verdict.gained, null);
  assert.equal(verdict.kind, 'trade');
  assert.equal(verdictParts(verdict).at(-1), 'loses the Millwheel power');
});

void test('a second copy of the piece already worn gains and loses no power', (): void => {
  const subject: VerdictSubject = owner(breeches);
  const copy: ItemInstance = { ...breeches, uid: 9, affixes: [{ affix: 'plated', value: 18 }, { affix: 'hale', value: 16 }, { affix: 'grounded', value: 0.1 }] };
  const verdict: Verdict = must(itemVerdict(content, subject, nearThe('ledger_hall_3'), copy), 'verdict');
  assert.equal(verdict.gained, null);
  assert.equal(verdict.lost, null);
});
