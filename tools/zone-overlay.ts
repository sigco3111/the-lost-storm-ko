import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import type { Accessor, Node, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { loadContent } from '../sim/content/content.ts';
import type { Content, PropDef, ZoneDef } from '../sim/content/types.ts';
import type { Vec2 } from '../sim/math.ts';
import type { Blocker, NavGrid } from '../sim/nav/grid.ts';
import { blockerGap, cellIndex } from '../sim/nav/grid.ts';
import { barrierPieces } from '../sim/nav/barrier.ts';
import { cliffRocks } from '../sim/nav/cliff-rocks.ts';
import { shorePlacements } from '../sim/world/shore-props.ts';
import { analyseGaps, GAPS, stageWorld } from '../sim/world/zone-gaps.ts';
import type { GapAnalysis, GapFinding, StagedWorld } from '../sim/world/zone-gaps.ts';
import { pathStones } from '../src/render/shore-props.ts';

export const OVERLAY = {
  pixelsPerMetre: 16,
  bodyHeight: 2.2,
  lowest: 0.05,
  knee: 0.4,
  gridEvery: 5,
  leastPatch: 0.25,
  shoreMargin: { across: 30, behind: 6, beyond: 6 },
  colours: {
    ground: [34, 38, 44],
    band: [66, 42, 46],
    solid: [168, 172, 180],
    low: [96, 88, 76],
    falseWall: [236, 56, 220],
    walkThrough: [250, 214, 40],
    stranded: [60, 120, 230],
    pinch: [255, 70, 40],
    narrow: [255, 150, 30],
    grid: [54, 60, 70],
  },
} as const;

type Rgb = readonly [number, number, number];
type Point = readonly [number, number, number];

export interface Placement {
  readonly id: string;
  readonly def: PropDef;
  readonly scale: number;
  readonly x: number;
  readonly z: number;
  readonly rotationDegrees: number;
}

export interface OverlayFrame {
  readonly origin: Vec2;
  readonly across: readonly [number, number];
  readonly ahead: readonly [number, number];
}

export interface Patch {
  readonly kind: 'false-wall' | 'walk-through';
  readonly area: number;
  readonly across: number;
  readonly ahead: number;
}

export interface Overlay {
  readonly width: number;
  readonly height: number;
  readonly rgb: Uint8Array;
  readonly patches: readonly Patch[];
  readonly findings: readonly GapFinding[];
}

const io: NodeIO = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const meshes: Map<string, Point[][]> = new Map<string, Point[][]>();

async function triangles(model: string): Promise<Point[][]> {
  const known: Point[][] | undefined = meshes.get(model);
  if (known !== undefined) return known;
  const file: string = `public/${model}`;
  const found: Point[][] = [];
  if (existsSync(file)) {
    const document = await io.readBinary(new Uint8Array(readFileSync(file)));
    const element: number[] = [0, 0, 0];
    for (const node of document.getRoot().listNodes() satisfies Node[]) {
      const mesh = node.getMesh();
      if (mesh === null) continue;
      const m: readonly number[] = node.getWorldMatrix();
      const at = (index: number): number => m[index] ?? 0;
      for (const primitive of mesh.listPrimitives() satisfies Primitive[]) {
        const position: Accessor | null = primitive.getAttribute('POSITION');
        if (position === null) continue;
        const points: Point[] = [];
        for (let index: number = 0; index < position.getCount(); index += 1) {
          position.getElement(index, element);
          const x: number = element[0] ?? 0;
          const y: number = element[1] ?? 0;
          const z: number = element[2] ?? 0;
          points.push([at(0) * x + at(4) * y + at(8) * z + at(12), at(1) * x + at(5) * y + at(9) * z + at(13), at(2) * x + at(6) * y + at(10) * z + at(14)]);
        }
        const indices: Accessor | null = primitive.getIndices();
        const order: number[] = indices === null ? points.map((_point: Point, index: number): number => index) : Array.from({ length: indices.getCount() }, (_value: unknown, index: number): number => indices.getScalar(index));
        for (let index: number = 0; index + 2 < order.length; index += 3) {
          const a: Point | undefined = points[order[index] ?? -1];
          const b: Point | undefined = points[order[index + 1] ?? -1];
          const c: Point | undefined = points[order[index + 2] ?? -1];
          if (a !== undefined && b !== undefined && c !== undefined) found.push([a, b, c]);
        }
      }
    }
  }
  meshes.set(model, found);
  return found;
}

export function placements(staged: StagedWorld, content: Content): Placement[] {
  const zone: ZoneDef = staged.world.zone;
  const listed: Placement[] = [];
  const add = (id: string, scale: number, x: number, z: number, rotationDegrees: number): void => {
    const def: PropDef | undefined = content.props.get(id);
    if (def !== undefined) listed.push({ id, def, scale, x, z, rotationDegrees });
  };
  for (const placed of zone.props) if (placed.when.length === 0) add(placed.prop, 1, placed.x, placed.z, placed.rotationDegrees);
  for (const piece of barrierPieces(zone, content.props)) add(piece.prop, piece.size, piece.x, piece.z, piece.rotationDegrees);
  for (const rock of cliffRocks(zone, content.props)) add(rock.prop, rock.size, rock.x, rock.z, rock.rotationDegrees);
  for (const placed of shorePlacements(staged.world)) add(placed.prop, placed.scale, placed.x, placed.z, placed.rotationDegrees);
  const path = zone.void?.shore?.path ?? null;
  const shore = staged.world.shore;
  if (path !== null && shore !== null) for (const stone of pathStones(path)) add(stone.prop, stone.scale, shore.at.x + stone.x, shore.at.z + stone.z, stone.rotationDegrees);
  return listed;
}

export function frameOf(staged: StagedWorld): OverlayFrame {
  const shore = staged.world.shore;
  const room = staged.world.zone.void?.shore?.room ?? null;
  if (shore !== null && room !== null) {
    const margin = OVERLAY.shoreMargin;
    return { origin: shore.at, across: [-margin.across, margin.across], ahead: [-margin.behind, room.depth + margin.beyond] };
  }
  const zone: ZoneDef = staged.world.zone;
  return { origin: { x: 0, z: 0 }, across: [0, (zone.tiles[0]?.length ?? 0) * zone.cellSize], ahead: [0, zone.tiles.length * zone.cellSize] };
}

interface Canvas {
  readonly frame: OverlayFrame;
  readonly width: number;
  readonly height: number;
}

function canvasOf(frame: OverlayFrame): Canvas {
  return { frame, width: Math.round((frame.across[1] - frame.across[0]) * OVERLAY.pixelsPerMetre), height: Math.round((frame.ahead[1] - frame.ahead[0]) * OVERLAY.pixelsPerMetre) };
}

function worldAt(canvas: Canvas, column: number, row: number): Vec2 {
  return { x: canvas.frame.origin.x + canvas.frame.across[1] - (column + 0.5) / OVERLAY.pixelsPerMetre, z: canvas.frame.origin.z + canvas.frame.ahead[1] - (row + 0.5) / OVERLAY.pixelsPerMetre };
}

function pixelAt(canvas: Canvas, x: number, z: number): readonly [number, number] {
  return [(canvas.frame.origin.x + canvas.frame.across[1] - x) * OVERLAY.pixelsPerMetre - 0.5, (canvas.frame.origin.z + canvas.frame.ahead[1] - z) * OVERLAY.pixelsPerMetre - 0.5];
}

function fillTriangle(canvas: Canvas, mask: Uint8Array, a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]): void {
  const fromColumn: number = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const toColumn: number = Math.min(canvas.width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const fromRow: number = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const toRow: number = Math.min(canvas.height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const area: number = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  for (let row: number = fromRow; row <= toRow; row += 1) {
    for (let column: number = fromColumn; column <= toColumn; column += 1) {
      if (Math.abs(area) < 1e-9) {
        if (Math.hypot(column - a[0], row - a[1]) <= 0.75) mask[row * canvas.width + column] = 1;
        continue;
      }
      const w0: number = ((b[0] - column) * (c[1] - row) - (c[0] - column) * (b[1] - row)) / area;
      const w1: number = ((c[0] - column) * (a[1] - row) - (a[0] - column) * (c[1] - row)) / area;
      const w2: number = 1 - w0 - w1;
      const edge: number = -0.5 / Math.max(1, Math.sqrt(Math.abs(area)));
      if (w0 >= edge && w1 >= edge && w2 >= edge) mask[row * canvas.width + column] = 1;
    }
  }
}

function fillHoles(piece: Uint8Array, width: number, height: number): void {
  const outside: Uint8Array = new Uint8Array(width * height);
  const queue: number[] = [];
  const visit = (column: number, row: number): void => {
    const index: number = row * width + column;
    if (piece[index] === 1 || outside[index] === 1) return;
    outside[index] = 1;
    queue.push(index);
  };
  for (let column: number = 0; column < width; column += 1) {
    visit(column, 0);
    visit(column, height - 1);
  }
  for (let row: number = 0; row < height; row += 1) {
    visit(0, row);
    visit(width - 1, row);
  }
  while (queue.length > 0) {
    const at: number | undefined = queue.pop();
    if (at === undefined) break;
    const column: number = at % width;
    const row: number = Math.floor(at / width);
    if (column > 0) visit(column - 1, row);
    if (column < width - 1) visit(column + 1, row);
    if (row > 0) visit(column, row - 1);
    if (row < height - 1) visit(column, row + 1);
  }
  for (let index: number = 0; index < piece.length; index += 1) if (outside[index] === 0) piece[index] = 1;
}

async function rasterise(canvas: Canvas, listed: readonly Placement[]): Promise<{ readonly tall: Uint8Array; readonly low: Uint8Array }> {
  const tall: Uint8Array = new Uint8Array(canvas.width * canvas.height);
  const low: Uint8Array = new Uint8Array(canvas.width * canvas.height);
  const models: Map<string, Point[][]> = new Map<string, Point[][]>(await Promise.all([...new Set(listed.map((placed: Placement): string => placed.def.model))].map(async (model: string): Promise<[string, Point[][]]> => [model, await triangles(model)])));
  for (const placed of listed) {
    const faces: Point[][] = models.get(placed.def.model) ?? [];
    const scale: number = placed.def.scale * placed.scale;
    const angle: number = (placed.rotationDegrees * Math.PI) / 180;
    const cos: number = Math.cos(angle);
    const sin: number = Math.sin(angle);
    const flats: (readonly [number, number])[][] = [];
    for (const face of faces) {
      const heights: number[] = face.map((p: Point): number => p[1] * scale);
      if (Math.max(...heights) < OVERLAY.lowest || Math.min(...heights) > OVERLAY.bodyHeight) continue;
      flats.push(face.map((p: Point): readonly [number, number] => pixelAt(canvas, placed.x + (p[0] * cos + p[2] * sin) * scale, placed.z + (-p[0] * sin + p[2] * cos) * scale)));
    }
    const all: (readonly [number, number])[] = flats.flat();
    if (all.length === 0) continue;
    const left: number = Math.floor(Math.min(...all.map((p): number => p[0]))) - 1;
    const top: number = Math.floor(Math.min(...all.map((p): number => p[1]))) - 1;
    const width: number = Math.ceil(Math.max(...all.map((p): number => p[0]))) - left + 2;
    const height: number = Math.ceil(Math.max(...all.map((p): number => p[1]))) - top + 2;
    const local: Canvas = { frame: canvas.frame, width, height };
    const piece: Uint8Array = new Uint8Array(width * height);
    for (const [a, b, c] of flats) if (a !== undefined && b !== undefined && c !== undefined) fillTriangle(local, piece, [a[0] - left, a[1] - top], [b[0] - left, b[1] - top], [c[0] - left, c[1] - top]);
    fillHoles(piece, width, height);
    const mask: Uint8Array = placed.def.height * placed.scale >= OVERLAY.knee ? tall : low;
    for (let row: number = 0; row < height; row += 1) {
      for (let column: number = 0; column < width; column += 1) {
        const x: number = column + left;
        const y: number = row + top;
        if (piece[row * width + column] === 1 && x >= 0 && y >= 0 && x < canvas.width && y < canvas.height) mask[y * canvas.width + x] = 1;
      }
    }
  }
  return { tall, low };
}

function solidMask(canvas: Canvas, bodies: readonly Blocker[]): Uint8Array {
  const mask: Uint8Array = new Uint8Array(canvas.width * canvas.height);
  for (const body of bodies) {
    const points: Vec2[] = body.kind === 'outline' ? [...body.outline] : [body.from, body.to];
    const pad: number = body.kind === 'capsule' ? body.radius : 0;
    const corners = points.map((p: Vec2): readonly [number, number] => pixelAt(canvas, p.x, p.z));
    const padPixels: number = pad * OVERLAY.pixelsPerMetre + 1;
    const fromColumn: number = Math.max(0, Math.floor(Math.min(...corners.map((p): number => p[0])) - padPixels));
    const toColumn: number = Math.min(canvas.width - 1, Math.ceil(Math.max(...corners.map((p): number => p[0])) + padPixels));
    const fromRow: number = Math.max(0, Math.floor(Math.min(...corners.map((p): number => p[1])) - padPixels));
    const toRow: number = Math.min(canvas.height - 1, Math.ceil(Math.max(...corners.map((p): number => p[1])) + padPixels));
    for (let row: number = fromRow; row <= toRow; row += 1) {
      for (let column: number = fromColumn; column <= toColumn; column += 1) {
        const at: Vec2 = worldAt(canvas, column, row);
        if (blockerGap(body, at.x, at.z) < 0) mask[row * canvas.width + column] = 1;
      }
    }
  }
  return mask;
}

function patchesOf(canvas: Canvas, kinds: Uint8Array): Patch[] {
  const seen: Uint8Array = new Uint8Array(kinds.length);
  const found: Patch[] = [];
  const area: number = OVERLAY.pixelsPerMetre * OVERLAY.pixelsPerMetre;
  for (let start: number = 0; start < kinds.length; start += 1) {
    const kind: number = kinds[start] ?? 0;
    if (kind === 0 || seen[start] === 1) continue;
    seen[start] = 1;
    const queue: number[] = [start];
    let count: number = 0;
    let sumColumn: number = 0;
    let sumRow: number = 0;
    while (queue.length > 0) {
      const at: number | undefined = queue.pop();
      if (at === undefined) break;
      count += 1;
      const column: number = at % canvas.width;
      const row: number = Math.floor(at / canvas.width);
      sumColumn += column;
      sumRow += row;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const c: number = column + dc;
        const r: number = row + dr;
        if (c < 0 || r < 0 || c >= canvas.width || r >= canvas.height) continue;
        const next: number = r * canvas.width + c;
        if (seen[next] === 1 || kinds[next] !== kind) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    if (count / area < OVERLAY.leastPatch) continue;
    const centre: Vec2 = worldAt(canvas, sumColumn / count, sumRow / count);
    found.push({ kind: kind === 1 ? 'false-wall' : 'walk-through', area: Math.round((count / area) * 100) / 100, across: Math.round((centre.x - canvas.frame.origin.x) * 10) / 10, ahead: Math.round((centre.z - canvas.frame.origin.z) * 10) / 10 });
  }
  return found.toSorted((a: Patch, b: Patch): number => b.area - a.area);
}

export async function drawOverlay(content: Content, zoneId: string): Promise<Overlay> {
  await MeshoptDecoder.ready;
  const staged: StagedWorld = stageWorld(content, zoneId);
  const grid: NavGrid = staged.world.grid;
  const canvas: Canvas = canvasOf(frameOf(staged));
  const { tall, low } = await rasterise(canvas, placements(staged, content));
  const solid: Uint8Array = solidMask(canvas, [...grid.bodies, ...staged.stamped]);
  const gaps: GapAnalysis = analyseGaps(content, staged);
  const gapAt = (mask: Uint8Array, at: Vec2): boolean => {
    const column: number = Math.floor((at.x - gaps.field.origin.x) / GAPS.sample);
    const row: number = Math.floor((at.z - gaps.field.origin.z) / GAPS.sample);
    return column >= 0 && row >= 0 && column < gaps.field.columns && row < gaps.field.rows && mask[row * gaps.field.columns + column] === 1;
  };
  const rgb: Uint8Array = new Uint8Array(canvas.width * canvas.height * 3);
  const kinds: Uint8Array = new Uint8Array(canvas.width * canvas.height);
  const line: number = 0.5 / OVERLAY.pixelsPerMetre;
  for (let row: number = 0; row < canvas.height; row += 1) {
    for (let column: number = 0; column < canvas.width; column += 1) {
      const at: Vec2 = worldAt(canvas, column, row);
      const index: number = row * canvas.width + column;
      const cell: number = cellIndex(grid, at.x, at.z);
      const ground: boolean = cell >= 0 && staged.floor[cell] === 1;
      const blocked: boolean = solid[index] === 1;
      const drawn: boolean = tall[index] === 1;
      let colour: Rgb = OVERLAY.colours.ground;
      if (!ground) colour = OVERLAY.colours.solid;
      else if (drawn && blocked) colour = OVERLAY.colours.solid;
      else if (drawn) {
        colour = OVERLAY.colours.walkThrough;
        kinds[index] = 2;
      } else if (blocked) {
        colour = OVERLAY.colours.falseWall;
        kinds[index] = 1;
      } else if (gapAt(gaps.pinch, at)) colour = OVERLAY.colours.pinch;
      else if (gapAt(gaps.narrow, at)) colour = OVERLAY.colours.narrow;
      else if (gapAt(gaps.pocket, at)) colour = OVERLAY.colours.stranded;
      else if (grid.walkable[cell] !== 1) colour = OVERLAY.colours.band;
      else if (staged.reached[cell] !== 1) colour = OVERLAY.colours.stranded;
      else if (low[index] === 1) colour = OVERLAY.colours.low;
      else {
        const across: number = at.x - canvas.frame.origin.x;
        const ahead: number = at.z - canvas.frame.origin.z;
        const near = (value: number): boolean => Math.abs(value - Math.round(value / OVERLAY.gridEvery) * OVERLAY.gridEvery) < line;
        if (near(across) || near(ahead)) colour = OVERLAY.colours.grid;
      }
      rgb.set(colour, index * 3);
    }
  }
  return { width: canvas.width, height: canvas.height, rgb, patches: patchesOf(canvas, kinds), findings: gaps.findings };
}

function chunk(kind: string, data: Buffer): Buffer {
  const length: Buffer = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body: Buffer = Buffer.concat([Buffer.from(kind, 'ascii'), data]);
  const check: Buffer = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, check]);
}

export function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const stride: number = width * 3 + 1;
  const rows: Buffer = Buffer.alloc(stride * height);
  for (let row: number = 0; row < height; row += 1) rows.set(rgb.subarray(row * width * 3, (row + 1) * width * 3), row * stride + 1);
  const header: Buffer = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

async function main(): Promise<void> {
  const [zoneId, out] = process.argv.slice(2);
  if (zoneId === undefined || out === undefined) throw new Error('usage: node tools/zone-overlay.ts <zone id> <out.png>');
  const overlay: Overlay = await drawOverlay(loadContent(), zoneId);
  writeFileSync(out, encodePng(overlay.width, overlay.height, overlay.rgb));
  for (const found of overlay.findings) process.stdout.write(`${found.kind} ${found.prop ?? ''} at ${String(found.x)}, ${String(found.z)}: ${String(found.length)} m long, ${String(found.area)} m²\n`);
  for (const patch of overlay.patches) process.stdout.write(`${patch.kind} ${String(patch.area)} m² at across ${String(patch.across)}, ahead ${String(patch.ahead)}\n`);
}

if (import.meta.main) await main();
