import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FightPlan, FightRaw, FightWave } from '../src/bench/fight-bench.ts';
import type { FightArgs, FightMeta, FightReport, FrameStats, MetricDelta } from './fight-bench-report.ts';
import { compareLines, compareReports, compareWarnings, FIGHT_SCENARIO, fightArgs, fightPlan, fightProfileFor, fightReport, fightWaves, frameStats, isQuiet, percentile, planName, readRaw, readReport, reportLines, spread } from './fight-bench-report.ts';

const META: FightMeta = { plan: 'hall-brawl-v1', zone: 'hall_of_time', commit: 'abc1234', at: '2026-11-16T00:00:00.000Z', load: 3, quiet: true, capped: true, width: 1280, height: 800, scale: 2, warmupMs: 15000, measureMs: 40000 };

const RAW: FightRaw = {
  zone: 'hall_of_time',
  frames: [16, 17, 16, 18, 25, 40, 60, 16],
  calls: [100, 120, 110, 300],
  triangles: [1000, 2000, 1500, 4000],
  longTasks: [55, 70.5],
  start: { programs: 40, geometries: 300, textures: 80, heapMegabytes: 120 },
  end: { programs: 43, geometries: 310, textures: 80, heapMegabytes: 150.5 },
  peakLive: 52,
  kills: 140,
  hits: 2200,
  drops: 60,
  casts: 120,
  heroDeaths: 0,
  problems: [],
};

void test('percentile takes the nearest rank and an empty list gives zero', (): void => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95), 10);
  assert.equal(percentile([7], 0.99), 7);
  assert.equal(percentile([], 0.5), 0);
});

void test('frame stats count the slow frames and the average rate', (): void => {
  const stats: FrameStats = frameStats(RAW.frames);
  assert.equal(stats.frames, 8);
  assert.equal(stats.medianMs, 17);
  assert.equal(stats.worstMs, 60);
  assert.equal(stats.over20, 3);
  assert.equal(stats.over33, 2);
  assert.equal(stats.over50, 1);
  assert.equal(stats.averageFps, 38.46);
  assert.deepEqual(frameStats([]), { frames: 0, medianMs: 0, p95Ms: 0, p99Ms: 0, worstMs: 0, over20: 0, over33: 0, over50: 0, averageFps: 0 });
});

void test('spread gives the median and the largest value', (): void => {
  assert.deepEqual(spread([3, 1, 2, 9]), { median: 2, max: 9 });
});

void test('waves cycle through the mix at a fixed beat up to the last time', (): void => {
  const waves: FightWave[] = fightWaves([{ monster: 'a', count: 2 }, { monster: 'b', count: 1 }], 1000, 2500);
  assert.deepEqual(waves, [{ atMs: 0, monster: 'a', count: 2 }, { atMs: 1000, monster: 'b', count: 1 }, { atMs: 2000, monster: 'a', count: 2 }]);
  assert.deepEqual(fightWaves([], 1000, 5000), []);
});

void test('the plan is the same every time and stops spawning before the window ends', (): void => {
  const plan: FightPlan = fightPlan(false);
  assert.deepEqual(plan, fightPlan(false));
  assert.equal(plan.zone, FIGHT_SCENARIO.zone);
  assert.equal(plan.warmupMs + plan.measureMs, 55000);
  const last: FightWave | undefined = plan.waves.at(-1);
  assert.ok(last !== undefined && last.atMs <= plan.warmupMs + plan.measureMs - FIGHT_SCENARIO.lastWaveBeforeEndMs);
  assert.ok(fightPlan(true).measureMs < plan.measureMs);
  assert.equal(planName(true, false), 'hall-brawl-v1-short-uncapped');
});

void test('the plan spawns enough monsters for a heavy fight', (): void => {
  const plan: FightPlan = fightPlan(false);
  const spawned: number = plan.waves.reduce((sum: number, wave: FightWave): number => sum + wave.count, 0);
  assert.ok(spawned >= 60);
});

void test('arguments have defaults and reject a bad port or a lone --to', (): void => {
  const args: FightArgs = fightArgs([], {});
  assert.equal(args.port, 5471);
  assert.equal(args.short, false);
  assert.equal(args.compare, null);
  assert.equal(fightArgs(['--url', 'http://localhost:9/', '--short', '--uncapped', '--out', 'a.json'], {}).url, 'http://localhost:9');
  assert.equal(fightArgs([], { CHROME_PATH: '/x' }).chrome, '/x');
  assert.throws((): unknown => fightArgs(['--port', 'nope'], {}));
  assert.throws((): unknown => fightArgs(['--to', 'b.json'], {}));
  assert.throws((): unknown => fightArgs(['--out'], {}));
});

void test('the profile folder is fixed for a checkout', (): void => {
  assert.equal(fightProfileFor('/a'), fightProfileFor('/a'));
  assert.notEqual(fightProfileFor('/a'), fightProfileFor('/b'));
  assert.match(fightProfileFor('/a'), /^fight-bench-profile-[0-9a-f]{10}$/);
});

void test('the page result is read back exactly and bad data is refused', (): void => {
  assert.deepEqual(readRaw(JSON.parse(JSON.stringify(RAW))), RAW);
  assert.throws((): unknown => readRaw({ ...RAW, frames: ['x'] }));
});

void test('a report survives a round trip through JSON', (): void => {
  const report: FightReport = fightReport(RAW, META);
  assert.deepEqual(readReport(JSON.parse(JSON.stringify(report))), report);
  assert.equal(report.renderer.programsEnd - report.renderer.programsStart, 3);
  assert.deepEqual(report.problems, []);
});

void test('a report names a dead hero, a wrong zone and an empty fight', (): void => {
  const report: FightReport = fightReport({ ...RAW, zone: 'between', frames: [], kills: 0, heroDeaths: 2 }, META);
  assert.equal(report.problems.length, 4);
  assert.ok(reportLines(report).some((line: string): boolean => line.startsWith('problem: the hero died 2')));
});

void test('the table warns when the machine was busy', (): void => {
  assert.ok(!reportLines(fightReport(RAW, META)).some((line: string): boolean => line.startsWith('WARNING')));
  assert.ok(reportLines(fightReport(RAW, { ...META, quiet: false, load: 29 })).some((line: string): boolean => line.startsWith('WARNING')));
  assert.equal(isQuiet(3, false), true);
  assert.equal(isQuiet(3, true), false);
  assert.equal(isQuiet(12, false), false);
});

void test('compare gives the change and calls a lower frame time better', (): void => {
  const before: FightReport = fightReport(RAW, META);
  const after: FightReport = fightReport({ ...RAW, frames: RAW.frames.map((frame: number): number => frame / 2) }, { ...META, commit: 'def5678' });
  const median: MetricDelta | undefined = compareReports(before, after).find((entry: MetricDelta): boolean => entry.label === 'frame median ms');
  assert.deepEqual(median, { label: 'frame median ms', before: 17, after: 8.5, delta: -8.5, percent: -50, better: 'lower' });
  const lines: string[] = compareLines(before, after);
  assert.ok(lines.some((line: string): boolean => line.startsWith('frame median ms') && line.endsWith('better')));
  assert.deepEqual(compareWarnings(before, after), []);
});

void test('compare warns when the runs differ in shape, work or quiet', (): void => {
  const before: FightReport = fightReport(RAW, META);
  const after: FightReport = fightReport({ ...RAW, kills: 60 }, { ...META, capped: false, quiet: false });
  const warnings: string[] = compareWarnings(before, after);
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some((warning: string): boolean => warning.includes('capped')));
  assert.ok(warnings.some((warning: string): boolean => warning.includes('kills')));
});
