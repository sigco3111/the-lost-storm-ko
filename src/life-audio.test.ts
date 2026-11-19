import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AudioDef } from '../sim/content/audio.ts';
import { loadAudio } from '../sim/content/audio.ts';
import { loadContent } from '../sim/content/content.ts';
import { cuesForLife } from '../sim/audio.ts';
import type { SoundCue } from '../sim/audio.ts';
import { lifeSounds } from './life-audio.ts';

const audio: AudioDef = loadAudio(loadContent());

void test('bats leaving a roost sound at the roost, and a lone bat crossing sounds where it is', (): void => {
  const heard = lifeSounds([
    { type: 'bats-disturbed', x: 12, y: 1, z: 30, count: 3 },
    { type: 'bat-flyby', x: 5, y: 2, z: 6 },
  ]);
  assert.deepEqual(heard, [
    { event: 'bats_disturbed', at: { x: 12, z: 30 } },
    { event: 'bat_flyby', at: { x: 5, z: 6 } },
  ]);
});

void test('a disturbed roost plays wing flaps and a squeak with a long wait before the next squeak, a flyby only wings', (): void => {
  const disturbed: readonly SoundCue[] = cuesForLife(audio, 'bats_disturbed', { x: 12, z: 30 });
  assert.deepEqual(disturbed.map((cue: SoundCue): string => cue.sound), ['bat_flutter', 'bat_squeak']);
  assert.ok(disturbed.every((cue: SoundCue): boolean => cue.volume <= 0.5));
  assert.ok((disturbed[1]?.cooldown ?? 0) >= 5);
  assert.deepEqual(disturbed[0]?.position, { x: 12, z: 30 });
  const flyby: readonly SoundCue[] = cuesForLife(audio, 'bat_flyby', { x: 5, z: 6 });
  assert.deepEqual(flyby.map((cue: SoundCue): string => cue.sound), ['bat_flutter']);
});
