import assert from 'node:assert/strict';
import { test } from 'node:test';
import { patienceFor, PROFILE, profileFor, readWalk, SLOW_WAIT, slowLine, UNSLOWED, WALK_DEFAULTS, walkArgs, walkLines, withAlarms } from './walk-report.ts';

void test('the walk takes a build address, a Chrome and a port, and falls back to a local dev server and the usual Chrome', (): void => {
  assert.deepEqual(walkArgs([], {}), { url: null, chrome: WALK_DEFAULTS.chrome, port: WALK_DEFAULTS.port, hero: WALK_DEFAULTS.hero, slow: UNSLOWED });
  assert.deepEqual(walkArgs(['--url', 'http://localhost:5173/', '--port', '6001', '--hero', 'man'], { CHROME_PATH: '/opt/chrome' }), { url: 'http://localhost:5173', chrome: '/opt/chrome', port: 6001, hero: 'man', slow: UNSLOWED });
  assert.throws((): unknown => walkArgs(['--hero', 'Wo man'], {}));
  assert.equal(walkArgs(['--chrome', '/x/chrome'], { CHROME_PATH: '/opt/chrome' }).chrome, '/x/chrome');
  assert.throws((): unknown => walkArgs(['--port', 'abc'], {}));
});

void test('a walk report from the page is read strictly and printed one look per line', (): void => {
  const summary = readWalk({ ok: false, looks: [{ zone: 'hall_of_time', afterMs: 2500, live: 12, missing: [] }, { zone: 'keepers_gate', afterMs: 9000, live: 1, missing: ['timekeeper_gatekeeper#17'] }], problems: ['keepers_gate after 9000 ms: 1 of 1 live monsters have no body (timekeeper_gatekeeper#17)'] });
  const lines: string[] = walkLines(summary);
  assert.match(lines[0] ?? '', /^ok {3}hall_of_time .* 12\/12 drawn$/);
  assert.match(lines[1] ?? '', /^FAIL keepers_gate .* 0\/1 drawn {2}missing: timekeeper_gatekeeper#17$/);
  assert.equal(lines.at(-1), 'BODY WALK FAILED');
  assert.throws((): unknown => readWalk({ ok: 'yes', looks: [], problems: [] }));
  assert.throws((): unknown => readWalk({ ok: true, looks: [{ zone: 'x' }], problems: [] }));
});

void test('the slow mode throttles the CPU and the network, holds a file once and fails a file a number of times or always', (): void => {
  const slow = walkArgs(['--cpu', '4', '--kbps', '1600', '--hold', 'Throw.glb=40000', '--hold', 'woman.glb=5000', '--fail', 'Zombie_Idle_Loop.glb=2', '--fail', 'scrap_javelin'], {}).slow;
  assert.deepEqual(slow, {
    cpuRate: 4,
    kbps: 1600,
    holds: [
      { pattern: 'Throw.glb', ms: 40000 },
      { pattern: 'woman.glb', ms: 5000 },
    ],
    fails: [
      { pattern: 'Zombie_Idle_Loop.glb', times: 2 },
      { pattern: 'scrap_javelin', times: Number.POSITIVE_INFINITY },
    ],
  });
  assert.equal(slowLine(slow), 'slowed: cpu 4x slower, network 1600 kbps, hold Throw.glb 40000 ms, hold woman.glb 5000 ms, fail Zombie_Idle_Loop.glb 2 times, fail scrap_javelin always');
  assert.equal(slowLine(UNSLOWED), null);
  assert.throws((): unknown => walkArgs(['--cpu', '0'], {}));
  assert.throws((): unknown => walkArgs(['--hold', 'Throw.glb'], {}));
  assert.throws((): unknown => walkArgs(['--hold', '=40000'], {}));
  assert.throws((): unknown => walkArgs(['--fail', 'x=-1'], {}));
  assert.throws((): unknown => walkArgs(['--fail', 'Throw.glb=0.4'], {}));
  assert.throws((): unknown => walkArgs(['--fail', 'Throw.glb=1.5'], {}));
  assert.throws((): unknown => walkArgs(['--cpu'], {}));
  assert.throws((): unknown => walkArgs(['--hold', '--cpu', '4'], {}));
  assert.throws((): unknown => walkArgs(['--kbps', '--hold', 'Throw.glb=1'], {}));
});

void test('each checkout walks with its own fixed Chrome profile, so two walks never share one and runs never add folders', (): void => {
  const here: string = profileFor('/work/the-lost-storm/');
  assert.equal(profileFor('/work/the-lost-storm/'), here);
  assert.notEqual(profileFor('/work/the-lost-storm/.claude/worktrees/other/'), here);
  assert.match(here, new RegExp(`^${PROFILE.base}-[0-9a-f]{${PROFILE.hashLength}}$`));
});

void test('a slowed walk waits longer for the world: the slowed factor times the CPU rate, plus every held file', (): void => {
  assert.equal(patienceFor(UNSLOWED, 30000), 30000);
  assert.equal(patienceFor(walkArgs(['--hold', 'Throw.glb=40000'], {}).slow, 30000), 30000 * SLOW_WAIT.slowedFactor + 40000);
  assert.equal(patienceFor(walkArgs(['--cpu', '4', '--hold', 'a.glb=1000', '--hold', 'b.glb=2000'], {}).slow, 30000), 30000 * 4 * SLOW_WAIT.slowedFactor + 3000);
  assert.ok(patienceFor(walkArgs(['--kbps', '800'], {}).slow, 30000) > 30000);
});

void test('a walk fails when the page says a live monster had nothing drawable, even if every look counted it drawn', (): void => {
  const passed = { ok: true, looks: [{ zone: 'hall_of_time', afterMs: 900, live: 4, missing: [] }], problems: [] } as const;
  const warned: string = 'warning: Monster unfinished_thrower (#21) was alive with nothing drawable; it falls back to its bare body';
  const failed = withAlarms(passed, ['warning: Rig unfinished arrived late, after 2 tries', warned]);
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.problems, [`the page's safety net fired: ${warned}`]);
  assert.equal(walkLines(failed).at(-1), 'BODY WALK FAILED');
  assert.deepEqual(withAlarms(passed, ['warning: Rig unfinished arrived late, after 2 tries']), passed);
});
