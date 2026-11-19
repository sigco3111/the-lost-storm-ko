import { BufferAttribute, BufferGeometry } from 'three';
import type { Skyline, SkylinePiece } from './lobby-sets.ts';

export const LOBBY_SKYLINE = {
  depthShare: 0.35,
  maxDepth: 3,
  towerBody: 0.82,
  gableBody: 0.68,
  brokenSteps: 6,
  brokenLow: 0.55,
  wallBody: 0.86,
  merlons: 11,
  ruinBody: 0.7,
  ruinTeeth: 4,
  ruinLow: 0.72,
  hillSegments: 14,
  hillFloor: 0.45,
  hillTaper: 0.7,
  cliffSegments: 18,
  cliffFloor: 0.62,
  ridgeDepth: 2,
  windowAcross: 0.6,
  windowLow: 0.3,
  windowSpan: 0.4,
  windowInset: 0.15,
} as const;

export interface RingPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

type Corner = readonly [number, number, number];

interface Builder {
  readonly points: number[];
  triangle(a: Corner, b: Corner, c: Corner): void;
  quad(a: Corner, b: Corner, c: Corner, d: Corner): void;
}

function builder(): Builder {
  const points: number[] = [];
  const triangle = (a: Corner, b: Corner, c: Corner): void => {
    points.push(...a, ...b, ...c);
  };
  return {
    points,
    triangle,
    quad(a: Corner, b: Corner, c: Corner, d: Corner): void {
      triangle(a, b, c);
      triangle(a, c, d);
    },
  };
}

export function stepHash(index: number, seed: number): number {
  const mixed: number = Math.sin(index * 91.7 + seed * 12.9898) * 43758.5453;
  return mixed - Math.floor(mixed);
}

function box(out: Builder, left: number, right: number, bottom: number, top: number, depth: number): void {
  const near: number = depth / 2;
  const far: number = -depth / 2;
  out.quad([left, bottom, near], [right, bottom, near], [right, top, near], [left, top, near]);
  out.quad([right, bottom, far], [left, bottom, far], [left, top, far], [right, top, far]);
  out.quad([left, bottom, far], [left, bottom, near], [left, top, near], [left, top, far]);
  out.quad([right, bottom, near], [right, bottom, far], [right, top, far], [right, top, near]);
  out.quad([left, top, near], [right, top, near], [right, top, far], [left, top, far]);
}

function pyramid(out: Builder, left: number, right: number, bottom: number, top: number, depth: number): void {
  const near: number = depth / 2;
  const far: number = -depth / 2;
  const apex: Corner = [(left + right) / 2, top, 0];
  out.triangle([left, bottom, near], [right, bottom, near], apex);
  out.triangle([right, bottom, far], [left, bottom, far], apex);
  out.triangle([left, bottom, far], [left, bottom, near], apex);
  out.triangle([right, bottom, near], [right, bottom, far], apex);
}

function prism(out: Builder, left: number, right: number, bottom: number, top: number, depth: number): void {
  const near: number = depth / 2;
  const far: number = -depth / 2;
  const middle: number = (left + right) / 2;
  out.triangle([left, bottom, near], [right, bottom, near], [middle, top, near]);
  out.triangle([right, bottom, far], [left, bottom, far], [middle, top, far]);
  out.quad([left, bottom, far], [left, bottom, near], [middle, top, near], [middle, top, far]);
  out.quad([right, bottom, near], [right, bottom, far], [middle, top, far], [middle, top, near]);
}

function ridge(out: Builder, left: number, right: number, bottom: number, heights: readonly number[], depth: number): void {
  const near: number = depth / 2;
  const far: number = -depth / 2;
  const segments: number = heights.length - 1;
  for (let index: number = 0; index < segments; index += 1) {
    const x0: number = left + ((right - left) * index) / segments;
    const x1: number = left + ((right - left) * (index + 1)) / segments;
    const h0: number = heights[index] ?? bottom;
    const h1: number = heights[index + 1] ?? bottom;
    out.quad([x0, bottom, near], [x1, bottom, near], [x1, h1, near], [x0, h0, near]);
    out.quad([x1, bottom, far], [x0, bottom, far], [x0, h0, far], [x1, h1, far]);
    out.quad([x0, h0, near], [x1, h1, near], [x1, h1, far], [x0, h0, far]);
  }
}

export function ridgeHeights(piece: SkylinePiece, segments: number, floor: number, taper: number, smooth: boolean): readonly number[] {
  const raw: number[] = [];
  for (let index: number = 0; index <= segments; index += 1) {
    const along: number = index / segments;
    const envelope: number = (1 - taper) + taper * Math.sin(Math.PI * along) ** 0.7;
    const jitter: number = smooth ? (stepHash(index, piece.angleDegrees) + stepHash(index + 1, piece.angleDegrees) + stepHash(index - 1, piece.angleDegrees)) / 3 : stepHash(index, piece.angleDegrees);
    raw.push(envelope * (floor + (1 - floor) * jitter));
  }
  const peak: number = Math.max(...raw);
  return raw.map((value: number): number => (value / peak) * piece.height);
}

export function pieceDepth(piece: SkylinePiece): number {
  return Math.min(LOBBY_SKYLINE.maxDepth, piece.width * LOBBY_SKYLINE.depthShare);
}

export function shapePiece(out: Builder, piece: SkylinePiece, bottom: number): void {
  const half: number = piece.width / 2;
  const depth: number = pieceDepth(piece);
  const spec = LOBBY_SKYLINE;
  switch (piece.kind) {
    case 'block':
      box(out, -half, half, bottom, piece.height, depth);
      return;
    case 'broken':
      for (let step: number = 0; step < spec.brokenSteps; step += 1) {
        const left: number = -half + (piece.width * step) / spec.brokenSteps;
        const right: number = -half + (piece.width * (step + 1)) / spec.brokenSteps;
        const top: number = piece.height * (spec.brokenLow + (1 - spec.brokenLow) * stepHash(step, piece.angleDegrees));
        box(out, left, right, bottom, top, depth);
      }
      return;
    case 'tower':
      box(out, -half, half, bottom, piece.height * spec.towerBody, depth);
      pyramid(out, -half * 1.15, half * 1.15, piece.height * spec.towerBody, piece.height, depth * 1.15);
      return;
    case 'ruin': {
      const body: number = piece.height * spec.ruinBody;
      box(out, -half, half, bottom, body, depth);
      const tooth: number = piece.width / spec.ruinTeeth;
      const tallest: number = Math.floor(stepHash(1, piece.angleDegrees) * spec.ruinTeeth);
      for (let index: number = 0; index < spec.ruinTeeth; index += 1) {
        const top: number = index === tallest ? piece.height : body + (piece.height - body) * (spec.ruinLow + (1 - spec.ruinLow) * stepHash(index + 7, piece.angleDegrees)) * 0.9;
        box(out, -half + index * tooth, -half + (index + 1) * tooth, body, top, depth);
      }
      return;
    }
    case 'spire':
      pyramid(out, -half, half, bottom, piece.height, depth);
      return;
    case 'gable':
      box(out, -half, half, bottom, piece.height * spec.gableBody, depth);
      prism(out, -half, half, piece.height * spec.gableBody, piece.height, depth);
      return;
    case 'wall': {
      const body: number = piece.height * spec.wallBody;
      box(out, -half, half, bottom, body, depth);
      const merlon: number = piece.width / (spec.merlons * 2 - 1);
      for (let index: number = 0; index < spec.merlons; index += 1) box(out, -half + index * 2 * merlon, -half + (index * 2 + 1) * merlon, body, piece.height, depth);
      return;
    }
    case 'hill':
      ridge(out, -half, half, bottom, ridgeHeights(piece, spec.hillSegments, spec.hillFloor, spec.hillTaper, true), spec.ridgeDepth);
      return;
    case 'cliff':
      ridge(out, -half, half, bottom, ridgeHeights(piece, spec.cliffSegments, spec.cliffFloor, spec.hillTaper, false), spec.ridgeDepth);
      return;
  }
}

export function onRing(radius: number, angleDegrees: number, x: number, y: number, z: number): RingPoint {
  const angle: number = (angleDegrees * Math.PI) / 180;
  const radial: number = radius - z;
  return { x: Math.cos(angle) * x + Math.sin(angle) * radial, y, z: Math.sin(angle) * x - Math.cos(angle) * radial };
}

export function skylineWindows(skyline: Skyline): readonly RingPoint[] {
  const spec = LOBBY_SKYLINE;
  return skyline.pieces.flatMap((piece: SkylinePiece): RingPoint[] =>
    Array.from({ length: Math.floor(piece.lit) }, (_unused: unknown, index: number): RingPoint => {
      const across: number = (stepHash(index + 3, piece.angleDegrees) - 0.5) * piece.width * spec.windowAcross;
      const up: number = piece.height * (spec.windowLow + spec.windowSpan * stepHash(index + 11, piece.angleDegrees));
      return onRing(skyline.radius, piece.angleDegrees, across, up, pieceDepth(piece) / 2 + spec.windowInset);
    }),
  );
}

export function skylineGeometry(skyline: Skyline): BufferGeometry {
  const all: number[] = [];
  for (const piece of skyline.pieces) {
    const out: Builder = builder();
    shapePiece(out, piece, -skyline.sink);
    for (let at: number = 0; at < out.points.length; at += 3) {
      const point: RingPoint = onRing(skyline.radius, piece.angleDegrees, out.points[at] ?? 0, out.points[at + 1] ?? 0, out.points[at + 2] ?? 0);
      all.push(point.x, point.y, point.z);
    }
  }
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(all), 3));
  geometry.computeBoundingSphere();
  return geometry;
}
