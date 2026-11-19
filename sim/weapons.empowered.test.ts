import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef, SkillTreeNodeDef } from './content/types.ts';
import { resolveSkill } from './stats.ts';
import { ANY_WEAPON, empoweredBy, empoweredMods } from './weapons.ts';

const content: Content = loadContent();

function skill(id: string): SkillDef {
  return must(content.skills.get(id), id);
}

function hit(resolved: SkillDef): number {
  return resolved.damage.weaponPercent;
}

void test('a weapon arm skill is cast with any weapon and hits a quarter harder with its own weapon in hand', (): void => {
  const bolt: SkillDef = skill('storm_bolt');
  const blade: number = hit(resolveSkill(content, bolt, [], [], [], 'blade'));
  const staff: number = hit(resolveSkill(content, bolt, [], [], [], 'staff'));
  assert.equal(blade, bolt.damage.weaponPercent);
  assert.ok(Math.abs(staff / blade - 1.25) < 1e-9);
  assert.equal(hit(resolveSkill(content, bolt, [], [], [], null)), blade);
  assert.equal(hit(resolveSkill(content, bolt, [], [], [], ANY_WEAPON)), staff);
});

void test('the empowerment stacks with the tree and follows the skill into the form a place turns it into', (): void => {
  const bolt: SkillDef = skill('storm_bolt');
  const taken: readonly string[] = ['stormcallers_focus', 'storm_1', 'twice_told_bolt'];
  const blade: SkillDef = resolveSkill(content, bolt, taken, [], [], 'blade');
  const staff: SkillDef = resolveSkill(content, bolt, taken, [], [], 'staff');
  assert.equal(blade.form, 'storm_bolt_echo');
  assert.equal(staff.form, 'storm_bolt_echo');
  assert.ok(staff.damage.weaponPercent > blade.damage.weaponPercent);
  assert.ok(Math.abs(hit(resolveSkill(content, bolt, ['twice_told_bolt'], [], [], 'staff')) / hit(resolveSkill(content, bolt, ['twice_told_bolt'], [], [], 'blade')) - 1.25) < 1e-9);
});

void test('a form with no empowerment of its own takes its base skill\'s, and mods apply only with that weapon', (): void => {
  const bolt: SkillDef = skill('storm_bolt');
  const bare: SkillDef = { ...skill('storm_bolt_lance'), empowered: null };
  assert.equal(empoweredBy(bare, bolt), bolt.empowered);
  assert.deepEqual(empoweredMods(bolt.empowered, 'blade'), []);
  assert.deepEqual(empoweredMods(bolt.empowered, 'staff'), bolt.empowered?.mods);
  assert.deepEqual(empoweredMods(null, 'staff'), []);
});

void test('every skill a weapon arm place gives is empowered by that weapon, and every form a weapon place makes names one of its makers', (): void => {
  const makers: Map<string, Set<string>> = new Map<string, Set<string>>();
  for (const node of content.skillTree) {
    if (node.weapon === null) continue;
    if (node.unlock !== null) assert.equal(skill(node.unlock).empowered?.weapon, node.weapon, node.id);
    for (const variant of node.variants) makers.set(variant.becomes, (makers.get(variant.becomes) ?? new Set<string>()).add(node.weapon));
  }
  for (const [becomes, weapons] of makers) {
    const weapon: string | undefined = skill(becomes).empowered?.weapon;
    if (weapon !== undefined) assert.ok(weapons.has(weapon), becomes);
  }
  const armed: readonly SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.weapon !== null && node.unlock !== null);
  assert.ok(armed.length >= 10);
});
