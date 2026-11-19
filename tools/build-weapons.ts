import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Accessor, Document, mat4, Mesh, Node, Primitive, Root, Scene, Texture } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, prune, simplify, transformPrimitive, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import { Vector3 } from 'three';
import type { Fields } from '../sim/content/read.ts';
import { choice, each, fields, items, numeric, text } from '../sim/content/read.ts';
import type { Axis, Hold, WeaponGoal, WeaponPlacement } from './weapon-fit.ts';
import { AXES, placeWeapon } from './weapon-fit.ts';

const BUILD = {
  out: 'public/models/weapons/{id}.glb',
  plan: 'tools/weapons.json',
  texture: '512',
  webpQuality: '84',
  simplifyError: 0.02,
  leastRoughness: 0.55,
  mostMetal: 0.6,
  channelTop: 255,
} as const;

const KINDS: readonly Hold['kind'][] = ['pole', 'crossbow'];

interface WeaponPlan {
  readonly id: string;
  readonly file: string;
  readonly parts: readonly number[] | null;
  readonly keep: number;
  readonly goal: WeaponGoal;
}

function readHold(source: Fields, where: string): Hold {
  const kind: Hold['kind'] = choice(source, 'kind', KINDS, where);
  const forward: Axis = choice(source, 'forward', AXES, where);
  if (kind === 'pole') return { kind, forward, side: source['side'] === null ? null : choice(source, 'side', AXES, where) };
  return { kind, forward, up: choice(source, 'up', AXES, where), rise: numeric(source, 'rise', where) };
}

function readPlan(): WeaponPlan[] {
  return each(JSON.parse(readFileSync(BUILD.plan, 'utf8')), 'weapons', (entry: unknown, at: string): WeaponPlan => {
    const weapon: Fields = fields(entry, at);
    return {
      id: text(weapon, 'id', at),
      file: text(weapon, 'file', at),
      parts:
        weapon['parts'] === null
          ? null
          : items(weapon['parts'], `${at}.parts`).map((part: unknown): number => {
              if (typeof part !== 'number') throw new Error(`${at}.parts holds a value that is not a part number`);
              return part;
            }),
      keep: weapon['keep'] === undefined ? 1 : numeric(weapon, 'keep', at),
      goal: { hold: readHold(fields(weapon['hold'], `${at}.hold`), `${at}.hold`), align: weapon['align'] === true, length: numeric(weapon, 'length', at), grip: numeric(weapon, 'grip', at) },
    };
  });
}

function positionsOf(primitive: Primitive): Vector3[] {
  const accessor: Accessor | null = primitive.getAttribute('POSITION');
  if (accessor === null) return [];
  return Array.from({ length: accessor.getCount() }, (_: unknown, index: number): Vector3 => new Vector3().fromArray(accessor.getElement(index, [0, 0, 0])));
}

function shrinkTexture(texture: Texture, folder: string, index: number, rough: boolean): void {
  const image: Uint8Array | null = texture.getImage();
  if (image === null) return;
  const source: string = join(folder, `${index}.src`);
  const floored: string = join(folder, `${index}.png`);
  const target: string = join(folder, `${index}.webp`);
  writeFileSync(source, image);
  if (rough) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', source, '-vf', `format=rgb24,lutrgb=g='max(val,${Math.round(BUILD.leastRoughness * BUILD.channelTop)})'`, floored]);
  execFileSync('cwebp', ['-quiet', '-q', BUILD.webpQuality, '-m', '6', '-resize', BUILD.texture, '0', rough ? floored : source, '-o', target]);
  texture.setImage(new Uint8Array(readFileSync(target)));
  texture.setMimeType('image/webp');
  texture.setURI('');
}

function roughened(document: Document): Set<Texture> {
  const textures: Set<Texture> = new Set();
  for (const material of document.getRoot().listMaterials()) {
    material.setMetallicFactor(Math.min(material.getMetallicFactor(), BUILD.mostMetal));
    const map: Texture | null = material.getMetallicRoughnessTexture();
    if (map === null) material.setRoughnessFactor(Math.max(material.getRoughnessFactor(), BUILD.leastRoughness));
    else textures.add(map);
  }
  return textures;
}

async function buildWeapon(io: NodeIO, folder: string, plan: WeaponPlan): Promise<string> {
  const document: Document = await io.read(join(folder, plan.file));
  const root: Root = document.getRoot();
  const carried: Primitive[] = [];
  const shown: Node[] = root.listNodes().filter((node: Node): boolean => node.getMesh() !== null && node.getSkin() === null);
  for (const [index, node] of shown.entries()) {
    const mesh: Mesh | null = node.getMesh();
    if (mesh === null || (plan.parts !== null && !plan.parts.includes(index))) continue;
    const world: mat4 = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const copy: Primitive = compactPrimitive(primitive.clone());
      transformPrimitive(copy, world);
      carried.push(copy);
    }
  }
  const placement: WeaponPlacement = placeWeapon(carried.flatMap(positionsOf), plan.goal);
  for (const primitive of carried) transformPrimitive(primitive, placement.matrix.toArray());
  for (const animation of root.listAnimations()) animation.dispose();
  for (const skin of root.listSkins()) skin.dispose();
  for (const camera of root.listCameras()) camera.dispose();
  for (const node of root.listNodes()) node.dispose();
  for (const mesh of root.listMeshes()) mesh.dispose();
  for (const scene of root.listScenes()) scene.dispose();
  const mesh: Mesh = document.createMesh(plan.id);
  for (const primitive of carried) mesh.addPrimitive(primitive);
  const scene: Scene = document.createScene(plan.id);
  root.setDefaultScene(scene);
  scene.addChild(document.createNode(plan.id).setMesh(mesh));
  if (plan.keep < 1) await document.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: plan.keep, error: BUILD.simplifyError }));
  await document.transform(prune(), unpartition());
  const textures: string = mkdtempSync(join(tmpdir(), 'weapons-'));
  const rough: Set<Texture> = roughened(document);
  root.listTextures().forEach((texture: Texture, index: number): void => shrinkTexture(texture, textures, index, rough.has(texture)));
  await io.write(BUILD.out.replace('{id}', plan.id), document);
  return `${plan.id}: scale ${placement.scale.toFixed(4)}, ${placement.reach.toFixed(3)} m ahead of the grip, ${placement.behind.toFixed(3)} m behind`;
}

async function main(): Promise<void> {
  const folder: string | undefined = process.argv[2];
  if (folder === undefined) {
    console.error('usage: node tools/build-weapons.ts <folder with the source weapons> [id,id]');
    process.exit(2);
  }
  await Promise.all([MeshoptDecoder.ready, MeshoptSimplifier.ready]);
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const only: string | undefined = process.argv[3];
  const chosen: WeaponPlan[] = readPlan().filter((plan: WeaponPlan): boolean => only === undefined || only.split(',').includes(plan.id));
  const reports: string[] = await Promise.all(chosen.map(async (plan: WeaponPlan): Promise<string> => buildWeapon(io, folder, plan)));
  console.log(reports.join('\n'));
}

await main();
