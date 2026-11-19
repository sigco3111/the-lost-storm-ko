import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import { describeExactMod, describeMod, describeSkillMod, isRatio, roundStat, statLabel } from './stat-text.ts';

void test('flat mods read as signed numbers with the stat label', (): void => {
  assert.equal(describeMod({ stat: 'maxLife', op: 'add', value: 30 }), '+30 Maximum Life');
  assert.equal(describeMod({ stat: 'lifeRegen', op: 'add', value: 1.5 }), '+1.5 Life Regenerated per Second');
});

void test('ratio stats and percent mods read as percentages', (): void => {
  assert.equal(describeMod({ stat: 'moveSpeed', op: 'percent', value: 0.1 }), '+10% Movement Speed');
  assert.equal(describeMod({ stat: 'critChance', op: 'add', value: 0.04 }), '+4% Critical Strike Chance');
  assert.equal(describeMod({ stat: 'attackSpeed', op: 'add', value: -0.15 }), '−15% Attack Speed');
});

void test('rounding follows the stat kind', (): void => {
  assert.equal(roundStat('maxLife', 'add', 12.6), 13);
  assert.equal(roundStat('manaRegen', 'add', 1.26), 1.3);
  assert.equal(roundStat('critChance', 'add', 0.0456), 0.05);
  assert.equal(roundStat('moveSpeed', 'percent', 0.0449), 0.04);
  assert.ok(isRatio('goldFind', 'add'));
  assert.ok(!isRatio('armour', 'add'));
  assert.equal(statLabel('armour'), 'Armour');
});

void test('a skill mod reads as a signed amount, the field and the skill or group it changes', (): void => {
  const content: Content = loadContent();
  assert.equal(describeSkillMod(content, { target: { type: 'group', group: 'lightning' }, field: 'damagePercent', value: 0.3 }), '+30% damage (lightning skills)');
  assert.equal(describeSkillMod(content, { target: { type: 'skill', skill: 'forkline' }, field: 'chains', value: 1 }), '+1 chains (Forkline)');
  assert.equal(describeSkillMod(content, { target: { type: 'skill', skill: 'held_breath' }, field: 'cooldownPercent', value: -0.3 }), '-30% cooldown (Held Breath)');
  assert.equal(describeSkillMod(content, { target: { type: 'skill', skill: 'standing_storm' }, field: 'lifeOnHit', value: 2 }), '+2 life on hit (Standing Storm)');
  assert.equal(describeSkillMod(content, { target: { type: 'skill', skill: 'storm_bolt' }, field: 'manaCostPercent', value: -0.2 }), '-20% mana cost (Storm Bolt)');
});

void test('a tree line keeps the half percent the place gives', (): void => {
  assert.equal(describeExactMod({ stat: 'critChance', op: 'add', value: 0.015 }), '+1.5% Critical Strike Chance');
  assert.equal(describeExactMod({ stat: 'damagePercent', op: 'add', value: -0.2 }), '−20% Damage');
  assert.equal(describeExactMod({ stat: 'maxLife', op: 'add', value: 30 }), '+30 Maximum Life');
});
