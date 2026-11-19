import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './parse-rigs.ts';
import { ContentError } from './read.ts';
import type { RigActionClip, RigDef } from './types.ts';
import { must } from '../../test/support.ts';

function withActions(actions: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'man',
    url: 'man.glb',
    clipFolder: 'clips',
    scale: 1,
    yawOffsetDegrees: 0,
    height: 1.8,
    rootMotionBone: null,
    gaits: [{ clip: 'Walk', groundSpeed: 1 }],
    clips: { idle: 'Idle', run: 'Run', hit: ['Hit'], death: ['Death'], actions },
    sockets: { hand_r: { bone: 'hand_r', position: [0, 0, 0], rotationDegrees: [0, 90, 0], scale: 1 } },
    hiddenNodes: [],
    bodyParts: {},
  };
}

void test('an action may name a private clip with its own impact, and one that names none has no private clip', (): void => {
  const parsed: RigDef = rig(withActions({ cast_bolt: { clip: 'Spell_Simple_Shoot', impactFraction: 0.35, private: { clip: 'mixamo_bolt', impactFraction: 0.25 } }, attack: { clip: 'Sword_Attack', impactFraction: 0.4 } }), 'rig');
  const bolt: RigActionClip = must(parsed.clips.actions['cast_bolt'], 'cast_bolt');
  const attack: RigActionClip = must(parsed.clips.actions['attack'], 'attack');
  assert.deepEqual(bolt.private, { clip: 'mixamo_bolt', impactFraction: 0.25 });
  assert.equal(bolt.clip, 'Spell_Simple_Shoot');
  assert.equal(attack.private, null);
});

void test('a private clip without a name or with an impact past its end is refused', (): void => {
  assert.throws((): unknown => rig(withActions({ cast_bolt: { clip: 'Spell_Simple_Shoot', impactFraction: 0.35, private: { impactFraction: 0.25 } } }), 'rig'), ContentError);
  assert.throws((): unknown => rig(withActions({ cast_bolt: { clip: 'Spell_Simple_Shoot', impactFraction: 0.35, private: { clip: 'mixamo_bolt', impactFraction: 1 } } }), 'rig'), ContentError);
});
