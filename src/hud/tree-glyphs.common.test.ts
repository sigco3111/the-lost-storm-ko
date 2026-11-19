import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import { isCommonGlyph, treeGlyph } from './tree-glyphs.ts';

void test('every common place draws a glyph of the one common family, and nothing else uses that family', (): void => {
  const content = loadContent();
  const frame: string = '<circle cx="12" cy="12" r="9.4" opacity="0.45"/>';
  for (const node of content.skillTree) {
    assert.equal(isCommonGlyph(node.icon), node.common !== null, node.id);
    if (node.common !== null) assert.ok(treeGlyph(node.icon).includes(frame), node.id);
  }
  for (const place of content.chart.common.places) assert.ok(isCommonGlyph(place.icon), place.id);
});
