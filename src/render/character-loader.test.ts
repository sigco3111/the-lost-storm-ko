import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Bone, BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh } from 'three';
import type { Object3D } from 'three';
import { unsafeGlsl } from '../../test/glsl-support.ts';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { AttachmentDef, Content, RigDef } from '../../sim/content/types.ts';
import type { CharacterLibrary, LoadedRig, RigClipSet, RigInstance } from './character-loader.ts';
import { CHARACTER_SHADE, instantiateRig } from './character-loader.ts';
import { createGhost } from '../glitch/ghost.ts';
import { isShadowCaster } from './shadow-caster.ts';
import { skinnedMeshes } from './wearables.ts';

const content: Content = loadContent();
const rigDef: RigDef = must(content.rigs.get(content.player.hero.rig), 'player rig');
const visual: string = must(must(content.itemBases.get('rusted_blade'), 'rusted_blade').visual, 'blade visual');
const bladeDef: AttachmentDef = must(content.attachments.get(visual), 'blade attachment');
const FRAME: number = 1 / 60;

const clips: RigClipSet = {
  idle: new AnimationClip('idle', 1, []),
  run: new AnimationClip('run', 1, []),
  gaits: [],
  hit: [],
  death: [],
  rise: null,
  actions: new Map(),
  unarmed: { idle: new AnimationClip('bare_idle', 1, []), actions: new Map() },
  stances: new Map(),
};

function bladeRig(): { readonly rig: RigInstance; readonly hand: Object3D } {
  const template: Group = new Group();
  const hand: Bone = new Bone();
  hand.name = must(rigDef.sockets[bladeDef.socket], 'socket').bone;
  template.add(hand);
  const bladeTemplate: Group = new Group();
  bladeTemplate.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
  const loaded: LoadedRig = { def: rigDef, template, clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  const library: CharacterLibrary = { rigs: new Map([[rigDef.id, loaded]]), attachments: new Map([[visual, { def: bladeDef, template: bladeTemplate }]]), wearables: new Map() };
  const rig: RigInstance = instantiateRig(loaded, library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false });
  rig.setGear([visual]);
  return { rig, hand: must(rig.root.getObjectByName(hand.name), 'hand') };
}

function heldMaterial(hand: Object3D): MeshStandardMaterial {
  const found: MeshStandardMaterial[] = [];
  hand.traverse((node: Object3D): void => {
    if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) found.push(node.material);
  });
  return must(found[0], 'held material');
}

function scaleOf(holder: Object3D): number {
  return holder.scale.x;
}

function settle(rig: RigInstance): void {
  for (let frame: number = 0; frame < 240; frame += 1) rig.stepWear(FRAME);
}

void test('a character\'s shading never takes pow of an unclamped facing term', (): void => {
  assert.deepEqual(unsafeGlsl(CHARACTER_SHADE), []);
});

void test('the hover glow lights only a character\'s edge, so a hovered person keeps their shading instead of turning into a flat cut-out', (): void => {
  assert.match(CHARACTER_SHADE, /uHover \* pow\( edgeFacing,/);
  assert.doesNotMatch(CHARACTER_SHADE, /uHover \+|\+ uHover;|uHover\s*;/);
});

void test('a hit flash lights a character mostly at the edge, so a struck figure keeps its shading instead of filling flat white', (): void => {
  assert.match(CHARACTER_SHADE, /uFlash \* \( 0\.15 \+ 0\.85 \* pow\( edgeFacing,.*\+ diffuseColor\.rgb \* uFlashLift/);
});

void test('a weapon put away shrinks out and leaves the hand, and one taken up grows in and then holds still', (): void => {
  const { rig, hand } = bladeRig();
  const size: number = must(rigDef.sockets[bladeDef.socket], 'socket').scale;
  const first: Object3D = must(hand.children[0], 'first holder');
  assert.equal(scaleOf(first), size);
  rig.setGear([]);
  rig.stepWear(FRAME);
  assert.ok(scaleOf(first) < size);
  assert.equal(first.parent, hand);
  settle(rig);
  assert.equal(first.parent, null);
  rig.setGear([visual]);
  const second: Object3D = must(hand.children[0], 'second holder');
  assert.equal(scaleOf(second), 0);
  rig.stepWear(FRAME);
  assert.ok(scaleOf(second) > 0);
  settle(rig);
  assert.equal(scaleOf(second), size);
  rig.setGear([visual]);
  rig.stepWear(FRAME);
  assert.equal(scaleOf(second), size);
  assert.equal(hand.children.length, 1);
});

void test('fading a body reaches a weapon taken up after the last fade, and no longer reaches one it has let go', (): void => {
  const { rig, hand } = bladeRig();
  const first: MeshStandardMaterial = heldMaterial(hand);
  rig.setFade(0.5);
  assert.equal(first.opacity, 0.5);
  rig.setGear([]);
  settle(rig);
  rig.setGear([visual]);
  const second: MeshStandardMaterial = heldMaterial(hand);
  rig.setFade(0.25);
  assert.equal(second.opacity, 0.25);
  assert.equal(first.opacity, 0.5);
});

interface SkinnedSource {
  readonly loaded: LoadedRig;
  readonly library: CharacterLibrary;
}

function skinnedSource(): SkinnedSource {
  const template: Group = new Group();
  const spine: Bone = new Bone();
  spine.name = 'spine';
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(12), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  const skin: SkinnedMesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  skin.name = 'body';
  template.add(spine);
  template.add(skin);
  template.updateMatrixWorld(true);
  skin.bind(new Skeleton([spine]));
  const loaded: LoadedRig = { def: rigDef, template, clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  return { loaded, library: { rigs: new Map([[rigDef.id, loaded]]), attachments: new Map(), wearables: new Map() } };
}

function skinnedRig(shadows: 'pieces' | 'together', source: SkinnedSource = skinnedSource()): { readonly rig: RigInstance; readonly body: SkinnedMesh } {
  const rig: RigInstance = instantiateRig(source.loaded, source.library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }, shadows);
  return { rig, body: must(skinnedMeshes(rig.root).find((mesh: SkinnedMesh): boolean => !isShadowCaster(mesh)), 'body') };
}

function castersIn(root: Object3D): SkinnedMesh[] {
  return skinnedMeshes(root).filter((mesh: SkinnedMesh): boolean => isShadowCaster(mesh));
}

void test('a rig that casts in pieces is as it always was: every mesh casts its own shadow and there is no caster', (): void => {
  const { rig, body } = skinnedRig('pieces');
  assert.equal(body.castShadow, true);
  assert.equal(castersIn(rig.root).length, 0);
});

void test('a rig that casts together has one caster on the body\'s skeleton holding the body\'s triangles, and the body no longer casts', (): void => {
  const { rig, body } = skinnedRig('together');
  const caster: SkinnedMesh = must(castersIn(rig.root)[0], 'caster');
  assert.equal(castersIn(rig.root).length, 1);
  assert.equal(body.castShadow, false);
  assert.equal(caster.castShadow, true);
  assert.equal(caster.skeleton, body.skeleton);
  assert.equal(caster.parent, body.parent);
  assert.equal(must(caster.geometry.attributes['position'], 'position').count, 3);
  assert.equal(must(caster.geometry.index, 'index').count, 3);
});

void test('two rigs of one kind dressed alike share one caster geometry, and a rig of another source has its own', (): void => {
  const source: SkinnedSource = skinnedSource();
  const first: SkinnedMesh = must(castersIn(skinnedRig('together', source).rig.root)[0], 'first caster');
  const second: SkinnedMesh = must(castersIn(skinnedRig('together', source).rig.root)[0], 'second caster');
  const other: SkinnedMesh = must(castersIn(skinnedRig('together').rig.root)[0], 'other caster');
  assert.equal(first.geometry, second.geometry);
  assert.notEqual(first.geometry, other.geometry);
  assert.notEqual(first.skeleton, second.skeleton);
});

void test('the hero\'s ghost is copied without the shadow caster, so it never shows as a second body', (): void => {
  const { rig } = skinnedRig('together');
  const ghost = createGhost(rig.root, 0xffffff, 0.4);
  assert.equal(castersIn(ghost.root).length, 0);
  let meshes: number = 0;
  ghost.root.traverse((node: Object3D): void => {
    if (node instanceof Mesh) meshes += 1;
  });
  assert.equal(meshes, 1);
});

