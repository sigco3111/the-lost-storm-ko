import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig, RIG_DEFAULTS } from './parse-rigs.ts';
import { ContentError } from './read.ts';

function source(): Record<string, unknown> {
  return {
    id: 'wight',
    url: 'wight.glb',
    clipFolder: 'clips',
    scale: 1,
    yawOffsetDegrees: 0,
    height: 1.8,
    rootMotionBone: null,
    gaits: [{ clip: 'Walk', groundSpeed: 1 }],
    clips: { idle: 'Idle', run: 'Run', hit: ['Hit'], death: ['Death'], actions: {} },
    sockets: {},
    hiddenNodes: [],
    bodyParts: {},
  };
}

void test('a rig keeps the worn skin as authored unless it names a skin colour', (): void => {
  assert.equal(rig(source(), 'rig').skin, RIG_DEFAULTS.skin);
  assert.equal(rig({ ...source(), skin: '#8a8578' }, 'rig').skin, '#8a8578');
});

void test('a skin that is not a #rrggbb colour is refused', (): void => {
  assert.throws((): unknown => rig({ ...source(), skin: 'grey' }, 'rig'), ContentError);
  assert.throws((): unknown => rig({ ...source(), skin: '#fff' }, 'rig'), ContentError);
});
