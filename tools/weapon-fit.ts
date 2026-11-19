import { Box3, Matrix4, Vector3 } from 'three';

export type Axis = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';

export const AXES: readonly Axis[] = ['+x', '-x', '+y', '-y', '+z', '-z'];

export interface PoleHold {
  readonly kind: 'pole';
  readonly forward: Axis;
  readonly side: Axis | null;
}

export interface CrossbowHold {
  readonly kind: 'crossbow';
  readonly forward: Axis;
  readonly up: Axis;
  readonly rise: number;
}

export type Hold = PoleHold | CrossbowHold;

export interface WeaponGoal {
  readonly hold: Hold;
  readonly align: boolean;
  readonly length: number;
  readonly grip: number;
}

export interface WeaponPlacement {
  readonly matrix: Matrix4;
  readonly scale: number;
  readonly reach: number;
  readonly behind: number;
}

const FIT = {
  slice: 0.03,
  sweeps: 64,
  leastSlicePoints: 3,
} as const;

const DIRECTIONS: Readonly<Record<Axis, readonly [number, number, number]>> = {
  '+x': [1, 0, 0],
  '-x': [-1, 0, 0],
  '+y': [0, 1, 0],
  '-y': [0, -1, 0],
  '+z': [0, 0, 1],
  '-z': [0, 0, -1],
};

export function axisVector(axis: Axis): Vector3 {
  const [x, y, z]: readonly [number, number, number] = DIRECTIONS[axis];
  return new Vector3(x, y, z);
}

function centreOf(points: readonly Vector3[]): Vector3 {
  const sum: Vector3 = new Vector3();
  for (const point of points) sum.add(point);
  return points.length === 0 ? sum : sum.divideScalar(points.length);
}

function spread(points: readonly Vector3[], centre: Vector3): readonly [Vector3, Vector3, Vector3] {
  const rows: [Vector3, Vector3, Vector3] = [new Vector3(), new Vector3(), new Vector3()];
  for (const point of points) {
    const offset: Vector3 = point.clone().sub(centre);
    rows[0].addScaledVector(offset, offset.x);
    rows[1].addScaledVector(offset, offset.y);
    rows[2].addScaledVector(offset, offset.z);
  }
  return rows;
}

function principal(points: readonly Vector3[], hint: Vector3, without: Vector3 | null): Vector3 {
  const rows: readonly [Vector3, Vector3, Vector3] = spread(points, centreOf(points));
  let axis: Vector3 = hint.clone();
  for (let sweep: number = 0; sweep < FIT.sweeps; sweep += 1) {
    if (without !== null) axis.addScaledVector(without, -axis.dot(without));
    const next: Vector3 = new Vector3(rows[0].dot(axis), rows[1].dot(axis), rows[2].dot(axis));
    if (without !== null) next.addScaledVector(without, -next.dot(without));
    if (next.lengthSq() === 0) break;
    axis = next.normalize();
  }
  return axis.dot(hint) < 0 ? axis.negate() : axis;
}

function basis(points: readonly Vector3[], goal: WeaponGoal): Matrix4 {
  const hint: Vector3 = axisVector(goal.hold.forward);
  const forward: Vector3 = goal.align ? principal(points, hint, null) : hint;
  const secondHint: Vector3 = goal.hold.kind === 'crossbow' ? axisVector(goal.hold.up) : goal.hold.side === null ? principal(points, new Vector3(1, 1, 1).normalize(), forward) : axisVector(goal.hold.side);
  const second: Vector3 = secondHint.clone().addScaledVector(forward, -secondHint.dot(forward)).normalize();
  const third: Vector3 = new Vector3().crossVectors(forward, second);
  const rows: Matrix4 =
    goal.hold.kind === 'pole'
      ? new Matrix4().makeBasis(second, forward, new Vector3().crossVectors(second, forward))
      : new Matrix4().makeBasis(forward, second, third);
  return rows.transpose();
}

export function placeWeapon(points: readonly Vector3[], goal: WeaponGoal): WeaponPlacement {
  if (points.length === 0) throw new Error('a weapon with no points cannot be placed');
  const turn: Matrix4 = basis(points, goal);
  const turned: Vector3[] = points.map((point: Vector3): Vector3 => point.clone().applyMatrix4(turn));
  const lengthAxis: 'x' | 'y' = goal.hold.kind === 'pole' ? 'y' : 'x';
  const box: Box3 = new Box3().setFromPoints(turned);
  const extent: number = box.max[lengthAxis] - box.min[lengthAxis];
  if (extent <= 0) throw new Error('a weapon with no length cannot be placed');
  const scale: number = goal.length / extent;
  const at: number = box.min[lengthAxis] + goal.grip * extent;
  const half: number = (FIT.slice * extent) / 2;
  let slice: Vector3[] = [];
  for (let widen: number = 1; slice.length < FIT.leastSlicePoints && widen < 64; widen *= 2) slice = turned.filter((point: Vector3): boolean => Math.abs(point[lengthAxis] - at) <= half * widen);
  const sliceBox: Box3 = new Box3().setFromPoints(slice);
  const grip: Vector3 = sliceBox.getCenter(new Vector3());
  grip[lengthAxis] = at;
  const rise: number = goal.hold.kind === 'crossbow' ? goal.hold.rise : 0;
  const matrix: Matrix4 = new Matrix4().makeTranslation(0, rise, 0).multiply(new Matrix4().makeScale(scale, scale, scale)).multiply(new Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z)).multiply(turn);
  return { matrix, scale, reach: (box.max[lengthAxis] - at) * scale, behind: (at - box.min[lengthAxis]) * scale };
}
