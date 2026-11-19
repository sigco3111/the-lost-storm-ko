import assert from 'node:assert/strict';
import { test } from 'node:test';
import audioJson from '../../data/audio.json' with { type: 'json' };
import type { AudioDef } from './audio.ts';
import { knownIdsOf, loadAudio, parseAudio } from './audio.ts';
import { soundProblems } from './audio-coverage.ts';
import { loadContent } from './content.ts';
import type { Content } from './types.ts';

const content: Content = loadContent();

function variant(change: (draft: Record<string, unknown>) => void): AudioDef {
  const copy: unknown = JSON.parse(JSON.stringify(audioJson));
  if (typeof copy !== 'object' || copy === null) throw new Error('audio.json is not an object');
  const draft: Record<string, unknown> = Object.fromEntries(Object.entries(copy));
  change(draft);
  return parseAudio(draft, knownIdsOf(content));
}

function without(draft: Record<string, unknown>, table: string, skill: string): void {
  const value: unknown = draft[table];
  if (typeof value !== 'object' || value === null) throw new Error(`audio.json has no ${table}`);
  draft[table] = Object.fromEntries(Object.entries(value).filter(([key]: [string, unknown]): boolean => key !== skill));
}

void test('every skill and every form has a sound when it starts, and every lasting area has one while it stands and when it ends', (): void => {
  assert.deepEqual(soundProblems(content, loadAudio(content)), []);
});

void test('a skill that starts in silence is reported, and a silent skill listed on purpose is not', (): void => {
  const bare: AudioDef = variant((draft: Record<string, unknown>): void => {
    without(draft, 'areaStart', 'standing_storm');
    without(draft, 'areaStart', 'thunderclap_standing');
    without(draft, 'areaStart', 'banked_fire');
    without(draft, 'skillStart', 'cleave');
  });
  const problems: readonly string[] = soundProblems(content, bare);
  assert.ok(problems.includes('standing_storm has no sound when it starts'));
  assert.ok(problems.includes('cleave has no sound when it starts'));
  assert.ok(!problems.includes('umbra has no sound when it starts'));
  const allowed: AudioDef = variant((draft: Record<string, unknown>): void => {
    without(draft, 'skillStart', 'cleave');
    draft['silent'] = { ground_heat: 'a surface burn', cleave: 'left silent on purpose' };
  });
  assert.ok(!soundProblems(content, allowed).some((problem: string): boolean => problem.startsWith('cleave ')));
});

void test('a change is heard through the skill it changes, so a variant needs no cue of its own', (): void => {
  const bare: AudioDef = variant((draft: Record<string, unknown>): void => {
    without(draft, 'skillStart', 'quarrel');
    without(draft, 'skillStart', 'quarrel_fan');
    without(draft, 'skillStart', 'quarrel_heave');
  });
  assert.deepEqual(soundProblems(content, bare), []);
});

void test('a lasting area that pulses without a sound, or ends without one, is reported', (): void => {
  const quiet: AudioDef = variant((draft: Record<string, unknown>): void => {
    without(draft, 'areaPulse', 'standing_storm');
    without(draft, 'areaEnd', 'banked_fire');
  });
  const problems: readonly string[] = soundProblems(content, quiet);
  assert.ok(problems.includes('standing_storm stands for 2.5 s and pulses every 0.5 s but has no sound while it stands'));
  assert.ok(problems.includes('banked_fire is a lasting area but has no sound when it ends'));
});

void test('a skill listed as silent that does start with a sound, or that does not exist, is reported', (): void => {
  const listed: AudioDef = variant((draft: Record<string, unknown>): void => {
    draft['silent'] = { cleave: 'wrongly listed' };
  });
  assert.ok(soundProblems(content, listed).includes('cleave is listed as silent but has a start sound'));
  assert.throws(
    (): AudioDef =>
      variant((draft: Record<string, unknown>): void => {
        draft['silent'] = { not_a_skill: 'nothing' };
      }),
    /unknown skill/,
  );
});
