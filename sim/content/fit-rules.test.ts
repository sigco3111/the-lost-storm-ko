import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { fitProblems } from './fit-rules.ts';
import type { Content, WearableDef } from './types.ts';

const content: Content = loadContent();

function withWearables(...defs: readonly WearableDef[]): Content {
  return { ...content, wearables: new Map<string, WearableDef>([...content.wearables, ...defs.map((def: WearableDef): [string, WearableDef] => [def.id, def])]) };
}

void test('the shipped wearables fit over each other without a problem', (): void => {
  assert.deepEqual(fitProblems(content), []);
});

void test('a fit nobody wears, an unknown fitted piece, one on another region and one with fits of its own are reported', (): void => {
  const charm: WearableDef = must(content.wearables.get('storm_idol'), 'storm_idol');
  const fitted: WearableDef = must(content.wearables.get('storm_idol_coat'), 'storm_idol_coat');
  const vest: WearableDef = must(content.wearables.get('leather_vest'), 'leather_vest');
  const problems: string[] = fitProblems(
    withWearables(
      { ...charm, id: 'odd_fit', fits: { cloak: 'storm_idol_coat' } },
      { ...charm, id: 'odd_target', fits: { coat: 'no_such_piece' } },
      { ...charm, id: 'odd_region', fits: { coat: 'leather_vest' } },
      { ...charm, id: 'odd_chain', fits: { coat: 'chained' } },
      { ...fitted, id: 'chained', fits: { coat: 'storm_idol_coat' } },
      vest,
    ),
  );
  assert.ok(problems.some((problem: string): boolean => problem.includes('odd_fit fits over cloak, which no wearable is')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('odd_target fits over coat as unknown wearable no_such_piece')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('odd_region fits over coat as leather_vest, which is worn on the chest, not the neck')));
  assert.ok(problems.some((problem: string): boolean => problem.includes('odd_chain fits over coat as chained, which has fits of its own')));
});
