import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fade } from './fade.ts';
import { fadeTo, heldAt, levelAt } from './fade.ts';

void test('a fade moves in a straight line from its level to its target and then holds', (): void => {
  const fade: Fade = fadeTo(heldAt(0, 10), 10, 1, 4);
  assert.equal(levelAt(fade, 9), 0);
  assert.equal(levelAt(fade, 10), 0);
  assert.equal(levelAt(fade, 12), 0.5);
  assert.equal(levelAt(fade, 14), 1);
  assert.equal(levelAt(fade, 30), 1);
});

void test('a fade that turns around starts from where the last one had got to, so the level never jumps', (): void => {
  const up: Fade = fadeTo(heldAt(0, 0), 0, 1, 4);
  const down: Fade = fadeTo(up, 1, 0, 2);
  assert.equal(down.from, 0.25);
  assert.equal(levelAt(down, 1), levelAt(up, 1));
  assert.equal(levelAt(down, 2), 0.125);
  assert.equal(levelAt(down, 3), 0);
});

void test('a fade of no length is a held level, never a negative span', (): void => {
  const fade: Fade = fadeTo(heldAt(0.6, 5), 5, 0, -1);
  assert.equal(fade.end, 5);
  assert.equal(levelAt(fade, 5), 0);
});
