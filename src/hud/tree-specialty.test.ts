import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, SkillTreeNodeDef } from '../../sim/content/types.ts';
import type { NameView } from './chart-label.ts';
import { markSpecialtyNames, placeHome, specialtyLine } from './tree-specialty.ts';
import type { SpecialtyName } from './tree-specialty.ts';

const content: Content = loadContent();

function placeOf(id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id);
  if (found === undefined) throw new Error(`no place ${id}`);
  return found;
}

function recordingName(id: string, marks: Map<string, boolean>): SpecialtyName {
  const view: NameView = {
    at: { x: 0, y: 0 },
    halfWidth: 0,
    halfHeight: 0,
    pins: false,
    measure: (): void => undefined,
    place: (): void => undefined,
    mark: (state: string, on: boolean): void => void marks.set(`${id}.${state}`, on),
  };
  return { id, view };
}

void test('a card names a common place as Common, a specialty place by its specialty and an arm place by its arm', (): void => {
  assert.equal(placeHome(content, placeOf('common_blade_wind_1')), content.chart.common.name);
  assert.equal(placeHome(content, placeOf('maelstrom_1')), 'The Maelstrom');
  assert.equal(placeHome(content, placeOf('blade_gate')), 'The Turning Tide');
});

void test('only a specialty place says that one specialty can be followed', (): void => {
  assert.match(specialtyLine(content, placeOf('maelstrom_1')) ?? '', /^A specialty of The Turning Tide\. Only one specialty/);
  assert.equal(specialtyLine(content, placeOf('blade_gate')), null);
  assert.equal(specialtyLine(content, placeOf('common_blade_wind_1')), null);
});

void test('the chosen specialty is marked chosen and every other one closed; with none chosen nothing is closed', (): void => {
  const marks: Map<string, boolean> = new Map<string, boolean>();
  const names: readonly SpecialtyName[] = [recordingName('maelstrom', marks), recordingName('kiln', marks)];
  markSpecialtyNames(content, names, ['maelstrom_1']);
  assert.deepEqual(Object.fromEntries(marks), { 'maelstrom.closed': false, 'maelstrom.chosen': true, 'kiln.closed': true, 'kiln.chosen': false });
  markSpecialtyNames(content, names, []);
  assert.equal(marks.get('kiln.closed'), false);
  assert.equal(marks.get('maelstrom.chosen'), false);
});
