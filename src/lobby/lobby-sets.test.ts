import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { Color, PerspectiveCamera, Vector3 } from 'three';
import { createLobbyOrbit, LOBBY_ORBIT, stepOrbit } from './lobby-orbit.ts';
import type { LobbyOrbit, OrbitView } from './lobby-orbit.ts';
import { LOBBY_SETS, pickSet, readLobbySets, setMounds } from './lobby-sets.ts';
import type { LobbySet, SetPiece, Skyline, SkylinePiece } from './lobby-sets.ts';
import { LOBBY_STAGE, lobbyFraming } from './lobby-stage.ts';
import type { Framing } from './lobby-stage.ts';

const content: Content = loadContent();

void test('every lobby set dresses its ground and pieces from surfaces and props the game already has', (): void => {
  for (const set of LOBBY_SETS.sets.values()) {
    assert.ok(content.surfaces.has(set.ground), `${set.id} ground ${set.ground}`);
    if (set.stone !== null) assert.ok(content.surfaces.has(set.stone), `${set.id} stone ${set.stone}`);
    for (const piece of set.pieces) assert.ok(content.props.has(piece.prop), `${set.id} piece ${piece.prop}`);
    const rubble: string | undefined = set.skirt?.rubble?.prop;
    if (rubble !== undefined) assert.ok(content.props.has(rubble), `${set.id} rubble ${rubble}`);
  }
});

void test('every set blends its pieces into the ground they stand on', (): void => {
  for (const set of LOBBY_SETS.sets.values()) {
    assert.ok(set.skirt !== null, `${set.id} has no ground skirt`);
    assert.ok(set.skirt.height > 0 && set.skirt.darken > 0 && set.skirt.rubble !== null, set.id);
  }
});

void test('the lobby shows the road before the Keeper\'s Gate, and any other set can still be asked for by name', (): void => {
  assert.deepEqual([...LOBBY_SETS.sets.keys()], ['stones', 'hall', 'cave', 'gate']);
  assert.equal(LOBBY_SETS.chosen, 'gate');
  assert.deepEqual([...LOBBY_SETS.sets.values()].filter((set: LobbySet): boolean => set.shadows).map((set: LobbySet): string => set.id), ['stones']);
  assert.equal(pickSet(LOBBY_SETS, '').id, 'gate');
  assert.equal(pickSet(LOBBY_SETS, '?lobby-set=cave').id, 'cave');
  assert.equal(pickSet(LOBBY_SETS, '?lobby-set=nowhere').id, 'gate');
});

void test('the gate road has a horizon in depth: walls, then ruined towers, then hills, each farther and paler', (): void => {
  const gate: LobbySet | undefined = LOBBY_SETS.sets.get('gate');
  assert.ok(gate !== undefined);
  const radii: readonly number[] = gate.skylines.map((skyline: Skyline): number => skyline.radius);
  assert.ok(radii.length >= 3);
  assert.ok(gate.skylines.some((skyline: Skyline): boolean => skyline.pieces.some((piece: SkylinePiece): boolean => piece.kind === 'hill' || piece.kind === 'cliff')));
  assert.ok(gate.skylines.some((skyline: Skyline): boolean => skyline.pieces.some((piece: SkylinePiece): boolean => piece.lit > 0)));
});

function frameDrop(radius: number, height: number, width: number, tall: number): number {
  const orbit: LobbyOrbit = createLobbyOrbit();
  let view: OrbitView = stepOrbit(orbit, 0);
  for (let step: number = 0; step < 300; step += 1) view = stepOrbit(orbit, 1 / 60);
  const camera: PerspectiveCamera = new PerspectiveCamera(LOBBY_STAGE.fov, width / tall, LOBBY_STAGE.near, LOBBY_STAGE.far);
  camera.position.set(view.x, view.y, view.z);
  camera.lookAt(0, view.lookHeight, 0);
  const framing: Framing = lobbyFraming(width, tall);
  camera.zoom = framing.zoom;
  camera.setViewOffset(width, tall, (0.5 - framing.across) * width, framing.down * tall, width, tall);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const behind: Vector3 = new Vector3(-view.x, 0, -view.z).normalize().multiplyScalar(radius).setY(height).project(camera);
  return (1 - behind.y) / 2;
}

void test('from the lobby camera every skyline top stands inside the frame, so towers and hills show their outline instead of running off the top', (): void => {
  for (const set of LOBBY_SETS.sets.values()) {
    for (const skyline of set.skylines) {
      for (const piece of skyline.pieces) {
        for (const [width, tall] of [[1440, 900], [390, 844]] as const) {
          const drop: number = frameDrop(skyline.radius, piece.height, width, tall);
          assert.ok(drop > 0.015, `${set.id} ${piece.kind} at ${piece.angleDegrees} on ${skyline.radius} tops out ${drop.toFixed(3)} down a ${width}x${tall} frame`);
        }
      }
    }
  }
});

void test('the gate horizon pales with distance, so each layer stands apart from the one in front of it', (): void => {
  const gate: LobbySet | undefined = LOBBY_SETS.sets.get('gate');
  assert.ok(gate !== undefined);
  const layers: readonly Skyline[] = gate.skylines.toSorted((near: Skyline, far: Skyline): number => near.radius - far.radius);
  const lightness: readonly number[] = layers.map((skyline: Skyline): number => new Color(skyline.color).getHSL({ h: 0, s: 0, l: 0 }).l);
  for (let layer: number = 1; layer < lightness.length; layer += 1) assert.ok((lightness[layer] ?? 0) > (lightness[layer - 1] ?? 1), `${layers[layer]?.radius}`);
});

void test('the gate camp fire and lanterns throw real light, each lamp set by a lit piece', (): void => {
  const gate: LobbySet | undefined = LOBBY_SETS.sets.get('gate');
  assert.ok(gate !== undefined);
  assert.ok(gate.lamps.length >= 1);
  for (const lamp of gate.lamps) {
    const nearest: number = Math.min(...gate.pieces.filter((piece: SetPiece): boolean => piece.prop === 'fire_pit' || piece.prop === 'gate_lantern_lit').map((piece: SetPiece): number => Math.hypot(piece.x - lamp.x, piece.z - lamp.z)));
    assert.ok(nearest < 1, `${lamp.x}, ${lamp.z}`);
  }
});

function blocksView(piece: SetPiece): boolean {
  const reach: number = Math.hypot(piece.x, piece.z);
  const near: number = LOBBY_ORBIT.near.distance;
  const far: number = LOBBY_ORBIT.far.distance;
  return reach > near - 1 && reach < far + 1.2 && piece.y < 2.4 && piece.size > 1;
}

void test('nothing tall stands in the ring the camera turns on, so the orbit never walks into a wall or hides the hero behind one', (): void => {
  for (const set of LOBBY_SETS.sets.values()) {
    if (set.id === 'stones') continue;
    for (const piece of set.pieces) assert.ok(!blocksView(piece), `${set.id} ${piece.prop} at ${piece.x}, ${piece.z}`);
  }
});

function coverage(set: LobbySet): number {
  const seen: Set<number> = new Set<number>();
  for (const piece of set.pieces) if (Math.hypot(piece.x, piece.z) > LOBBY_ORBIT.far.distance) seen.add(Math.floor(((Math.atan2(piece.x, -piece.z) * 180) / Math.PI + 360) / 30) % 12);
  for (const piece of set.skylines.flatMap((skyline: Skyline): readonly SkylinePiece[] => skyline.pieces)) seen.add(Math.floor((((piece.angleDegrees % 360) + 360) % 360) / 30));
  return seen.size;
}

void test('each new set dresses the whole way round, so the slow turn of the lobby never shows an empty edge', (): void => {
  for (const id of ['hall', 'cave', 'gate']) {
    const set: LobbySet | undefined = LOBBY_SETS.sets.get(id);
    assert.ok(set !== undefined);
    assert.equal(coverage(set), 12, id);
  }
});

void test('a set is read strictly: a missing chosen set, reversed fog or lightning, or an unknown skyline shape is refused', (): void => {
  const good = { chosen: 'a', sets: [{ id: 'a', ground: 'black_rock', stone: null, shade: 0.5, fogNear: 10, fogFar: 20, haze: 0, pieces: [{ prop: 'rock_1', x: 1, z: 2, mound: true }], flash: null }] };
  const read = readLobbySets(good);
  const set: LobbySet | undefined = read.sets.get('a');
  assert.ok(set !== undefined);
  assert.deepEqual(setMounds(set), [{ x: 1, z: 2, size: 1 }]);
  assert.throws((): void => void readLobbySets({ ...good, chosen: 'b' }));
  assert.throws((): void => void readLobbySets({ ...good, zones: { hall_of_time: 'b' } }));
  assert.throws((): void => void readLobbySets({ ...good, sets: [{ ...good.sets[0], fogFar: 5 }] }));
  assert.throws((): void => void readLobbySets({ ...good, sets: [{ ...good.sets[0], flash: { everyMin: 9, everyMax: 3, strength: 1 } }] }));
  assert.throws((): void => void readLobbySets({ ...good, sets: [{ ...good.sets[0], skylines: [{ radius: 30, pieces: [{ kind: 'dome', angle: 0, width: 1, height: 1 }] }] }] }));
  assert.throws((): void => void readLobbySets({ ...good, sets: [{ ...good.sets[0], skirt: { height: 0.4, contact: 0.5, darken: 0.4, hue: 0.2, rubble: { prop: 'rubble_chip', count: 3, sizeMin: 1, sizeMax: 0.5, from: 1, to: 1.4, minRadius: 1 } } }] }));
  assert.equal(set.skirt, null);
  assert.deepEqual(set.skylines, []);
});

void test('a zone can name the set the lobby shows for a character who last stood there, and a set asked for by name still wins', (): void => {
  const two = { chosen: 'a', zones: { hall_of_time: 'b' }, sets: [{ id: 'a', ground: 'black_rock', stone: null, shade: 0.5, fogNear: 10, fogFar: 20, haze: 0, pieces: [] }, { id: 'b', ground: 'black_rock', stone: null, shade: 0.5, fogNear: 10, fogFar: 20, haze: 0, pieces: [] }] };
  const read = readLobbySets(two);
  assert.equal(pickSet(read, '', 'hall_of_time').id, 'b');
  assert.equal(pickSet(read, '', 'hideout').id, 'a');
  assert.equal(pickSet(read, '', null).id, 'a');
  assert.equal(pickSet(read, '?lobby-set=a', 'hall_of_time').id, 'a');
  for (const zone of LOBBY_SETS.zones.keys()) assert.ok(content.zones.has(zone), `no zone ${zone}`);
});
