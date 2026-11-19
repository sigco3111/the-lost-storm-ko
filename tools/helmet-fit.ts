import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import type { Intersection } from 'three';

export interface HelmetShape {
  readonly positions: readonly number[];
  readonly indices: readonly number[];
}

export interface HeadShape {
  readonly points: readonly Vector3[];
  readonly centre: Vector3;
  readonly top: number;
  readonly width: number;
}

export type Anchor = 'crown' | 'base';

export interface FitGoal {
  readonly anchor: Anchor;
  readonly clearance: number;
  readonly crown: number;
  readonly forward: number;
  readonly lift: number;
  readonly lowest: number;
  readonly highest: number;
  readonly steps: number;
}

export interface Placement {
  readonly scale: number;
  readonly offset: Vector3;
  readonly clearance: number;
  readonly covered: number;
}

const FIT = {
  far: Infinity,
  crownBand: 0.6,
  passes: 12,
  settled: 0.0002,
  leastCovered: { crown: 0.4, base: 0.03 },
  keepCrown: 0.9,
  scan: 16,
} as const;

interface Judged {
  readonly placement: Placement;
  readonly crownCovered: number;
}

function crownFrom(head: HeadShape): number {
  return head.centre.y + (head.top - head.centre.y) * FIT.crownBand;
}

function crownOf(head: HeadShape): HeadShape {
  const from: number = crownFrom(head);
  return { ...head, points: head.points.filter((point: Vector3): boolean => point.y >= from) };
}

export function headShape(points: readonly Vector3[], above: number, every: number): HeadShape {
  const kept: Vector3[] = points.filter((point: Vector3, index: number): boolean => point.y >= above && index % every === 0);
  const box: Box3 = new Box3().setFromPoints(points.filter((point: Vector3): boolean => point.y >= above));
  const centre: Vector3 = box.getCenter(new Vector3());
  return { points: kept, centre, top: box.max.y, width: box.max.x - box.min.x };
}

export function helmetMesh(shape: HelmetShape): Mesh {
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(shape.positions), 3));
  geometry.setIndex([...shape.indices]);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
}

function helmetBox(shape: HelmetShape): Box3 {
  const box: Box3 = new Box3();
  for (let index: number = 0; index + 2 < shape.positions.length; index += 3) box.expandByPoint(new Vector3(shape.positions[index] ?? 0, shape.positions[index + 1] ?? 0, shape.positions[index + 2] ?? 0));
  return box;
}

function firstHit(raycaster: Raycaster, mesh: Mesh, origin: Vector3, direction: Vector3): number | null {
  raycaster.set(origin, direction);
  raycaster.far = FIT.far;
  const hits: Intersection[] = raycaster.intersectObject(mesh, false);
  const outer: Intersection | undefined = hits.find((hit: Intersection): boolean => (hit.face?.normal.dot(direction) ?? 1) > 0);
  const first: Intersection | undefined = outer ?? hits[0];
  return first === undefined ? null : first.distance;
}

export interface Clearance {
  readonly least: number;
  readonly covered: number;
  readonly coveredAbove: number;
}

export function clearanceAt(mesh: Mesh, head: HeadShape, scale: number, offset: Vector3, above: number = Infinity): Clearance {
  const raycaster: Raycaster = new Raycaster();
  const origin: Vector3 = head.centre.clone().sub(offset).divideScalar(scale);
  let least: number = Infinity;
  let covered: number = 0;
  let coveredAbove: number = 0;
  for (const point of head.points) {
    const toward: Vector3 = point.clone().sub(head.centre);
    const reach: number = toward.length();
    if (reach === 0) continue;
    const hit: number | null = firstHit(raycaster, mesh, origin, toward.normalize());
    if (hit === null) continue;
    covered += 1;
    if (point.y >= above) coveredAbove += 1;
    least = Math.min(least, hit * scale - reach);
  }
  return { least, covered, coveredAbove };
}

export function placeAt(mesh: Mesh, base: Box3, head: HeadShape, goal: FitGoal, scale: number): Vector3 {
  const centre: Vector3 = base.getCenter(new Vector3());
  const offset: Vector3 = new Vector3(head.centre.x - centre.x * scale, head.top + goal.crown - base.max.y * scale, head.centre.z + goal.forward - centre.z * scale);
  switch (goal.anchor) {
    case 'base':
      return offset.setY(head.centre.y + goal.lift - base.min.y * scale);
    case 'crown':
      break;
  }
  const crown: HeadShape = crownOf(head);
  if (clearanceAt(mesh, crown, scale, offset).covered === 0) return offset.setY(head.centre.y - (base.min.y + base.max.y) * scale * 0.5);
  for (let pass: number = 0; pass < FIT.passes; pass += 1) {
    const { least, covered } = clearanceAt(mesh, crown, scale, offset);
    if (covered === 0) return offset;
    const short: number = goal.crown - least;
    if (Math.abs(short) < FIT.settled) return offset;
    offset.setY(offset.y + short);
  }
  return offset;
}

export function fitHelmet(shape: HelmetShape, head: HeadShape, goal: FitGoal): Placement {
  const mesh: Mesh = helmetMesh(shape);
  const base: Box3 = helmetBox(shape);
  const unit: number = head.width / Math.max(base.max.x - base.min.x, Number.EPSILON);
  const from: number = crownFrom(head);
  const judge = (factor: number): Judged => {
    const scale: number = unit * factor;
    const offset: Vector3 = placeAt(mesh, base, head, goal, scale);
    const { least, covered, coveredAbove } = clearanceAt(mesh, head, scale, offset, from);
    const placement: Placement = { scale, offset, clearance: covered < head.points.length * FIT.leastCovered[goal.anchor] ? -Infinity : least, covered };
    return { placement, crownCovered: coveredAbove };
  };
  const enough: number = (goal.anchor === 'crown' ? Math.min(goal.clearance, goal.crown) : goal.clearance) - FIT.settled;
  let best: Judged = judge(goal.highest);
  const keep: number = best.crownCovered * FIT.keepCrown;
  const fits = (tried: Judged): boolean => tried.placement.clearance >= enough && tried.crownCovered >= keep;
  const ratio: number = (goal.highest / goal.lowest) ** (1 / (FIT.scan - 1));
  let low: number = goal.lowest;
  let high: number = goal.highest;
  for (let at: number = 0; at < FIT.scan; at += 1) {
    const factor: number = goal.lowest * ratio ** at;
    const tried: Judged = judge(factor);
    if (fits(tried)) {
      best = tried;
      high = factor;
      break;
    }
    low = factor;
  }
  for (let step: number = 0; step < goal.steps; step += 1) {
    const middle: number = (low + high) / 2;
    const tried: Judged = judge(middle);
    if (fits(tried)) {
      best = tried;
      high = middle;
    } else low = middle;
  }
  return best.placement;
}
