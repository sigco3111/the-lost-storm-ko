import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { emptyEquipment } from '../../sim/items.ts';
import type { Equipment, ItemInstance } from '../../sim/world/types.ts';
import { holdingLine, placeOff } from './place-off.ts';
import type { PlaceOff } from './place-off.ts';

const content: Content = loadContent();

function holding(base: string): Equipment {
  const item: ItemInstance = { uid: 1, base, rarity: 'common', level: 1, affixes: [], ledger: null };
  return { ...emptyEquipment(), weapon: item };
}

function node(id: string): SkillTreeNodeDef {
  return must(content.skillTree.find((entry: SkillTreeNodeDef): boolean => entry.id === id), id);
}

void test('a staff place held with a blade lists its weapon damage lines as off, and keeps lines a bladed hand still uses', (): void => {
  const off: PlaceOff = must(placeOff(content, node('storm_5'), holding('woodsman_hatchet')), 'off');
  assert.equal(off.lines.length, 1);
  assert.ok(off.lines.every((line: string): boolean => line.includes('Critical Strike Chance')));
  assert.equal(off.need, 'Inactive: needs a staff.');
  assert.equal(off.holding, "You hold a blade: Woodsman's Hatchet.");
  assert.equal(placeOff(content, node('thunder_in_the_bones'), holding('woodsman_hatchet')), null);
});

void test('a skill change and its trigger stay on with any weapon, and nothing is off with the right weapon or no weapon place', (): void => {
  assert.equal(placeOff(content, node('riptide'), holding('driftwood_staff')), null);
  assert.equal(placeOff(content, node('riptide'), holding('woodsman_hatchet')), null);
  assert.equal(placeOff(content, node('storm_lance'), holding('woodsman_hatchet')), null);
});

void test('empty hands are named as empty', (): void => {
  assert.equal(holdingLine(content, emptyEquipment()), 'Your hands are empty.');
});
