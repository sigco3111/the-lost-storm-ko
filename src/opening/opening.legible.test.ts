import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const LEGIBLE = {
  voidGround: [0xba, 0xbf, 0xc4],
  least: 4.5,
  hudSelector: '.hud',
  voidSelector: "body[data-zone-kind='void'] .hud",
} as const;

interface Rgba {
  readonly rgb: readonly [number, number, number];
  readonly alpha: number;
}

function block(css: string, selector: string): string {
  const found: string | undefined = css.split('}').find((part: string): boolean => (part.split('{')[0] ?? '').trim() === selector);
  assert.ok(found !== undefined, `no block for ${selector}`);
  return found;
}

function rgbaOf(css: string, property: string): Rgba {
  const match: RegExpExecArray | null = new RegExp(`${property}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)`).exec(css);
  assert.ok(match !== null, `no rgba for ${property}`);
  return { rgb: [Number(match[1]), Number(match[2]), Number(match[3])], alpha: Number(match[4]) };
}

function over(top: Rgba, under: readonly [number, number, number]): [number, number, number] {
  const mix = (index: 0 | 1 | 2): number => top.rgb[index] * top.alpha + under[index] * (1 - top.alpha);
  return [mix(0), mix(1), mix(2)];
}

function channel(value: number): number {
  const share: number = value / 255;
  return share <= 0.03928 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4;
}

function luminance(rgb: readonly [number, number, number]): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const light: number = Math.max(luminance(a), luminance(b));
  const dark: number = Math.min(luminance(a), luminance(b));
  return (light + 0.05) / (dark + 0.05);
}

function hintContrast(tokens: string): number {
  const plate: [number, number, number] = over(rgbaOf(tokens, '--legible-plate'), LEGIBLE.voidGround);
  return contrast(over(rgbaOf(tokens, '--text-dim'), plate), plate);
}

void test('a hint on its plate reads clearly over the pale In-Between, where the plain plate washes out', (): void => {
  const opening: string = readFileSync(new URL('./opening.css', import.meta.url), 'utf8');
  const hud: string = readFileSync(new URL('../hud/hud.css', import.meta.url), 'utf8');
  const plain: number = hintContrast(block(hud, LEGIBLE.hudSelector));
  const inVoid: number = hintContrast(block(opening, LEGIBLE.voidSelector));
  assert.ok(plain < LEGIBLE.least, `the plain plate is already legible on the void (${plain.toFixed(2)}), so this rule is not needed`);
  assert.ok(inVoid >= LEGIBLE.least, `hint text on the void reaches only ${inVoid.toFixed(2)}:1`);
});
