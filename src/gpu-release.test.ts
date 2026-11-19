import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGpuRegistry } from './gpu-release.ts';
import type { GpuRegistry } from './gpu-release.ts';

void test('releasing frees every held context once, in the order they were held', (): void => {
  const registry: GpuRegistry = createGpuRegistry();
  const freed: string[] = [];
  registry.hold((): void => void freed.push('stage'));
  registry.hold((): void => void freed.push('sky'));
  registry.release();
  registry.release();
  assert.deepEqual(freed, ['stage', 'sky']);
  assert.equal(registry.released, true);
});

void test('a holder that lets go is not freed again', (): void => {
  const registry: GpuRegistry = createGpuRegistry();
  const freed: string[] = [];
  const letGo: () => void = registry.hold((): void => void freed.push('thumbnails'));
  registry.hold((): void => void freed.push('stage'));
  letGo();
  registry.release();
  assert.deepEqual(freed, ['stage']);
});

void test('one holder that throws does not keep the others from being freed', (): void => {
  const registry: GpuRegistry = createGpuRegistry();
  const freed: string[] = [];
  registry.hold((): void => {
    throw new Error('already lost');
  });
  registry.hold((): void => void freed.push('stage'));
  registry.release();
  assert.deepEqual(freed, ['stage']);
});

void test('a context made after the release is freed at once', (): void => {
  const registry: GpuRegistry = createGpuRegistry();
  registry.release();
  const freed: string[] = [];
  registry.hold((): void => void freed.push('late'));
  assert.deepEqual(freed, ['late']);
});
