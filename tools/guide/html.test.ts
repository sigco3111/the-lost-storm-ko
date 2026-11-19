import assert from 'node:assert/strict';
import { test } from 'node:test';
import { esc, list, minutes, percent, signedPercent, table } from './html.ts';

void test('text is escaped before it reaches the page', (): void => {
  assert.equal(esc('<b> & "x"'), '&lt;b&gt; &amp; &quot;x&quot;');
});

void test('lists read as a sentence', (): void => {
  assert.equal(list([]), '');
  assert.equal(list(['a']), 'a');
  assert.equal(list(['a', 'b', 'c']), 'a, b and c');
});

void test('numbers are written the way a player reads them', (): void => {
  assert.equal(percent(0.256), '26%');
  assert.equal(signedPercent(-0.3), '−30%');
  assert.equal(minutes(42.4), '42 min');
  assert.equal(minutes(120), '2 h');
  assert.equal(minutes(166), '2 h 46 min');
});

void test('a table puts its first column in row headers', (): void => {
  const html: string = table({ head: ['A', 'B'], rows: [['x', '1']] });
  assert.ok(html.includes('<th scope="row">x</th><td class="num">1</td>'));
});
