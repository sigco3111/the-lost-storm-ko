import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Object3D, Quaternion, Vector3 } from 'three';
import type { WakePiece, WakePose, WakeState } from './marker-awaken.ts';
import { advanceWake, climbHeight, landedBetween, landingShare, MARKER_AWAKEN, posePiece, pulseFlare, startWake, wakePieces, wakePose, wakeShare } from './marker-awaken.ts';

const FRAME: number = 1 / 60;

function run(pieces: number): WakePose[] {
  const poses: WakePose[] = [];
  let state: WakeState = advanceWake(startWake(false), true, FRAME);
  while (state.type === 'waking') {
    poses.push(wakePose(wakeShare(state), pieces));
    state = advanceWake(state, true, FRAME);
  }
  poses.push(wakePose(wakeShare(state), pieces));
  return poses;
}

void test('a waypoint the hero has already found starts awake, and one he has not starts asleep', (): void => {
  assert.deepEqual(startWake(true), { type: 'awake' });
  assert.deepEqual(startWake(false), { type: 'asleep' });
  assert.equal(wakeShare(startWake(true)), 1);
  assert.deepEqual(wakePose(1, 2), { pieces: [1, 1], climb: 1, glow: 1, crystal: 1, pulse: null });
  assert.deepEqual(wakePose(0, 2), { pieces: [0, 0], climb: 0, glow: 0, crystal: 0, pulse: null });
});

void test('the awakening plays once, over its length, and never jumps from one frame to the next', (): void => {
  const poses: WakePose[] = run(2);
  assert.ok(Math.abs(poses.length * FRAME - MARKER_AWAKEN.seconds) < FRAME * 2);
  for (let index: number = 1; index < poses.length; index += 1) {
    const before: WakePose | undefined = poses[index - 1];
    const after: WakePose | undefined = poses[index];
    if (before === undefined || after === undefined) continue;
    for (const key of ['climb', 'glow', 'crystal'] as const) assert.ok(Math.abs(after[key] - before[key]) < 0.06, `${key} at frame ${index}`);
    after.pieces.forEach((placed: number, piece: number): void => assert.ok(Math.abs(placed - (before.pieces[piece] ?? placed)) < 0.12, `piece ${piece} at frame ${index}`));
  }
  const last: WakePose | undefined = poses[poses.length - 1];
  assert.deepEqual(last, { pieces: [1, 1], climb: 1, glow: 1, crystal: 1, pulse: null });
});

void test('the pieces rise and settle before the light climbs, and the stone\'s own light flares on the way', (): void => {
  const poses: WakePose[] = run(2);
  const overshoot: number = Math.max(...poses.map((pose: WakePose): number => pose.pieces[0] ?? 0));
  assert.ok(overshoot > 1 && overshoot < 1.15);
  const landing: number = landingShare(2);
  const atLanding: WakePose = wakePose(landing, 2);
  assert.ok(atLanding.pieces.every((placed: number): boolean => Math.abs(placed - 1) < 1e-9));
  assert.ok(atLanding.climb < 0.5);
  assert.ok(poses.some((pose: WakePose): boolean => pulseFlare(pose.pulse) > 0.9));
  assert.equal(pulseFlare(null), 0);
  assert.equal(pulseFlare(0), 0);
  assert.ok(pulseFlare(1) < 1e-9);
});

void test('the camera kicks once, as the last piece lands, and never for a waypoint with no pieces to land', (): void => {
  let kicks: number = 0;
  let state: WakeState = startWake(false);
  for (let frame: number = 0; frame < 400; frame += 1) {
    const before: number = wakeShare(state);
    state = advanceWake(state, true, FRAME);
    if (landedBetween(before, wakeShare(state), 2)) kicks += 1;
  }
  assert.equal(kicks, 1);
  assert.equal(landedBetween(0, 1, 0), false);
});

void test('the light on the carvings climbs from below the floor to past the top and then stays open', (): void => {
  assert.ok(climbHeight(2, 3, 0, false) < 2);
  assert.ok(climbHeight(2, 3, 1, false) > 5 + MARKER_AWAKEN.climbFeather);
  assert.equal(climbHeight(2, 3, 0.5, true), MARKER_AWAKEN.climbOpen);
});

void test('a fallen piece lies at its fallen mark and comes to rest where the model put it', (): void => {
  const scene: Object3D = new Object3D();
  const drum: Object3D = new Object3D();
  drum.name = 'drum';
  drum.position.set(0, 1.6, -1.6);
  const fallen: Object3D = new Object3D();
  fallen.name = 'drum_fallen';
  fallen.position.set(0.8, 0.3, -0.8);
  fallen.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 1.5);
  scene.add(drum, fallen);
  const pieces: WakePiece[] = wakePieces(scene, [{ node: 'missing', fallen: 'drum_fallen' }, { node: 'drum', fallen: 'drum_fallen' }]);
  assert.equal(pieces.length, 1);
  const piece: WakePiece | undefined = pieces[0];
  assert.ok(piece !== undefined);
  assert.equal(piece.index, 1);
  posePiece(piece, 0);
  assert.ok(drum.position.distanceTo(new Vector3(0.8, 0.3, -0.8)) < 1e-9);
  assert.ok(drum.quaternion.angleTo(fallen.quaternion) < 1e-6);
  posePiece(piece, 0.5);
  assert.ok(drum.position.y > 0.95 + MARKER_AWAKEN.arc * 0.9);
  posePiece(piece, 1);
  assert.ok(drum.position.distanceTo(new Vector3(0, 1.6, -1.6)) < 1e-9);
  assert.ok(drum.quaternion.angleTo(new Quaternion()) < 1e-6);
});
