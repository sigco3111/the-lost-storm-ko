import type { Document, Material, Mesh, Node, Primitive, Property, Skin } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument, dedup, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Box3, Color, Matrix3, Matrix4, Vector3 } from 'three';
import type { Fields } from '../sim/content/read.ts';
import { each, fields, numeric, text, textList } from '../sim/content/read.ts';
import { elementsOf, meshNodes } from './fit-over.ts';
import { simplifyDocument } from './simplify-model.ts';

const SKULL = {
  influences: 4,
  corners: 3,
  sphereRings: 8,
  sphereSegments: 12,
  simplifyError: 0.02,
  minTriangles: 100,
  degrees: Math.PI / 180,
} as const;

export interface JointLink {
  readonly from: string;
  readonly to: string;
}

export type Point = readonly [number, number, number];

export interface EyePlan {
  readonly material: string;
  readonly colour: string;
  readonly strength: number;
  readonly radius: number;
  readonly at: readonly Point[];
}

export interface PartPlan {
  readonly source: string;
  readonly sizeFrom: string | null;
  readonly keep: readonly string[] | null;
  readonly joints: readonly JointLink[];
  readonly turnDegrees: number;
  readonly height: number;
  readonly offset: Point;
  readonly triangles: number | null;
  readonly material: string;
  readonly tint: string;
}

export interface SkullPlan {
  readonly out: string;
  readonly body: string;
  readonly drop: readonly string[];
  readonly mesh: string;
  readonly anchor: string;
  readonly parts: readonly PartPlan[];
  readonly eyes: EyePlan | null;
}

export interface Measured {
  readonly centre: Vector3;
  readonly height: number;
}

interface Skeleton {
  readonly skin: Skin;
  readonly names: readonly string[];
}

interface Influences {
  readonly joints: number[];
  readonly weights: number[];
}

interface Built {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly joints: number[];
  readonly weights: number[];
  readonly indices: number[];
}

interface SourcePiece {
  readonly primitive: Primitive;
  readonly world: Matrix4;
  readonly names: readonly string[] | null;
}

function usage(): never {
  console.error('usage: node tools/build-skull-body.ts <plan.json> <sources-folder> [<out.glb> ...]');
  process.exit(2);
}

function readLink(value: unknown, where: string): JointLink {
  const source: Fields = fields(value, where);
  return { from: text(source, 'from', where), to: text(source, 'to', where) };
}

function readPoint(value: unknown, where: string): Point {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${where} must be three numbers`);
  const list: readonly unknown[] = value;
  const [x, y, z] = list;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') throw new Error(`${where} must be three numbers`);
  return [x, y, z];
}

function readEyes(value: unknown, where: string): EyePlan | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  return {
    material: text(source, 'material', where),
    colour: text(source, 'colour', where),
    strength: numeric(source, 'strength', where),
    radius: numeric(source, 'radius', where),
    at: each(source['at'], `${where}.at`, readPoint),
  };
}

function readPart(value: unknown, where: string): PartPlan {
  const source: Fields = fields(value, where);
  return {
    source: text(source, 'source', where),
    sizeFrom: source['sizeFrom'] === undefined ? null : text(source, 'sizeFrom', where),
    keep: source['keep'] === undefined ? null : textList(source, 'keep', where),
    joints: source['joints'] === undefined ? [] : each(source['joints'], `${where}.joints`, readLink),
    turnDegrees: source['turnDegrees'] === undefined ? 0 : numeric(source, 'turnDegrees', where),
    height: numeric(source, 'height', where),
    offset: source['offset'] === undefined ? [0, 0, 0] : readPoint(source['offset'], `${where}.offset`),
    triangles: source['triangles'] === undefined ? null : numeric(source, 'triangles', where),
    material: text(source, 'material', where),
    tint: source['tint'] === undefined ? '#ffffff' : text(source, 'tint', where),
  };
}

export function readSkullPlans(value: unknown): SkullPlan[] {
  return each(value, 'plans', (entry: unknown, where: string): SkullPlan => {
    const source: Fields = fields(entry, where);
    return {
      out: text(source, 'out', where),
      body: text(source, 'body', where),
      drop: textList(source, 'drop', where),
      mesh: text(source, 'mesh', where),
      anchor: text(source, 'anchor', where),
      parts: each(source['parts'], `${where}.parts`, readPart),
      eyes: readEyes(source['eyes'], `${where}.eyes`),
    };
  });
}

function skeletonOf(document: Document, where: string): Skeleton {
  const skin: Skin | undefined = document.getRoot().listSkins()[0];
  if (skin === undefined) throw new Error(`${where} has no skin`);
  return { skin, names: skin.listJoints().map((joint: Node): string => joint.getName()) };
}

export function dominantJoint(joints: readonly number[], weights: readonly number[], vertex: number): number {
  let best: number = 0;
  let most: number = -1;
  for (let slot: number = 0; slot < SKULL.influences; slot += 1) {
    const weight: number = weights[vertex * SKULL.influences + slot] ?? 0;
    if (weight > most) {
      most = weight;
      best = joints[vertex * SKULL.influences + slot] ?? 0;
    }
  }
  return best;
}

export function mappedInfluences(joints: readonly number[], weights: readonly number[], vertex: number, map: ReadonlyMap<number, number>, fallback: number): Influences {
  const total: Map<number, number> = new Map<number, number>();
  for (let slot: number = 0; slot < SKULL.influences && joints.length > 0; slot += 1) {
    const weight: number = weights[vertex * SKULL.influences + slot] ?? 0;
    const to: number | undefined = map.get(joints[vertex * SKULL.influences + slot] ?? -1);
    if (weight <= 0 || to === undefined) continue;
    total.set(to, (total.get(to) ?? 0) + weight);
  }
  if (total.size === 0) total.set(fallback, 1);
  const sum: number = [...total.values()].reduce((left: number, right: number): number => left + right, 0);
  const pairs: [number, number][] = [...total].toSorted((left: [number, number], right: [number, number]): number => right[1] - left[1]).slice(0, SKULL.influences);
  const out: Influences = { joints: [], weights: [] };
  for (let slot: number = 0; slot < SKULL.influences; slot += 1) {
    const pair: [number, number] | undefined = pairs[slot];
    out.joints.push(pair === undefined ? 0 : pair[0]);
    out.weights.push(pair === undefined ? 0 : pair[1] / sum);
  }
  return out;
}

export function measure(points: readonly Vector3[]): Measured {
  const box: Box3 = new Box3().setFromPoints([...points]);
  if (box.isEmpty()) throw new Error('nothing to measure');
  return { centre: box.getCenter(new Vector3()), height: box.max.y - box.min.y };
}

export function fitMove(from: Measured, to: Measured, height: number, offset: Point): Matrix4 {
  const scale: number = (height * to.height) / from.height;
  const placed: Matrix4 = new Matrix4().makeTranslation(to.centre.x + offset[0], to.centre.y + offset[1], to.centre.z + offset[2]);
  return placed.multiply(new Matrix4().makeScale(scale, scale, scale)).multiply(new Matrix4().makeTranslation(-from.centre.x, -from.centre.y, -from.centre.z));
}

function pointsOf(primitive: Primitive, place: Matrix4, owned: (joints: readonly number[], weights: readonly number[], vertex: number) => boolean): Vector3[] {
  const positions: number[] = elementsOf(primitive.getAttribute('POSITION'), 3);
  const joints: number[] = elementsOf(primitive.getAttribute('JOINTS_0'), SKULL.influences);
  const weights: number[] = elementsOf(primitive.getAttribute('WEIGHTS_0'), SKULL.influences);
  const points: Vector3[] = [];
  for (let vertex: number = 0; vertex < positions.length / 3; vertex += 1) {
    if (owned(joints, weights, vertex)) points.push(new Vector3(positions[vertex * 3] ?? 0, positions[vertex * 3 + 1] ?? 0, positions[vertex * 3 + 2] ?? 0).applyMatrix4(place));
  }
  return points;
}

function targetBox(document: Document, skeleton: Skeleton, plan: SkullPlan): Measured {
  const anchor: number = skeleton.names.indexOf(plan.anchor);
  if (anchor < 0) throw new Error(`${plan.body} has no joint named "${plan.anchor}"`);
  const points: Vector3[] = [];
  for (const node of meshNodes(document)) {
    if (!plan.drop.includes(node.getName())) continue;
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      points.push(...pointsOf(primitive, new Matrix4(), (joints: readonly number[], weights: readonly number[], vertex: number): boolean => dominantJoint(joints, weights, vertex) === anchor));
    }
  }
  return measure(points);
}

function piecesOf(source: Document): SourcePiece[] {
  const skin: Skin | undefined = source.getRoot().listSkins()[0];
  const names: readonly string[] | null = skin === undefined ? null : skin.listJoints().map((joint: Node): string => joint.getName());
  return meshNodes(source).flatMap((node: Node): SourcePiece[] => {
    const world: Matrix4 = node.getSkin() === null ? new Matrix4().fromArray(node.getWorldMatrix()) : new Matrix4();
    return (node.getMesh()?.listPrimitives() ?? []).map((primitive: Primitive): SourcePiece => ({ primitive, world, names: node.getSkin() === null ? null : names }));
  });
}

function jointSet(names: readonly string[] | null, wanted: readonly string[] | null, where: string): Set<number> | null {
  if (wanted === null) return null;
  if (names === null) throw new Error(`${where} names joints but has no skin`);
  return new Set<number>(
    wanted.map((name: string): number => {
      const at: number = names.indexOf(name);
      if (at < 0) throw new Error(`${where} has no joint named "${name}"`);
      return at;
    }),
  );
}

function carve(piece: SourcePiece, place: Matrix4, kept: Set<number> | null, map: ReadonlyMap<number, number>, fallback: number): Built {
  const primitive: Primitive = piece.primitive;
  const positions: number[] = elementsOf(primitive.getAttribute('POSITION'), 3);
  const normals: number[] = elementsOf(primitive.getAttribute('NORMAL'), 3);
  const uvs: number[] = elementsOf(primitive.getAttribute('TEXCOORD_0'), 2);
  const joints: number[] = elementsOf(primitive.getAttribute('JOINTS_0'), SKULL.influences);
  const weights: number[] = elementsOf(primitive.getAttribute('WEIGHTS_0'), SKULL.influences);
  const indices: number[] = primitive.getIndices() === null ? Array.from({ length: positions.length / 3 }, (_value: unknown, index: number): number => index) : elementsOf(primitive.getIndices(), 1);
  const turn: Matrix3 = new Matrix3().getNormalMatrix(place);
  const slotOf: Map<number, number> = new Map<number, number>();
  const built: Built = { positions: [], normals: [], uvs: [], joints: [], weights: [], indices: [] };
  const point: Vector3 = new Vector3();
  const normal: Vector3 = new Vector3();
  const add = (vertex: number): number => {
    const known: number | undefined = slotOf.get(vertex);
    if (known !== undefined) return known;
    const slot: number = slotOf.size;
    slotOf.set(vertex, slot);
    point.set(positions[vertex * 3] ?? 0, positions[vertex * 3 + 1] ?? 0, positions[vertex * 3 + 2] ?? 0).applyMatrix4(place);
    normal.set(normals[vertex * 3] ?? 0, normals[vertex * 3 + 1] ?? 0, normals[vertex * 3 + 2] ?? 0).applyMatrix3(turn).normalize();
    built.positions.push(point.x, point.y, point.z);
    built.normals.push(normal.x, normal.y, normal.z);
    built.uvs.push(uvs[vertex * 2] ?? 0, uvs[vertex * 2 + 1] ?? 0);
    const influences: Influences = mappedInfluences(joints, weights, vertex, map, fallback);
    built.joints.push(...influences.joints);
    built.weights.push(...influences.weights);
    return slot;
  };
  for (let corner: number = 0; corner + 2 < indices.length; corner += SKULL.corners) {
    const triangle: number[] = [indices[corner] ?? 0, indices[corner + 1] ?? 0, indices[corner + 2] ?? 0];
    if (kept !== null && !triangle.every((vertex: number): boolean => kept.has(dominantJoint(joints, weights, vertex)))) continue;
    for (const vertex of triangle) built.indices.push(add(vertex));
  }
  return built;
}

export function sphere(centre: Point, radius: number, base: number): { readonly positions: number[]; readonly normals: number[]; readonly indices: number[] } {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let ring: number = 0; ring <= SKULL.sphereRings; ring += 1) {
    const tilt: number = (ring / SKULL.sphereRings) * Math.PI;
    for (let segment: number = 0; segment <= SKULL.sphereSegments; segment += 1) {
      const turn: number = (segment / SKULL.sphereSegments) * Math.PI * 2;
      const x: number = Math.sin(tilt) * Math.cos(turn);
      const y: number = Math.cos(tilt);
      const z: number = Math.sin(tilt) * Math.sin(turn);
      positions.push(centre[0] + x * radius, centre[1] + y * radius, centre[2] + z * radius);
      normals.push(x, y, z);
    }
  }
  const row: number = SKULL.sphereSegments + 1;
  for (let ring: number = 0; ring < SKULL.sphereRings; ring += 1) {
    for (let segment: number = 0; segment < SKULL.sphereSegments; segment += 1) {
      const a: number = base + ring * row + segment;
      const b: number = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { positions, normals, indices };
}

function primitiveOf(document: Document, built: Built, material: Material): Primitive {
  const buffer = document.getRoot().listBuffers()[0] ?? document.createBuffer();
  const made: Primitive = document
    .createPrimitive()
    .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(new Float32Array(built.positions)).setBuffer(buffer))
    .setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(new Float32Array(built.normals)).setBuffer(buffer))
    .setAttribute('JOINTS_0', document.createAccessor().setType('VEC4').setArray(new Uint16Array(built.joints)).setBuffer(buffer))
    .setAttribute('WEIGHTS_0', document.createAccessor().setType('VEC4').setArray(new Float32Array(built.weights)).setBuffer(buffer))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint32Array(built.indices)).setBuffer(buffer))
    .setMaterial(material);
  if (built.uvs.length > 0) made.setAttribute('TEXCOORD_0', document.createAccessor().setType('VEC2').setArray(new Float32Array(built.uvs)).setBuffer(buffer));
  return made;
}

function eyesOf(document: Document, anchor: number, eyes: EyePlan): Primitive {
  const built: Built = { positions: [], normals: [], uvs: [], joints: [], weights: [], indices: [] };
  for (const at of eyes.at) {
    const ball: { readonly positions: number[]; readonly normals: number[]; readonly indices: number[] } = sphere(at, eyes.radius, built.positions.length / 3);
    built.positions.push(...ball.positions);
    built.normals.push(...ball.normals);
    built.indices.push(...ball.indices);
    for (let vertex: number = 0; vertex < ball.positions.length / 3; vertex += 1) {
      built.joints.push(anchor, 0, 0, 0);
      built.weights.push(1, 0, 0, 0);
    }
  }
  const colour: Color = new Color(eyes.colour);
  const material: Material = document
    .createMaterial(eyes.material)
    .setBaseColorFactor([colour.r, colour.g, colour.b, 1])
    .setEmissiveFactor([Math.min(1, colour.r * eyes.strength), Math.min(1, colour.g * eyes.strength), Math.min(1, colour.b * eyes.strength)])
    .setRoughnessFactor(1)
    .setMetallicFactor(0);
  return primitiveOf(document, built, material);
}

async function sourceOf(io: NodeIO, part: PartPlan, root: string): Promise<Document> {
  const source: Document = await io.read(part.source.startsWith('public/') ? part.source : `${root}/${part.source}`);
  if (part.triangles === null) return source;
  const count: number = source
    .getRoot()
    .listMeshes()
    .flatMap((mesh: Mesh): Primitive[] => mesh.listPrimitives())
    .reduce((total: number, primitive: Primitive): number => total + (primitive.getIndices()?.getCount() ?? 0) / SKULL.corners, 0);
  if (count > part.triangles) await simplifyDocument(source, { ratio: part.triangles / count, error: SKULL.simplifyError, minTriangles: SKULL.minTriangles });
  return source;
}

function addPart(document: Document, mesh: Mesh, target: Skeleton, aim: Measured, part: PartPlan, source: Document, anchor: number): void {
  const pieces: SourcePiece[] = piecesOf(source);
  const turn: Matrix4 = new Matrix4().makeRotationY(part.turnDegrees * SKULL.degrees);
  const sizing: Vector3[] = pieces.flatMap((piece: SourcePiece): Vector3[] => {
    const sized: Set<number> | null = jointSet(piece.names, part.sizeFrom === null ? null : [part.sizeFrom], part.source);
    return pointsOf(piece.primitive, turn.clone().multiply(piece.world), (joints: readonly number[], weights: readonly number[], vertex: number): boolean => sized === null || sized.has(dominantJoint(joints, weights, vertex)));
  });
  const move: Matrix4 = fitMove(measure(sizing), aim, part.height, part.offset);
  const tint: Color = new Color(part.tint);
  for (const piece of pieces) {
    const worn: Material | null = piece.primitive.getMaterial();
    const copied: Property | undefined = worn === null ? undefined : copyToDocument(document, source, [worn]).get(worn);
    const material: Material =
      document
        .getRoot()
        .listMaterials()
        .find((candidate: Material): boolean => candidate === copied) ?? document.createMaterial(part.material);
    material.setName(part.material).setBaseColorFactor([tint.r, tint.g, tint.b, 1]).setMetallicFactor(0);
    const map: Map<number, number> = new Map<number, number>();
    for (const link of part.joints) {
      const from: number = piece.names?.indexOf(link.from) ?? -1;
      const to: number = target.names.indexOf(link.to);
      if (from < 0 || to < 0) throw new Error(`${part.source}: cannot link "${link.from}" to "${link.to}"`);
      map.set(from, to);
    }
    const built: Built = carve(piece, move.clone().multiply(turn).multiply(piece.world), jointSet(piece.names, part.keep, part.source), map, anchor);
    if (built.indices.length > 0) mesh.addPrimitive(primitiveOf(document, built, material));
  }
}

async function build(io: NodeIO, plan: SkullPlan, root: string): Promise<Document> {
  const document: Document = await io.read(plan.body);
  const target: Skeleton = skeletonOf(document, plan.body);
  const anchor: number = target.names.indexOf(plan.anchor);
  const aim: Measured = targetBox(document, target, plan);
  let holder: Node | null = null;
  for (const node of meshNodes(document)) {
    if (!plan.drop.includes(node.getName())) continue;
    holder ??= node.getParentNode();
    node.dispose();
  }
  const mesh: Mesh = document.createMesh(plan.mesh);
  const sources: Document[] = await Promise.all(plan.parts.map((part: PartPlan): Promise<Document> => sourceOf(io, part, root)));
  plan.parts.forEach((part: PartPlan, index: number): void => {
    const source: Document | undefined = sources[index];
    if (source !== undefined) addPart(document, mesh, target, aim, part, source, anchor);
  });
  if (plan.eyes !== null) mesh.addPrimitive(eyesOf(document, anchor, plan.eyes));
  const node: Node = document.createNode(plan.mesh).setMesh(mesh).setSkin(target.skin);
  if (holder === null) document.getRoot().listScenes()[0]?.addChild(node);
  else holder.addChild(node);
  await document.transform(prune({ keepLeaves: true }), dedup());
  return document;
}

async function main(): Promise<void> {
  const [planPath, root, ...only] = process.argv.slice(2);
  if (planPath === undefined || root === undefined) usage();
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const plans: SkullPlan[] = readSkullPlans(JSON.parse(readFileSync(planPath, 'utf8')));
  const chosen: SkullPlan[] = plans.filter((plan: SkullPlan): boolean => only.length === 0 || only.includes(plan.out));
  await Promise.all(
    chosen.map(async (plan: SkullPlan): Promise<void> => {
      const document: Document = await build(io, plan, root);
      mkdirSync(dirname(plan.out), { recursive: true });
      await io.write(plan.out, document);
      console.log(`${plan.out}: ${plan.parts.map((part: PartPlan): string => part.source).join(' + ')} over ${plan.body}`);
    }),
  );
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) await main();
