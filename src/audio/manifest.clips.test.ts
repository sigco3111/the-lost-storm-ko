import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetManifest } from './manifest.ts';
import { parseManifest } from './manifest.ts';

void test('a manifest names its private clips, skips a clip with no path, and has none when it lists none', (): void => {
  const manifest: AssetManifest | null = parseManifest({ sfx: {}, clips: { spin_whirlwind_loop: 'anim/millwheel/loop.glb', broken: 4 } });
  assert.ok(manifest !== null);
  assert.equal(manifest.clips.get('spin_whirlwind_loop'), 'anim/millwheel/loop.glb');
  assert.equal(manifest.clips.has('broken'), false);
  assert.equal(parseManifest({ sfx: {} })?.clips.size, 0);
});
