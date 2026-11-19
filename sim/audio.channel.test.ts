import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { channelSound, cuesForEvent } from './audio.ts';
import type { SoundCue } from './audio.ts';
import type { AudioDef } from './content/audio.ts';
import { loadAudio } from './content/audio.ts';
import { loadContent } from './content/content.ts';
import type { Content, SkillDef } from './content/types.ts';
import { arena } from '../test/arena-support.ts';
import type { World, WorldEvent } from './world/types.ts';

const content: Content = loadContent();
const audio: AudioDef = loadAudio(content);
const AIM = { x: 1, z: 0 };

function skill(id: string): SkillDef {
  return must(content.skills.get(id), id);
}

function started(id: string, actorId: number): WorldEvent {
  return { type: 'skill_start', actorId, skill: skill(id), direction: AIM, windup: 0.1, recovery: 0.1 };
}

const CHANNELS: readonly SkillDef[] = [...content.skills.values()].filter((def: SkillDef): boolean => def.press?.type === 'channel');

void test('every held skill\'s start sound belongs to its channel, and the channel\'s end releases it', (): void => {
  const world: World = arena(1);
  assert.ok(CHANNELS.length > 0);
  for (const def of CHANNELS) {
    const start: WorldEvent = started(def.id, world.player.id);
    assert.deepEqual(channelSound(start), { type: 'hold', actorId: world.player.id }, def.id);
    const cues: readonly SoundCue[] = cuesForEvent(audio, world, start);
    assert.ok(cues.length > 0, `${def.id} has no start sound`);
    const end: WorldEvent = { type: 'channel_end', actorId: world.player.id, skill: def };
    assert.deepEqual(channelSound(end), { type: 'release', actorId: world.player.id }, def.id);
    assert.deepEqual(cuesForEvent(audio, world, end), []);
  }
});

void test('a skill that is not held, a charged one among them, plays its start sound loose', (): void => {
  const world: World = arena(1);
  for (const id of ['cleave', 'cleave_heave', 'quarrel_heave', 'storm_bolt']) {
    assert.equal(channelSound(started(id, world.player.id)), null, id);
  }
  assert.equal(channelSound({ type: 'skill_interrupt', actorId: world.player.id }), null);
});
