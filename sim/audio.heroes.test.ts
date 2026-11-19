import assert from 'node:assert/strict';
import { test } from 'node:test';
import { offset, shapeArena, shapeSkill } from '../test/shape-support.ts';
import type { SoundCue } from './audio.ts';
import { cuesForEvent } from './audio.ts';
import type { AudioDef } from './content/audio.ts';
import { loadAudio } from './content/audio.ts';
import type { Vec2 } from './math.ts';
import type { PlayerState, World, WorldEvent } from './world/types.ts';

const AWAY: Vec2 = { x: 3, z: 4 };

function swing(actorId: number): WorldEvent {
  return { type: 'skill_start', actorId, skill: shapeSkill('cleave'), direction: AWAY, windup: 0.1, recovery: 0.1 };
}

void test('a second hero swinging the same weapon sounds like the primary hero and is heard where it stands', (): void => {
  const world: World = shapeArena(['cleave']);
  const audio: AudioDef = loadAudio(world.content);
  const second: PlayerState = { ...world.player, id: world.nextId, pos: offset(6, 0), party: 1 };
  world.nextId += 1;
  world.heroes.push(second);
  const own: readonly SoundCue[] = cuesForEvent(audio, world, swing(world.player.id));
  const theirs: readonly SoundCue[] = cuesForEvent(audio, world, swing(second.id));
  assert.ok(own.length > 0);
  assert.deepEqual(theirs.map((cue: SoundCue): string => cue.sound), own.map((cue: SoundCue): string => cue.sound));
  assert.deepEqual(theirs[0]?.position, second.pos);
});
