import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { ScreenLimit } from './generate.ts';
import { caveProblems, screenLoad } from './checks.ts';

const content: Content = loadContent();
const caves: ZoneDef | undefined = content.zones.get('under_hall');
assert.ok(caves !== undefined);
const limit: ScreenLimit = screenLoad(content, caves);

void test('Hourfall Caves sets the screen limit and passes its own checks', (): void => {
  assert.ok(limit.monsters > 0 && limit.lights > 0);
  assert.deepEqual(caveProblems(content, caves, limit), []);
});

void test('packs drawn together, a pack at the waypoint, a fuller screen and a rock on the exit are each reported', (): void => {
  const first = caves.packs[0];
  const exit = caves.exits[0];
  assert.ok(first !== undefined && exit !== undefined && caves.waypoint !== null);
  const crowded: ZoneDef = { ...caves, packs: [...caves.packs, { ...first, x: first.x + 1 }, { ...first, x: caves.waypoint.x, z: caves.waypoint.z + 2 }], props: [...caves.props, { prop: 'cave_boulder_large', x: exit.x, z: exit.z + 1, y: 0, rotationDegrees: 0, when: [] }] };
  const problems: string[] = caveProblems(content, crowded, { monsters: 1, lights: limit.lights });
  assert.ok(problems.some((line: string): boolean => line.includes('apart')), problems.join('; '));
  assert.ok(problems.some((line: string): boolean => line.includes('from the waypoint')), problems.join('; '));
  assert.ok(problems.some((line: string): boolean => line.includes('blocks exit')), problems.join('; '));
  assert.ok(problems.some((line: string): boolean => line.includes('on one screen')), problems.join('; '));
});
