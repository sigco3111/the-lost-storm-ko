import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ItemBaseDef, SkillTreeNodeDef, WeaponGroup } from '../../sim/content/types.ts';
import { baseFamily, familyLine, needLine, pathFamily, placeFamily } from './weapon-family.ts';

const content: Content = loadContent();

function base(id: string): ItemBaseDef {
  const found: ItemBaseDef | undefined = content.itemBases.get(id);
  if (found === undefined) throw new Error(`no item base ${id}`);
  return found;
}

function family(found: WeaponGroup | null): WeaponGroup {
  if (found === null) throw new Error('no family');
  return found;
}

void test('a weapon names its family and the arm whose skills are stronger with it', (): void => {
  assert.equal(familyLine(content, family(baseFamily(content, base('tempest_greatsword')))), 'Heavy weapon · The Banked Fire skills are stronger with it');
  assert.equal(familyLine(content, family(baseFamily(content, base('woodsman_hatchet')))), 'Blade · The Turning Tide skills are stronger with it');
  assert.equal(familyLine(content, family(baseFamily(content, base('keepers_rod')))), 'Staff · The Gathering Storm skills are stronger with it');
  assert.equal(baseFamily(content, base('traveller_coat')), null);
  assert.equal(baseFamily(content, null), null);
});

void test('a place with a weapon damage line says which weapons it needs, and a skill change place needs none', (): void => {
  const hands: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === 'heavy_hands');
  assert.ok(hands !== undefined);
  assert.equal(needLine(family(placeFamily(content, hands))), 'Needs a blade: swords, sabres, knives, dirks and axes');
  const turn: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === 'endless_turn');
  assert.ok(turn !== undefined);
  assert.equal(placeFamily(content, turn), null);
  const forked: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === 'forked_bolt');
  assert.ok(forked !== undefined && forked.weapon !== null);
  assert.equal(placeFamily(content, forked), null);
});

void test('every weapon arm starts under its family, and the Echo has none', (): void => {
  assert.equal(family(pathFamily(content, 'wind')).id, 'crossbow');
  assert.equal(family(pathFamily(content, 'stone')).id, 'heavy');
  assert.equal(pathFamily(content, 'echo'), null);
  for (const group of content.chart.weaponGroups) assert.equal(pathFamily(content, group.path)?.id, group.id);
});
