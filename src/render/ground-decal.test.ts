import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Camera, Group, Mesh, Scene, ShaderMaterial } from 'three';
import { roadZone } from '../../test/road-support.ts';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import type { ZoneDef } from '../../sim/content/types.ts';
import { GROUND_DECAL_FRAGMENT, GROUND_DECAL_VERTEX, awaitsDecalDraw, groundDecalBox, groundDecalsIn, groundDecalUniforms, layOnGround, liftOffGround, setLevel } from './ground-decal.ts';
import { liftAt, useTerrain } from './terrain-lift.ts';

const SIZE = 4;
const STAIR: ZoneDef = roadZone({
  id: 'stair_decal_test',
  cellSize: SIZE,
  floorHeight: 0.5,
  tiles: ['wwwwww', 'wwwwww'],
  terrain: { rise: 1, groundStep: 0.6, levels: ['000/22', '000/22'], cliff: 'road_firm', rough: null, blends: [], cliffs: [] },
});
const FLAT: ZoneDef = roadZone({ id: 'flat_decal_test', cellSize: SIZE, tiles: ['ww'] });

function decal(): Mesh {
  const mesh: Mesh = new Mesh(groundDecalBox(0.5), new ShaderMaterial({ uniforms: groundDecalUniforms(0.5), vertexShader: GROUND_DECAL_VERTEX, fragmentShader: [...GROUND_DECAL_FRAGMENT, 'void main() { vec2 local; gl_FragColor = vec4(onGround(local)); }'].join('\n') }));
  mesh.rotation.x = -Math.PI / 2;
  layOnGround(mesh);
  return mesh;
}

function levelOf(mesh: Mesh): unknown {
  const material: unknown = mesh.material;
  assert.ok(material instanceof ShaderMaterial);
  return material.uniforms['uDecalLevel']?.value;
}

void test('the decal shaders keep their smoothsteps in order and clamp what they raise', (): void => {
  assert.deepEqual(unsafeGlsl(GROUND_DECAL_VERTEX), []);
  assert.deepEqual(unsafeGlsl(GROUND_DECAL_FRAGMENT.join('\n')), []);
});

void test('a decal stands on the floor under its centre, never at the height its mesh was given', (): void => {
  assert.doesNotMatch(GROUND_DECAL_VERTEX, /centre\.y|modelMatrix\[3\]\.y|position\.y\s*\+/);
  assert.match(GROUND_DECAL_VERTEX, /uDecalLevel/);
  useTerrain(STAIR);
  for (const [x, z] of [[2, 2], [14, 2], [22, 6]] as const) {
    const mesh: Mesh = decal();
    mesh.position.set(x, 40, z);
    mesh.updateMatrixWorld();
    setLevel(mesh);
    assert.equal(levelOf(mesh), liftAt(STAIR, x, z));
    liftOffGround(mesh);
  }
  useTerrain(FLAT);
  const flat: Mesh = decal();
  flat.position.set(2, 3, 2);
  flat.updateMatrixWorld();
  setLevel(flat);
  assert.equal(levelOf(flat), 0);
  liftOffGround(flat);
});

void test('the surface it lights is read back from the scene depth and held to a band around the floor there', (): void => {
  const fragment: string = GROUND_DECAL_FRAGMENT.join('\n');
  assert.match(fragment, /texture2D\(uSceneDepth/);
  assert.match(fragment, /groundLevel\(p\.xz\)/);
  assert.match(fragment, /float rise = p\.y - here;/);
});

void test('the main camera never draws a decal; only the decal pass does, while it and its parents are shown in the scene', (): void => {
  const scene: Scene = new Scene();
  const group: Group = new Group();
  scene.add(group);
  const mesh: Mesh = decal();
  assert.equal(mesh.layers.test(new Camera().layers), false);
  assert.equal(groundDecalsIn(scene).includes(mesh), false);
  group.add(mesh);
  assert.equal(groundDecalsIn(scene).includes(mesh), true);
  group.visible = false;
  assert.equal(groundDecalsIn(scene).includes(mesh), false);
  group.visible = true;
  liftOffGround(mesh);
  assert.equal(groundDecalsIn(scene).includes(mesh), false);
});

void test('a decal laid on the ground awaits its first draw, and a lifted or plain mesh never does', (): void => {
  const plain: Mesh = new Mesh(groundDecalBox(1), new ShaderMaterial());
  const laid: Mesh = new Mesh(groundDecalBox(1), new ShaderMaterial());
  layOnGround(laid);
  assert.equal(awaitsDecalDraw(plain), false);
  assert.equal(awaitsDecalDraw(laid), true);
  liftOffGround(laid);
  assert.equal(awaitsDecalDraw(laid), false);
});
