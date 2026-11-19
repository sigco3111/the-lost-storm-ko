import assert from 'node:assert/strict';
import { test } from 'node:test';
import { surface } from './parse-surface.ts';
import { ContentError } from './read.ts';

const PLAIN: Readonly<Record<string, unknown>> = { id: 'molten', color: 'textures/molten_color.webp', normal: null, orm: null, metres: 5, tint: '#ffffff', roughness: 0.6, metalness: 0, normalScale: 0.4, spill: 3 };
const GLOW: Readonly<Record<string, unknown>> = { color: '#ff5a14', strength: 1.5, cover: 0.95, cracks: 0, scale: 3.6, flow: 0.2, pulse: 0.1 };

void test('a glow names no light source and is lit by its tint', (): void => {
  assert.equal(surface({ ...PLAIN, glow: GLOW }, 'surfaces[0]').glow?.lit, 'tint');
});

void test('a glow lit by its map reads so, and slows the walkers who wade through it', (): void => {
  const read = surface({ ...PLAIN, pace: 0.55, glow: { ...GLOW, lit: 'map' } }, 'surfaces[0]');
  assert.equal(read.glow?.lit, 'map');
  assert.equal(read.pace, 0.55);
});

void test('a glow lit by anything but its tint or its map is rejected', (): void => {
  assert.throws((): unknown => surface({ ...PLAIN, glow: { ...GLOW, lit: 'sun' } }, 'surfaces[0]'), ContentError);
});
