import { readFileSync } from 'node:fs';
import type { Accessor, Document, Material, Node, Primitive, Skin } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, Matrix4, Vector3 } from 'three';
import type { Fields } from '../sim/content/read.ts';
import { each, fields, text, textList } from '../sim/content/read.ts';
import type { Design, DesignResult, HeadFit, Landmarks } from './headgear-designs.ts';
import { DESIGNS } from './headgear-designs.ts';
import type { Envelope, EnvelopeFit, MeshPart, ShellPlan } from './headgear-shapes.ts';
import { anglesOf, envelopeOf, innerRadius, smoothParts, triangleCount } from './headgear-shapes.ts';

const BUILD = {
  out: 'public/models/wear/{frame}/headgear.glb',
  body: 'public/models/characters/{frame}.glb',
  hair: 'public/models/wear/{frame}/hair.glb',
  hairRegion: 'hair',
  bodyFolder: 'models/characters/',
  headMesh: 'Head',
  eyesMesh: 'Eyes',
  browsMesh: 'Eyebrows',
  headJoint: 'Head',
  centreBelowEyes: 0.015,
  reachBelow: 0.17,
  chinBand: 0.015,
  chinBehindNose: 0.06,
  hairFront: 0.04,
  hairBand: 0.02,
  influences: 4,
  leastClearance: 0.001,
  wideIndexFrom: 65536,
  tuckWithin: 0.0105,
  tuckSide: 58,
  tuckPasses: 5,
  maskSide: 84,
  maskBelowChin: 8,
  maskAboveHairline: 4,
} as const;

const LOOSE: EnvelopeFit = { cone: 7, spread: 2, blur: 7 };
const MASK_FIT: EnvelopeFit = { cone: 4, spread: 3, blur: 18 };
const SNUG: EnvelopeFit = { cone: 3, spread: 1, blur: 3 };

interface MaterialLook {
  readonly color: readonly [number, number, number, number];
  readonly metal: number;
  readonly rough: number;
  readonly glow: readonly [number, number, number];
}

const LOOKS: Readonly<Record<string, MaterialLook>> = {
  plate: { color: [0.62, 0.6, 0.56, 1], metal: 0, rough: 1, glow: [0, 0, 0] },
  trim: { color: [0.55, 0.42, 0.24, 1], metal: 0.85, rough: 0.6, glow: [0, 0, 0] },
  lining: { color: [0.12, 0.1, 0.09, 1], metal: 0, rough: 1, glow: [0, 0, 0] },
  strap: { color: [0.2, 0.15, 0.12, 1], metal: 0, rough: 1, glow: [0, 0, 0] },
  slit: { color: [0.006, 0.006, 0.008, 1], metal: 0, rough: 1, glow: [0, 0, 0] },
  lens: { color: [0.05, 0.075, 0.085, 1], metal: 0.7, rough: 0.14, glow: [0.035, 0.07, 0.08] },
  glass: { color: [0.3, 0.22, 0.1, 1], metal: 0.6, rough: 0.12, glow: [0.05, 0.032, 0.008] },
  tip: { color: [0.62, 0.58, 0.8, 1], metal: 0.9, rough: 0.3, glow: [0, 0, 0] },
  stone: { color: [0.22, 0.03, 0.04, 1], metal: 0.5, rough: 0.2, glow: [0.03, 0.002, 0.004] },
};

interface SkinPoint {
  readonly at: Vector3;
  readonly joints: readonly number[];
  readonly weights: readonly number[];
}

interface Head {
  readonly skin: Skin;
  readonly parent: Node | null;
  readonly points: readonly SkinPoint[];
  readonly face: readonly Vector3[];
  readonly hair: readonly Vector3[];
  readonly eyes: Box3;
  readonly brows: Box3;
  readonly joint: Vector3;
  readonly headIndex: number;
}

function framed(path: string, frame: string): string {
  return path.replaceAll('{frame}', frame);
}

function heroHair(): Map<string, string[]> {
  const where: string = 'headgear';
  const player: Fields = fields(JSON.parse(readFileSync('data/player.json', 'utf8')), 'player');
  const heroRigs: string[] = each(player['heroes'], 'heroes', (entry: unknown, at: string): string => text(fields(entry, at), 'rig', at));
  const rigs: Fields[] = each(JSON.parse(readFileSync('data/rigs.json', 'utf8')), 'rigs', (entry: unknown, at: string): Fields => fields(entry, at));
  const wearables: Fields[] = each(JSON.parse(readFileSync('data/wearables.json', 'utf8')), 'wearables', (entry: unknown, at: string): Fields => fields(entry, at));
  const hair: Map<string, string[]> = new Map<string, string[]>();
  for (const rig of rigs) {
    if (!heroRigs.includes(text(rig, 'id', where))) continue;
    const frame: string = text(rig, 'frame', where);
    const base: string[] = rig['base'] === undefined ? [] : textList(rig, 'base', where);
    for (const worn of wearables) {
      if (!base.includes(text(worn, 'id', where)) || text(worn, 'region', where) !== BUILD.hairRegion) continue;
      hair.set(frame, [...(hair.get(frame) ?? []), ...textList(worn, 'pieces', where)]);
    }
  }
  const layers: Fields[] = each(JSON.parse(readFileSync('data/base-layers.json', 'utf8')), 'layers', (entry: unknown, at: string): Fields => fields(entry, at));
  for (const layer of layers) {
    const frame: string = text(layer, 'body', where).replace(BUILD.bodyFolder, '').replace('.glb', '');
    const worn: string[] = textList(layer, 'wear', where);
    for (const wearable of wearables) {
      if (!worn.includes(text(wearable, 'id', where)) || text(wearable, 'region', where) !== BUILD.hairRegion) continue;
      hair.set(frame, [...new Set([...(hair.get(frame) ?? []), ...textList(wearable, 'pieces', where)])]);
    }
  }
  return hair;
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

function primitivesOf(node: Node): Primitive[] {
  return node.getMesh()?.listPrimitives() ?? [];
}

function boxOf(node: Node): Box3 {
  return new Box3().setFromPoints(primitivesOf(node).flatMap(positionsOf));
}

function skinPoints(node: Node): SkinPoint[] {
  const found: SkinPoint[] = [];
  for (const primitive of primitivesOf(node)) {
    const joints: Accessor | null = primitive.getAttribute('JOINTS_0');
    const weights: Accessor | null = primitive.getAttribute('WEIGHTS_0');
    if (joints === null || weights === null) continue;
    positionsOf(primitive).forEach((at: Vector3, index: number): void => {
      found.push({ at, joints: joints.getElement(index, [0, 0, 0, 0]), weights: weights.getElement(index, [0, 0, 0, 0]) });
    });
  }
  return found;
}

function jointAt(skin: Skin, name: string): Vector3 {
  const index: number = skin.listJoints().findIndex((joint: Node): boolean => joint.getName() === name);
  const binds: Accessor | null = skin.getInverseBindMatrices();
  if (index < 0 || binds === null) throw new Error(`skin has no joint ${name}`);
  return new Vector3().setFromMatrixPosition(new Matrix4().fromArray(binds.getElement(index, Array.from({ length: 16 }, (): number => 0))).invert());
}

async function readHead(io: NodeIO, frame: string, hairPieces: readonly string[]): Promise<{ readonly document: Document; readonly head: Head }> {
  const document: Document = await io.read(framed(BUILD.body, frame));
  const node: Node = meshNode(document, BUILD.headMesh);
  const skin: Skin | null = node.getSkin();
  if (skin === null) throw new Error(`${frame} head is not skinned`);
  const hairDocument: Document = await io.read(framed(BUILD.hair, frame));
  const hair: Vector3[] = hairPieces.flatMap((piece: string): Vector3[] => primitivesOf(meshNode(hairDocument, piece)).flatMap(positionsOf));
  const eyes: Node = meshNode(document, BUILD.eyesMesh);
  const brows: Node = meshNode(document, BUILD.browsMesh);
  const face: Vector3[] = [...primitivesOf(eyes), ...primitivesOf(brows)].flatMap(positionsOf);
  return { document, head: { skin, parent: node.getParentNode(), points: skinPoints(node), face, hair, eyes: boxOf(eyes), brows: boxOf(brows), joint: jointAt(skin, BUILD.headJoint), headIndex: skin.listJoints().findIndex((joint: Node): boolean => joint.getName() === BUILD.headJoint) } };
}

function lowest(points: readonly Vector3[], keep: (point: Vector3) => boolean): Vector3 {
  const found: Vector3 | undefined = points.filter(keep).reduce<Vector3 | undefined>((best: Vector3 | undefined, point: Vector3): Vector3 => (best === undefined || point.y < best.y ? point : best), undefined);
  if (found === undefined) throw new Error('no point matched the landmark');
  return found;
}

interface Measured {
  readonly fit: HeadFit;
  readonly centre: Vector3;
  readonly skin: readonly Vector3[];
  readonly hair: readonly Vector3[];
  readonly all: readonly Vector3[];
}

function faceOf(skin: readonly Vector3[], hair: readonly Vector3[], centre: Vector3, marks: Landmarks): Envelope {
  const candidates: Vector3[] = hair.filter((point: Vector3): boolean => Math.abs(anglesOf(point.clone().sub(centre)).theta) < BUILD.tuckSide);
  const tucked: Set<Vector3> = new Set<Vector3>();
  const inMask = (point: Vector3): boolean => {
    const at = anglesOf(point.clone().sub(centre));
    return Math.abs(at.theta) < BUILD.maskSide && at.phi > marks.chin - BUILD.maskBelowChin && at.phi < marks.hairline + BUILD.maskAboveHairline;
  };
  let face: Envelope = envelopeOf(skin.filter(inMask), centre, MASK_FIT);
  for (let pass: number = 0; pass < BUILD.tuckPasses; pass += 1) {
    const before: number = tucked.size;
    for (const point of candidates) {
      const offset: Vector3 = point.clone().sub(centre);
      const at = anglesOf(offset);
      if (offset.length() - face.radius(at.theta, at.phi) < BUILD.tuckWithin) tucked.add(point);
    }
    if (tucked.size === before) break;
    face = envelopeOf([...skin, ...tucked].filter(inMask), centre, MASK_FIT);
  }
  return face;
}

function fitOf(head: Head): Measured {
  const eye: Vector3 = head.eyes.getCenter(new Vector3());
  const centre: Vector3 = new Vector3(0, eye.y - BUILD.centreBelowEyes, head.joint.z);
  const near = (point: Vector3): boolean => point.y > centre.y - BUILD.reachBelow;
  const skin: Vector3[] = [...head.points.map((point: SkinPoint): Vector3 => point.at), ...head.face].filter(near);
  const hair: Vector3[] = head.hair.filter(near);
  const all: Vector3[] = [...skin, ...hair];
  const nose: number = Math.max(...skin.map((point: Vector3): number => point.z));
  const chin: Vector3 = lowest(skin, (point: Vector3): boolean => Math.abs(point.x) < BUILD.chinBand && point.z > nose - BUILD.chinBehindNose);
  const line: Vector3 = lowest(head.hair, (point: Vector3): boolean => Math.abs(point.x) < BUILD.hairBand && point.z > centre.z + BUILD.hairFront);
  const phi = (point: Vector3): number => anglesOf(point.clone().sub(centre)).phi;
  const right: Vector3[] = head.face.filter((point: Vector3): boolean => point.x < 0 && point.y < head.brows.min.y);
  const side: Vector3 = new Box3().setFromPoints(right).getCenter(new Vector3());
  const marks: Landmarks = { eyeSide: Math.abs(anglesOf(side.clone().sub(centre)).theta), eye: phi(eye), brow: phi(new Vector3(0, head.brows.max.y, head.brows.max.z)), chin: phi(chin), hairline: phi(line) };
  return { fit: { marks, skin: envelopeOf(skin, centre, LOOSE), withHair: envelopeOf(all, centre, LOOSE), snug: envelopeOf(all, centre, SNUG), face: faceOf(skin, hair, centre, marks) }, centre, skin, hair, all };
}

function crossing(shells: readonly ShellPlan[], measured: Measured): number {
  let count: number = 0;
  for (const shell of shells) {
    if (shell.envelope !== measured.fit.face) continue;
    for (const point of measured.hair) {
      const offset: Vector3 = point.clone().sub(measured.centre);
      const at = anglesOf(offset);
      const inner: number | null = innerRadius(shell, at.theta, at.phi);
      if (inner !== null && offset.length() > inner && offset.length() < inner + shell.thickness) count += 1;
    }
  }
  return count;
}

function clearance(shells: readonly ShellPlan[], measured: Measured): number {
  let least: number = Infinity;
  for (const shell of shells) {
    const points: readonly Vector3[] = shell.envelope === measured.fit.withHair || shell.envelope === measured.fit.snug ? measured.all : measured.skin;
    for (const point of points) {
      const offset: Vector3 = point.clone().sub(measured.centre);
      const at = anglesOf(offset);
      const inner: number | null = innerRadius(shell, at.theta, at.phi);
      if (inner !== null) least = Math.min(least, inner - offset.length());
    }
  }
  return least;
}

function materialFor(document: Document, made: Map<string, Material>, name: string): Material {
  const known: Material | undefined = made.get(name);
  if (known !== undefined) return known;
  const look: MaterialLook | undefined = LOOKS[name];
  if (look === undefined) throw new Error(`no look for material ${name}`);
  const material: Material = document.createMaterial(name).setBaseColorFactor([...look.color]).setMetallicFactor(look.metal).setRoughnessFactor(look.rough).setEmissiveFactor([...look.glow]);
  made.set(name, material);
  return material;
}

function primitiveFor(document: Document, part: MeshPart, material: Material, joint: number): Primitive {
  const count: number = part.positions.length / 3;
  const joints: Uint16Array = new Uint16Array(count * BUILD.influences);
  const weights: Float32Array = new Float32Array(count * BUILD.influences);
  for (let vertex: number = 0; vertex < count; vertex += 1) {
    joints[vertex * BUILD.influences] = joint;
    weights[vertex * BUILD.influences] = 1;
  }
  const accessor = (array: Float32Array | Uint16Array | Uint32Array, type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4'): Accessor => document.createAccessor().setArray(array).setType(type);
  return document
    .createPrimitive()
    .setMaterial(material)
    .setAttribute('POSITION', accessor(new Float32Array(part.positions), 'VEC3'))
    .setAttribute('NORMAL', accessor(new Float32Array(part.normals), 'VEC3'))
    .setAttribute('TEXCOORD_0', accessor(new Float32Array(part.uvs), 'VEC2'))
    .setAttribute('JOINTS_0', accessor(joints, 'VEC4'))
    .setAttribute('WEIGHTS_0', accessor(weights, 'VEC4'))
    .setIndices(accessor(count >= BUILD.wideIndexFrom ? new Uint32Array(part.indices) : new Uint16Array(part.indices), 'SCALAR'));
}

async function buildFrame(io: NodeIO, frame: string, hairPieces: readonly string[]): Promise<string[]> {
  const { document, head } = await readHead(io, frame, hairPieces);
  const measured: Measured = fitOf(head);
  const fit: HeadFit = measured.fit;
  const report: string[] = [];
  report.push(`${frame}: side ${fit.marks.eyeSide.toFixed(1)} eye ${fit.marks.eye.toFixed(1)} brow ${fit.marks.brow.toFixed(1)} chin ${fit.marks.chin.toFixed(1)} hairline ${fit.marks.hairline.toFixed(1)}`);
  for (const node of document.getRoot().listNodes()) if (node.getMesh() !== null) node.dispose();
  for (const extension of document.getRoot().listExtensionsUsed()) extension.dispose();
  const made: Map<string, Material> = new Map<string, Material>();
  for (const design of DESIGNS) {
    const result: DesignResult = design.build(fit);
    const least: number = clearance(result.shells, measured);
    const parts: MeshPart[] = smoothParts(result.soup, design.smoothDegrees, measured.centre);
    report.push(`  ${design.piece}: ${triangleCount(parts)} triangles, ${(least * 1000).toFixed(1)} mm clear, ${crossing(result.shells, measured)} hair points through it`);
    if (least < BUILD.leastClearance) throw new Error(`${frame} ${design.piece} is only ${(least * 1000).toFixed(1)} mm off the head`);
    addPiece(document, design, parts, made, head);
  }
  await document.transform(prune());
  await io.write(framed(BUILD.out, frame), document);
  return report;
}

function addPiece(document: Document, design: Design, parts: readonly MeshPart[], made: Map<string, Material>, head: Head): void {
  const mesh = document.createMesh(design.piece);
  for (const part of parts) mesh.addPrimitive(primitiveFor(document, part, materialFor(document, made, part.material), head.headIndex));
  const node: Node = document.createNode(design.piece).setMesh(mesh).setSkin(head.skin);
  if (head.parent === null) document.getRoot().getDefaultScene()?.addChild(node);
  else head.parent.addChild(node);
}

async function main(): Promise<void> {
  await MeshoptDecoder.ready;
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const reports: string[][] = await Promise.all([...heroHair()].map(async ([frame, pieces]: [string, readonly string[]]): Promise<string[]> => buildFrame(io, frame, pieces)));
  console.log(reports.flat().join('\n'));
}

await main();
