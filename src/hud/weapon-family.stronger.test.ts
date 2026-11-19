import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { ANY_WEAPON_LINE, placeWeaponLine, strongerLine } from './weapon-family.ts';

const content: Content = loadContent();

function place(id: string): SkillTreeNodeDef {
  return must(content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id), id);
}

void test('a skill from a weapon arm says which weapon makes it stronger and by how much', (): void => {
  assert.equal(strongerLine(content, must(content.skills.get('storm_bolt'), 'storm_bolt').empowered), 'Stronger with a staff: +25% damage');
  assert.equal(strongerLine(content, must(content.skills.get('held_breath'), 'held_breath').empowered), 'Stronger with a heavy weapon: +25% duration');
  assert.equal(strongerLine(content, must(content.skills.get('cleave'), 'cleave').empowered), null);
});

void test('a place that gives or changes a weapon arm skill works with any weapon and says which makes it stronger', (): void => {
  assert.equal(placeWeaponLine(content, place('storm_storm_bolt')), 'Works with any weapon · stronger with a staff');
  assert.equal(placeWeaponLine(content, place('twice_told_bolt')), 'Works with any weapon · stronger with a staff');
  assert.equal(placeWeaponLine(content, place('forked_bolt')), ANY_WEAPON_LINE);
});
