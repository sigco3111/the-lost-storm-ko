import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SkillTreeNodeDef } from '../../sim/content/types.ts';
import { CONTENT } from '../simulate-run.ts';
import { GUIDE_SPEC } from './builds.ts';
import { SIGNATURES, shortestRoute, signatureFacts } from './signature.ts';

function names(order: readonly string[]): string[] {
  return order.map((id: string): string => CONTENT.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id)?.name ?? id);
}

void test('the Maelstrom reaches the Millwheel in seven places, with a blade worn and Cleave held', (): void => {
  const facts = signatureFacts(CONTENT, 'whirlwind');
  assert.deepEqual(names(facts.route), ['Thunderhead', 'Heavy Hands', 'Keen Edge', 'Whetstone', 'Follow Through', 'Whirling Cleave', 'Endless Turn']);
  assert.equal(facts.family?.id, 'blade');
  assert.equal(facts.held, 'cleave');
  assert.equal(facts.becomes, 'cleave_millwheel');
});

void test('the Nightshot holds Cleave, which a crossbow makes Quarrel, and the Echo needs no weapon', (): void => {
  const shot = signatureFacts(CONTENT, 'windrunner');
  assert.equal(shot.family?.id, 'crossbow');
  assert.equal(shot.worn, 'quarrel');
  assert.equal(shot.becomes, 'quarrel_fan');
  const echo = signatureFacts(CONTENT, 'echo-weaver');
  assert.equal(echo.family, null);
  assert.equal(echo.held, null);
});

void test('every build in the guide has a signature, and each route starts at a starting place and walks linked places', (): void => {
  for (const build of GUIDE_SPEC.builds) {
    assert.ok(SIGNATURES[build.id] !== undefined, build.id);
    const order: readonly string[] = signatureFacts(CONTENT, build.id).route;
    const first: SkillTreeNodeDef | undefined = CONTENT.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === order[0]);
    assert.deepEqual(first?.requires, []);
  }
  assert.throws(() => shortestRoute(CONTENT, 'no_such_place'));
});
