import { Vector3 } from 'three';
import type { ProfilePoint, Triangle } from './headgear-shapes.ts';
import { buildLathe, buildTube } from './headgear-shapes.ts';
import { buildLoop, movedSoup } from './charm-fit.ts';

export interface CharmDesign {
  readonly piece: string;
  readonly smoothDegrees: number;
  readonly build: (soup: Triangle[]) => void;
}

export const BAIL = {
  radius: 0.0032,
  tube: 0.0009,
  sides: 8,
  steps: 20,
  stemRadius: 0.0008,
  stemFrom: -0.0036,
  drop: 0.0052,
} as const;

const DISC = {
  radius: 0.016,
  thickness: 0.0035,
  bevel: 0.0012,
  segments: 40,
  spiralFrom: 0.0022,
  spiralTo: 0.0118,
  spiralTurns: 1.75,
  spiralSteps: 70,
  spiralTube: 0.0007,
  rimInset: 0.0014,
  rimTube: 0.0006,
  rimSteps: 48,
  lift: 0.0003,
} as const;

const TEAR = {
  segments: 24,
  prongs: 4,
  prongTube: 0.00065,
  prongFrom: 0.003,
  prongTo: 0.0125,
  prongSteps: 8,
  prongLift: 0.0005,
} as const;

const TEAR_PROFILE: readonly ProfilePoint[] = [
  { radius: 0, height: 0.027 },
  { radius: 0.003, height: 0.026 },
  { radius: 0.0055, height: 0.0235 },
  { radius: 0.007, height: 0.019 },
  { radius: 0.0072, height: 0.014 },
  { radius: 0.0058, height: 0.008 },
  { radius: 0.0036, height: 0.003 },
  { radius: 0.0025, height: 0.0008 },
  { radius: 0, height: 0 },
];

const TOKEN = {
  radius: 0.0145,
  segments: 6,
  smooth: 30,
} as const;

const TOKEN_PROFILE: readonly ProfilePoint[] = [
  { radius: 0, height: 0.0016 },
  { radius: 0.004, height: 0.0016 },
  { radius: 0.005, height: 0.0008 },
  { radius: 0.0112, height: 0.0008 },
  { radius: 0.0118, height: 0.0017 },
  { radius: 0.0145, height: 0.0017 },
  { radius: 0.0145, height: -0.0017 },
  { radius: 0, height: -0.0017 },
];

const PEBBLE = {
  radius: 0.012,
  stretch: 1.3,
  segments: 36,
  capAbove: 0.0015,
} as const;

const PEBBLE_PROFILE: readonly ProfilePoint[] = [
  { radius: 0, height: 0.0046 },
  { radius: 0.006, height: 0.004 },
  { radius: 0.0095, height: 0.0027 },
  { radius: 0.0117, height: 0.001 },
  { radius: 0.012, height: 0 },
  { radius: 0.0112, height: -0.0017 },
  { radius: 0.008, height: -0.0031 },
  { radius: 0, height: -0.0036 },
];

const PEBBLE_CAP: readonly ProfilePoint[] = [
  { radius: 0.0044, height: 0.0042 },
  { radius: 0.0046, height: 0.0034 },
  { radius: 0.003, height: 0.001 },
  { radius: 0.0014, height: 0 },
  { radius: 0, height: 0 },
];

const IDOL = {
  segments: 8,
  turn: 22.5,
} as const;

const IDOL_PROFILE: readonly ProfilePoint[] = [
  { radius: 0, height: 0.032 },
  { radius: 0.0052, height: 0.032 },
  { radius: 0.0055, height: 0.0292 },
  { radius: 0.0041, height: 0.0272 },
  { radius: 0.0045, height: 0.0175 },
  { radius: 0.0049, height: 0.0158 },
  { radius: 0.0049, height: 0.0134 },
  { radius: 0.0057, height: 0.0102 },
  { radius: 0.0034, height: 0.0086 },
  { radius: 0.0043, height: 0.0068 },
  { radius: 0.0045, height: 0.0038 },
  { radius: 0.0028, height: 0.0012 },
  { radius: 0, height: 0.0006 },
];

const IDOL_MATERIALS: readonly string[] = ['idol', 'idol', 'idol', 'idol', 'storm', 'storm', 'idol', 'idol', 'idol', 'idol', 'idol', 'idol'];

const LANTERN = {
  segments: 12,
  bars: 4,
  barTube: 0.0006,
  barRadius: 0.0051,
  barFrom: 0.0108,
  barTo: 0.0246,
} as const;

const LANTERN_PROFILE: readonly ProfilePoint[] = [
  { radius: 0, height: 0.0305 },
  { radius: 0.0022, height: 0.03 },
  { radius: 0.0055, height: 0.0272 },
  { radius: 0.0058, height: 0.025 },
  { radius: 0.0044, height: 0.0242 },
  { radius: 0.0044, height: 0.0118 },
  { radius: 0.006, height: 0.0104 },
  { radius: 0.0057, height: 0.009 },
  { radius: 0.0034, height: 0.0046 },
  { radius: 0.0015, height: 0.003 },
  { radius: 0.0012, height: 0.001 },
  { radius: 0, height: 0.0006 },
];

const LANTERN_MATERIALS: readonly string[] = ['iron', 'iron', 'iron', 'iron', 'lantern', 'iron', 'iron', 'iron', 'iron', 'iron', 'iron'];

const SCALE = {
  gale: 3,
  ember: 2.7,
  token: 3,
  tide: 2.7,
  idol: 2.7,
  lantern: 2.7,
} as const;

const DOWN: Vector3 = new Vector3(0, -1, 0);
const OUT: Vector3 = new Vector3(0, 0, 1);
const UP: Vector3 = new Vector3(0, 1, 0);
const TOP: Vector3 = new Vector3(0, -BAIL.drop, 0);

function circle(centre: Vector3, first: Vector3, second: Vector3, radius: number, steps: number): Vector3[] {
  return Array.from({ length: steps }, (_: unknown, index: number): Vector3 => {
    const angle: number = (index / steps) * Math.PI * 2;
    return centre.clone().add(first.clone().multiplyScalar(Math.cos(angle) * radius)).add(second.clone().multiplyScalar(Math.sin(angle) * radius));
  });
}

function grow(soup: Triangle[], body: readonly Triangle[], scale: number): void {
  soup.push(...movedSoup(body, (point: Vector3): Vector3 => point.sub(TOP).multiplyScalar(scale).add(TOP)));
}

function bail(soup: Triangle[], material: string): void {
  buildLoop(soup, circle(new Vector3(), UP, OUT, BAIL.radius, BAIL.steps), BAIL.tube, BAIL.sides, material);
  buildTube(soup, [new Vector3(0, BAIL.stemFrom, 0), new Vector3(0, -BAIL.drop - BAIL.stemRadius, 0)], BAIL.stemRadius, BAIL.sides, material);
}

function radiusAt(profile: readonly ProfilePoint[], height: number): number {
  for (let index: number = 0; index + 1 < profile.length; index += 1) {
    const a: ProfilePoint | undefined = profile[index];
    const b: ProfilePoint | undefined = profile[index + 1];
    if (a === undefined || b === undefined) continue;
    const low: number = Math.min(a.height, b.height);
    const high: number = Math.max(a.height, b.height);
    if (height < low || height > high || high === low) continue;
    return a.radius + ((height - a.height) / (b.height - a.height)) * (b.radius - a.radius);
  }
  return 0;
}

function hanging(profile: readonly ProfilePoint[], materials: readonly string[], segments: number, turn: number): (soup: Triangle[]) => void {
  return (soup: Triangle[]): void => {
    buildLathe(soup, { origin: TOP, normal: DOWN, up: OUT, segments, turn, profile, materials });
  };
}

function galeDisc(soup: Triangle[]): void {
  bail(soup, 'silver');
  const body: Triangle[] = [];
  const centre: Vector3 = TOP.clone().add(new Vector3(0, -DISC.radius, 0));
  const half: number = DISC.thickness / 2;
  const profile: ProfilePoint[] = [
    { radius: 0, height: half },
    { radius: DISC.radius - DISC.bevel, height: half },
    { radius: DISC.radius, height: half - DISC.bevel },
    { radius: DISC.radius, height: -half + DISC.bevel },
    { radius: DISC.radius - DISC.bevel, height: -half },
    { radius: 0, height: -half },
  ];
  buildLathe(body, { origin: centre, normal: OUT, up: UP, segments: DISC.segments, turn: 0, profile, materials: ['pewter'] });
  const face: number = half + DISC.lift;
  const spiral: Vector3[] = Array.from({ length: DISC.spiralSteps }, (_: unknown, index: number): Vector3 => {
    const share: number = index / (DISC.spiralSteps - 1);
    const radius: number = DISC.spiralFrom + (DISC.spiralTo - DISC.spiralFrom) * share;
    const angle: number = share * DISC.spiralTurns * Math.PI * 2;
    return centre.clone().add(new Vector3(Math.sin(angle) * radius, Math.cos(angle) * radius, face));
  });
  buildTube(body, spiral, DISC.spiralTube, BAIL.sides, 'silver');
  buildLoop(body, circle(centre.clone().add(new Vector3(0, 0, face)), UP, new Vector3(1, 0, 0), DISC.radius - DISC.rimInset, DISC.rimSteps), DISC.rimTube, BAIL.sides, 'silver');
  grow(soup, body, SCALE.gale);
}

function emberDrop(soup: Triangle[]): void {
  bail(soup, 'bronze');
  const body: Triangle[] = [];
  hanging(TEAR_PROFILE, ['ember', 'ember', 'ember', 'ember', 'ember', 'ember', 'bronze', 'bronze'], TEAR.segments, 0)(body);
  for (let prong: number = 0; prong < TEAR.prongs; prong += 1) {
    const angle: number = ((prong + 0.5) / TEAR.prongs) * Math.PI * 2;
    const path: Vector3[] = Array.from({ length: TEAR.prongSteps }, (_: unknown, index: number): Vector3 => {
      const height: number = TEAR.prongFrom + ((TEAR.prongTo - TEAR.prongFrom) * index) / (TEAR.prongSteps - 1);
      const radius: number = radiusAt(TEAR_PROFILE, height) + TEAR.prongLift;
      return TOP.clone().add(new Vector3(Math.sin(angle) * radius, -height, Math.cos(angle) * radius));
    });
    buildTube(body, path, TEAR.prongTube, BAIL.sides, 'bronze');
  }
  grow(soup, body, SCALE.ember);
}

function hexToken(soup: Triangle[]): void {
  bail(soup, 'gold');
  const body: Triangle[] = [];
  const centre: Vector3 = TOP.clone().add(new Vector3(0, -TOKEN.radius, 0));
  buildLathe(body, { origin: centre, normal: OUT, up: UP, segments: TOKEN.segments, turn: 0, profile: TOKEN_PROFILE, materials: ['gold', 'gold', 'gold_dark', 'gold', 'gold', 'gold', 'gold'] });
  grow(soup, body, SCALE.token);
}


function tidePebble(soup: Triangle[]): void {
  bail(soup, 'bronze');
  const body: Triangle[] = [];
  const top: Vector3 = TOP.clone().add(new Vector3(0, -PEBBLE.capAbove, 0));
  const centre: Vector3 = top.clone().add(new Vector3(0, -PEBBLE.radius * PEBBLE.stretch, 0));
  const stone: Triangle[] = [];
  buildLathe(stone, { origin: centre, normal: OUT, up: UP, segments: PEBBLE.segments, turn: 0, profile: PEBBLE_PROFILE, materials: ['tidestone'] });
  body.push(...movedSoup(stone, (point: Vector3): Vector3 => point.setY(centre.y + (point.y - centre.y) * PEBBLE.stretch)));
  buildLathe(body, { origin: TOP, normal: DOWN, up: OUT, segments: PEBBLE.segments, turn: 0, profile: PEBBLE_CAP, materials: ['bronze'] });
  grow(soup, body, SCALE.tide);
}

function stormIdol(soup: Triangle[]): void {
  bail(soup, 'iron');
  const body: Triangle[] = [];
  hanging(IDOL_PROFILE, IDOL_MATERIALS, IDOL.segments, IDOL.turn)(body);
  grow(soup, body, SCALE.idol);
}

function tinyLantern(soup: Triangle[]): void {
  bail(soup, 'iron');
  const body: Triangle[] = [];
  hanging(LANTERN_PROFILE, LANTERN_MATERIALS, LANTERN.segments, 0)(body);
  for (let bar: number = 0; bar < LANTERN.bars; bar += 1) {
    const angle: number = ((bar + 0.5) / LANTERN.bars) * Math.PI * 2;
    const at = (height: number): Vector3 => TOP.clone().add(new Vector3(Math.sin(angle) * LANTERN.barRadius, -height, Math.cos(angle) * LANTERN.barRadius));
    buildTube(body, [at(LANTERN.barFrom), at(LANTERN.barTo)], LANTERN.barTube, BAIL.sides, 'iron');
  }
  grow(soup, body, SCALE.lantern);
}

export const CHARM_DESIGNS: readonly CharmDesign[] = [
  { piece: 'Gale_Charm', smoothDegrees: 40, build: galeDisc },
  { piece: 'Ember_Charm', smoothDegrees: 40, build: emberDrop },
  { piece: 'Gilded_Token', smoothDegrees: TOKEN.smooth, build: hexToken },
  { piece: 'Tidestone_Charm', smoothDegrees: 50, build: tidePebble },
  { piece: 'Storm_Idol', smoothDegrees: 30, build: stormIdol },
  { piece: 'Lantern_Charm', smoothDegrees: 40, build: tinyLantern },
];
