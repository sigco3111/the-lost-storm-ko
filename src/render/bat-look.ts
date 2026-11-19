import { BufferAttribute, BufferGeometry, Color } from 'three';
import type { BatKind } from './life-kinds.ts';

type Triple = readonly [number, number, number];

export const BAT_LOOK = {
  nose: [0, 0.03, 0.16],
  tail: [0, 0, -0.15],
  waist: { z: 0.02, half: 0.075, top: 0.065, belly: -0.05 },
  ears: [[0.025, 0.05, 0.12], [0.055, 0.15, 0.1], [0.012, 0.05, 0.07]],
  wing: {
    root: [0.05, 0.01, 0.09],
    wrist: [0.36, 0.03, 0.17],
    tip: [0.84, 0.01, -0.02],
    fingers: [[0.66, 0.01, -0.25], [0.42, 0.01, -0.28]],
    valleys: [[0.66, 0.01, -0.08], [0.53, 0.01, -0.16], [0.25, 0.01, -0.12]],
    attach: [0.06, 0.01, -0.13],
  },
  bone: { width: 0.024, rise: 0.006 },
  bend: { from: 0.3, span: 0.5, outer: 1.3 },
} as const;

export interface BatShape {
  readonly positions: Float32Array;
  readonly limbs: Float32Array;
  readonly tones: Float32Array;
}

function mirror(point: Triple, side: number): Triple {
  return [point[0] * side, point[1], point[2]];
}

function bendAt(point: Triple): number {
  const bend = BAT_LOOK.bend;
  return 1 + (bend.outer - 1) * Math.min(1, Math.max(0, (Math.abs(point[0]) - bend.from) / bend.span));
}

class BatBuilder {
  readonly positions: number[] = [];
  readonly limbs: number[] = [];
  readonly tones: number[] = [];

  triangle(points: readonly [Triple, Triple, Triple], tone: number, flexes: boolean): void {
    for (const point of points) {
      this.positions.push(...point);
      this.limbs.push(flexes ? bendAt(point) : 0);
      this.tones.push(tone);
    }
  }

  bone(from: Triple, to: Triple): void {
    const dx: number = to[0] - from[0];
    const dz: number = to[2] - from[2];
    const length: number = Math.max(BAT_LOOK.bone.width, Math.hypot(dx, dz));
    const half: number = BAT_LOOK.bone.width / 2;
    const ox: number = (-dz / length) * half;
    const oz: number = (dx / length) * half;
    const lift: number = BAT_LOOK.bone.rise;
    const a: Triple = [from[0] + ox, from[1] + lift, from[2] + oz];
    const b: Triple = [from[0] - ox, from[1] + lift, from[2] - oz];
    const c: Triple = [to[0] + ox, to[1] + lift, to[2] + oz];
    const d: Triple = [to[0] - ox, to[1] + lift, to[2] - oz];
    this.triangle([a, b, c], 0, true);
    this.triangle([b, d, c], 0, true);
  }

  shape(): BatShape {
    return { positions: new Float32Array(this.positions), limbs: new Float32Array(this.limbs), tones: new Float32Array(this.tones) };
  }
}

export function batShape(): BatShape {
  const build: BatBuilder = new BatBuilder();
  const waist = BAT_LOOK.waist;
  const ring: Triple[] = [[waist.half, 0, waist.z], [0, waist.top, waist.z], [-waist.half, 0, waist.z], [0, waist.belly, waist.z]];
  ring.forEach((point: Triple, index: number): void => {
    const next: Triple = ring[(index + 1) % ring.length] ?? point;
    build.triangle([BAT_LOOK.nose, next, point], 0, false);
    build.triangle([BAT_LOOK.tail, point, next], 0, false);
  });
  const wing = BAT_LOOK.wing;
  for (const side of [-1, 1]) {
    const [earFront, earTip, earBack] = BAT_LOOK.ears.map((point: Triple): Triple => mirror(point, side));
    const [fourth, fifth] = wing.fingers.map((point: Triple): Triple => mirror(point, side));
    const [outerValley, midValley, innerValley] = wing.valleys.map((point: Triple): Triple => mirror(point, side));
    if (earFront === undefined || earTip === undefined || earBack === undefined || fourth === undefined || fifth === undefined || outerValley === undefined || midValley === undefined || innerValley === undefined) continue;
    const root: Triple = mirror(wing.root, side);
    const wrist: Triple = mirror(wing.wrist, side);
    const tip: Triple = mirror(wing.tip, side);
    const attach: Triple = mirror(wing.attach, side);
    build.triangle([earFront, earTip, earBack], 0, false);
    const outline: Triple[] = [tip, outerValley, fourth, midValley, fifth, innerValley, attach, root];
    outline.forEach((point: Triple, index: number): void => {
      const next: Triple | undefined = outline[index + 1];
      if (next !== undefined) build.triangle([wrist, point, next], 1, true);
    });
    build.bone(root, wrist);
    build.bone(wrist, tip);
    build.bone(wrist, fourth);
    build.bone(wrist, fifth);
  }
  return build.shape();
}

export function batGeometry(kind: BatKind): BufferGeometry {
  const shape: BatShape = batShape();
  const body: Color = new Color(kind.colour);
  const membrane: Color = new Color(kind.membrane);
  const colours: Float32Array = new Float32Array(shape.tones.length * 3);
  shape.tones.forEach((tone: number, index: number): void => {
    const shade: Color = body.clone().lerp(membrane, tone);
    colours.set([shade.r, shade.g, shade.b], index * 3);
  });
  const geometry: BufferGeometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(shape.positions, 3));
  geometry.setAttribute('limb', new BufferAttribute(shape.limbs, 1));
  geometry.setAttribute('color', new BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return geometry;
}
