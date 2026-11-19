import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetManifest } from './manifest.ts';
import { warmPaths, warmVoicePaths } from './warm.ts';

const MANIFEST: AssetManifest = {
  sfx: new Map<string, readonly string[]>([
    ['a', ['a1.ogg', 'a2.ogg']],
    ['b', ['b1.ogg']],
    ['c', ['a2.ogg', 'c1.ogg']],
  ]),
  voice: new Map<string, string>([
    ['page_one', 'voice/book/page_one.mp3'],
    ['page_two', 'voice/book/page_two.mp3'],
    ['page_twin', 'voice/book/page_one.mp3'],
  ]),
  clips: new Map<string, string>(),
};

void test('every variation of each wanted id is listed once, in the order of the ids', (): void => {
  assert.deepEqual(warmPaths(['b', 'a', 'c'], MANIFEST), ['b1.ogg', 'a1.ogg', 'a2.ogg', 'c1.ogg']);
});

void test('ids the manifest does not have are skipped', (): void => {
  assert.deepEqual(warmPaths(['missing', 'b', 'also_missing'], MANIFEST), ['b1.ogg']);
  assert.deepEqual(warmPaths([], MANIFEST), []);
});

void test('each wanted voice clip is listed once, in the order asked, and unknown ones are skipped', (): void => {
  assert.deepEqual(warmVoicePaths(['page_two', 'missing', 'page_one', 'page_twin'], MANIFEST), ['voice/book/page_two.mp3', 'voice/book/page_one.mp3']);
  assert.deepEqual(warmVoicePaths([], MANIFEST), []);
});
