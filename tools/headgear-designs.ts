import type { Envelope, ShellLevel, ShellPlan, Triangle } from './headgear-shapes.ts';
import { addTriangle, buildLathe, buildShell, buildTube, direction, shellPoint, smoothstep, surfaceFrame, wrapDegrees } from './headgear-shapes.ts';
import { Vector3 } from 'three';

export interface Landmarks {
  readonly eyeSide: number;
  readonly eye: number;
  readonly brow: number;
  readonly chin: number;
  readonly hairline: number;
}

export interface HeadFit {
  readonly marks: Landmarks;
  readonly skin: Envelope;
  readonly withHair: Envelope;
  readonly snug: Envelope;
  readonly face: Envelope;
}

export interface Design {
  readonly piece: string;
  readonly smoothDegrees: number;
  readonly build: (fit: HeadFit) => DesignResult;
}

export interface DesignResult {
  readonly soup: readonly Triangle[];
  readonly shells: readonly ShellPlan[];
}

const MASK = {
  halfWidth: 64,
  columns: 36,
  rows: 20,
  belowEye: 7,
  belowChin: 3,
  belowHairline: 2,
  topPower: 2.6,
  bottomPower: 1.7,
  keel: 0.0012,
  keelWidth: 16,
  clearance: 0.0045,
  thickness: 0.0042,
  seatSpan: 9,
  seatStep: 1.5,
  smooth: 40,
} as const;

const LENS = {
  glass: 0.0168,
  dome: 0.0046,
  seat: 0.0011,
  ring: 0.0262,
  ringTop: 0.0037,
  ringFoot: 0.0292,
  sink: -0.0065,
  segments: 32,
} as const;

const STRAP = {
  from: 64,
  columns: 34,
  sideRise: 13,
  backRise: 8,
  half: 2.6,
  clearance: 0.0035,
  thickness: 0.0026,
  rivet: 0.0042,
  rivetHeight: 0.0024,
} as const;

const SLIT = {
  halfWidth: 66,
  columns: 34,
  rowsBelow: 12,
  rowsAbove: 7,
  belowEye: 4,
  belowChin: 5,
  belowHairline: 1,
  topPower: 3.4,
  bottomPower: 2.2,
  keel: 0.0034,
  keelWidth: 9,
  gap: 1.6,
  reach: 50,
  reachBlend: 4,
  depth: 0.0042,
  clearance: 0.0045,
  thickness: 0.0045,
  smooth: 30,
} as const;

const HELM = {
  columns: 72,
  rows: 11,
  overBrow: 6,
  jawRise: 15,
  nape: -16,
  frontTo: 28,
  cheekFrom: 52,
  cheekTo: 98,
  backFrom: 150,
  band: 4,
  bandLift: 0.0026,
  ridge: 0.0042,
  ridgeWidth: 7,
  top: 86,
  clearance: 0.0042,
  thickness: 0.0042,
  rivet: 0.0036,
  rivetHeight: 0.0026,
  rivetEvery: 30,
  smooth: 36,
} as const;

const CIRCLET = {
  columns: 72,
  overBrowFront: 10,
  overBrowBack: 2,
  half: 2.3,
  clearance: 0.0016,
  thickness: 0.0032,
  setting: 0.0092,
  settingTop: 0.0026,
  stone: 0.0064,
  stoneDome: 0.0036,
  segments: 20,
  smooth: 40,
} as const;

const LOUPE = {
  bandHalf: 2.7,
  hingeAt: 64,
  hinge: 0.0066,
  hingeHeight: 0.0034,
  arm: 0.0021,
  armSides: 6,
  armSteps: 14,
  armLift: 0.006,
  stand: 0.013,
  ring: 0.0152,
  glass: 0.0118,
  depth: 0.012,
  glassAt: 0.75,
  dome: 0.0016,
  segments: 24,
  reachBack: 9,
  smooth: 38,
} as const;

const CROWN = {
  half: 7,
  overBrowFront: 14,
  overBrowBack: 6,
  sink: 0.005,
  flare: 0.16,
  plate: 0.0075,
  tipFrom: 0.62,
  smooth: 40,
} as const;

interface Point {
  readonly x: number;
  readonly y: number;
  readonly half: number;
}

interface Spike {
  readonly theta: number;
  readonly outline: readonly (readonly Point[])[];
}

function tine(theta: number, height: number, width: number): Spike {
  const mid: number = CROWN.tipFrom;
  return {
    theta,
    outline: [
      [
        { x: 0, y: 0, half: width },
        { x: width * 0.34, y: height * mid, half: width * (1 - mid) },
        { x: width * 0.55, y: height, half: 0 },
      ],
      [
        { x: width * 1.2, y: 0, half: width * 0.64 },
        { x: width * 1.8, y: height * 0.36, half: width * 0.64 * 0.45 },
        { x: width * 2.4, y: height * 0.62, half: 0 },
      ],
    ],
  };
}

const TINES: readonly Spike[] = [
  tine(0, 0.15, 0.025),
  tine(48, 0.123, 0.023),
  tine(-48, 0.123, 0.023),
  tine(100, 0.102, 0.021),
  tine(-100, 0.102, 0.021),
  tine(150, 0.087, 0.02),
  tine(-150, 0.087, 0.02),
];

const SAME: (theta: number) => number = (): number => 0;

function named(material: string): (theta: number) => string {
  return (): string => material;
}

function along(fractions: number, from: (theta: number) => number, to: (theta: number) => number): ((theta: number) => number)[] {
  return Array.from({ length: fractions + 1 }, (_: unknown, index: number): ((theta: number) => number) => (theta: number): number => from(theta) + ((to(theta) - from(theta)) * index) / fractions);
}

function level(phi: (theta: number) => number, lift: (theta: number) => number, material: (theta: number) => string): ShellLevel {
  return { phi, lift, material };
}

function keelOf(height: number, width: number): (theta: number) => number {
  return (theta: number): number => height * (1 - smoothstep(0, width, Math.abs(wrapDegrees(theta))));
}

function strapAndRivets(soup: Triangle[], fit: HeadFit, mask: ShellPlan): ShellPlan {
  const middle = (theta: number): number => {
    const side: number = (Math.abs(wrapDegrees(theta)) - STRAP.from) / (180 - STRAP.from);
    return fit.marks.eye + STRAP.sideRise + (STRAP.backRise - STRAP.sideRise) * smoothstep(0, 1, side);
  };
  const strap: ShellPlan = {
    envelope: fit.withHair,
    clearance: STRAP.clearance,
    thickness: STRAP.thickness,
    thetaFrom: STRAP.from,
    thetaTo: 360 - STRAP.from,
    columns: STRAP.columns,
    closed: false,
    pole: false,
    liftInner: false,
    levels: along(2, (theta: number): number => middle(theta) - STRAP.half, (theta: number): number => middle(theta) + STRAP.half).map((phi: (theta: number) => number): ShellLevel => level(phi, SAME, named('strap'))),
    inside: 'strap',
    rim: 'strap',
  };
  buildShell(soup, strap);
  for (const side of [-1, 1]) {
    const theta: number = side * (STRAP.from + 3);
    const at = surfaceFrame(mask, theta, middle(theta), mask.thickness);
    buildLathe(soup, { origin: at.point, normal: at.normal, up: at.up, segments: 10, turn: 0, profile: [{ radius: 0, height: STRAP.rivetHeight }, { radius: STRAP.rivet * 0.6, height: STRAP.rivetHeight * 0.8 }, { radius: STRAP.rivet, height: 0 }, { radius: STRAP.rivet, height: -0.002 }], materials: ['trim'] });
  }
  return strap;
}

function oval(middle: number, reach: number, halfWidth: number, power: number): (theta: number) => number {
  return (theta: number): number => middle + reach * (1 - Math.min(1, Math.abs(theta) / halfWidth) ** power) ** (1 / power);
}

function seatLift(plan: ShellPlan, at: { readonly point: Vector3; readonly normal: Vector3 }, centre: { readonly theta: number; readonly phi: number }, radius: number): number {
  let highest: number = 0;
  for (let dt: number = -MASK.seatSpan; dt <= MASK.seatSpan; dt += MASK.seatStep) {
    for (let dp: number = -MASK.seatSpan; dp <= MASK.seatSpan; dp += MASK.seatStep) {
      const offset: Vector3 = shellPoint(plan, centre.theta + dt, centre.phi + dp, plan.thickness).sub(at.point);
      const height: number = offset.dot(at.normal);
      const across: number = offset.clone().sub(at.normal.clone().multiplyScalar(height)).length();
      if (across <= radius) highest = Math.max(highest, height);
    }
  }
  return highest;
}

function lensMask(fit: HeadFit): DesignResult {
  const soup: Triangle[] = [];
  const middle: number = fit.marks.eye - MASK.belowEye;
  const bottom = oval(middle, fit.marks.chin - MASK.belowChin - middle, MASK.halfWidth, MASK.bottomPower);
  const top = oval(middle, fit.marks.hairline - MASK.belowHairline - middle, MASK.halfWidth, MASK.topPower);
  const keel = keelOf(MASK.keel, MASK.keelWidth);
  const plan: ShellPlan = {
    envelope: fit.face,
    clearance: MASK.clearance,
    thickness: MASK.thickness,
    thetaFrom: -MASK.halfWidth,
    thetaTo: MASK.halfWidth,
    columns: MASK.columns,
    closed: false,
    pole: false,
    liftInner: false,
    levels: along(MASK.rows, bottom, top).map((phi: (theta: number) => number): ShellLevel => level(phi, keel, named('plate'))),
    inside: 'lining',
    rim: 'trim',
  };
  buildShell(soup, plan);
  const at = surfaceFrame(plan, 0, fit.marks.eye, plan.thickness);
  const seat: Vector3 = at.normal.clone().multiplyScalar(seatLift(plan, at, { theta: 0, phi: fit.marks.eye }, LENS.ringFoot)).add(at.point);
  buildLathe(soup, {
    origin: seat,
    normal: at.normal,
    up: at.up,
    segments: LENS.segments,
    turn: 0,
    profile: [
      { radius: LENS.glass, height: LENS.sink },
      { radius: LENS.glass, height: LENS.ringTop * 0.8 },
      { radius: (LENS.glass + LENS.ring) / 2, height: LENS.ringTop },
      { radius: LENS.ring, height: LENS.ringTop * 0.85 },
      { radius: LENS.ringFoot, height: 0 },
      { radius: LENS.ringFoot, height: LENS.sink },
    ],
    materials: ['trim'],
  });
  buildLathe(soup, {
    origin: seat,
    normal: at.normal,
    up: at.up,
    segments: LENS.segments,
    turn: 0,
    profile: [
      { radius: 0, height: LENS.dome },
      { radius: LENS.glass * 0.45, height: LENS.dome * 0.86 },
      { radius: LENS.glass * 0.78, height: LENS.dome * 0.55 },
      { radius: LENS.glass, height: LENS.seat },
    ],
    materials: ['lens'],
  });
  const strap: ShellPlan = strapAndRivets(soup, fit, plan);
  return { soup, shells: [plan, strap] };
}

function slitMask(fit: HeadFit): DesignResult {
  const soup: Triangle[] = [];
  const middle: number = fit.marks.eye - SLIT.belowEye;
  const bottom = oval(middle, fit.marks.chin - SLIT.belowChin - middle, SLIT.halfWidth, SLIT.bottomPower);
  const top = oval(middle, fit.marks.hairline - SLIT.belowHairline - middle, SLIT.halfWidth, SLIT.topPower);
  const low = (): number => fit.marks.eye - SLIT.gap;
  const high = (): number => fit.marks.eye + SLIT.gap;
  const keel = keelOf(SLIT.keel, SLIT.keelWidth);
  const opening = (theta: number): number => 1 - smoothstep(SLIT.reach - SLIT.reachBlend, SLIT.reach + SLIT.reachBlend, Math.abs(theta));
  const deep = (theta: number): number => keel(theta) - SLIT.depth * opening(theta);
  const dark = (theta: number): string => (opening(theta) > 0.5 ? 'slit' : 'plate');
  const belowRows: ShellLevel[] = along(SLIT.rowsBelow, bottom, low).map((phi: (theta: number) => number): ShellLevel => level(phi, keel, named('plate')));
  const aboveRows: ShellLevel[] = along(SLIT.rowsAbove, high, top)
    .slice(1)
    .map((phi: (theta: number) => number): ShellLevel => level(phi, keel, named('plate')));
  const plan: ShellPlan = {
    envelope: fit.face,
    clearance: SLIT.clearance,
    thickness: SLIT.thickness,
    thetaFrom: -SLIT.halfWidth,
    thetaTo: SLIT.halfWidth,
    columns: SLIT.columns,
    closed: false,
    pole: false,
    liftInner: false,
    levels: [
      ...belowRows.slice(0, -1),
      level(low, keel, dark),
      level(low, deep, dark),
      level(high, deep, dark),
      level(high, keel, dark),
      ...aboveRows,
    ],
    inside: 'lining',
    rim: 'plate',
  };
  buildShell(soup, plan);
  return { soup, shells: [plan] };
}

function blend(theta: number, stops: readonly (readonly [number, number])[]): number {
  const at: number = Math.abs(wrapDegrees(theta));
  let value: number = stops[0]?.[1] ?? 0;
  for (let index: number = 1; index < stops.length; index += 1) {
    const before: readonly [number, number] | undefined = stops[index - 1];
    const after: readonly [number, number] | undefined = stops[index];
    if (before === undefined || after === undefined) continue;
    value += (after[1] - before[1]) * smoothstep(before[0], after[0], at);
  }
  return value;
}

function rivetsAlong(soup: Triangle[], plan: ShellPlan, phi: (theta: number) => number, every: number, skip: (theta: number) => boolean, radius: number, height: number): void {
  for (let theta: number = -180; theta < 180; theta += every) {
    if (skip(theta)) continue;
    const at = surfaceFrame(plan, theta, phi(theta), plan.thickness + HELM.bandLift);
    buildLathe(soup, { origin: at.point, normal: at.normal, up: at.up, segments: 8, turn: 0, profile: [{ radius: 0, height }, { radius: radius * 0.65, height: height * 0.75 }, { radius, height: 0 }, { radius, height: -0.002 }], materials: ['trim'] });
  }
}

function helm(fit: HeadFit): DesignResult {
  const soup: Triangle[] = [];
  const bottom = (theta: number): number =>
    blend(theta, [
      [HELM.frontTo, fit.marks.brow + HELM.overBrow],
      [HELM.cheekFrom, fit.marks.chin + HELM.jawRise],
      [HELM.cheekTo, fit.marks.chin + HELM.jawRise],
      [HELM.backFrom, HELM.nape],
    ]);
  const bandTop = (theta: number): number => bottom(theta) + HELM.band;
  const ridge = (theta: number): number => keelOf(HELM.ridge, HELM.ridgeWidth)(theta) + keelOf(HELM.ridge, HELM.ridgeWidth)(theta + 180);
  const bandLift = (): number => HELM.bandLift;
  const rows: ShellLevel[] = along(HELM.rows, bandTop, (): number => HELM.top)
    .slice(1)
    .map((phi: (theta: number) => number, index: number): ShellLevel => level(phi, (theta: number): number => ridge(theta) * Math.min(1, (index + 1) / 3), named('plate')));
  const plan: ShellPlan = {
    envelope: fit.skin,
    clearance: HELM.clearance,
    thickness: HELM.thickness,
    thetaFrom: -180,
    thetaTo: 180,
    columns: HELM.columns,
    closed: true,
    pole: true,
    liftInner: false,
    levels: [level(bottom, bandLift, named('trim')), level(bandTop, bandLift, named('trim')), level(bandTop, SAME, named('plate')), ...rows],
    inside: 'lining',
    rim: 'trim',
  };
  buildShell(soup, plan);
  rivetsAlong(soup, plan, (theta: number): number => bottom(theta) + HELM.band / 2, HELM.rivetEvery, (theta: number): boolean => Math.abs(theta) < HELM.cheekFrom, HELM.rivet, HELM.rivetHeight);
  return { soup, shells: [plan] };
}

function bandMiddle(fit: HeadFit, front: number, back: number): (theta: number) => number {
  return (theta: number): number => fit.marks.brow + back + (front - back) * (0.5 + 0.5 * Math.cos((wrapDegrees(theta) * Math.PI) / 180));
}

function band(soup: Triangle[], fit: HeadFit, middle: (theta: number) => number, half: number, envelope: Envelope = fit.withHair): ShellPlan {
  const plan: ShellPlan = {
    envelope,
    clearance: CIRCLET.clearance,
    thickness: CIRCLET.thickness,
    thetaFrom: -180,
    thetaTo: 180,
    columns: CIRCLET.columns,
    closed: true,
    pole: false,
    liftInner: false,
    levels: along(2, (theta: number): number => middle(theta) - half, (theta: number): number => middle(theta) + half).map((phi: (theta: number) => number): ShellLevel => level(phi, SAME, named('trim'))),
    inside: 'trim',
    rim: 'trim',
  };
  buildShell(soup, plan);
  return plan;
}

function circlet(fit: HeadFit): DesignResult {
  const soup: Triangle[] = [];
  const middle = bandMiddle(fit, CIRCLET.overBrowFront, CIRCLET.overBrowBack);
  const plan: ShellPlan = band(soup, fit, middle, CIRCLET.half);
  const at = surfaceFrame(plan, 0, middle(0), plan.thickness);
  buildLathe(soup, { origin: at.point, normal: at.normal, up: at.up, segments: CIRCLET.segments, turn: 0, profile: [{ radius: CIRCLET.stone, height: -0.001 }, { radius: CIRCLET.stone, height: CIRCLET.settingTop }, { radius: CIRCLET.setting, height: CIRCLET.settingTop * 0.7 }, { radius: CIRCLET.setting * 1.08, height: -0.001 }], materials: ['trim'] });
  buildLathe(soup, { origin: at.point, normal: at.normal, up: at.up, segments: CIRCLET.segments, turn: 0, profile: [{ radius: 0, height: CIRCLET.stoneDome }, { radius: CIRCLET.stone * 0.6, height: CIRCLET.stoneDome * 0.75 }, { radius: CIRCLET.stone, height: CIRCLET.settingTop * 0.6 }], materials: ['stone'] });
  return { soup, shells: [plan] };
}

function stand(soup: Triangle[], plan: ShellPlan, base: number, spike: Spike): void {
  const centre: Vector3 = plan.envelope.centre;
  const root: Vector3 = shellPoint(plan, spike.theta, base, plan.thickness / 2);
  const across: Vector3 = shellPoint(plan, spike.theta + 0.5, base, 0).sub(shellPoint(plan, spike.theta - 0.5, base, 0)).setY(0).normalize();
  const out: Vector3 = root.clone().sub(centre).setY(0).normalize();
  const up: Vector3 = new Vector3(0, 1, 0).add(out.clone().multiplyScalar(CROWN.flare)).normalize();
  const face: Vector3 = across.clone().cross(up).normalize();
  if (face.dot(out) < 0) face.negate();
  const half: number = CROWN.plate / 2;
  const corner = (point: Point, side: number, depth: number): Vector3 => root.clone().add(across.clone().multiplyScalar(point.x + side * point.half)).add(up.clone().multiplyScalar(point.y - CROWN.sink)).add(face.clone().multiplyScalar(depth));
  for (const line of spike.outline) {
    for (let index: number = 0; index + 1 < line.length; index += 1) {
      const material: string = index + 2 === line.length ? 'tip' : 'trim';
      const here: Point | undefined = line[index];
      const next: Point | undefined = line[index + 1];
      if (here === undefined || next === undefined) continue;
      const frontA: Vector3 = corner(here, -1, half);
      const frontB: Vector3 = corner(here, 1, half);
      const frontC: Vector3 = corner(next, 1, half);
      const frontD: Vector3 = corner(next, -1, half);
      const backA: Vector3 = corner(here, -1, -half);
      const backB: Vector3 = corner(here, 1, -half);
      const backC: Vector3 = corner(next, 1, -half);
      const backD: Vector3 = corner(next, -1, -half);
      addTriangle(soup, frontA, frontB, frontC, material, face);
      addTriangle(soup, frontA, frontC, frontD, material, face);
      addTriangle(soup, backA, backB, backC, material, face.clone().negate());
      addTriangle(soup, backA, backC, backD, material, face.clone().negate());
      addTriangle(soup, frontA, backA, backD, material, across.clone().negate());
      addTriangle(soup, frontA, backD, frontD, material, across.clone().negate());
      addTriangle(soup, frontB, backB, backC, material, across);
      addTriangle(soup, frontB, backC, frontC, material, across);
    }
  }
}

function crown(fit: HeadFit): DesignResult {
  const soup: Triangle[] = [];
  const middle = bandMiddle(fit, CROWN.overBrowFront, CROWN.overBrowBack);
  const plan: ShellPlan = band(soup, fit, middle, CROWN.half, fit.snug);
  for (const spike of TINES) stand(soup, plan, middle(spike.theta) + CROWN.half, spike);
  return { soup, shells: [plan] };
}

function loupe(fit: HeadFit): DesignResult {
  const soup: Triangle[] = [];
  const middle = bandMiddle(fit, CIRCLET.overBrowFront, CIRCLET.overBrowBack);
  const head: ShellPlan = band(soup, fit, middle, LOUPE.bandHalf);
  const hingeTheta: number = -LOUPE.hingeAt;
  const hinge = surfaceFrame(head, hingeTheta, middle(hingeTheta), head.thickness);
  buildLathe(soup, { origin: hinge.point, normal: hinge.normal, up: hinge.up, segments: 14, turn: 0, profile: [{ radius: 0, height: LOUPE.hingeHeight }, { radius: LOUPE.hinge * 0.7, height: LOUPE.hingeHeight }, { radius: LOUPE.hinge, height: LOUPE.hingeHeight * 0.45 }, { radius: LOUPE.hinge, height: -0.002 }], materials: ['trim'] });
  const lensTheta: number = -fit.marks.eyeSide;
  const axis: Vector3 = direction(lensTheta, fit.marks.eye);
  const seat: Vector3 = axis.clone().multiplyScalar(fit.face.radius(lensTheta, fit.marks.eye) + LOUPE.stand).add(fit.face.centre);
  const up: Vector3 = new Vector3(0, 1, 0);
  buildLathe(soup, { origin: seat, normal: axis, up, segments: LOUPE.segments, turn: 0, profile: [{ radius: LOUPE.ring, height: 0 }, { radius: LOUPE.glass, height: 0 }, { radius: LOUPE.glass, height: LOUPE.depth }, { radius: LOUPE.ring, height: LOUPE.depth }, { radius: LOUPE.ring, height: 0 }], materials: ['trim'] });
  buildLathe(soup, { origin: seat, normal: axis, up, segments: LOUPE.segments, turn: 0, profile: [{ radius: 0, height: LOUPE.depth * LOUPE.glassAt + LOUPE.dome }, { radius: LOUPE.glass * 0.6, height: LOUPE.depth * LOUPE.glassAt + LOUPE.dome * 0.65 }, { radius: LOUPE.glass, height: LOUPE.depth * LOUPE.glassAt }], materials: ['glass'] });
  const outer: number = LOUPE.depth * 0.5;
  const sideways: Vector3 = axis.clone().cross(up).normalize();
  const end: Vector3 = seat.clone().add(axis.clone().multiplyScalar(outer)).add(sideways.multiplyScalar(-LOUPE.ring));
  const start: Vector3 = hinge.point.clone().add(hinge.normal.clone().multiplyScalar(LOUPE.hingeHeight * 0.6));
  const path: Vector3[] = Array.from({ length: LOUPE.armSteps + 1 }, (_: unknown, index: number): Vector3 => {
    const share: number = index / LOUPE.armSteps;
    const straight: Vector3 = start.clone().lerp(end, share);
    const out: Vector3 = straight.clone().sub(fit.face.centre).normalize();
    return straight.add(out.multiplyScalar(LOUPE.armLift * Math.sin(share * Math.PI)));
  });
  buildTube(soup, path, LOUPE.arm, LOUPE.armSides, 'trim');
  return { soup, shells: [head] };
}

export const DESIGNS: readonly Design[] = [
  { piece: 'Lens_Mask', smoothDegrees: MASK.smooth, build: lensMask },
  { piece: 'Slit_Mask', smoothDegrees: SLIT.smooth, build: slitMask },
  { piece: 'Iron_Helm', smoothDegrees: HELM.smooth, build: helm },
  { piece: 'Circlet', smoothDegrees: CIRCLET.smooth, build: circlet },
  { piece: 'Keeper_Loupe', smoothDegrees: LOUPE.smooth, build: loupe },
  { piece: 'Crown_Tines', smoothDegrees: CROWN.smooth, build: crown },
];
