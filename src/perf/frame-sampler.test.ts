import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PERF_PROTOCOL } from '../backend/api.ts';
import type { PerfWindowBody } from '../backend/api.ts';
import { createFrameSampler, FRAME_SAMPLER, fineIndex, fineQuantile, protocolHistogram } from './frame-sampler.ts';
import type { FrameSampler } from './frame-sampler.ts';

interface Run {
  readonly sampler: FrameSampler;
  readonly windows: PerfWindowBody[];
  readonly clock: { now: number };
}

function start(): Run {
  const windows: PerfWindowBody[] = [];
  return { sampler: createFrameSampler((window: PerfWindowBody): void => void windows.push(window)), windows, clock: { now: 1000 } };
}

function frames(run: Run, count: number, ms: number, zone: string = 'hideout', monsters: number = 0): void {
  for (let index: number = 0; index < count; index += 1) {
    run.clock.now += ms;
    run.sampler.frame(run.clock.now, true, zone, monsters);
  }
}

function only(run: Run): PerfWindowBody {
  assert.equal(run.windows.length, 1);
  const window: PerfWindowBody | undefined = run.windows[0];
  assert.ok(window !== undefined);
  return window;
}

void test('fine buckets are a millisecond wide below 100 ms, ten wide to a second, then one overflow', (): void => {
  assert.deepEqual([fineIndex(0), fineIndex(16.7), fineIndex(99.9), fineIndex(100), fineIndex(109), fineIndex(110), fineIndex(999), fineIndex(1000), fineIndex(60_000)], [0, 16, 99, 100, 100, 101, 189, 190, 190]);
});

void test('the fine histogram folds into the fixed protocol buckets, which line up with fine edges', (): void => {
  const fine: Uint32Array = new Uint32Array(fineIndex(Infinity) + 1);
  fine[fineIndex(8.3)] = 5;
  fine[fineIndex(16.7)] = 50;
  fine[fineIndex(33.4)] = 3;
  fine[fineIndex(140)] = 1;
  fine[fineIndex(2400)] = 1;
  const histogram: number[] = protocolHistogram(fine);
  assert.equal(histogram.length, PERF_PROTOCOL.histogramEdgesMs.length + 1);
  assert.deepEqual(histogram, [0, 5, 0, 50, 0, 0, 3, 0, 0, 0, 0, 1, 0, 0, 0, 1]);
  assert.equal(fineQuantile(fine, 60, 0.5, 2400), 16.5);
  assert.equal(fineQuantile(fine, 60, 0.98, 2400), 145);
  assert.equal(fineQuantile(fine, 60, 1, 2400), 2400);
});

void test('a steady minute closes as one timed window with its frames, quantiles and render facts', (): void => {
  const run: Run = start();
  run.sampler.frame(run.clock.now, true, 'hideout', 0);
  assert.equal(run.sampler.wantsMeasure(run.clock.now), true);
  assert.equal(run.sampler.wantsMeasure(run.clock.now + 10), false);
  run.sampler.measured({ draws: 210, triangles: 140_000, textures: 52, geometries: 141, width: 488, height: 1055, pixelRatio: 1.25 });
  run.sampler.measured({ draws: 180, triangles: 90_000, textures: 53, geometries: 140, width: 488, height: 1055, pixelRatio: 1.25 });
  run.sampler.note('rearm');
  frames(run, 3580, 16.7, 'hideout', 3);
  frames(run, 1, 120, 'hideout', 5);
  frames(run, 6, 16.7, 'hideout', 3);
  const window: PerfWindowBody = only(run);
  assert.equal(window.end, 'time');
  assert.equal(window.zone, 'hideout');
  assert.equal(window.frames, 3587);
  assert.equal(window.ms, Math.round(3586 * 16.7 + 120));
  assert.equal(window.p50, 16.5);
  assert.equal(window.p99, 16.5);
  assert.equal(window.worst, 120);
  assert.deepEqual(window.over, [1, 1, 1, 0]);
  assert.equal(window.stallMs, 120);
  assert.equal(window.monsters, 5);
  assert.deepEqual([window.draws, window.triangles, window.textures, window.geometries, window.canvas, window.pixelRatio], [210, 140_000, 53, 140, [488, 1055], 1.25]);
  assert.deepEqual([window.rearms, window.offers, window.lost, window.restored, window.hidden], [1, 0, 0, 0, false]);
  assert.equal(window.histogram.reduce((sum: number, count: number): number => sum + count, 0), 3587);
});

void test('the longest stall is the longest unbroken run of slow frames', (): void => {
  const run: Run = start();
  frames(run, 20, 16.7);
  frames(run, 3, 200);
  frames(run, 1, 16.7);
  frames(run, 2, 60);
  run.sampler.end(run.clock.now, 'left');
  const window: PerfWindowBody = only(run);
  assert.equal(window.stallMs, 600);
  assert.equal(window.end, 'left');
  assert.deepEqual(window.over, [5, 5, 3, 0]);
});

void test('a zone change closes the window under the old zone and opens one for the new', (): void => {
  const run: Run = start();
  frames(run, 30, 16.7, 'stillhold');
  frames(run, 30, 16.7, 'hideout');
  run.sampler.end(run.clock.now, 'page');
  assert.deepEqual(
    run.windows.map((window: PerfWindowBody): readonly [string, string, number] => [window.zone, window.end, window.frames]),
    [
      ['stillhold', 'zone', 29],
      ['hideout', 'page', 30],
    ],
  );
});

void test('frames out of play or while hidden are not counted, and the gap they leave is not a frame', (): void => {
  const run: Run = start();
  frames(run, 20, 16.7);
  run.clock.now += 5000;
  run.sampler.frame(run.clock.now, false, 'hideout', 0);
  frames(run, 20, 16.7);
  run.sampler.hidden();
  run.clock.now += 30_000;
  frames(run, 20, 16.7);
  run.sampler.end(run.clock.now, 'hidden');
  const window: PerfWindowBody = only(run);
  assert.equal(window.frames, 57);
  assert.equal(window.worst, 16.7);
  assert.equal(window.hidden, true);
});

void test('a window with too few frames is dropped, and its events wait for the next window', (): void => {
  const run: Run = start();
  run.sampler.note('lost');
  run.sampler.note('restored');
  frames(run, FRAME_SAMPLER.minFrames - 1, 16.7);
  run.sampler.end(run.clock.now, 'hidden');
  assert.equal(run.windows.length, 0);
  frames(run, FRAME_SAMPLER.minFrames + 1, 16.7);
  run.sampler.end(run.clock.now, 'left');
  const window: PerfWindowBody = only(run);
  assert.deepEqual([window.lost, window.restored, window.hidden], [1, 1, false]);
});
