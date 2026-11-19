import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CONTENT } from '../simulate-run.ts';
import { treePicture } from './tree-picture.ts';

void test('the picture draws every place and fills only the route', (): void => {
  const order: readonly string[] = CONTENT.skillTree.slice(0, 1).map((node): string => node.id);
  const svg: string = treePicture(CONTENT, order, 'A route');
  assert.equal((svg.match(/<circle /g) ?? []).length, CONTENT.skillTree.length);
  assert.equal((svg.match(/class="place [a-z]+ taken"/g) ?? []).length, order.length);
  assert.ok(svg.includes('aria-label="A route"'));
});

void test('every path is named on the picture', (): void => {
  const svg: string = treePicture(CONTENT, [], 'Tree');
  for (const path of CONTENT.chart.paths) assert.ok(svg.includes(`>${path.name}</text>`), path.name);
});
