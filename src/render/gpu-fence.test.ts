import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FenceContext, GpuQueue } from './gpu-fence.ts';
import { createGpuQueue } from './gpu-fence.ts';

interface FakeFences extends FenceContext {
  readonly deleted: number;
  readonly flushes: number;
  finish(count: number): void;
  lose(): void;
  forget(): void;
}

function fakeFences(): FakeFences {
  const signalled: Set<WebGLSync> = new Set<WebGLSync>();
  const placed: WebGLSync[] = [];
  let deleted: number = 0;
  let flushes: number = 0;
  let lost: boolean = false;
  let forgotten: boolean = false;
  return {
    SYNC_GPU_COMMANDS_COMPLETE: 1,
    SYNC_STATUS: 2,
    SIGNALED: 3,
    UNSIGNALED: 4,
    isContextLost(): boolean {
      return lost;
    },
    get deleted(): number {
      return deleted;
    },
    get flushes(): number {
      return flushes;
    },
    fenceSync(): WebGLSync {
      const sync: WebGLSync = {};
      placed.push(sync);
      return sync;
    },
    getSyncParameter(sync: WebGLSync): number | null {
      if (forgotten) return null;
      return signalled.has(sync) ? 3 : 4;
    },
    deleteSync(sync: WebGLSync | null): void {
      if (sync !== null) deleted += 1;
    },
    flush(): void {
      flushes += 1;
    },
    lose(): void {
      lost = true;
    },
    forget(): void {
      forgotten = true;
    },
    finish(count: number): void {
      for (const sync of placed.splice(0, count)) signalled.add(sync);
    },
  };
}

void test('every drawn frame waits in the queue until the GPU has finished it, oldest first', (): void => {
  const gl: FakeFences = fakeFences();
  const queue: GpuQueue = createGpuQueue(gl);
  assert.equal(queue.waiting(), 0);
  queue.mark();
  queue.mark();
  queue.mark();
  assert.equal(gl.flushes, 3);
  assert.equal(queue.waiting(), 3);
  gl.finish(2);
  assert.equal(queue.waiting(), 1);
  assert.equal(gl.deleted, 2);
  gl.finish(1);
  assert.equal(queue.waiting(), 0);
});

void test('without fences, as on WebGL 1, nothing ever waits', (): void => {
  const queue: GpuQueue = createGpuQueue(null);
  queue.mark();
  queue.mark();
  assert.equal(queue.waiting(), 0);
});

void test('a lost context drops every open fence, so the queue never wedges', (): void => {
  const gl: FakeFences = fakeFences();
  const queue: GpuQueue = createGpuQueue(gl);
  queue.mark();
  queue.mark();
  gl.lose();
  assert.equal(queue.waiting(), 0);
});

void test('a fence whose status cannot be read any more is dropped, not waited on', (): void => {
  const gl: FakeFences = fakeFences();
  const queue: GpuQueue = createGpuQueue(gl);
  queue.mark();
  queue.mark();
  gl.forget();
  assert.equal(queue.waiting(), 0);
});
