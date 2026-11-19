import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { armedLine } from './armed-line.ts';

const content: Content = loadContent();

void test('a laid starter is announced by its group and named by its item, in the bag or at the feet', (): void => {
  assert.deepEqual(armedLine(content, 'staff', 'driftwood_staff', 'bag'), { title: 'A staff was laid in your bag', subtitle: 'Driftwood Staff' });
  assert.deepEqual(armedLine(content, 'staff', 'driftwood_staff', null), { title: 'A staff was laid for you', subtitle: 'Driftwood Staff' });
  assert.deepEqual(armedLine(content, 'heavy', 'tempest_greatsword', 'ground'), { title: 'A heavy weapon was laid at your feet', subtitle: 'Tempest Greatsword' });
});
