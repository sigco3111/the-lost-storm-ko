import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BotPlan } from './bot-plan.ts';
import { STAND_WEIGHTS, nextPlace } from './bot-plan.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillTreeNodeDef } from './content/types.ts';

const content: Content = loadContent();

const PLAN: BotPlan = { name: 'test', flaskAt: 0.5, manaFlaskAt: null, rolls: true, loot: true, lineSeconds: 0, readSeconds: 0, paths: ['blade'], skills: [], route: [], weights: STAND_WEIGHTS, focus: null, style: 'stand', keepGap: 0, weapons: 'any', avoid: [] };

function placeOf(id: string): SkillTreeNodeDef {
  const found: SkillTreeNodeDef | undefined = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id);
  if (found === undefined) throw new Error(`no place ${id}`);
  return found;
}

function spend(plan: BotPlan, points: number): string[] {
  const taken: string[] = [];
  for (let point: number = 0; point < points; point += 1) {
    const next: string | null = nextPlace(content, plan, taken, 1);
    if (next === null) break;
    taken.push(next);
  }
  return taken;
}

void test('a build that names no common or specialty place in its route never takes one', (): void => {
  const taken: readonly string[] = spend(PLAN, 60);
  assert.ok(taken.length > 20);
  for (const id of taken) {
    const node: SkillTreeNodeDef = placeOf(id);
    assert.equal(node.common, null, id);
    assert.equal(node.specialty, null, id);
  }
});

void test('a route to a specialty keystone walks its own arm and its own specialty, never a common place or another specialty', (): void => {
  const taken: readonly string[] = spend({ ...PLAN, route: ['maelstrom_maelstrom'] }, 60);
  assert.ok(taken.includes('maelstrom_maelstrom'));
  for (const id of taken) {
    const node: SkillTreeNodeDef = placeOf(id);
    assert.equal(node.common, null, id);
    assert.ok(node.specialty === null || node.specialty === 'maelstrom', id);
  }
});

void test('a route that names a common place reaches it through the common places beside it', (): void => {
  const taken: readonly string[] = spend({ ...PLAN, route: ['common_blade_wind_3'] }, 60);
  assert.ok(taken.includes('common_blade_wind_3'));
});
