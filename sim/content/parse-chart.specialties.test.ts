import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import { chartDef, chartProblems, treeNode } from './parse-chart.ts';
import type { CommonPlace, Content, SkillTreeNodeDef, SpecialtyDef } from './types.ts';

const content: Content = loadContent();

function place(id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id);
  if (found === undefined) throw new Error(id);
  return found;
}

function withPlace(changed: SkillTreeNodeDef): Content {
  return { ...content, skillTree: [...content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.id !== changed.id), changed] };
}

const LIFE: CommonPlace = { id: 'life', name: 'Hardy', description: '+10 Maximum Life.', icon: 'common_life', statMods: [{ stat: 'maxLife', op: 'add', value: 10 }] };

void test('a common place takes its name, words, glyph and stats from the one shared entry', (): void => {
  const made: SkillTreeNodeDef = treeNode({ id: 'c1', common: 'life', path: 'blade', column: 1, row: 2, requires: ['x'] }, 'tree', [LIFE]);
  assert.equal(made.name, 'Hardy');
  assert.equal(made.description, '+10 Maximum Life.');
  assert.equal(made.icon, 'common_life');
  assert.equal(made.kind, 'minor');
  assert.equal(made.common, 'life');
  assert.equal(made.specialty, null);
  assert.equal(made.weapon, null);
  assert.deepEqual(made.statMods, LIFE.statMods);
  assert.throws((): unknown => treeNode({ id: 'c2', common: 'nothing', path: 'blade', column: 1, row: 2, requires: [] }, 'tree', [LIFE]), /unknown common place/);
});

void test('every common place of one kind is the same wherever it stands', (): void => {
  const commons: readonly SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.common !== null);
  assert.ok(commons.length >= 30);
  for (const kind of content.chart.common.places) {
    const same: readonly SkillTreeNodeDef[] = commons.filter((node: SkillTreeNodeDef): boolean => node.common === kind.id);
    assert.ok(same.length > 0, kind.id);
    for (const node of same) assert.deepEqual([node.name, node.description, node.icon, node.statMods, node.skillMods, node.triggers], [kind.name, kind.description, kind.icon, kind.statMods, [], []]);
  }
});

void test('a chart without commons or specialties reads as empty, and the content has none of the problems the chart looks for', (): void => {
  const bare = chartDef({ title: 'T', pointsPerLevel: 2, revision: 1, respec: { goldPerPoint: 1, goldPerLevel: 1 }, grants: [], twist: 0, paths: [], groups: [], weaponGroups: [] }, 'chart');
  assert.deepEqual(bare.specialties, []);
  assert.deepEqual(bare.common.places, []);
  assert.deepEqual(chartProblems(content), []);
});

void test('the chart reports a specialty on the wrong path, an unknown specialty and a specialty with no single keystone', (): void => {
  const kiln: SpecialtyDef | undefined = content.chart.specialties.find((entry: SpecialtyDef): boolean => entry.id === 'kiln');
  assert.ok(kiln !== undefined);
  const moved: Content = { ...content, chart: { ...content.chart, specialties: [...content.chart.specialties.filter((entry: SpecialtyDef): boolean => entry.id !== 'kiln'), { id: kiln.id, name: kiln.name, description: kiln.description, path: 'storm' }] } };
  assert.ok(chartProblems(moved).some((problem: string): boolean => problem.includes('of specialty kiln is on path stone')));
  const stray: Content = withPlace({ ...place('stone_gate'), specialty: 'nowhere' });
  assert.ok(chartProblems(stray).includes('tree node stone_gate belongs to unknown specialty nowhere'));
  const keystone: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.specialty === 'kiln' && node.kind === 'keystone');
  assert.ok(keystone !== undefined);
  const flat: Content = withPlace({ ...keystone, kind: 'notable' });
  assert.ok(chartProblems(flat).includes('specialty kiln has no single keystone'));
});
