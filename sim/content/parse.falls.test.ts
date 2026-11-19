import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from './content.ts';
import { contentProblems } from './parse.ts';
import type { Content, ZoneDef, ZoneFall } from './types.ts';

function pouring(surface: string): Content {
  const content: Content = loadContent();
  const zone: ZoneDef = must(content.zones.get('lava_depths'), 'lava_depths');
  const first: ZoneFall = must(zone.falls[0], 'first fall');
  const zones: Map<string, ZoneDef> = new Map<string, ZoneDef>(content.zones);
  zones.set(zone.id, { ...zone, falls: [{ ...first, surface }] });
  return { ...content, zones };
}

void test('the shipped falls all pour a glowing surface', (): void => {
  assert.deepEqual(contentProblems(loadContent()).filter((problem: string): boolean => problem.includes('pours a fall')), []);
});

void test('a fall of a surface that does not glow is reported, since it would draw nothing', (): void => {
  assert.ok(contentProblems(pouring('basalt')).some((problem: string): boolean => problem.includes('pours a fall of basalt, which is unknown or does not glow')));
});

void test('a fall of an unknown surface is reported', (): void => {
  assert.ok(contentProblems(pouring('no_such_surface')).some((problem: string): boolean => problem.includes('pours a fall of no_such_surface')));
});
