import { Matrix4, Vector3 } from 'three';
import type { Triangle } from './headgear-shapes.ts';
import { addTriangle } from './headgear-shapes.ts';

export interface CordPlan {
  readonly centre: Vector3;
  readonly frontY: number;
  readonly ceiling: number;
  readonly samples: number;
  readonly gap: number;
  readonly frontGap: number;
  readonly smoothing: number;
  readonly collarReach: number;
  readonly collarWindow: number;
  readonly collarBand: number;
  readonly skinMargin: number;
  readonly outside: number;
  readonly frontFrom: number;
}

export interface CordLine {
  readonly origin: Vector3;
  readonly out: Vector3;
}

export interface Influence {
  readonly joint: string;
  readonly weight: number;
}

export interface Weighted {
  readonly at: Vector3;
  readonly influences: readonly Influence[];
}

export interface Resting {
  readonly tilt: number;
  readonly placed: Matrix4;
}

export const FIT = {
  tiltStep: 0.5,
  tiltMost: 70,
  frontPower: 6,
} as const;

const RADIANS: number = Math.PI / 180;

function degreesOf(theta: number): number {
  const wrapped: number = ((((theta / RADIANS) % 360) + 540) % 360) - 180;
  return Math.abs(wrapped);
}

export function frontShare(plan: CordPlan, theta: number): number {
  const off: number = degreesOf(theta) / plan.frontFrom;
  if (off >= 1) return 0;
  return 1 - off * off * (3 - 2 * off);
}

export function cordGap(plan: CordPlan, theta: number): number {
  return plan.gap + (plan.frontGap - plan.gap) * ((1 + Math.cos(theta)) / 2) ** FIT.frontPower;
}

function across(theta: number): Vector3 {
  return new Vector3(Math.sin(theta), 0, Math.cos(theta));
}

function windowed(points: readonly Vector3[], plan: CordPlan, theta: number): { readonly height: number; readonly distance: number }[] {
  const window: number = plan.collarWindow * RADIANS;
  const inside: { readonly height: number; readonly distance: number }[] = [];
  for (const point of points) {
    const dx: number = point.x - plan.centre.x;
    const dz: number = point.z - plan.centre.z;
    const distance: number = Math.hypot(dx, dz);
    if (distance > plan.collarReach || point.y > plan.ceiling) continue;
    const turn: number = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - theta), Math.cos(Math.atan2(dx, dz) - theta)));
    if (turn <= window) inside.push({ height: point.y, distance });
  }
  return inside;
}

function median(values: readonly number[]): number {
  const sorted: number[] = values.toSorted((a: number, b: number): number => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function necklineRadius(collar: readonly Vector3[], neck: readonly Vector3[], plan: CordPlan, theta: number): number {
  const inside = windowed(collar, plan, theta);
  const top: number = Math.max(...inside.map((point): number => point.height));
  const rim: number = median(inside.filter((point): boolean => point.height >= top - plan.collarBand).map((point): number => point.distance));
  const skin: number = Math.max(0, ...windowed(neck, plan, theta).map((point): number => point.distance));
  return Math.max(rim, skin + plan.skinMargin) + plan.outside;
}

export function cordLine(plan: CordPlan, theta: number, radius: number): CordLine {
  const share: number = frontShare(plan, theta);
  const beta: number = (share * Math.PI) / 2;
  const outward: Vector3 = across(theta);
  const height: number = plan.centre.y + (plan.frontY - plan.centre.y) * share;
  const origin: Vector3 = new Vector3(plan.centre.x, height, plan.centre.z).add(outward.clone().multiplyScalar(radius));
  return { origin, out: outward.multiplyScalar(Math.sin(beta)).add(new Vector3(0, Math.cos(beta), 0)).normalize() };
}

export function contactAlong(points: readonly Vector3[], line: CordLine, gap: number): number {
  const reach: number = gap * gap;
  let most: number = -Infinity;
  const offset: Vector3 = new Vector3();
  for (const point of points) {
    offset.subVectors(point, line.origin);
    const along: number = offset.dot(line.out);
    const off: number = offset.lengthSq() - along * along;
    if (off < reach) most = Math.max(most, along + Math.sqrt(reach - off));
  }
  return Number.isFinite(most) ? most : 0;
}

function around<T>(list: readonly T[], index: number): T {
  const found: T | undefined = list[((index % list.length) + list.length) % list.length];
  if (found === undefined) throw new Error('empty list');
  return found;
}

export function closedFrom(values: readonly number[], width: number): number[] {
  const widened: number[] = values.map((_: number, index: number): number => {
    let most: number = -Infinity;
    for (let offset: number = -width; offset <= width; offset += 1) most = Math.max(most, around(values, index + offset));
    return most;
  });
  return widened.map((_: number, index: number): number => {
    let sum: number = 0;
    for (let offset: number = -width; offset <= width; offset += 1) sum += around(widened, index + offset);
    return sum / (width * 2 + 1);
  });
}

export function averaged(values: readonly number[], width: number): number[] {
  return values.map((_: number, index: number): number => {
    let sum: number = 0;
    for (let offset: number = -width; offset <= width; offset += 1) sum += around(values, index + offset);
    return sum / (width * 2 + 1);
  });
}

export function cordAngle(plan: CordPlan, index: number): number {
  return (index / plan.samples) * Math.PI * 2;
}

export function settleCord(points: readonly Vector3[], collar: readonly Vector3[], neck: readonly Vector3[], plan: CordPlan): Vector3[] {
  const angles: number[] = Array.from({ length: plan.samples }, (_: unknown, index: number): number => cordAngle(plan, index));
  const radii: number[] = closedFrom(angles.map((theta: number): number => necklineRadius(collar, neck, plan, theta)), plan.smoothing);
  const lines: CordLine[] = angles.map((theta: number, index: number): CordLine => cordLine(plan, theta, radii[index] ?? 0));
  const reach: number[] = lines.map((line: CordLine, index: number): number => contactAlong(points, line, cordGap(plan, angles[index] ?? 0)));
  return closedFrom(reach, plan.smoothing).map((along: number, index: number): Vector3 => {
    const line: CordLine = around(lines, index);
    return line.origin.clone().add(line.out.clone().multiplyScalar(along));
  });
}

export function leastDistance(from: readonly Vector3[], to: readonly Vector3[]): number {
  let least: number = Infinity;
  for (const a of from) for (const b of to) least = Math.min(least, a.distanceToSquared(b));
  return Math.sqrt(least);
}

export function buildLoop(soup: Triangle[], path: readonly Vector3[], radius: number, sides: number, material: string): void {
  const count: number = path.length;
  let normal: Vector3 = new Vector3(0, 1, 0);
  const frames: { readonly normal: Vector3; readonly binormal: Vector3 }[] = [];
  for (let index: number = 0; index <= count; index += 1) {
    const tangent: Vector3 = around(path, index + 1).clone().sub(around(path, index - 1)).normalize();
    normal = normal.clone().sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
    frames.push({ normal, binormal: tangent.clone().cross(normal) });
  }
  const first = around(frames, 0);
  const last = around(frames, count);
  const twist: number = Math.atan2(last.normal.dot(first.binormal), last.normal.dot(first.normal));
  const rings: Vector3[][] = path.map((point: Vector3, index: number): Vector3[] => {
    const frame = around(frames, index);
    const undo: number = (-twist * index) / count;
    return Array.from({ length: sides }, (_: unknown, side: number): Vector3 => {
      const angle: number = (side / sides) * Math.PI * 2 + undo;
      return point.clone().add(frame.normal.clone().multiplyScalar(Math.cos(angle) * radius)).add(frame.binormal.clone().multiplyScalar(Math.sin(angle) * radius));
    });
  });
  for (let index: number = 0; index < count; index += 1) {
    const here: Vector3[] = around(rings, index);
    const next: Vector3[] = around(rings, index + 1);
    const centre: Vector3 = around(path, index).clone().add(around(path, index + 1)).multiplyScalar(0.5);
    for (let side: number = 0; side < sides; side += 1) {
      const a: Vector3 = around(here, side);
      const b: Vector3 = around(here, side + 1);
      const c: Vector3 = around(next, side + 1);
      const d: Vector3 = around(next, side);
      const outward: Vector3 = a.clone().add(b).add(c).add(d).multiplyScalar(0.25).sub(centre);
      addTriangle(soup, a, b, c, material, outward);
      addTriangle(soup, a, c, d, material, outward);
    }
  }
}

export function movedSoup(soup: readonly Triangle[], move: (point: Vector3) => Vector3): Triangle[] {
  return soup.map((triangle: Triangle): Triangle => {
    const [a, b, c] = triangle.corners;
    return { corners: [move(a.clone()), move(b.clone()), move(c.clone())], material: triangle.material };
  });
}

export function strongest(influences: readonly Influence[], keep: number): Influence[] {
  const summed: Map<string, number> = new Map<string, number>();
  for (const influence of influences) summed.set(influence.joint, (summed.get(influence.joint) ?? 0) + influence.weight);
  const kept: Influence[] = [...summed]
    .map(([joint, weight]: [string, number]): Influence => ({ joint, weight }))
    .filter((influence: Influence): boolean => influence.weight > 0)
    .toSorted((a: Influence, b: Influence): number => (b.weight === a.weight ? a.joint.localeCompare(b.joint) : b.weight - a.weight))
    .slice(0, keep);
  const total: number = kept.reduce((sum: number, influence: Influence): number => sum + influence.weight, 0);
  return total > 0 ? kept.map((influence: Influence): Influence => ({ joint: influence.joint, weight: influence.weight / total })) : [];
}

export function blendNearest(sources: readonly Weighted[], at: Vector3, count: number, keep: number): Influence[] {
  const nearest: { readonly source: Weighted; readonly distance: number }[] = sources
    .map((source: Weighted): { readonly source: Weighted; readonly distance: number } => ({ source, distance: source.at.distanceTo(at) }))
    .toSorted((a, b): number => a.distance - b.distance)
    .slice(0, count);
  const blended: Influence[] = nearest.flatMap(({ source, distance }): Influence[] => source.influences.map((influence: Influence): Influence => ({ joint: influence.joint, weight: influence.weight / Math.max(distance, 1e-4) })));
  return strongest(blended, keep);
}

export function smoothAlong(rings: readonly (readonly Influence[])[], passes: number, keep: number): Influence[][] {
  let current: Influence[][] = rings.map((ring: readonly Influence[]): Influence[] => [...ring]);
  for (let pass: number = 0; pass < passes; pass += 1) {
    const before: Influence[][] = current;
    current = before.map((_: Influence[], index: number): Influence[] => {
      const scaled = (ring: readonly Influence[], by: number): Influence[] => ring.map((influence: Influence): Influence => ({ joint: influence.joint, weight: influence.weight * by }));
      return strongest([...scaled(around(before, index - 1), 0.25), ...scaled(around(before, index), 0.5), ...scaled(around(before, index + 1), 0.25)], keep);
    });
  }
  return current;
}

export class PointGrid {
  private readonly cells: Map<string, Vector3[]> = new Map<string, Vector3[]>();

  private readonly size: number;

  constructor(points: readonly Vector3[], size: number) {
    this.size = size;
    for (const point of points) {
      const key: string = this.keyOf(Math.floor(point.x / size), Math.floor(point.y / size), Math.floor(point.z / size));
      const list: Vector3[] = this.cells.get(key) ?? [];
      list.push(point);
      this.cells.set(key, list);
    }
  }

  private keyOf(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  nearerThan(at: Vector3, distance: number): boolean {
    const reach: number = Math.ceil(distance / this.size);
    const cx: number = Math.floor(at.x / this.size);
    const cy: number = Math.floor(at.y / this.size);
    const cz: number = Math.floor(at.z / this.size);
    const limit: number = distance * distance;
    for (let x: number = cx - reach; x <= cx + reach; x += 1) {
      for (let y: number = cy - reach; y <= cy + reach; y += 1) {
        for (let z: number = cz - reach; z <= cz + reach; z += 1) {
          for (const point of this.cells.get(this.keyOf(x, y, z)) ?? []) if (point.distanceToSquared(at) < limit) return true;
        }
      }
    }
    return false;
  }
}

export function surfaceSamples(a: Vector3, b: Vector3, c: Vector3, spacing: number): Vector3[] {
  const longest: number = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  const steps: number = Math.max(1, Math.ceil(longest / spacing));
  const found: Vector3[] = [];
  for (let i: number = 0; i <= steps; i += 1) {
    for (let j: number = 0; i + j <= steps; j += 1) {
      found.push(a.clone().add(b.clone().sub(a).multiplyScalar(i / steps)).add(c.clone().sub(a).multiplyScalar(j / steps)));
    }
  }
  return found;
}

export function hangMatrix(hang: Vector3, tilt: number): Matrix4 {
  return new Matrix4().makeRotationX(-tilt * RADIANS).setPosition(hang);
}

export function restingTilt(local: readonly Vector3[], hang: Vector3, grid: PointGrid, clearance: number): Resting {
  for (let tilt: number = 0; tilt <= FIT.tiltMost; tilt += FIT.tiltStep) {
    const placed: Matrix4 = hangMatrix(hang, tilt);
    if (!local.some((point: Vector3): boolean => grid.nearerThan(point.clone().applyMatrix4(placed), clearance))) return { tilt, placed };
  }
  throw new Error(`no tilt up to ${FIT.tiltMost} degrees clears the chest`);
}
