import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { changesShape, placeChanges, skillChanges } from './skill-changes.ts';
import type { ChangeChoice, ChangeOwner, SkillChanges } from './skill-changes.ts';

const content: Content = loadContent();
const both: readonly string[] = ['storm_lance', 'twice_told_bolt'];

function owner(allocated: readonly string[], changes: Readonly<Record<string, string>>): ChangeOwner {
  return { allocated, changes };
}

function node(id: string): SkillTreeNodeDef {
  return must(content.skillTree.find((entry: SkillTreeNodeDef): boolean => entry.id === id), id);
}

void test('a skill with two changes offers both by place name, and lights the first taken whatever weapon is in hand', (): void => {
  const choices: SkillChanges = must(skillChanges(content, owner(both, {}), 'storm_bolt'), 'storm bolt changes');
  assert.equal(choices.title, 'Storm Bolt uses');
  assert.deepEqual(
    choices.choices.map((choice: ChangeChoice): readonly [string, boolean] => [choice.name, choice.lit]),
    [
      ['Storm Lance', true],
      ['Twice-Told Bolt', false],
    ],
  );
  const chosen: SkillChanges = must(skillChanges(content, owner(both, { storm_bolt: 'storm_bolt_echo' }), 'storm_bolt'), 'chosen');
  assert.deepEqual(
    chosen.choices.map((choice: ChangeChoice): boolean => choice.lit),
    [false, true],
  );
  assert.equal(skillChanges(content, owner(['storm_lance'], {}), 'storm_bolt'), null);
});

void test('a card shows the choice only once its place is taken, and its shape changes only with the changes held', (): void => {
  assert.deepEqual(placeChanges(content, owner(['storm_lance'], {}), node('twice_told_bolt')), []);
  const shown: readonly SkillChanges[] = placeChanges(content, owner(both, {}), node('twice_told_bolt'));
  assert.equal(shown.length, 1);
  assert.equal(changesShape(shown), 'storm_bolt=storm_bolt_lance|storm_bolt_echo');
  assert.equal(changesShape(placeChanges(content, owner(both, { storm_bolt: 'storm_bolt_echo' }), node('storm_lance'))), changesShape(shown));
});
