import { BufferAttribute, BufferGeometry } from 'three';
import type { PropLid } from '../../sim/content/types.ts';
import type { ReadonlyVec2 } from '../../sim/math.ts';
import type { OpenService } from '../../sim/world/service-types.ts';

export const PROP_LID = {
  openStiffness: 150,
  openDamping: 15,
  closeStiffness: 40,
  closeDamping: 6.5,
  bounce: 0.12,
  maxStep: 0.05,
  restDistance: 0.002,
  restSpeed: 0.01,
  thudSpeed: 0.35,
  anchorReach: 0.05,
} as const;

export interface LidSwing {
  value: number;
  velocity: number;
  open: boolean;
}

export type LidStep = 'still' | 'moving' | 'opened' | 'landed';

export interface LidEvent {
  readonly type: 'lid-opened' | 'lid-closed';
  readonly x: number;
  readonly z: number;
}

export function splitAtSeam(geometry: BufferGeometry, seam: number, above: boolean): BufferGeometry {
  const flat: BufferGeometry = geometry.index === null ? geometry : geometry.toNonIndexed();
  const raw: unknown = flat.getAttribute('position');
  const position: BufferAttribute | undefined = raw instanceof BufferAttribute ? raw : undefined;
  const kept: number[] = [];
  const count: number = position === undefined ? 0 : position.count;
  for (let corner: number = 0; corner + 2 < count; corner += 3) {
    const middle: number = position === undefined ? 0 : (position.getY(corner) + position.getY(corner + 1) + position.getY(corner + 2)) / 3;
    if (middle >= seam === above) kept.push(corner, corner + 1, corner + 2);
  }
  const part: BufferGeometry = new BufferGeometry();
  for (const name of Object.keys(flat.attributes)) {
    const source: unknown = flat.getAttribute(name);
    if (!(source instanceof BufferAttribute)) continue;
    const values: Float32Array = new Float32Array(kept.length * source.itemSize);
    kept.forEach((vertex: number, at: number): void => {
      for (let item: number = 0; item < source.itemSize; item += 1) values[at * source.itemSize + item] = source.getComponent(vertex, item);
    });
    part.setAttribute(name, new BufferAttribute(values, source.itemSize));
  }
  if (flat !== geometry) flat.dispose();
  return part;
}

export function lidAngle(lid: PropLid, swing: number): number {
  return (lid.hinge < 0 ? -1 : 1) * swing * ((lid.degrees * Math.PI) / 180);
}

export function openAt(service: OpenService | null, at: ReadonlyVec2): boolean {
  return service !== null && Math.hypot(service.anchor.x - at.x, service.anchor.z - at.z) <= PROP_LID.anchorReach;
}

export function closedSwing(): LidSwing {
  return { value: 0, velocity: 0, open: false };
}

export function stepLid(swing: LidSwing, open: boolean, dt: number): LidStep {
  const started: boolean = open && !swing.open;
  swing.open = open;
  const target: number = open ? 1 : 0;
  const step: number = Math.min(dt, PROP_LID.maxStep);
  const offset: number = target - swing.value;
  if (Math.abs(offset) < PROP_LID.restDistance && Math.abs(swing.velocity) < PROP_LID.restSpeed) {
    swing.value = target;
    swing.velocity = 0;
    return started ? 'opened' : 'still';
  }
  const stiffness: number = open ? PROP_LID.openStiffness : PROP_LID.closeStiffness;
  const damping: number = open ? PROP_LID.openDamping : PROP_LID.closeDamping;
  swing.velocity += (offset * stiffness - swing.velocity * damping) * step;
  swing.value += swing.velocity * step;
  if (swing.value >= 0) return started ? 'opened' : 'moving';
  const impact: number = -swing.velocity;
  swing.value = 0;
  swing.velocity = impact * PROP_LID.bounce;
  if (started) return 'opened';
  return impact >= PROP_LID.thudSpeed ? 'landed' : 'moving';
}
