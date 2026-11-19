import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnimationClip, Bone, BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh } from 'three';
import type { Material, Object3D } from 'three';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { AttachmentDef, Content, RigDef } from '../../sim/content/types.ts';
import type { CharacterLibrary, LoadedRig, RigClipSet, RigInstance } from './character-loader.ts';
import { instantiateRig } from './character-loader.ts';
import { isShadowCaster } from './shadow-caster.ts';
import { skinnedMeshes } from './wearables.ts';

const content: Content = loadContent();
const rigDef: RigDef = must(content.rigs.get(content.player.hero.rig), 'player rig');
const visual: string = must(must(content.itemBases.get('rusted_blade'), 'rusted_blade').visual, 'blade visual');
const bladeDef: AttachmentDef = must(content.attachments.get(visual), 'blade attachment');
const FRAME: number = 1 / 60;
const RED: Color = new Color(1, 0, 0);

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

interface Source {
  readonly loaded: LoadedRig;
  readonly library: CharacterLibrary;
  readonly hand: string;
}

function source(): Source {
  const template: Group = new Group();
  const hand: Bone = new Bone();
  hand.name = must(rigDef.sockets[bladeDef.socket], 'socket').bone;
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(12), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 4));
  const skin: SkinnedMesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  skin.name = 'body';
  template.add(hand);
  template.add(skin);
  template.updateMatrixWorld(true);
  skin.bind(new Skeleton([hand]));
  const blade: Group = new Group();
  blade.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
  const loaded: LoadedRig = { def: rigDef, template, clips, bodyParts: [], bodyMasks: new Map(), fitted: new Map() };
  return { loaded, library: { rigs: new Map([[rigDef.id, loaded]]), attachments: new Map([[visual, { def: bladeDef, template: blade }]]), wearables: new Map() }, hand: hand.name };
}

function made(from: Source, share: boolean): RigInstance {
  const rig: RigInstance = instantiateRig(from.loaded, from.library, { tint: '#ffffff', glow: '#ffffff', ghost: null, feather: false }, 'together', share);
  rig.stepWear(FRAME);
  return rig;
}

function bodyOf(rig: RigInstance): Material {
  const body: SkinnedMesh = must(skinnedMeshes(rig.root).find((mesh: SkinnedMesh): boolean => !isShadowCaster(mesh)), 'body');
  return must(Array.isArray(body.material) ? body.material[0] : body.material, 'body material');
}

function heldOf(rig: RigInstance, hand: string): Material {
  const found: Material[] = [];
  must(rig.root.getObjectByName(hand), 'hand').traverse((node: Object3D): void => {
    if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) found.push(node.material);
  });
  return must(found[0], 'held material');
}

void test('two monsters of one kind at rest draw with the same materials, so the renderer does not reload them between draws', (): void => {
  const from: Source = source();
  const one: RigInstance = made(from, true);
  const two: RigInstance = made(from, true);
  assert.equal(bodyOf(one), bodyOf(two));
  assert.equal(one.sharedLook(), true);
});

void test('a struck monster draws with its own materials until the flash has gone, and the others stay shared', (): void => {
  const from: Source = source();
  const struck: RigInstance = made(from, true);
  const calm: RigInstance = made(from, true);
  const shared: Material = bodyOf(calm);
  struck.setFlash(RED, 1);
  struck.stepWear(FRAME);
  assert.notEqual(bodyOf(struck), shared);
  assert.equal(bodyOf(calm), shared);
  struck.setFlash(RED, 0);
  struck.stepWear(FRAME);
  assert.equal(bodyOf(struck), shared);
});

void test('a fading, shaded or hovered monster keeps its own materials', (): void => {
  const from: Source = source();
  const shared: Material = bodyOf(made(from, true));
  const fading: RigInstance = made(from, true);
  fading.setFade(0.5);
  fading.stepWear(FRAME);
  assert.notEqual(bodyOf(fading), shared);
  const shaded: RigInstance = made(from, true);
  shaded.setShade(RED, 0.4, false, 0);
  shaded.stepWear(FRAME);
  assert.notEqual(bodyOf(shaded), shared);
  const hovered: RigInstance = made(from, true);
  hovered.setHover(RED, 1);
  hovered.stepWear(FRAME);
  assert.notEqual(bodyOf(hovered), shared);
});

void test('a held weapon is shared at rest as well, and a rig made without sharing keeps everything its own', (): void => {
  const from: Source = source();
  const one: RigInstance = made(from, true);
  const two: RigInstance = made(from, true);
  one.setGear([visual]);
  two.setGear([visual]);
  for (let frame: number = 0; frame < 240; frame += 1) {
    one.stepWear(FRAME);
    two.stepWear(FRAME);
  }
  assert.equal(heldOf(one, from.hand), heldOf(two, from.hand));
  const hero: RigInstance = made(from, false);
  const other: RigInstance = made(from, false);
  assert.notEqual(bodyOf(hero), bodyOf(other));
  assert.equal(hero.sharedLook(), false);
});

void test('disposing a monster leaves the shared materials to the others', (): void => {
  const from: Source = source();
  const gone: RigInstance = made(from, true);
  const kept: RigInstance = made(from, true);
  const shared: Material = bodyOf(kept);
  let disposed: boolean = false;
  shared.addEventListener('dispose', (): void => {
    disposed = true;
  });
  gone.dispose();
  assert.equal(disposed, false);
});
