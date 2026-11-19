import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Group, Object3D, PointLight } from 'three';
import { AdditiveBlending, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadContent } from '../../sim/content/content.ts';
import { must } from '../../test/support.ts';
import { groundContact } from './lobby-contact.ts';
import { groundHeight } from './lobby-ground.ts';
import { createSetDressing, featherShare, lampFlicker, lampLights, LOBBY_SCENERY, pieceMatrix, pieceMatrixInto, pieceSeat, stepFlash, strikeShape, swayAngle } from './lobby-scenery.ts';
import type { FlashState, SetDressing } from './lobby-scenery.ts';
import { LOBBY_SETS, setMounds } from './lobby-sets.ts';
import type { Flash, Lamp, LobbySet, SetPiece } from './lobby-sets.ts';

const STONES: LobbySet = must(LOBBY_SETS.sets.get('stones'), 'the stones set');

void test('the rocks of the first lobby stand where they always stood, bedded a fifth of their size into their own rise', (): void => {
  const mounds = setMounds(STONES);
  assert.equal(mounds.length, STONES.pieces.length);
  for (const piece of STONES.pieces) {
    assert.ok(Math.abs(pieceSeat(piece, mounds) - (groundHeight(piece.x, piece.z, mounds) - 0.2 * piece.size)) < 1e-9, piece.prop);
    assert.equal(STONES.stone, 'black_rock');
  }
});

void test('a piece is placed on the ground under it, turned, tilted and sized from its data', (): void => {
  const piece: SetPiece = { prop: 'castle_column', x: 4, z: -12, y: 0.5, yawDegrees: 90, pitchDegrees: 0, rollDegrees: 0, size: 2, sink: 0.1, mound: false, swayDegrees: 0, skirt: true };
  const matrix = pieceMatrix(piece, 1.5, [], 0);
  const origin: Vector3 = new Vector3().setFromMatrixPosition(matrix);
  assert.ok(Math.abs(origin.y - (groundHeight(4, -12, []) - 0.1 + 0.5)) < 1e-9);
  assert.ok(Math.abs(new Vector3().setFromMatrixScale(matrix).x - 3) < 1e-9);
  const across: Vector3 = new Vector3(1, 0, 0).transformDirection(matrix);
  assert.ok(Math.abs(across.z + 1) < 1e-9, 'a quarter turn sends the model\'s width away from the camera');
  const hanging: Vector3 = new Vector3(0, 1, 0).transformDirection(pieceMatrix({ ...piece, pitchDegrees: 180 }, 1, [], 0));
  assert.ok(hanging.y < -0.999, 'a piece turned over hangs down');
});

void test('a swaying piece is placed into a kept matrix, the same as a fresh one', (): void => {
  const piece: SetPiece = { prop: 'banner_blue', x: 2, z: -9, y: 0, yawDegrees: 30, pitchDegrees: 10, rollDegrees: 5, size: 1.2, sink: 0, mound: false, swayDegrees: 3, skirt: false };
  const kept: Matrix4 = new Matrix4();
  const written: Matrix4 = pieceMatrixInto(kept, piece, 2, [], 0.04);
  assert.equal(written, kept);
  assert.deepEqual(kept.elements, pieceMatrix(piece, 2, [], 0.04).elements);
  pieceMatrixInto(kept, piece, 2, [], -0.04);
  assert.deepEqual(kept.elements, pieceMatrix(piece, 2, [], -0.04).elements);
});

void test('a banner sways a few degrees and comes back, and a still piece never moves', (): void => {
  const banner: SetPiece = { prop: 'banner_blue', x: 0, z: -12, y: 0, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, size: 1, sink: 0, mound: false, swayDegrees: 3, skirt: false };
  const angles: number[] = Array.from({ length: 200 }, (_: unknown, step: number): number => swayAngle(banner, step * 0.05, 0));
  assert.ok(Math.max(...angles) <= (3 * Math.PI) / 180 + 1e-9 && Math.min(...angles) < 0 && Math.max(...angles) > 0);
  assert.equal(swayAngle({ ...banner, swayDegrees: 0 }, 3.3, 2), 0);
});

void test('far lightning strikes now and then, rises in a blink, fades, and flickers once more before it is gone', (): void => {
  assert.equal(strikeShape(-1), 0);
  assert.ok(strikeShape(LOBBY_SCENERY.flash.rise) > 0.99);
  assert.ok(strikeShape(LOBBY_SCENERY.flash.echoAfter + LOBBY_SCENERY.flash.rise) > strikeShape(LOBBY_SCENERY.flash.echoAfter - 0.01));
  assert.ok(strikeShape(4) < 0.01);
  const flash: Flash = { everyMin: 5, everyMax: 9, strength: 0.8 };
  const state: FlashState = { wait: 1, since: Number.POSITIVE_INFINITY };
  const amounts: number[] = [];
  for (let step: number = 0; step < 1200; step += 1) amounts.push(stepFlash(state, flash, 1 / 60, (): number => 0.5));
  assert.equal(amounts[0], 0);
  assert.ok(Math.max(...amounts) <= flash.strength && Math.max(...amounts) > flash.strength * 0.9);
  const strikes: number = amounts.filter((amount: number, index: number): boolean => index > 0 && amount > 0.5 && (amounts[index - 1] ?? 0) <= 0.5).length;
  assert.ok(strikes >= 3 && strikes <= 6, `${strikes} rises in 20 seconds`);
});

void test('a lamp glow is soft all the way out and has no edge', (): void => {
  assert.equal(featherShare(0), 1);
  assert.equal(featherShare(1), 0);
  assert.equal(featherShare(1.3), 0);
  assert.ok(featherShare(0.98) < 0.002);
});

void test('a lamp starts dark where its data puts it, and a flickering fire wavers round its strength without going out while a steady lantern holds still', (): void => {
  const lamps: readonly Lamp[] = [
    { x: 3, y: 0.8, z: -12, color: '#ff8a3a', intensity: 12, distance: 7, flicker: 0.3 },
    { x: -2, y: 3, z: 14, color: '#ffc874', intensity: 8, distance: 8, flicker: 0 },
  ];
  const lights: readonly PointLight[] = lampLights(lamps);
  assert.equal(lights.length, 2);
  assert.deepEqual(lights.map((light: PointLight): readonly number[] => [light.position.x, light.position.y, light.position.z, light.intensity, light.distance, light.decay]), [[3, 0.8, -12, 0, 7, LOBBY_SCENERY.lamp.decay], [-2, 3, 14, 0, 8, LOBBY_SCENERY.lamp.decay]]);
  const fire: readonly number[] = Array.from({ length: 200 }, (_unused: unknown, step: number): number => lampFlicker(step * 0.05, 0, 0.3));
  assert.ok(Math.min(...fire) >= 0.7 - 1e-9 && Math.max(...fire) <= 1.3 + 1e-9);
  assert.ok(Math.max(...fire) - Math.min(...fire) > 0.2);
  for (let step: number = 0; step < 50; step += 1) assert.equal(lampFlicker(step * 0.1, 1, 0), 1);
});

function dressingMaterials(group: Group): (MeshStandardMaterial | MeshBasicMaterial)[] {
  const found: (MeshStandardMaterial | MeshBasicMaterial)[] = [];
  group.traverse((object: Object3D): void => {
    if (!(object instanceof Mesh)) return;
    const material: unknown = object.material;
    if (material instanceof MeshStandardMaterial || material instanceof MeshBasicMaterial) found.push(material);
  });
  return found;
}

void test('the set is built once and fades in from nothing, but can be compiled as it will stand once solid, and a set in place before the first frame stands solid at once', async (): Promise<void> => {
  const base: LobbySet = must([...LOBBY_SETS.sets.values()].find((set: LobbySet): boolean => set.skylines.length > 0 && set.roosts.length + set.glows.length > 0), 'a set with a skyline and roosts or glows');
  const set: LobbySet = { ...base, pieces: [], skirt: null };
  const dressing: SetDressing = createSetDressing(set, loadContent(), new GLTFLoader(), groundContact(setMounds(set)), null, (): number => 0.5);
  const group: Group = await dressing.build();
  assert.equal(await dressing.build(), group);
  const materials: (MeshStandardMaterial | MeshBasicMaterial)[] = dressingMaterials(group);
  assert.ok(materials.length >= 2);
  const fading = (): boolean => materials.every((material: MeshStandardMaterial | MeshBasicMaterial): boolean => material.transparent && material.opacity === 0);
  assert.ok(fading());
  const opaque: MeshStandardMaterial | MeshBasicMaterial = must(materials.find((material: MeshStandardMaterial | MeshBasicMaterial): boolean => material.blending !== AdditiveBlending), 'an opaque dressing material');
  const during: boolean = dressing.asSolid((): boolean => !opaque.transparent && opaque.opacity === 1);
  assert.ok(during);
  assert.ok(fading());
  dressing.show(true);
  assert.equal(opaque.transparent, false);
  assert.equal(opaque.opacity, 1);
  assert.ok(materials.filter((material: MeshStandardMaterial | MeshBasicMaterial): boolean => material.blending === AdditiveBlending).every((material: MeshStandardMaterial | MeshBasicMaterial): boolean => material.transparent));
});
