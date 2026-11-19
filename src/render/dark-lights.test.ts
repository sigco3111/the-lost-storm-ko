import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShaderChunk } from 'three';
import { DIRECT_CALL, GUARDED_CALL, installDarkLightSkip, skipDarkLights } from './dark-lights.ts';

function count(text: string, part: string): number {
  return text.split(part).length - 1;
}

void test('every direct light call in the lights chunk runs only for a light that reaches the pixel', (): void => {
  const original: string = ShaderChunk.lights_fragment_begin.replaceAll(GUARDED_CALL, DIRECT_CALL);
  const calls: number = count(original, DIRECT_CALL);
  assert.ok(calls >= 3);
  const guarded: string = skipDarkLights(original);
  assert.equal(count(guarded, GUARDED_CALL), calls);
  assert.equal(count(guarded, DIRECT_CALL), calls);
  assert.equal(guarded.replaceAll(GUARDED_CALL, DIRECT_CALL), original);
});

void test('the guard is applied once however often it is installed', (): void => {
  installDarkLightSkip();
  const once: string = ShaderChunk.lights_fragment_begin;
  installDarkLightSkip();
  assert.equal(ShaderChunk.lights_fragment_begin, once);
  assert.equal(skipDarkLights(once), once);
});

void test('a chunk without the direct light call is refused instead of left unguarded', (): void => {
  assert.throws((): string => skipDarkLights('void main() {}'), /no direct light call/);
});
