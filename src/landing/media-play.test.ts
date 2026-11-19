import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlayState } from './media-play.ts';
import { shouldPlay, shouldStream } from './media-play.ts';

const SEEN: PlayState = { onScreen: true, tabHidden: false, reducedMotion: false };

void test('a clip plays only while it is on screen in a visible tab', (): void => {
  assert.equal(shouldPlay(SEEN), true);
  assert.equal(shouldPlay({ ...SEEN, onScreen: false }), false);
  assert.equal(shouldPlay({ ...SEEN, tabHidden: true }), false);
});

void test('reduced motion keeps every clip on its still', (): void => {
  assert.equal(shouldPlay({ ...SEEN, reducedMotion: true }), false);
  assert.equal(shouldStream(true, false), false);
});

void test('a reader who asked to save data gets the stills and no video', (): void => {
  assert.equal(shouldStream(false, true), false);
  assert.equal(shouldStream(false, false), true);
});

void test('on a slow connection the page keeps to its stills', (): void => {
  assert.equal(shouldStream(false, false, '3g'), false);
  assert.equal(shouldStream(false, false, 'slow-2g'), false);
  assert.equal(shouldStream(false, false, '4g'), true);
  assert.equal(shouldStream(false, false, undefined), true);
});
