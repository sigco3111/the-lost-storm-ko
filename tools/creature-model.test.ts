import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Animation, Material, Node } from '@gltf-transform/core';
import { Document } from '@gltf-transform/core';
import { must } from '../test/support.ts';
import { clipNamesOf, dropClips, fixMaterials, flatColour, flattenMaterials, holdStillClips, keepOnlyClip, plainClipName, plainClipNames } from './creature-model.ts';

function creature(): Document {
  const document: Document = new Document();
  const buffer = document.createBuffer();
  const position = document.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer);
  const faded: Material = document.createMaterial('Main').setAlphaMode('BLEND').setBaseColorFactor([0.2, 0.3, 0.4, 0]).setEmissiveFactor([0.2, 0.3, 0.4]);
  document.createMaterial('Eyes').setBaseColorFactor([0, 0, 0, 1]);
  const mesh = document.createMesh('Body').addPrimitive(document.createPrimitive().setAttribute('POSITION', position).setMaterial(faded));
  const hip: Node = document.createNode('Hip');
  const tail: Node = document.createNode('Tail').setTranslation([0, 0, 1]);
  hip.addChild(tail);
  const skin = document.createSkin('Armature').addJoint(hip).addJoint(tail);
  const body: Node = document.createNode('Wolf').setMesh(mesh).setSkin(skin);
  document.createScene('Scene').addChild(body).addChild(hip);
  const times = document.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])).setBuffer(buffer);
  const still = document.createAccessor().setType('VEC3').setArray(new Float32Array([0, 0, 1, 0, 0, 1])).setBuffer(buffer);
  const wag = document.createAccessor().setType('VEC4').setArray(new Float32Array([0, 0, 0, 1, 0, 0.38, 0, 0.92])).setBuffer(buffer);
  for (const name of ['Idle', 'Attack']) {
    const animation: Animation = document.createAnimation(name);
    const turn = document.createAnimationSampler().setInput(times).setOutput(wag);
    const hold = document.createAnimationSampler().setInput(times).setOutput(still);
    animation.addSampler(turn).addSampler(hold);
    animation.addChannel(document.createAnimationChannel().setTargetNode(tail).setTargetPath('rotation').setSampler(turn));
    animation.addChannel(document.createAnimationChannel().setTargetNode(tail).setTargetPath('translation').setSampler(hold));
  }
  return document;
}

void test('a converted creature that came out see-through and glowing is made opaque and unlit, and a sound material is left alone', (): void => {
  const document: Document = creature();
  assert.deepEqual(fixMaterials(document), [{ name: 'Main', opacity: true, emissive: true }]);
  const main: Material = must(document.getRoot().listMaterials()[0], 'Main');
  assert.equal(main.getAlphaMode(), 'OPAQUE');
  assert.deepEqual(main.getBaseColorFactor().map((value: number): number => Math.round(value * 10) / 10), [0.2, 0.3, 0.4, 1]);
  assert.deepEqual(main.getEmissiveFactor(), [0, 0, 0]);
  assert.deepEqual(fixMaterials(document), []);
});

void test('the body keeps its mesh and skeleton and loses every clip', (): void => {
  const document: Document = creature();
  assert.deepEqual(clipNamesOf(document), ['Idle', 'Attack']);
  dropClips(document);
  assert.deepEqual(clipNamesOf(document), []);
  assert.equal(document.getRoot().listMeshes().length, 1);
  assert.equal(document.getRoot().listSkins().length, 1);
});

void test('a clip exported from Blender as armature|armature|action keeps only the action name', (): void => {
  assert.equal(plainClipName('RatArmature|RatArmature|Rat_Attack'), 'Rat_Attack');
  assert.equal(plainClipName('Gallop'), 'Gallop');
  const document: Document = creature();
  must(document.getRoot().listAnimations()[0], 'Idle').setName('Armature|Idle');
  plainClipNames(document);
  assert.deepEqual(clipNamesOf(document), ['Idle', 'Attack']);
});

void test('a clip file keeps one clip on bare joints, with no mesh, and drops the channels that never leave the rest pose', (): void => {
  const document: Document = creature();
  keepOnlyClip(document, 'Attack');
  assert.deepEqual(clipNamesOf(document), ['Attack']);
  assert.equal(document.getRoot().listMeshes().length, 0);
  assert.equal(document.getRoot().listMaterials().length, 0);
  assert.deepEqual(
    document
      .getRoot()
      .listAnimations()
      .flatMap((animation: Animation): string[] => animation.listChannels().map((channel): string => `${channel.getTargetNode()?.getName() ?? ''}.${channel.getTargetPath() ?? ''}`)),
    ['Tail.rotation'],
  );
  assert.ok(document.getRoot().listNodes().some((node: Node): boolean => node.getName() === 'Hip'));
  assert.throws((): void => keepOnlyClip(creature(), 'Howl'), /no clip named Howl/);
});

void test('a creature whose texture cannot ship is given one flat colour, read as sRGB, and keeps no texture', (): void => {
  const document: Document = creature();
  const main: Material = must(document.getRoot().listMaterials()[0], 'Main');
  main.setBaseColorTexture(document.createTexture('borrowed').setMimeType('image/jpeg').setImage(new Uint8Array([1, 2, 3])));
  const colour = must(flatColour('#ff8000'), 'colour');
  assert.deepEqual(colour.map((value: number): number => Math.round(value * 1000) / 1000), [1, 0.216, 0]);
  assert.equal(flattenMaterials(document, colour), 1);
  assert.equal(document.getRoot().listTextures().length, 0);
  assert.equal(main.getBaseColorTexture(), null);
  assert.deepEqual(main.getBaseColorFactor(), [colour[0], colour[1], colour[2], 1]);
  assert.equal(flatColour('olive'), null);
});

void test('a clip of a single pose with no length is held for a second so it can loop', (): void => {
  const document: Document = creature();
  const animation: Animation = must(document.getRoot().listAnimations()[0], 'Idle');
  const buffer = document.getRoot().listBuffers()[0] ?? null;
  const pose = document.createAccessor().setType('VEC4').setArray(new Float32Array([0, 0.38, 0, 0.92])).setBuffer(buffer);
  const once = document.createAccessor().setType('SCALAR').setArray(new Float32Array([0])).setBuffer(buffer);
  const sampler = must(animation.listSamplers()[0], 'sampler').setInput(once).setOutput(pose).setInterpolation('STEP');
  assert.equal(holdStillClips(document), 1);
  const times = must(sampler.getInput(), 'times');
  assert.deepEqual([times.getCount(), times.getScalar(0), times.getScalar(1)], [2, 0, 1]);
  const poses = must(sampler.getOutput(), 'poses');
  const last: number[] = [];
  poses.getElement(1, last);
  assert.deepEqual([poses.getCount(), ...last.map((value: number): number => Math.round(value * 100) / 100)], [2, 0, 0.38, 0, 0.92]);
  assert.equal(sampler.getInterpolation(), 'LINEAR');
  assert.equal(holdStillClips(document), 0);
});
