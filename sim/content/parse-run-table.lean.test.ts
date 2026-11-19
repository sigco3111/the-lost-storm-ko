import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from './content.ts';
import { runTableProblems } from './parse-run-table.ts';
import type { RunCondition, RunReward } from './run-table-types.ts';
import type { Content } from './types.ts';

const content: Content = loadContent();
const NO_REWARD: RunReward = { xp: 0, gold: 0, items: 0, rarity: 0 };

function withCondition(condition: RunCondition, leaning: boolean = content.leaning): Content {
  return { ...content, leaning, runTable: { ...content.runTable, conditions: [...content.runTable.conditions, condition] } };
}

function extra(lean: number): RunCondition {
  const template: RunCondition | undefined = content.runTable.conditions.find((entry: RunCondition): boolean => entry.pick === 'none');
  assert.ok(template !== undefined);
  return { ...template, id: 'extra', excludes: [], reward: NO_REWARD, shape: { ...template.shape, mods: [], lean } };
}

void test('the run table as shipped has no problems', (): void => {
  assert.deepEqual(runTableProblems(content), []);
});

void test('a condition that only leans drops needs no other reward, and one that adds neither is refused', (): void => {
  assert.deepEqual(runTableProblems(withCondition(extra(1))), []);
  assert.deepEqual(runTableProblems(withCondition(extra(0))), ['run condition extra adds no reward and no lean']);
});

void test('a condition that leans drops is refused on every level with no drop lean', (): void => {
  const problems: string[] = runTableProblems(withCondition(extra(1), false));
  assert.equal(problems.filter((problem: string): boolean => problem.startsWith('run condition extra ')).length, content.runTable.levels.length);
  for (const level of content.runTable.levels) assert.ok(problems.includes(`run condition extra leans drops, but run table level ${level} has no drop lean`), level);
});
