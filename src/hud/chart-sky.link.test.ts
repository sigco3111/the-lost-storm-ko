import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkPhase } from './chart-sky.ts';
import type { LinkProbe } from './chart-sky.ts';

interface CountedProbe extends LinkProbe {
  readonly statusReads: () => number;
}

function probeOf(complete: boolean, linked: boolean): CountedProbe {
  let reads: number = 0;
  return {
    complete: (): boolean => complete,
    linked: (): boolean => {
      reads += 1;
      return linked;
    },
    statusReads: (): number => reads,
  };
}

void test('a sky program still compiling is never asked whether it linked, so the main thread does not wait on the GPU', (): void => {
  const probe: CountedProbe = probeOf(false, true);
  assert.equal(linkPhase(probe), 'linking');
  assert.equal(linkPhase(probe), 'linking');
  assert.equal(probe.statusReads(), 0);
});

void test('a finished sky program is ready when it linked and broken when it did not', (): void => {
  assert.equal(linkPhase(probeOf(true, true)), 'ready');
  assert.equal(linkPhase(probeOf(true, false)), 'broken');
});
