import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css: string = readFileSync(new URL('./death.css', import.meta.url), 'utf8');

function ruleBody(selector: string): string {
  const block: string | undefined = css.split('}').find((part: string): boolean => (part.split('{')[0] ?? '').trim() === selector);
  return block === undefined ? '' : (block.split('{')[1] ?? '');
}

void test('while the hero lives the death screen holds no backdrop filter and leaves the render tree once its fade-out ends', (): void => {
  const rest: string = ruleBody('.death-screen');
  assert.ok(rest.includes('backdrop-filter: none'), rest);
  assert.ok(rest.includes('visibility: hidden'), rest);
  assert.ok(rest.includes('opacity calc(var(--spring-smooth-ms) * 2) var(--spring-smooth)'), rest);
  assert.ok(rest.includes('visibility 0s linear calc(var(--spring-smooth-ms) * 2)'), rest);
});

void test('the death screen is back in the render tree before its fade-in starts', (): void => {
  const shown: string = ruleBody('.death-screen.visible');
  assert.ok(shown.includes('visibility: visible'), shown);
  assert.ok(shown.includes('visibility 0s;'), shown);
  assert.ok(shown.includes('backdrop-filter: saturate(0.12) brightness(0.42)'), shown);
});
