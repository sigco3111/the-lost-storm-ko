import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Accessor, Document, Material, Mesh, Node, Primitive, Property, Scene, Skin, Texture } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { mergeDocuments, prune, transformMesh, unpartition } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, Euler, MathUtils, Matrix4, Vector3 } from 'three';
import type { Fields } from '../sim/content/read.ts';
import { choice, each, fields, items, numeric, text } from '../sim/content/read.ts';
import type { Anchor, FitGoal, HeadShape, HelmetShape, Placement } from './helmet-fit.ts';
import { fitHelmet, headShape } from './helmet-fit.ts';

const BUILD = {
  out: 'public/models/wear/{frame}/helms/{piece}.glb',
  body: 'public/models/characters/{frame}.glb',
  plan: 'tools/helmets.json',
  headMesh: 'Head',
  eyesMesh: 'Eyes',
  headJoint: 'Head',
  every: 3,
  influences: 4,
  texture: '512',
  webpQuality: '84',
  lowest: 0.3,
  highest: 2.4,
  steps: 8,
  leastClearance: 0.001,
} as const;

const ANCHORS: readonly Anchor[] = ['crown', 'base'];

interface PartPlan {
  readonly file: string;
  readonly turn: readonly [number, number, number];
  readonly clearance: number;
  readonly crown: number;
  readonly forward: number;
  readonly lift: number;
  readonly widen: number;
  readonly anchor: Anchor;
  readonly saturation: number;
  readonly cut: number;
  readonly floor: number | null;
  readonly stretch: readonly [number, number, number];
  readonly shift: readonly [number, number, number];
  readonly finish: Finish | null;
}

interface Finish {
  readonly colour: readonly [number, number, number];
  readonly metallic: number;
  readonly roughness: number;
}

interface PiecePlan {
  readonly piece: string;
  readonly parts: readonly PartPlan[];
}

interface Body {
  readonly document: Document;
  readonly skin: Skin;
  readonly parent: Node | null;
  readonly headIndex: number;
  readonly points: readonly Vector3[];
  readonly joint: number;
  readonly facing: number;
}

function framed(path: string, frame: string): string {
  return path.replaceAll('{frame}', frame);
}

function triple(part: Fields, key: string, where: string): number[] {
  return items(part[key], `${where}.${key}`).map((value: unknown): number => {
    if (typeof value !== 'number') throw new Error(`${where}.${key} holds a value that is not a number`);
    return value;
  });
}

function readFinish(finish: Fields, where: string): Finish {
  const colour: number[] = triple(finish, 'colour', where);
  return { colour: [colour[0] ?? 0, colour[1] ?? 0, colour[2] ?? 0], metallic: numeric(finish, 'metallic', where), roughness: numeric(finish, 'roughness', where) };
}

function finished(document: Document, finish: Finish | null): void {
  if (finish === null) return;
  for (const material of document.getRoot().listMaterials()) {
    material
      .setBaseColorTexture(null)
      .setMetallicRoughnessTexture(null)
      .setEmissiveTexture(null)
      .setEmissiveFactor([0, 0, 0])
      .setBaseColorFactor([finish.colour[0], finish.colour[1], finish.colour[2], 1])
      .setMetallicFactor(finish.metallic)
      .setRoughnessFactor(finish.roughness);
  }
}

function readPlan(): PiecePlan[] {
  const where: string = 'helmets';
  return each(JSON.parse(readFileSync(BUILD.plan, 'utf8')), where, (entry: unknown, at: string): PiecePlan => {
    const piece: Fields = fields(entry, at);
    return {
      piece: text(piece, 'piece', at),
      parts: each(piece['parts'], `${at}.parts`, (raw: unknown, partAt: string): PartPlan => {
        const part: Fields = fields(raw, partAt);
        const turn: number[] = triple(part, 'turn', partAt);
        const stretch: number[] = triple(part, 'stretch', partAt);
        const shift: number[] = triple(part, 'shift', partAt);
        return {
          file: text(part, 'file', partAt),
          turn: [turn[0] ?? 0, turn[1] ?? 0, turn[2] ?? 0],
          clearance: numeric(part, 'clearance', partAt),
          crown: numeric(part, 'crown', partAt),
          forward: numeric(part, 'forward', partAt),
          lift: numeric(part, 'lift', partAt),
          widen: numeric(part, 'widen', partAt),
          anchor: choice(part, 'anchor', ANCHORS, partAt),
          saturation: numeric(part, 'saturation', partAt),
          cut: numeric(part, 'cut', partAt),
          floor: part['floor'] === null ? null : numeric(part, 'floor', partAt),
          stretch: [stretch[0] ?? 1, stretch[1] ?? 1, stretch[2] ?? 1],
          shift: [shift[0] ?? 0, shift[1] ?? 0, shift[2] ?? 0],
          finish: part['finish'] === null ? null : readFinish(fields(part['finish'], `${partAt}.finish`), `${partAt}.finish`),
        };
      }),
    };
  });
}

function heroFrames(): string[] {
  const where: string = 'helmets';
  const player: Fields = fields(JSON.parse(readFileSync('data/player.json', 'utf8')), 'player');
  const rigIds: string[] = each(player['heroes'], 'heroes', (entry: unknown, at: string): string => text(fields(entry, at), 'rig', at));
  const rigs: Fields[] = each(JSON.parse(readFileSync('data/rigs.json', 'utf8')), 'rigs', (entry: unknown, at: string): Fields => fields(entry, at));
  return [...new Set(rigs.filter((rig: Fields): boolean => rigIds.includes(text(rig, 'id', where))).map((rig: Fields): string => text(rig, 'frame', where)))];
}

function positionsOf(primitive: Primitive): Vector3[] {
  const accessor: Accessor | null = primitive.getAttribute('POSITION');
  if (accessor === null) return [];
  return Array.from({ length: accessor.getCount() }, (_: unknown, index: number): Vector3 => new Vector3().fromArray(accessor.getElement(index, [0, 0, 0])));
}

function meshNode(document: Document, name: string): Node {
  const found: Node | undefined = document
    .getRoot()
    .listNodes()
    .find((node: Node): boolean => node.getName() === name && node.getMesh() !== null);
  if (found === undefined) throw new Error(`no mesh node ${name}`);
  return found;
}

function pointsOf(node: Node): Vector3[] {
  return (node.getMesh()?.listPrimitives() ?? []).flatMap(positionsOf);
}

async function readBody(io: NodeIO, frame: string): Promise<Body> {
  const document: Document = await io.read(framed(BUILD.body, frame));
  const node: Node = meshNode(document, BUILD.headMesh);
  const skin: Skin | null = node.getSkin();
  if (skin === null) throw new Error(`${frame} head is not skinned`);
  const headIndex: number = skin.listJoints().findIndex((joint: Node): boolean => joint.getName() === BUILD.headJoint);
  const binds: Accessor | null = skin.getInverseBindMatrices();
  if (headIndex < 0 || binds === null) throw new Error(`${frame} skin has no ${BUILD.headJoint}`);
  const joint: Vector3 = new Vector3().setFromMatrixPosition(new Matrix4().fromArray(binds.getElement(headIndex, Array.from({ length: 16 }, (): number => 0))).invert());
  const points: Vector3[] = pointsOf(node);
  const centre: Vector3 = new Box3().setFromPoints(points).getCenter(new Vector3());
  const eyes: Vector3 = new Box3().setFromPoints(pointsOf(meshNode(document, BUILD.eyesMesh))).getCenter(new Vector3());
  return { document, skin, parent: node.getParentNode(), headIndex, points, joint: joint.y, facing: eyes.z >= centre.z ? 1 : -1 };
}

function meshNodesOf(document: Document): Node[] {
  return document
    .getRoot()
    .listNodes()
    .filter((node: Node): boolean => node.getMesh() !== null);
}

function bakeInto(document: Document, matrix: Matrix4): void {
  for (const node of meshNodesOf(document)) {
    const mesh: Mesh | null = node.getMesh();
    if (mesh === null) continue;
    transformMesh(mesh, matrix.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix())).toArray());
  }
}

function shapeOf(document: Document): HelmetShape {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const node of meshNodesOf(document)) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const start: number = positions.length / 3;
      const points: Vector3[] = positionsOf(primitive);
      for (const point of points) positions.push(point.x, point.y, point.z);
      const order: Accessor | null = primitive.getIndices();
      if (order === null) for (let index: number = 0; index < points.length; index += 1) indices.push(start + index);
      else for (let index: number = 0; index < order.getCount(); index += 1) indices.push(start + order.getScalar(index));
    }
  }
  return { positions, indices };
}

function trimBelow(document: Document, primitive: Primitive, floor: number): void {
  const points: Vector3[] = positionsOf(primitive);
  const order: Accessor | null = primitive.getIndices();
  const corners: number[] = order === null ? points.map((_: Vector3, index: number): number => index) : Array.from({ length: order.getCount() }, (_: unknown, index: number): number => order.getScalar(index));
  const kept: number[] = [];
  for (let at: number = 0; at + 2 < corners.length; at += 3) {
    const triangle: number[] = [corners[at] ?? 0, corners[at + 1] ?? 0, corners[at + 2] ?? 0];
    if (triangle.some((corner: number): boolean => (points[corner]?.y ?? floor) >= floor)) kept.push(...triangle);
  }
  primitive.setIndices(document.createAccessor().setArray(new Uint32Array(kept)).setType('SCALAR'));
}

function rigid(document: Document, primitive: Primitive, joint: number): void {
  const count: number = primitive.getAttribute('POSITION')?.getCount() ?? 0;
  const joints: Uint16Array = new Uint16Array(count * BUILD.influences);
  const weights: Float32Array = new Float32Array(count * BUILD.influences);
  for (let vertex: number = 0; vertex < count; vertex += 1) {
    joints[vertex * BUILD.influences] = joint;
    weights[vertex * BUILD.influences] = 1;
  }
  primitive.setAttribute('JOINTS_0', document.createAccessor().setArray(joints).setType('VEC4'));
  primitive.setAttribute('WEIGHTS_0', document.createAccessor().setArray(weights).setType('VEC4'));
}

function shrinkTexture(texture: Texture, folder: string, index: number): void {
  const image: Uint8Array | null = texture.getImage();
  if (image === null) return;
  const source: string = join(folder, `${index}.src`);
  const target: string = join(folder, `${index}.webp`);
  writeFileSync(source, image);
  execFileSync('cwebp', ['-quiet', '-q', BUILD.webpQuality, '-m', '6', '-resize', BUILD.texture, '0', source, '-o', target]);
  texture.setImage(new Uint8Array(readFileSync(target)));
  texture.setMimeType('image/webp');
  texture.setURI('');
}

function desaturate(document: Document, saturation: number): void {
  if (saturation === 1) return;
  const folder: string = mkdtempSync(join(tmpdir(), 'helmet-colour-'));
  document
    .getRoot()
    .listMaterials()
    .forEach((material: Material, index: number): void => {
      const texture: Texture | null = material.getBaseColorTexture();
      const image: Uint8Array | null = texture?.getImage() ?? null;
      if (texture === null || image === null) return;
      const source: string = join(folder, `${index}.src`);
      const target: string = join(folder, `${index}.png`);
      writeFileSync(source, image);
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', source, '-vf', `hue=s=${saturation}`, target]);
      texture.setImage(new Uint8Array(readFileSync(target)));
      texture.setMimeType('image/png');
    });
}

async function partFor(io: NodeIO, folder: string, part: PartPlan, body: Body, joint: number, report: string[], label: string): Promise<Document> {
  const document: Document = await io.read(join(folder, part.file));
  const turn: Matrix4 = new Matrix4().makeRotationFromEuler(new Euler(MathUtils.degToRad(part.turn[0]), MathUtils.degToRad(part.turn[1] + (body.facing > 0 ? 0 : 180)), MathUtils.degToRad(part.turn[2])));
  bakeInto(document, new Matrix4().makeScale(part.stretch[0], part.stretch[1], part.stretch[2]).multiply(turn));
  desaturate(document, part.saturation);
  finished(document, part.finish);
  for (const node of meshNodesOf(document)) node.setMatrix(new Matrix4().toArray());
  const goal: FitGoal = { anchor: part.anchor, clearance: part.clearance, crown: part.crown, forward: part.forward * body.facing, lift: part.lift, lowest: BUILD.lowest, highest: BUILD.highest * part.widen, steps: BUILD.steps };
  const head: HeadShape = headShape(body.points, body.joint + part.cut, BUILD.every);
  const placed: Placement = fitHelmet(shapeOf(document), head, goal);
  report.push(`  ${label}: scale ${placed.scale.toFixed(4)}, ${(placed.clearance * 1000).toFixed(1)} mm clear over ${placed.covered} of ${head.points.length} head points`);
  if (placed.covered > 0 && placed.clearance < BUILD.leastClearance) throw new Error(`${label} is only ${(placed.clearance * 1000).toFixed(1)} mm off the head`);
  const place: Matrix4 = new Matrix4().makeTranslation(placed.offset.x + part.shift[0], placed.offset.y + part.shift[1], placed.offset.z + part.shift[2] * body.facing).multiply(new Matrix4().makeScale(placed.scale, placed.scale, placed.scale));
  for (const node of meshNodesOf(document)) {
    const mesh: Mesh | null = node.getMesh();
    if (mesh === null) continue;
    transformMesh(mesh, place.toArray());
    for (const primitive of mesh.listPrimitives()) {
      if (part.floor !== null) trimBelow(document, primitive, body.joint + part.floor);
      rigid(document, primitive, joint);
    }
  }
  return document;
}

async function buildPiece(io: NodeIO, frame: string, folder: string, piece: PiecePlan): Promise<string[]> {
  const body: Body = await readBody(io, frame);
  const target: Document = body.document;
  const report: string[] = [];
  for (const node of meshNodesOf(target)) node.dispose();
  for (const extension of target.getRoot().listExtensionsUsed()) extension.dispose();
  const mesh: Mesh = target.createMesh(piece.piece);
  const sources: Document[] = await Promise.all(piece.parts.map(async (part: PartPlan, index: number): Promise<Document> => partFor(io, folder, part, body, body.headIndex, report, `${frame} ${piece.piece} ${index + 1}`)));
  for (const source of sources) {
    const sourceNodes: Node[] = meshNodesOf(source);
    const merged: Map<Property, Property> = mergeDocuments(target, source);
    for (const node of sourceNodes) {
      const copy: Property | undefined = merged.get(node);
      const copied: Node | undefined = target
        .getRoot()
        .listNodes()
        .find((candidate: Node): boolean => candidate === copy);
      for (const primitive of copied?.getMesh()?.listPrimitives() ?? []) mesh.addPrimitive(primitive);
      copied?.dispose();
    }
  }
  const scene: Scene | null = target.getRoot().getDefaultScene();
  for (const other of target.getRoot().listScenes()) if (other !== scene) other.dispose();
  const node: Node = target.createNode(piece.piece).setMesh(mesh).setSkin(body.skin);
  if (body.parent === null) scene?.addChild(node);
  else body.parent.addChild(node);
  await target.transform(prune(), unpartition());
  const textures: string = mkdtempSync(join(tmpdir(), 'helmets-'));
  target
    .getRoot()
    .listTextures()
    .forEach((texture: Texture, index: number): void => shrinkTexture(texture, textures, index));
  await io.write(framed(BUILD.out, frame).replace('{piece}', piece.piece.toLowerCase()), target);
  return report;
}

async function main(): Promise<void> {
  const folder: string | undefined = process.argv[2];
  if (folder === undefined) {
    console.error('usage: node tools/build-helmets.ts <folder with the source helmets> [Piece,Piece]');
    process.exit(2);
  }
  await MeshoptDecoder.ready;
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const plan: PiecePlan[] = readPlan();
  const only: string | undefined = process.argv[3];
  const chosen: PiecePlan[] = plan.filter((piece: PiecePlan): boolean => only === undefined || only.split(',').includes(piece.piece));
  const reports: string[][] = await Promise.all(heroFrames().flatMap((frame: string): Promise<string[]>[] => chosen.map(async (piece: PiecePlan): Promise<string[]> => buildPiece(io, frame, folder, piece))));
  console.log(reports.flat().join('\n'));
}

await main();
