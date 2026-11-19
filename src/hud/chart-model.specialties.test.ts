import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { chartMatches, pathLabels, pathTint, placeTint, specialtyLabels } from './chart-model.ts';
import type { PathLabel, SpecialtyLabel } from './chart-model.ts';

const content: Content = loadContent();

function place(id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

void test('each specialty is named past its own farthest place, and the arm names stay at the ends of the arms', (): void => {
  const labels: readonly SpecialtyLabel[] = specialtyLabels(content);
  assert.equal(labels.length, content.chart.specialties.length);
  for (const label of labels) {
    const own: readonly SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.specialty === label.specialty.id);
    const reach: number = Math.max(...own.map((node: SkillTreeNodeDef): number => Math.hypot(node.column, node.row)));
    assert.ok(Math.hypot(label.at.x, label.at.y) > reach, label.specialty.id);
    assert.equal(label.tint, pathTint(content, label.specialty.path));
  }
  const arms: ReadonlyMap<string, PathLabel> = new Map<string, PathLabel>(pathLabels(content).map((label: PathLabel): [string, PathLabel] => [label.path.id, label]));
  const blade: PathLabel | undefined = arms.get('blade');
  const keystone: SkillTreeNodeDef = place('edge_without_rest');
  assert.ok(blade !== undefined && Math.hypot(blade.at.x, blade.at.y) < Math.hypot(keystone.column, keystone.row) * 1.2);
});

void test('common places wear the common tint and are found by the word common or by their specialty name', (): void => {
  const common: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.common !== null);
  assert.ok(common !== undefined);
  assert.equal(placeTint(content, common), content.chart.common.tint);
  assert.equal(placeTint(content, place('maelstrom_1')), pathTint(content, 'blade'));
  assert.equal(chartMatches(content, 'common')?.has(common.id), true);
  assert.equal(chartMatches(content, 'maelstrom')?.has('maelstrom_1'), true);
});
