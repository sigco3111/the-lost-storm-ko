import { Vector3 } from 'three';

export const SHAPES = {
  gridStep: 3,
  phiFrom: -87,
  phiTo: 90,
  pushPasses: 3,
  weld: 1e5,
  sliver: 1e-24,
  uvDigits: 1e4,
  normalDigits: 1e3,
  uvRadius: 0.11,
} as const;

const RADIANS: number = Math.PI / 180;

export interface Angles {
  readonly theta: number;
  readonly phi: number;
}

export interface EnvelopeFit {
  readonly cone: number;
  readonly spread: number;
  readonly blur: number;
}

export interface Envelope {
  readonly centre: Vector3;
  readonly radius: (theta: number, phi: number) => number;
}

export interface Triangle {
  readonly corners: readonly [Vector3, Vector3, Vector3];
  readonly material: string;
}

export interface ShellLevel {
  readonly phi: (theta: number) => number;
  readonly lift: (theta: number) => number;
  readonly material: (theta: number) => string;
}

export interface ShellPlan {
  readonly envelope: Envelope;
  readonly clearance: number;
  readonly thickness: number;
  readonly thetaFrom: number;
  readonly thetaTo: number;
  readonly columns: number;
  readonly closed: boolean;
  readonly pole: boolean;
  readonly liftInner: boolean;
  readonly levels: readonly ShellLevel[];
  readonly inside: string;
  readonly rim: string;
}

export interface ProfilePoint {
  readonly radius: number;
  readonly height: number;
}

export interface LathePlan {
  readonly origin: Vector3;
  readonly normal: Vector3;
  readonly up: Vector3;
  readonly segments: number;
  readonly turn: number;
  readonly profile: readonly ProfilePoint[];
  readonly materials: readonly string[];
}

export interface MeshPart {
  readonly material: string;
  readonly positions: readonly number[];
  readonly normals: readonly number[];
  readonly uvs: readonly number[];
  readonly indices: readonly number[];
}

export function direction(theta: number, phi: number): Vector3 {
  const t: number = theta * RADIANS;
  const p: number = phi * RADIANS;
  return new Vector3(Math.cos(p) * Math.sin(t), Math.sin(p), Math.cos(p) * Math.cos(t));
}

export function anglesOf(offset: Vector3): Angles {
  const flat: number = Math.hypot(offset.x, offset.z);
  return { theta: Math.atan2(offset.x, offset.z) / RADIANS, phi: Math.atan2(offset.y, flat) / RADIANS };
}

export function wrapDegrees(theta: number): number {
  return ((((theta + 180) % 360) + 360) % 360) - 180;
}

export function smoothstep(from: number, to: number, value: number): number {
  const t: number = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

interface Grid {
  readonly columns: number;
  readonly rows: number;
  readonly values: Float64Array;
}

function gridOf(): Grid {
  const columns: number = Math.round(360 / SHAPES.gridStep);
  const rows: number = Math.round((SHAPES.phiTo - SHAPES.phiFrom) / SHAPES.gridStep) + 1;
  return { columns, rows, values: new Float64Array(columns * rows) };
}

function cellAt(grid: Grid, column: number, row: number): number {
  const wrapped: number = ((column % grid.columns) + grid.columns) % grid.columns;
  const clamped: number = Math.min(grid.rows - 1, Math.max(0, row));
  return clamped * grid.columns + wrapped;
}

function read(grid: Grid, column: number, row: number): number {
  return grid.values[cellAt(grid, column, row)] ?? 0;
}

function cellAngles(grid: Grid, column: number, row: number): Angles {
  return { theta: -180 + (column / grid.columns) * 360, phi: SHAPES.phiFrom + row * SHAPES.gridStep };
}

function neighbourhood(grid: Grid, column: number, row: number, choose: (values: readonly number[]) => number): number {
  const around: number[] = [];
  for (let dr: number = -1; dr <= 1; dr += 1) for (let dc: number = -1; dc <= 1; dc += 1) around.push(read(grid, column + dc, row + dr));
  return choose(around);
}

function filtered(grid: Grid, choose: (values: readonly number[]) => number): Grid {
  const next: Grid = { ...grid, values: new Float64Array(grid.values.length) };
  for (let row: number = 0; row < grid.rows; row += 1) for (let column: number = 0; column < grid.columns; column += 1) next.values[cellAt(grid, column, row)] = neighbourhood(grid, column, row, choose);
  return next;
}

function largest(values: readonly number[]): number {
  return Math.max(...values);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum: number, value: number): number => sum + value, 0) / values.length;
}

function filledIn(grid: Grid): Grid {
  let current: Grid = grid;
  for (let pass: number = 0; pass < grid.rows && current.values.includes(0); pass += 1) {
    const before: Grid = current;
    const next: Grid = { ...before, values: Float64Array.from(before.values) };
    for (let row: number = 0; row < grid.rows; row += 1) {
      for (let column: number = 0; column < grid.columns; column += 1) {
        if (read(before, column, row) > 0) continue;
        const known: number[] = [];
        for (let dr: number = -1; dr <= 1; dr += 1) for (let dc: number = -1; dc <= 1; dc += 1) if (read(before, column + dc, row + dr) > 0) known.push(read(before, column + dc, row + dr));
        if (known.length > 0) next.values[cellAt(before, column, row)] = mean(known);
      }
    }
    current = next;
  }
  return current;
}

function reach(points: readonly Vector3[], centre: Vector3, coneDegrees: number): Grid {
  const grid: Grid = gridOf();
  const cone: number = Math.cos(coneDegrees * RADIANS);
  for (const point of points) {
    const offset: Vector3 = point.clone().sub(centre);
    const distance: number = offset.length();
    if (distance <= 0) continue;
    const unit: Vector3 = offset.clone().divideScalar(distance);
    const at: Angles = anglesOf(offset);
    const rowFrom: number = Math.floor((at.phi - coneDegrees - SHAPES.phiFrom) / SHAPES.gridStep);
    const rowTo: number = Math.ceil((at.phi + coneDegrees - SHAPES.phiFrom) / SHAPES.gridStep);
    for (let row: number = rowFrom; row <= rowTo; row += 1) {
      if (row < 0 || row >= grid.rows) continue;
      for (let column: number = 0; column < grid.columns; column += 1) {
        const cell: Angles = cellAngles(grid, column, row);
        if (direction(cell.theta, cell.phi).dot(unit) < cone) continue;
        const index: number = cellAt(grid, column, row);
        grid.values[index] = Math.max(grid.values[index] ?? 0, distance);
      }
    }
  }
  return grid;
}

function sample(grid: Grid, theta: number, phi: number): number {
  const column: number = ((wrapDegrees(theta) + 180) / 360) * grid.columns;
  const row: number = Math.min(grid.rows - 1, Math.max(0, (phi - SHAPES.phiFrom) / SHAPES.gridStep));
  const c0: number = Math.floor(column);
  const r0: number = Math.floor(row);
  const fc: number = column - c0;
  const fr: number = row - r0;
  const low: number = read(grid, c0, r0) * (1 - fc) + read(grid, c0 + 1, r0) * fc;
  const high: number = read(grid, c0, r0 + 1) * (1 - fc) + read(grid, c0 + 1, r0 + 1) * fc;
  return low * (1 - fr) + high * fr;
}

function repeated(grid: Grid, times: number, choose: (values: readonly number[]) => number): Grid {
  let current: Grid = grid;
  for (let pass: number = 0; pass < times; pass += 1) current = filtered(current, choose);
  return current;
}

function withValues(grid: Grid, values: Float64Array): Grid {
  return { ...grid, values };
}

export function envelopeOf(points: readonly Vector3[], centre: Vector3, fit: EnvelopeFit): Envelope {
  const needed: Grid = filledIn(reach(points, centre, fit.cone));
  let smooth: Grid = repeated(repeated(needed, fit.spread, largest), fit.blur, mean);
  for (let pass: number = 0; pass < SHAPES.pushPasses; pass += 1) {
    const short: Grid = withValues(smooth, smooth.values.map((value: number, index: number): number => Math.max(0, (needed.values[index] ?? 0) - value)));
    const push: Grid = repeated(repeated(short, fit.spread, largest), fit.blur, mean);
    smooth = withValues(smooth, smooth.values.map((value: number, index: number): number => value + (push.values[index] ?? 0)));
  }
  const final: Grid = smooth;
  return { centre: centre.clone(), radius: (theta: number, phi: number): number => sample(final, theta, phi) };
}

function normalOf(a: Vector3, b: Vector3, c: Vector3): Vector3 {
  return b.clone().sub(a).cross(c.clone().sub(a));
}

export function addTriangle(soup: Triangle[], a: Vector3, b: Vector3, c: Vector3, material: string, outward: Vector3 | null): void {
  const normal: Vector3 = normalOf(a, b, c);
  if (normal.lengthSq() < SHAPES.sliver) return;
  const flip: boolean = outward !== null && normal.dot(outward) < 0;
  soup.push({ corners: flip ? [a, c, b] : [a, b, c], material });
}

function quad(soup: Triangle[], corners: readonly [Vector3, Vector3, Vector3, Vector3], material: string, outward: Vector3 | null): void {
  const [a, b, c, d] = corners;
  addTriangle(soup, a, b, c, material, outward);
  addTriangle(soup, a, c, d, material, outward);
}

export function shellPoint(plan: ShellPlan, theta: number, phi: number, offset: number): Vector3 {
  const radius: number = plan.envelope.radius(theta, phi) + plan.clearance + offset;
  return direction(theta, phi).multiplyScalar(radius).add(plan.envelope.centre);
}

function columnAngles(plan: ShellPlan): number[] {
  const count: number = plan.closed ? plan.columns : plan.columns + 1;
  return Array.from({ length: count }, (_: unknown, index: number): number => plan.thetaFrom + ((plan.thetaTo - plan.thetaFrom) * index) / plan.columns);
}

function pick<T>(list: readonly T[], index: number): T {
  const found: T | undefined = list[index];
  if (found === undefined) throw new Error(`index ${index} is outside a list of ${list.length}`);
  return found;
}

export function innerRadius(plan: ShellPlan, theta: number, phi: number): number | null {
  const first: ShellLevel = pick(plan.levels, 0);
  const last: ShellLevel = pick(plan.levels, plan.levels.length - 1);
  const inside: boolean = plan.closed || (theta >= plan.thetaFrom && theta <= plan.thetaTo);
  if (!inside || phi < first.phi(theta) || (!plan.pole && phi > last.phi(theta))) return null;
  return plan.envelope.radius(theta, phi) + plan.clearance;
}

export function buildShell(soup: Triangle[], plan: ShellPlan): void {
  const thetas: number[] = columnAngles(plan);
  const outer: Vector3[][] = thetas.map((theta: number): Vector3[] => plan.levels.map((level: ShellLevel): Vector3 => shellPoint(plan, theta, level.phi(theta), plan.thickness + level.lift(theta))));
  const inner: Vector3[][] = thetas.map((theta: number): Vector3[] => plan.levels.map((level: ShellLevel): Vector3 => shellPoint(plan, theta, level.phi(theta), plan.liftInner ? level.lift(theta) : 0)));
  const spans: number = plan.closed ? thetas.length : thetas.length - 1;
  const top: number = plan.levels.length - 1;
  for (let i: number = 0; i < spans; i += 1) {
    const next: number = (i + 1) % thetas.length;
    const middle: number = plan.closed && next === 0 ? pick(thetas, i) + (plan.thetaTo - plan.thetaFrom) / (2 * plan.columns) : (pick(thetas, i) + pick(thetas, next)) / 2;
    const left: Vector3[] = pick(outer, i);
    const right: Vector3[] = pick(outer, next);
    const leftIn: Vector3[] = pick(inner, i);
    const rightIn: Vector3[] = pick(inner, next);
    for (let j: number = 0; j < top; j += 1) {
      const material: string = pick(plan.levels, j).material(middle);
      quad(soup, [pick(left, j), pick(right, j), pick(right, j + 1), pick(left, j + 1)], material, null);
      quad(soup, [pick(leftIn, j), pick(leftIn, j + 1), pick(rightIn, j + 1), pick(rightIn, j)], plan.inside, null);
    }
    const downward: Vector3 = pick(left, 0).clone().sub(pick(left, 1));
    quad(soup, [pick(left, 0), pick(right, 0), pick(rightIn, 0), pick(leftIn, 0)], plan.rim, downward);
    if (plan.pole) {
      const apex: Vector3 = shellPoint(plan, 0, SHAPES.phiTo, plan.thickness + pick(plan.levels, top).lift(0));
      const apexIn: Vector3 = shellPoint(plan, 0, SHAPES.phiTo, 0);
      addTriangle(soup, pick(left, top), pick(right, top), apex, pick(plan.levels, top).material(middle), pick(left, top).clone().sub(plan.envelope.centre));
      addTriangle(soup, pick(leftIn, top), apexIn, pick(rightIn, top), plan.inside, plan.envelope.centre.clone().sub(pick(leftIn, top)));
    } else {
      const upward: Vector3 = pick(left, top).clone().sub(pick(left, top - 1));
      quad(soup, [pick(left, top), pick(right, top), pick(rightIn, top), pick(leftIn, top)], plan.rim, upward);
    }
  }
  if (plan.closed) return;
  const last: number = thetas.length - 1;
  for (let j: number = 0; j < top; j += 1) {
    const towardLeft: Vector3 = pick(pick(outer, 0), j).clone().sub(pick(pick(outer, 1), j));
    quad(soup, [pick(pick(outer, 0), j), pick(pick(outer, 0), j + 1), pick(pick(inner, 0), j + 1), pick(pick(inner, 0), j)], plan.rim, towardLeft);
    const towardRight: Vector3 = pick(pick(outer, last), j).clone().sub(pick(pick(outer, last - 1), j));
    quad(soup, [pick(pick(outer, last), j), pick(pick(outer, last), j + 1), pick(pick(inner, last), j + 1), pick(pick(inner, last), j)], plan.rim, towardRight);
  }
}

export function surfaceFrame(plan: ShellPlan, theta: number, phi: number, offset: number): { readonly point: Vector3; readonly normal: Vector3; readonly up: Vector3 } {
  const step: number = 0.5;
  const point: Vector3 = shellPoint(plan, theta, phi, offset);
  const across: Vector3 = shellPoint(plan, theta + step, phi, offset).sub(shellPoint(plan, theta - step, phi, offset));
  const up: Vector3 = shellPoint(plan, theta, phi + step, offset).sub(shellPoint(plan, theta, phi - step, offset));
  const normal: Vector3 = across.clone().cross(up).normalize();
  return { point, normal, up: up.normalize() };
}

export function buildLathe(soup: Triangle[], plan: LathePlan): void {
  const axis: Vector3 = plan.normal.clone().normalize();
  const first: Vector3 = plan.up.clone().sub(axis.clone().multiplyScalar(plan.up.dot(axis))).normalize();
  const second: Vector3 = axis.clone().cross(first);
  const ring = (point: ProfilePoint, segment: number): Vector3 => {
    const angle: number = plan.turn * RADIANS + (segment / plan.segments) * Math.PI * 2;
    return plan.origin
      .clone()
      .add(axis.clone().multiplyScalar(point.height))
      .add(first.clone().multiplyScalar(Math.cos(angle) * point.radius))
      .add(second.clone().multiplyScalar(Math.sin(angle) * point.radius));
  };
  for (let k: number = 0; k + 1 < plan.profile.length; k += 1) {
    const from: ProfilePoint = pick(plan.profile, k);
    const to: ProfilePoint = pick(plan.profile, k + 1);
    const flatOut: number = -(to.height - from.height);
    const flatUp: number = to.radius - from.radius;
    const material: string = pick(plan.materials, Math.min(k, plan.materials.length - 1));
    for (let s: number = 0; s < plan.segments; s += 1) {
      const angle: number = plan.turn * RADIANS + ((s + 0.5) / plan.segments) * Math.PI * 2;
      const radial: Vector3 = first.clone().multiplyScalar(Math.cos(angle)).add(second.clone().multiplyScalar(Math.sin(angle)));
      const outward: Vector3 = radial.multiplyScalar(flatOut).add(axis.clone().multiplyScalar(flatUp));
      quad(soup, [ring(from, s), ring(from, s + 1), ring(to, s + 1), ring(to, s)], material, outward);
    }
  }
}

export function buildTube(soup: Triangle[], path: readonly Vector3[], radius: number, sides: number, material: string): void {
  const rings: Vector3[][] = [];
  let normal: Vector3 = new Vector3(0, 1, 0);
  path.forEach((point: Vector3, index: number): void => {
    const before: Vector3 = pick(path, Math.max(0, index - 1));
    const after: Vector3 = pick(path, Math.min(path.length - 1, index + 1));
    const tangent: Vector3 = after.clone().sub(before).normalize();
    normal = normal.clone().sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
    const binormal: Vector3 = tangent.clone().cross(normal);
    rings.push(Array.from({ length: sides }, (_: unknown, side: number): Vector3 => {
      const angle: number = (side / sides) * Math.PI * 2;
      return point.clone().add(normal.clone().multiplyScalar(Math.cos(angle) * radius)).add(binormal.clone().multiplyScalar(Math.sin(angle) * radius));
    }));
  });
  for (let index: number = 0; index + 1 < rings.length; index += 1) {
    const here: Vector3[] = pick(rings, index);
    const next: Vector3[] = pick(rings, index + 1);
    const centre: Vector3 = pick(path, index).clone().add(pick(path, index + 1)).multiplyScalar(0.5);
    for (let side: number = 0; side < sides; side += 1) {
      const turn: number = (side + 1) % sides;
      const corners: [Vector3, Vector3, Vector3, Vector3] = [pick(here, side), pick(here, turn), pick(next, turn), pick(next, side)];
      const middle: Vector3 = corners.reduce((sum: Vector3, corner: Vector3): Vector3 => sum.add(corner), new Vector3()).multiplyScalar(0.25);
      quad(soup, corners, material, middle.sub(centre));
    }
  }
  const ends: readonly [number, number][] = [[0, 1], [rings.length - 1, rings.length - 2]];
  for (const [end, inward] of ends) {
    const ring: Vector3[] = pick(rings, end);
    const outward: Vector3 = pick(path, end).clone().sub(pick(path, inward));
    for (let side: number = 1; side + 1 < sides; side += 1) addTriangle(soup, pick(ring, 0), pick(ring, side), pick(ring, side + 1), material, outward);
  }
}

function key(vector: Vector3, digits: number): string {
  return `${Math.round(vector.x * digits)},${Math.round(vector.y * digits)},${Math.round(vector.z * digits)}`;
}

function wrappedUv(point: Vector3, centre: Vector3): [number, number] {
  const at: Angles = anglesOf(point.clone().sub(centre));
  return [at.theta * RADIANS * SHAPES.uvRadius, at.phi * RADIANS * SHAPES.uvRadius];
}

interface Building {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
  readonly seen: Map<string, number>;
}

export function smoothParts(soup: readonly Triangle[], smoothDegrees: number, centre: Vector3): MeshPart[] {
  const limit: number = Math.cos(smoothDegrees * RADIANS);
  const faces: Vector3[] = soup.map((triangle: Triangle): Vector3 => normalOf(...triangle.corners));
  const units: Vector3[] = faces.map((face: Vector3): Vector3 => face.clone().normalize());
  const byPoint: Map<string, number[]> = new Map<string, number[]>();
  soup.forEach((triangle: Triangle, face: number): void => {
    for (const corner of triangle.corners) {
      const at: string = key(corner, SHAPES.weld);
      const list: number[] = byPoint.get(at) ?? [];
      list.push(face);
      byPoint.set(at, list);
    }
  });
  const parts: Map<string, Building> = new Map<string, Building>();
  soup.forEach((triangle: Triangle, face: number): void => {
    const part: Building = parts.get(triangle.material) ?? { positions: [], normals: [], uvs: [], indices: [], seen: new Map<string, number>() };
    parts.set(triangle.material, part);
    const own: Vector3 = pick(units, face);
    for (const corner of triangle.corners) {
      const normal: Vector3 = new Vector3();
      for (const other of byPoint.get(key(corner, SHAPES.weld)) ?? []) if (pick(units, other).dot(own) >= limit) normal.add(pick(faces, other));
      normal.normalize();
      const uv: [number, number] = wrappedUv(corner, centre);
      const vertexKey: string = `${key(corner, SHAPES.weld)}|${key(normal, SHAPES.normalDigits)}|${Math.round(uv[0] * SHAPES.uvDigits)},${Math.round(uv[1] * SHAPES.uvDigits)}`;
      const known: number | undefined = part.seen.get(vertexKey);
      if (known !== undefined) {
        part.indices.push(known);
        continue;
      }
      const index: number = part.positions.length / 3;
      part.seen.set(vertexKey, index);
      part.positions.push(corner.x, corner.y, corner.z);
      part.normals.push(normal.x, normal.y, normal.z);
      part.uvs.push(uv[0], uv[1]);
      part.indices.push(index);
    }
  });
  return [...parts].map(([material, part]: [string, Building]): MeshPart => ({ material, positions: part.positions, normals: part.normals, uvs: part.uvs, indices: part.indices }));
}

export function triangleCount(parts: readonly MeshPart[]): number {
  return parts.reduce((sum: number, part: MeshPart): number => sum + part.indices.length / 3, 0);
}
