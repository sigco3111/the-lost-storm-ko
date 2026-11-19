import assert from 'node:assert/strict';
import { test } from 'node:test';
import markers from '../../data/markers.json' with { type: 'json' };
import type { MarkerKind } from './marker-types.ts';
import { markerLibrary } from './parse-markers.ts';
import { ContentError } from './read.ts';

const kind = { id: 'stone', model: 'models/world/waypoint.glb', surfaces: { stone: 'ashlar' }, solid: [], color: '#ffffff', glow: ['glyph'], focal: null, seal: null, veil: null, light: { intensity: 1, distance: 2, height: 1 }, shadow: 0, pick: { radius: 1, height: 1 }, label: 2, facing: 'camera', levels: { dormant: 0, awake: 0.5, aimed: 0.8, used: 1 } };
const roles = { waypoint: 'stone', checkpoint: 'stone', down: 'stone', up: 'stone' };

void test('a marker without an awakening never wakes, and one with it names its reach and its fallen pieces', (): void => {
  const plain: MarkerKind | undefined = markerLibrary({ roles, cameraYawDegrees: 45, kinds: [kind] }, 'markers').kinds.get('stone');
  assert.equal(plain?.awaken, null);
  const woken: MarkerKind | undefined = markerLibrary({ roles, cameraYawDegrees: 45, kinds: [{ ...kind, awaken: { radius: 4, pieces: [{ node: 'drum', fallen: 'drum_fallen' }] } }] }, 'markers').kinds.get('stone');
  assert.deepEqual(woken?.awaken, { radius: 4, pieces: [{ node: 'drum', fallen: 'drum_fallen' }] });
  assert.throws((): unknown => markerLibrary({ roles, cameraYawDegrees: 45, kinds: [{ ...kind, awaken: { radius: 0, pieces: [] } }] }, 'markers'), ContentError);
  assert.throws((): unknown => markerLibrary({ roles, cameraYawDegrees: 45, kinds: [{ ...kind, awaken: { radius: 4, pieces: [{ node: 'drum' }] } }] }, 'markers'), ContentError);
});

void test('every shipped waypoint wakes and the obelisk raises its fallen drum and crown', (): void => {
  const library = markerLibrary(markers, 'markers');
  for (const [id, found] of library.kinds) assert.equal(found.awaken !== null, id.startsWith('waypoint'), id);
  assert.deepEqual(library.kinds.get('waypoint_obelisk')?.awaken?.pieces.map((piece): string => piece.node), ['drum', 'crown']);
});
