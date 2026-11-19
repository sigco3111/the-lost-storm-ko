import type { Accessor, Animation, AnimationChannel, Document, Material, Node, Texture } from '@gltf-transform/core';

export const CREATURE_MODEL = {
  restEpsilon: 1e-4,
  stillSeconds: 1,
} as const;

export interface MaterialFix {
  readonly name: string;
  readonly opacity: boolean;
  readonly emissive: boolean;
}

function fixMaterial(material: Material): MaterialFix {
  const colour: readonly number[] = material.getBaseColorFactor();
  const opacity: boolean = material.getAlphaMode() !== 'OPAQUE' || (colour[3] ?? 1) < 1;
  if (opacity) {
    material.setAlphaMode('OPAQUE');
    material.setBaseColorFactor([colour[0] ?? 1, colour[1] ?? 1, colour[2] ?? 1, 1]);
  }
  const glow: readonly number[] = material.getEmissiveFactor();
  const emissive: boolean = material.getEmissiveTexture() === null && glow.some((value: number): boolean => value > 0);
  if (emissive) material.setEmissiveFactor([0, 0, 0]);
  return { name: material.getName(), opacity, emissive };
}

export function fixMaterials(document: Document): readonly MaterialFix[] {
  return document
    .getRoot()
    .listMaterials()
    .map(fixMaterial)
    .filter((fix: MaterialFix): boolean => fix.opacity || fix.emissive);
}

function linear(channel: number): number {
  const value: number = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function flatColour(hex: string): readonly [number, number, number] | null {
  const match: RegExpExecArray | null = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) return null;
  const [, red = '0', green = '0', blue = '0'] = match;
  return [linear(parseInt(red, 16)), linear(parseInt(green, 16)), linear(parseInt(blue, 16))];
}

export function flattenMaterials(document: Document, colour: readonly [number, number, number]): number {
  for (const material of document.getRoot().listMaterials()) {
    material.setBaseColorTexture(null).setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    material.setBaseColorFactor([colour[0], colour[1], colour[2], 1]);
  }
  const textures: Texture[] = document.getRoot().listTextures();
  for (const texture of textures) texture.dispose();
  return textures.length;
}

export function clipNamesOf(document: Document): readonly string[] {
  return document
    .getRoot()
    .listAnimations()
    .map((animation: Animation): string => animation.getName());
}

export function plainClipName(name: string): string {
  return name.slice(name.lastIndexOf('|') + 1);
}

export function plainClipNames(document: Document): void {
  for (const animation of document.getRoot().listAnimations()) animation.setName(plainClipName(animation.getName()));
}

export function dropClips(document: Document): void {
  for (const animation of document.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) channel.getSampler()?.dispose();
    animation.dispose();
  }
}

function restValue(node: Node, path: string): readonly number[] | null {
  switch (path) {
    case 'translation':
      return node.getTranslation();
    case 'rotation':
      return node.getRotation();
    case 'scale':
      return node.getScale();
    default:
      return null;
  }
}

function staysAtRest(channel: AnimationChannel): boolean {
  const node: Node | null = channel.getTargetNode();
  const output: Accessor | null | undefined = channel.getSampler()?.getOutput();
  const rest: readonly number[] | null = node === null ? null : restValue(node, channel.getTargetPath() ?? '');
  if (rest === null || output === null || output === undefined) return false;
  const element: number[] = [];
  for (let index: number = 0; index < output.getCount(); index += 1) {
    output.getElement(index, element);
    if (element.some((value: number, axis: number): boolean => Math.abs(value - (rest[axis] ?? value)) > CREATURE_MODEL.restEpsilon)) return false;
  }
  return true;
}

export function keepOnlyClip(document: Document, name: string): void {
  let kept: boolean = false;
  for (const animation of document.getRoot().listAnimations()) {
    if (animation.getName() !== name || kept) {
      for (const channel of animation.listChannels()) channel.getSampler()?.dispose();
      animation.dispose();
      continue;
    }
    kept = true;
    for (const channel of animation.listChannels()) {
      if (!staysAtRest(channel)) continue;
      channel.getSampler()?.dispose();
      channel.dispose();
    }
  }
  if (!kept) throw new Error(`no clip named ${name}`);
  for (const node of document.getRoot().listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  for (const mesh of document.getRoot().listMeshes()) mesh.dispose();
  for (const skin of document.getRoot().listSkins()) skin.dispose();
  for (const material of document.getRoot().listMaterials()) material.dispose();
}

export function holdStillClips(document: Document): number {
  let held: number = 0;
  for (const animation of document.getRoot().listAnimations()) {
    for (const sampler of animation.listSamplers()) {
      const input: Accessor | null = sampler.getInput();
      const output: Accessor | null = sampler.getOutput();
      if (input === null || output === null || input.getCount() !== 1) continue;
      const element: number[] = [];
      output.getElement(0, element);
      sampler.setInput(document.createAccessor().setType('SCALAR').setArray(new Float32Array([0, CREATURE_MODEL.stillSeconds])).setBuffer(input.getBuffer()));
      sampler.setOutput(document.createAccessor().setType(output.getType()).setArray(new Float32Array([...element, ...element])).setBuffer(output.getBuffer()));
      sampler.setInterpolation('LINEAR');
      held += 1;
    }
  }
  return held;
}
