import { readFileSync } from 'node:fs';
import type { Accessor, Document, Material, Node, Primitive, Skin } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix4, Vector3 } from 'three';
import type { Fields } from '../sim/content/read.ts';
import { each, fields, text, textList } from '../sim/content/read.ts';
import { CHARM_DESIGNS } from './charm-designs.ts';
import type { CordPlan, Influence, Resting, Weighted } from './charm-fit.ts';
import { blendNearest, buildLoop, leastDistance, movedSoup, PointGrid, restingTilt, settleCord, smoothAlong, surfaceSamples } from './charm-fit.ts';
import type { MeshPart, Triangle } from './headgear-shapes.ts';
import { smoothParts, triangleCount } from './headgear-shapes.ts';

const BUILD = {
  out: 'public/models/wear/{frame}/charms.glb',
  body: 'public/models/characters/{frame}.glb',
  headMesh: 'Head',
  neckJoint: 'neck_01',
  chestRegion: 'chest',
  hairRegion: 'hair',
  near: 0.32,
  side: 0.2,
  forward: 0.012,
  frontBelow: 0.07,
  frontBelowMan: 0.045,
  ceiling: 0.12,
  collarReach: 0.15,
  collarWindow: 10,
  collarBand: 0.01,
  skinMargin: 0.012,
  headCeiling: 0.05,
  neckTo: 0.03,
  outside: 0.006,
  frontFrom: 80,
  samples: 120,
  smoothing: 7,
  cordRadius: 0.0017,
  cordSides: 8,
  clearance: 0.0025,
  bailClearance: 0.008,
  pendantClearance: 0.0035,
  cordSmooth: 60,
  nearest: 6,
  influences: 4,
  weightPasses: 4,
  wideIndexFrom: 65536,
  spacing: 0.0015,
  gridSize: 0.004,
} as const;

interface MaterialLook {
  readonly color: readonly [number, number, number, number];
  readonly metal: number;
  readonly rough: number;
  readonly glow: readonly [number, number, number];
}

const LOOKS: Readonly<Record<string, MaterialLook>> = {
  cord: { color: [0.26, 0.18, 0.1, 1], metal: 0, rough: 0.9, glow: [0, 0, 0] },
  bronze: { color: [0.55, 0.33, 0.12, 1], metal: 0.55, rough: 0.45, glow: [0, 0, 0] },
  silver: { color: [0.6, 0.62, 0.68, 1], metal: 0.6, rough: 0.4, glow: [0, 0, 0] },
  pewter: { color: [0.3, 0.34, 0.44, 1], metal: 0.55, rough: 0.45, glow: [0, 0, 0] },
  gold: { color: [0.74, 0.46, 0.08, 1], metal: 0.55, rough: 0.4, glow: [0, 0, 0] },
  gold_dark: { color: [0.46, 0.28, 0.06, 1], metal: 0.55, rough: 0.55, glow: [0, 0, 0] },
  ember: { color: [0.72, 0.12, 0.02, 1], metal: 0.2, rough: 0.25, glow: [0, 0, 0] },
  tidestone: { color: [0.03, 0.3, 0.42, 1], metal: 0.25, rough: 0.12, glow: [0, 0, 0] },
  idol: { color: [0.34, 0.35, 0.4, 1], metal: 0.1, rough: 0.6, glow: [0, 0, 0] },
  storm: { color: [0.35, 0.55, 0.95, 1], metal: 0, rough: 0.35, glow: [0, 0, 0] },
  iron: { color: [0.26, 0.26, 0.3, 1], metal: 0.55, rough: 0.5, glow: [0, 0, 0] },
  lantern: { color: [0.86, 0.45, 0.08, 1], metal: 0, rough: 0.3, glow: [0, 0, 0] },
};

interface Garment {
  readonly model: string;
  readonly pieces: readonly string[];
  readonly fit: string | null;
}

interface FrameData {
  readonly frame: string;
  readonly garments: readonly Garment[];
  readonly hair: readonly string[];
}

interface Fitted {
  readonly suffix: string;
  readonly obstacles: readonly Vector3[];
  readonly collar: readonly Vector3[];
  readonly neck: readonly Vector3[];
  readonly weighted: readonly Weighted[];
}

function framed(path: string, frame: string): string {
  return path.replaceAll('{frame}', frame);
}

function readList(path: string): Fields[] {
  return each(JSON.parse(readFileSync(path, 'utf8')), path, (entry: unknown, at: string): Fields => fields(entry, at));
}

function frames(): FrameData[] {
  const where: string = 'charms';
  const player: Fields = fields(JSON.parse(readFileSync('data/player.json', 'utf8')), 'player');
  const heroRigs: string[] = each(player['heroes'], 'heroes', (entry: unknown, at: string): string => text(fields(entry, at), 'rig', at));
  const never: string[] = textList(player, 'neverWears', where);
  const wearables: Fields[] = readList('data/wearables.json');
  const found: FrameData[] = [];
  for (const rig of readList('data/rigs.json')) {
    if (!heroRigs.includes(text(rig, 'id', where))) continue;
    const frame: string = text(rig, 'frame', where);
    const base: string[] = rig['base'] === undefined ? [] : textList(rig, 'base', where);
    const garments: Garment[] = wearables
      .filter((worn: Fields): boolean => text(worn, 'region', where) === BUILD.chestRegion && !never.includes(text(worn, 'id', where)))
      .map((worn: Fields): Garment => ({ model: framed(`public/${text(worn, 'model', where)}`, frame), pieces: textList(worn, 'pieces', where), fit: worn['fit'] === undefined ? null : text(worn, 'fit', where) }));
    const hair: string[] = wearables.filter((worn: Fields): boolean => base.includes(text(worn, 'id', where)) && text(worn, 'region', where) === BUILD.hairRegion).flatMap((worn: Fields): string[] => textList(worn, 'pieces', where));
    found.push({ frame, garments, hair });
  }
  return found;
}

function meshNodes(document: Document, name: string): Node[] {
  return document
    .getRoot()
    .listNodes()
    .filter((node: Node): boolean => node.getName() === name && node.getMesh() !== null);
}

function weightedOf(node: Node): Weighted[] {
  const skin: Skin | null = node.getSkin();
  if (skin === null) return [];
  const names: string[] = skin.listJoints().map((joint: Node): string => joint.getName());
  const found: Weighted[] = [];
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const positions: Accessor | null = primitive.getAttribute('POSITION');
    const joints: Accessor | null = primitive.getAttribute('JOINTS_0');
    const weights: Accessor | null = primitive.getAttribute('WEIGHTS_0');
    if (positions === null || joints === null || weights === null) continue;
    for (let index: number = 0; index < positions.getCount(); index += 1) {
      const at: Vector3 = new Vector3().fromArray(positions.getElement(index, [0, 0, 0]));
      const joint: number[] = joints.getElement(index, [0, 0, 0, 0]);
      const weight: number[] = weights.getElement(index, [0, 0, 0, 0]);
      const influences: Influence[] = joint.flatMap((jointIndex: number, slot: number): Influence[] => {
        const share: number = weight[slot] ?? 0;
        const name: string | undefined = names[jointIndex];
        return share > 0 && name !== undefined ? [{ joint: name, weight: share }] : [];
      });
      found.push({ at, influences });
    }
  }
  return found;
}

function surfaceOf(node: Node, keep: (point: Vector3) => boolean): Vector3[] {
  const found: Vector3[] = [];
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const positions: Accessor | null = primitive.getAttribute('POSITION');
    const indices: Accessor | null = primitive.getIndices();
    if (positions === null || indices === null) continue;
    const corner = (index: number): Vector3 => new Vector3().fromArray(positions.getElement(indices.getScalar(index), [0, 0, 0]));
    for (let index: number = 0; index + 2 < indices.getCount(); index += 3) {
      const a: Vector3 = corner(index);
      const b: Vector3 = corner(index + 1);
      const c: Vector3 = corner(index + 2);
      if (!keep(a) && !keep(b) && !keep(c)) continue;
      for (const point of surfaceSamples(a, b, c, BUILD.spacing)) if (keep(point)) found.push(point);
    }
  }
  return found;
}

function jointAt(skin: Skin, name: string): Vector3 {
  const index: number = skin.listJoints().findIndex((joint: Node): boolean => joint.getName() === name);
  const binds: Accessor | null = skin.getInverseBindMatrices();
  if (index < 0 || binds === null) throw new Error(`skin has no joint ${name}`);
  return new Vector3().setFromMatrixPosition(new Matrix4().fromArray(binds.getElement(index, Array.from({ length: 16 }, (): number => 0))).invert());
}

function suffixOf(fit: string | null): string {
  return fit === null ? '' : `_${fit.charAt(0).toUpperCase()}${fit.slice(1)}`;
}

async function fittings(io: NodeIO, data: FrameData, neck: Vector3, headNode: Node): Promise<Fitted[]> {
  const skin: Weighted[] = weightedOf(headNode);
  const near = (point: Vector3): boolean => point.y > neck.y - BUILD.near && Math.abs(point.x - neck.x) < BUILD.side;
  const models: string[] = [...new Set<string>(data.garments.map((garment: Garment): string => garment.model))];
  const read: Document[] = await Promise.all(models.map((model: string): Promise<Document> => io.read(model)));
  const documents: Map<string, Document> = new Map<string, Document>(models.flatMap((model: string, index: number): [string, Document][] => {
      const document: Document | undefined = read[index];
      return document === undefined ? [] : [[model, document]];
    }));
  const groups: Map<string | null, Weighted[]> = new Map<string | null, Weighted[]>();
  const surfaces: Map<string | null, Vector3[]> = new Map<string | null, Vector3[]>();
  for (const garment of data.garments) {
    const document: Document | undefined = documents.get(garment.model);
    if (document === undefined) continue;
    const points: Weighted[] = groups.get(garment.fit) ?? [];
    const surface: Vector3[] = surfaces.get(garment.fit) ?? [];
    for (const piece of garment.pieces) {
      for (const node of meshNodes(document, piece)) {
        points.push(...weightedOf(node).filter((point: Weighted): boolean => near(point.at)));
        for (const point of surfaceOf(node, near)) surface.push(point);
      }
    }
    groups.set(garment.fit, points);
    surfaces.set(garment.fit, surface);
  }
  const head: Weighted[] = skin.filter((point: Weighted): boolean => near(point.at));
  const headSurface: Vector3[] = surfaceOf(headNode, (point: Vector3): boolean => near(point) && point.y < neck.y + BUILD.headCeiling);
  const neckSkin: Vector3[] = head.filter((point: Weighted): boolean => point.influences.toSorted((a: Influence, b: Influence): number => b.weight - a.weight)[0]?.joint === BUILD.neckJoint && point.at.y < neck.y + BUILD.neckTo).map((point: Weighted): Vector3 => point.at);
  return [...groups].map(([fit, points]: [string | null, Weighted[]]): Fitted => ({ suffix: suffixOf(fit), obstacles: [...(surfaces.get(fit) ?? []), ...headSurface], collar: points.map((point: Weighted): Vector3 => point.at), neck: neckSkin, weighted: [...points, ...head] }));
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

function primitiveFor(document: Document, part: MeshPart, material: Material, weigh: (at: Vector3) => readonly Influence[], jointIndex: (name: string) => number): Primitive {
  const count: number = part.positions.length / 3;
  const joints: Uint16Array = new Uint16Array(count * BUILD.influences);
  const weights: Float32Array = new Float32Array(count * BUILD.influences);
  for (let vertex: number = 0; vertex < count; vertex += 1) {
    const at: Vector3 = new Vector3(part.positions[vertex * 3] ?? 0, part.positions[vertex * 3 + 1] ?? 0, part.positions[vertex * 3 + 2] ?? 0);
    weigh(at).forEach((influence: Influence, slot: number): void => {
      joints[vertex * BUILD.influences + slot] = jointIndex(influence.joint);
      weights[vertex * BUILD.influences + slot] = influence.weight;
    });
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

function nearestIndex(path: readonly Vector3[], at: Vector3): number {
  let best: number = 0;
  path.forEach((point: Vector3, index: number): void => {
    if (point.distanceToSquared(at) < (path[best] ?? point).distanceToSquared(at)) best = index;
  });
  return best;
}

function cornersOf(soup: readonly Triangle[]): Vector3[] {
  const seen: Map<string, Vector3> = new Map<string, Vector3>();
  for (const triangle of soup) for (const corner of triangle.corners) seen.set(`${corner.x.toFixed(5)},${corner.y.toFixed(5)},${corner.z.toFixed(5)}`, corner);
  return [...seen.values()];
}

async function buildFrame(io: NodeIO, data: FrameData): Promise<string[]> {
  const document: Document = await io.read(framed(BUILD.body, data.frame));
  const head: Node | undefined = meshNodes(document, BUILD.headMesh)[0];
  const skin: Skin | null = head?.getSkin() ?? null;
  if (head === undefined || skin === null) throw new Error(`${data.frame} head is not skinned`);
  const neck: Vector3 = jointAt(skin, BUILD.neckJoint);
  const names: string[] = skin.listJoints().map((joint: Node): string => joint.getName());
  const jointIndex = (name: string): number => {
    const index: number = names.indexOf(name);
    if (index < 0) throw new Error(`${data.frame} has no joint ${name}`);
    return index;
  };
  const fitted: Fitted[] = await fittings(io, data, neck, head);
  const parent: Node | null = head.getParentNode();
  for (const node of document.getRoot().listNodes()) if (node.getMesh() !== null) node.dispose();
  for (const extension of document.getRoot().listExtensionsUsed()) extension.dispose();
  const made: Map<string, Material> = new Map<string, Material>();
  const report: string[] = [];
  const plan: CordPlan = {
    centre: new Vector3(neck.x, neck.y, neck.z + BUILD.forward),
    frontY: neck.y - (data.frame === 'man' ? BUILD.frontBelowMan : BUILD.frontBelow),
    ceiling: neck.y + BUILD.ceiling,
    samples: BUILD.samples,
    gap: BUILD.cordRadius + BUILD.clearance,
    frontGap: BUILD.bailClearance,
    smoothing: BUILD.smoothing,
    collarReach: BUILD.collarReach,
    collarWindow: BUILD.collarWindow,
    collarBand: BUILD.collarBand,
    skinMargin: BUILD.skinMargin,
    outside: BUILD.outside,
    frontFrom: BUILD.frontFrom,
  };
  for (const fit of fitted) {
    const path: Vector3[] = settleCord(fit.obstacles, fit.collar, fit.neck, plan);
    const grid: PointGrid = new PointGrid(fit.obstacles, BUILD.gridSize);
    const ringWeights: Influence[][] = smoothAlong(path.map((point: Vector3): Influence[] => blendNearest(fit.weighted, point, BUILD.nearest, BUILD.influences)), BUILD.weightPasses, BUILD.influences);
    const cordSoup: Triangle[] = [];
    buildLoop(cordSoup, path, BUILD.cordRadius, BUILD.cordSides, 'cord');
    const cordParts: MeshPart[] = smoothParts(cordSoup, BUILD.cordSmooth, plan.centre);
    const hang: Vector3 = path[0] ?? plan.centre;
    const hangWeights: readonly Influence[] = ringWeights[0] ?? [];
    report.push(`${data.frame}${fit.suffix}: cord ${(leastDistance(path, fit.obstacles) * 1000 - BUILD.cordRadius * 1000).toFixed(1)} mm clear, ${fit.obstacles.length} surface points`);
    for (const design of CHARM_DESIGNS) {
      const local: Triangle[] = [];
      design.build(local);
      const resting: Resting = restingTilt(cornersOf(local), hang, grid, BUILD.pendantClearance);
      const placed: Triangle[] = movedSoup(local, (point: Vector3): Vector3 => point.applyMatrix4(resting.placed));
      const pendant: MeshPart[] = smoothParts(placed, design.smoothDegrees, hang);
      const name: string = `${design.piece}${fit.suffix}`;
      const mesh = document.createMesh(name);
      for (const part of cordParts) mesh.addPrimitive(primitiveFor(document, part, materialFor(document, made, part.material), (at: Vector3): readonly Influence[] => ringWeights[nearestIndex(path, at)] ?? [], jointIndex));
      for (const part of pendant) mesh.addPrimitive(primitiveFor(document, part, materialFor(document, made, part.material), (): readonly Influence[] => hangWeights, jointIndex));
      const node: Node = document.createNode(name).setMesh(mesh).setSkin(skin);
      if (parent === null) document.getRoot().getDefaultScene()?.addChild(node);
      else parent.addChild(node);
      report.push(`  ${name}: ${triangleCount([...cordParts, ...pendant])} triangles, resting at ${resting.tilt.toFixed(1)} degrees`);
    }
  }
  await document.transform(prune());
  await io.write(framed(BUILD.out, data.frame), document);
  return report;
}

async function main(): Promise<void> {
  await MeshoptDecoder.ready;
  const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const reports: string[][] = await Promise.all(frames().map(async (data: FrameData): Promise<string[]> => buildFrame(io, data)));
  console.log(reports.flat().join('\n'));
}

await main();
