import type { Accessor, Document, Material, Primitive, Texture, TextureInfo } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, join, prune, quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import type { AtlasCell, Raster } from './atlas-layout.ts';
import { atlasCells, blankRaster, paste, placeUv, resample } from './atlas-layout.ts';

const ATLAS_MODEL = {
  edge: 1024,
  gutter: 8,
  webpQuality: '84',
  quantized: /^(NORMAL|TANGENT|JOINTS_\d+|WEIGHTS_\d+|COLOR_\d+)$/,
  clampToEdge: 33071,
  kilobyte: 1024,
  pamHeaderEnd: 'ENDHDR\n',
} as const;

type Slot = 'baseColor' | 'normal' | 'metallicRoughness' | 'occlusion' | 'emissive';

const SLOTS: readonly Slot[] = ['baseColor', 'normal', 'metallicRoughness', 'occlusion', 'emissive'];

interface SlotAccess {
  texture(material: Material): Texture | null;
  info(material: Material): TextureInfo | null;
  set(material: Material, texture: Texture): void;
}

const SLOT_ACCESS: Readonly<Record<Slot, SlotAccess>> = {
  baseColor: { texture: (m: Material): Texture | null => m.getBaseColorTexture(), info: (m: Material): TextureInfo | null => m.getBaseColorTextureInfo(), set: (m: Material, t: Texture): void => void m.setBaseColorTexture(t) },
  normal: { texture: (m: Material): Texture | null => m.getNormalTexture(), info: (m: Material): TextureInfo | null => m.getNormalTextureInfo(), set: (m: Material, t: Texture): void => void m.setNormalTexture(t) },
  metallicRoughness: { texture: (m: Material): Texture | null => m.getMetallicRoughnessTexture(), info: (m: Material): TextureInfo | null => m.getMetallicRoughnessTextureInfo(), set: (m: Material, t: Texture): void => void m.setMetallicRoughnessTexture(t) },
  occlusion: { texture: (m: Material): Texture | null => m.getOcclusionTexture(), info: (m: Material): TextureInfo | null => m.getOcclusionTextureInfo(), set: (m: Material, t: Texture): void => void m.setOcclusionTexture(t) },
  emissive: { texture: (m: Material): Texture | null => m.getEmissiveTexture(), info: (m: Material): TextureInfo | null => m.getEmissiveTextureInfo(), set: (m: Material, t: Texture): void => void m.setEmissiveTexture(t) },
};

function textureIn(material: Material, slot: Slot): Texture | null {
  return SLOT_ACCESS[slot].texture(material);
}

function infoIn(material: Material, slot: Slot): TextureInfo | null {
  return SLOT_ACCESS[slot].info(material);
}

function setTexture(material: Material, slot: Slot, texture: Texture): void {
  SLOT_ACCESS[slot].set(material, texture);
}

function factorsOf(material: Material): string {
  return JSON.stringify([
    material.getBaseColorFactor(),
    material.getMetallicFactor(),
    material.getRoughnessFactor(),
    material.getEmissiveFactor(),
    material.getNormalScale(),
    material.getOcclusionStrength(),
    material.getDoubleSided(),
    material.getAlphaMode(),
    material.getAlphaCutoff(),
    material.listExtensions().map((extension): string => extension.extensionName),
    SLOTS.map((slot: Slot): boolean => textureIn(material, slot) !== null),
    SLOTS.map((slot: Slot): number => infoIn(material, slot)?.getTexCoord() ?? 0),
  ]);
}

function slotGroups(materials: readonly Material[]): Slot[][] {
  const used: Slot[] = SLOTS.filter((slot: Slot): boolean => materials.every((material: Material): boolean => textureIn(material, slot) !== null));
  const groups: Slot[][] = [];
  for (const slot of used) {
    const shared: Slot[] | undefined = groups.find((group: Slot[]): boolean => materials.every((material: Material): boolean => textureIn(material, group[0] ?? slot) === textureIn(material, slot)));
    if (shared === undefined) groups.push([slot]);
    else shared.push(slot);
  }
  return groups;
}

function readPam(bytes: Uint8Array): Raster {
  const text: string = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 256)));
  const end: number = text.indexOf(ATLAS_MODEL.pamHeaderEnd);
  if (end < 0) throw new Error('not a PAM image');
  const header: Map<string, string> = new Map<string, string>(
    text
      .slice(0, end)
      .split('\n')
      .map((line: string): [string, string] => {
        const [key = '', value = ''] = line.split(' ');
        return [key, value];
      }),
  );
  const width: number = Number(header.get('WIDTH'));
  const height: number = Number(header.get('HEIGHT'));
  if (header.get('DEPTH') !== '4') throw new Error('expected an RGBA PAM image');
  const start: number = end + ATLAS_MODEL.pamHeaderEnd.length;
  return { width, height, data: bytes.slice(start, start + width * height * 4) };
}

function pamOf(raster: Raster): Uint8Array {
  const header: Uint8Array = new TextEncoder().encode(`P7\nWIDTH ${raster.width}\nHEIGHT ${raster.height}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\n${ATLAS_MODEL.pamHeaderEnd}`);
  const out: Uint8Array = new Uint8Array(header.length + raster.data.length);
  out.set(header, 0);
  out.set(raster.data, header.length);
  return out;
}

function decode(texture: Texture, folder: string, name: string): Raster {
  const image: Uint8Array | null = texture.getImage();
  if (image === null || texture.getMimeType() !== 'image/webp') throw new Error(`texture ${texture.getName()} is not an embedded WebP image`);
  const source: string = joinPath(folder, `${name}.webp`);
  const target: string = joinPath(folder, `${name}.pam`);
  writeFileSync(source, image);
  execFileSync('dwebp', ['-quiet', source, '-pam', '-o', target]);
  return readPam(new Uint8Array(readFileSync(target)));
}

function encode(raster: Raster, folder: string, name: string): Uint8Array {
  const source: string = joinPath(folder, `${name}.pam`);
  const target: string = joinPath(folder, `${name}.webp`);
  writeFileSync(source, pamOf(raster));
  execFileSync('cwebp', ['-quiet', '-q', ATLAS_MODEL.webpQuality, '-m', '6', '-exact', source, '-o', target]);
  return new Uint8Array(readFileSync(target));
}

function triangleArea(position: Accessor, a: number, b: number, c: number): number {
  const pa: number[] = position.getElement(a, [0, 0, 0]);
  const pb: number[] = position.getElement(b, [0, 0, 0]);
  const pc: number[] = position.getElement(c, [0, 0, 0]);
  const u: number[] = pb.map((value: number, axis: number): number => value - (pa[axis] ?? 0));
  const v: number[] = pc.map((value: number, axis: number): number => value - (pa[axis] ?? 0));
  const [ux = 0, uy = 0, uz = 0] = u;
  const [vx = 0, vy = 0, vz = 0] = v;
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

function surfaceArea(primitive: Primitive): number {
  const position: Accessor | null = primitive.getAttribute('POSITION');
  if (position === null) return 0;
  const indices: Accessor | null = primitive.getIndices();
  const count: number = indices === null ? position.getCount() : indices.getCount();
  const corner = (at: number): number => (indices === null ? at : indices.getScalar(at));
  let area: number = 0;
  for (let at: number = 0; at + 2 < count; at += 3) area += triangleArea(position, corner(at), corner(at + 1), corner(at + 2));
  return area;
}

function remapUvs(document: Document, primitive: Primitive, cell: AtlasCell): void {
  const shared: Accessor | null = primitive.getAttribute('TEXCOORD_0');
  if (shared === null) throw new Error('a primitive with an atlased material has no TEXCOORD_0');
  const uvs: Accessor = shared.listParents().filter((parent): boolean => parent !== document.getRoot()).length > 1 ? shared.clone() : shared;
  primitive.setAttribute('TEXCOORD_0', uvs);
  const element: number[] = [0, 0];
  for (let at: number = 0; at < uvs.getCount(); at += 1) {
    uvs.getElement(at, element);
    uvs.setElement(at, placeUv(cell, ATLAS_MODEL.edge, ATLAS_MODEL.gutter, element[0] ?? 0, element[1] ?? 0));
  }
}

async function atlasFile(io: NodeIO, path: string): Promise<void> {
  const before: number = statSync(path).size;
  const document: Document = await io.read(path);
  const primitives: Primitive[] = document
    .getRoot()
    .listMeshes()
    .flatMap((mesh): Primitive[] => mesh.listPrimitives());
  const materials: Material[] = [...new Set(primitives.map((primitive: Primitive): Material | null => primitive.getMaterial()))].filter((material: Material | null): material is Material => material !== null);
  if (materials.length < 2) throw new Error(`${path} has ${materials.length} material, nothing to atlas`);
  const kinds: Set<string> = new Set<string>(materials.map(factorsOf));
  if (kinds.size !== 1) throw new Error(`${path}: its materials differ in more than their textures`);
  const area = (material: Material): number => primitives.filter((primitive: Primitive): boolean => primitive.getMaterial() === material).reduce((sum: number, primitive: Primitive): number => sum + surfaceArea(primitive), 0);
  const ranked: Material[] = materials.toSorted((a: Material, b: Material): number => area(b) - area(a));
  const cells: AtlasCell[] = atlasCells(ranked.length, ATLAS_MODEL.edge);
  const folder: string = mkdtempSync(joinPath(tmpdir(), 'atlas-model-'));
  const [first] = ranked;
  if (first === undefined) return;
  const stem: string = first.getName().replace(/[A-Z][a-z]+$/, '');
  const merged: Material = first.clone().setName(stem.length > 0 ? stem : 'atlas');
  for (const [groupIndex, group] of slotGroups(ranked).entries()) {
    const atlas: Raster = blankRaster(ATLAS_MODEL.edge, ATLAS_MODEL.edge);
    for (const [index, material] of ranked.entries()) {
      const cell: AtlasCell | undefined = cells[index];
      const texture: Texture | null = textureIn(material, group[0] ?? 'baseColor');
      if (cell === undefined || texture === null) continue;
      paste(atlas, resample(decode(texture, folder, `${groupIndex}-${index}`), cell.size - 2 * ATLAS_MODEL.gutter), cell, ATLAS_MODEL.gutter);
    }
    const texture: Texture = document
      .createTexture(`atlas-${group.join('-')}`)
      .setImage(encode(atlas, folder, `atlas-${groupIndex}`))
      .setMimeType('image/webp')
      .setURI(`atlas_${group.join('_')}.webp`);
    for (const slot of group) {
      setTexture(merged, slot, texture);
      infoIn(merged, slot)?.setWrapS(ATLAS_MODEL.clampToEdge).setWrapT(ATLAS_MODEL.clampToEdge);
    }
  }
  for (const primitive of primitives) {
    const at: number = ranked.findIndex((material: Material): boolean => material === primitive.getMaterial());
    const cell: AtlasCell | undefined = cells[at];
    if (cell === undefined) continue;
    remapUvs(document, primitive, cell);
    primitive.setMaterial(merged);
  }
  for (const material of materials) material.dispose();
  await document.transform(join({ keepNamed: false }), dedup(), prune({ keepLeaves: true }), reorder({ encoder: MeshoptEncoder, target: 'size' }), quantize({ pattern: ATLAS_MODEL.quantized }));
  document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(path, document);
  const after: Document = await io.read(path);
  console.log(`${path}: ${Math.round(before / ATLAS_MODEL.kilobyte)} KB -> ${Math.round(statSync(path).size / ATLAS_MODEL.kilobyte)} KB, ${materials.length} materials -> ${after.getRoot().listMaterials().length}, ${after.getRoot().listTextures().length} textures, ${after.getRoot().listMeshes().flatMap((mesh): Primitive[] => mesh.listPrimitives()).length} primitives`);
}

async function main(): Promise<void> {
  const paths: readonly string[] = process.argv.slice(2);
  if (paths.length === 0) {
    console.error('usage: node tools/atlas-model.ts <model.glb> [<model.glb> ...]');
    process.exit(2);
  }
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const next = async (index: number): Promise<void> => {
    const path: string | undefined = paths[index];
    if (path === undefined) return;
    await atlasFile(io, path);
    await next(index + 1);
  };
  await next(0);
}

await main();
