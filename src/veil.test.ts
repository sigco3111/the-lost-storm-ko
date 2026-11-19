import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VEIL } from './veil.ts';

const css: string = readFileSync(new URL('./veil.css', import.meta.url), 'utf8');

void test('the loading mark sits in the middle of whichever veil holds it, never in a corner', (): void => {
  const rules: string[] = css.split('}').filter((block: string): boolean => (block.split('{')[0] ?? '').includes(`.${VEIL.markClass}`));
  assert.equal(rules.length, 1);
  const [head, body] = (rules[0] ?? '').split('{');
  assert.equal((head ?? '').trim(), `.${VEIL.markClass}`);
  for (const wanted of ['position: absolute', 'left: 50%', 'top: 50%', 'translate: -50% -50%']) assert.ok((body ?? '').includes(wanted), wanted);
});

function ruleBody(selector: string): string {
  const block: string | undefined = css.split('}').find((part: string): boolean => (part.split('{')[0] ?? '').trim() === selector);
  return block === undefined ? '' : (block.split('{')[1] ?? '');
}

void test('the veil leaves the render tree once its fade-out ends and is back before its fade-in starts', (): void => {
  const rest: string = ruleBody('#fade');
  const cover: string = ruleBody(`#fade.${VEIL.coverClass}`);
  assert.ok(rest.includes('visibility: hidden'), rest);
  assert.ok(rest.includes('opacity var(--spring-smooth-ms) var(--spring-smooth)'), rest);
  assert.ok(rest.includes('visibility 0s linear var(--spring-smooth-ms)'), rest);
  assert.ok(cover.includes('visibility: visible'), cover);
  assert.ok(cover.includes('visibility 0s;'), cover);
});
