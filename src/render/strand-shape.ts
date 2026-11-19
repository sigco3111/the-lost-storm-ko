export const STRAND = {
  trunkLevels: 5,
  forkLevels: 3,
  maxForks: 4,
  forkScale: 1.5,
  kinkShare: 0.15,
  kinkReach: 1.1,
  roughness: 0.5,
  kinkSpacing: 0.3,
  riseShare: 0.55,
  taperReach: 0.45,
  taperShareMax: 0.22,
  widthVary: 0.4,
  varyEvery: 6,
  hotShare: 0.22,
  forkFrom: 0.25,
  forkSpan: 0.7,
  forkReach: 0.28,
  forkReachMax: 1.6,
  forkLengthMin: 0.45,
  forkTurnMin: 0.3,
  forkTurnSpan: 0.35,
  forkKink: 0.22,
  forkWeight: 0.6,
  lead: 0.05,
  leaderLight: 0.5,
  strikeFall: 0.16,
  afterimage: 0.3,
  restrikeAt: 0.4,
  restrikeFall: 0.06,
  restrike: 0.6,
} as const;

export const TRUNK_POINTS: number = 2 ** STRAND.trunkLevels + 1;
export const FORK_POINTS: number = 2 ** STRAND.forkLevels + 1;
export const STRAND_POINTS: number = TRUNK_POINTS + STRAND.maxForks * FORK_POINTS;

export interface StrandEnds {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StrandForm {
  readonly forks: number;
  readonly jitter: number;
}

export interface StrandBuffers {
  readonly points: Float32Array;
  readonly weights: Float32Array;
  readonly heats: Float32Array;
  readonly alongs: Float32Array;
}

export function createStrandBuffers(): StrandBuffers {
  return { points: new Float32Array(STRAND_POINTS * 3), weights: new Float32Array(STRAND_POINTS), heats: new Float32Array(STRAND_POINTS), alongs: new Float32Array(STRAND_POINTS) };
}

export function strandStrips(): readonly (readonly [number, number])[] {
  const strips: [number, number][] = [[0, TRUNK_POINTS]];
  for (let fork: number = 0; fork < STRAND.maxForks; fork += 1) strips.push([TRUNK_POINTS + fork * FORK_POINTS, FORK_POINTS]);
  return strips;
}

function smooth(t: number): number {
  const clamped: number = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

interface Frame {
  ax: number;
  ay: number;
  az: number;
  sx: number;
  sz: number;
  ux: number;
  uy: number;
  uz: number;
}

function blankFrame(): Frame {
  return { ax: 0, ay: 0, az: 0, sx: 0, sz: 0, ux: 0, uy: 0, uz: 0 };
}

const TRUNK_FRAME: Frame = blankFrame();
const LOCAL_FRAME: Frame = blankFrame();
const BRANCH_FRAME: Frame = blankFrame();

function frameOf(dx: number, dy: number, dz: number, out: Frame): Frame {
  const length: number = Math.max(1e-4, Math.hypot(dx, dy, dz));
  const ax: number = dx / length;
  const ay: number = dy / length;
  const az: number = dz / length;
  const flat: number = Math.hypot(ax, az);
  const sx: number = flat > 1e-3 ? az / flat : 1;
  const sz: number = flat > 1e-3 ? -ax / flat : 0;
  out.ax = ax;
  out.ay = ay;
  out.az = az;
  out.sx = sx;
  out.sz = sz;
  out.ux = ay * sz;
  out.uy = az * sx - ax * sz;
  out.uz = -ay * sx;
  return out;
}

const SIDE: Float32Array = new Float32Array(TRUNK_POINTS);
const VARY: Float32Array = new Float32Array(Math.ceil((TRUNK_POINTS - 1) / STRAND.varyEvery) + 1);
const RISE: Float32Array = new Float32Array(TRUNK_POINTS);

function displace(count: number, amplitude: number, spacing: number, random: () => number): void {
  SIDE.fill(0, 0, count);
  RISE.fill(0, 0, count);
  let size: number = count - 1;
  let reach: number = amplitude;
  while (size > 1) {
    const half: number = size / 2;
    for (let mid: number = half; mid < count - 1; mid += size) {
      const kink: number = size * spacing >= STRAND.kinkSpacing ? reach : 0;
      SIDE[mid] = ((SIDE[mid - half] ?? 0) + (SIDE[mid + half] ?? 0)) / 2 + (random() - 0.5) * 2 * kink;
      RISE[mid] = ((RISE[mid - half] ?? 0) + (RISE[mid + half] ?? 0)) / 2 + (random() - 0.5) * 2 * kink * STRAND.riseShare;
    }
    size = half;
    reach *= STRAND.roughness;
  }
}

function put(out: StrandBuffers, index: number, x: number, y: number, z: number, weight: number, heat: number, along: number): void {
  out.points[index * 3] = x;
  out.points[index * 3 + 1] = y;
  out.points[index * 3 + 2] = z;
  out.weights[index] = weight;
  out.heats[index] = heat;
  out.alongs[index] = along;
}

function heatOf(random: () => number): number {
  const roll: number = random();
  if (roll > STRAND.hotShare) return 0;
  return (random() < 0.5 ? -1 : 1) * (1 - roll / STRAND.hotShare);
}

export function strandTaper(t: number, share: number): number {
  return smooth(t / share) * smooth((1 - t) / share);
}

export function drawnForks(forks: number): number {
  return Math.max(0, Math.min(STRAND.maxForks, Math.round(Math.floor(forks) * STRAND.forkScale)));
}

export function writeStrand(from: StrandEnds, to: StrandEnds, form: StrandForm, random: () => number, out: StrandBuffers): number {
  const dx: number = to.x - from.x;
  const dy: number = to.y - from.y;
  const dz: number = to.z - from.z;
  const length: number = Math.max(1e-4, Math.hypot(dx, dy, dz));
  const frame: Frame = frameOf(dx, dy, dz, TRUNK_FRAME);
  const jitter: number = Math.max(0, form.jitter);
  displace(TRUNK_POINTS, Math.min(length * STRAND.kinkShare, STRAND.kinkReach) * jitter, length / (TRUNK_POINTS - 1), random);
  const share: number = Math.min(STRAND.taperShareMax, STRAND.taperReach / length);
  for (let knot: number = 0; knot < VARY.length; knot += 1) VARY[knot] = 1 - STRAND.widthVary * random();
  for (let point: number = 0; point < TRUNK_POINTS; point += 1) {
    const t: number = point / (TRUNK_POINTS - 1);
    const side: number = SIDE[point] ?? 0;
    const rise: number = RISE[point] ?? 0;
    const knot: number = Math.floor(point / STRAND.varyEvery);
    const mix: number = (point % STRAND.varyEvery) / STRAND.varyEvery;
    const vary: number = (VARY[knot] ?? 1) * (1 - mix) + (VARY[knot + 1] ?? 1) * mix;
    put(out, point, from.x + dx * t + frame.sx * side + frame.ux * rise, from.y + dy * t + frame.uy * rise, from.z + dz * t + frame.sz * side + frame.uz * rise, strandTaper(t, share) * vary, heatOf(random), t);
  }
  const forks: number = drawnForks(form.forks);
  const reachMax: number = Math.min(length * STRAND.forkReach, STRAND.forkReachMax);
  for (let fork: number = 0; fork < STRAND.maxForks; fork += 1) {
    const base: number = TRUNK_POINTS + fork * FORK_POINTS;
    const root: number = Math.min(TRUNK_POINTS - 2, Math.max(1, Math.round((TRUNK_POINTS - 1) * (STRAND.forkFrom + STRAND.forkSpan * Math.sqrt(random())))));
    const rx: number = out.points[root * 3] ?? from.x;
    const ry: number = out.points[root * 3 + 1] ?? from.y;
    const rz: number = out.points[root * 3 + 2] ?? from.z;
    const ahead: number = Math.min(TRUNK_POINTS - 1, root + 1);
    const local: Frame = frameOf((out.points[ahead * 3] ?? to.x) - rx, (out.points[ahead * 3 + 1] ?? to.y) - ry, (out.points[ahead * 3 + 2] ?? to.z) - rz, LOCAL_FRAME);
    const turn: number = (STRAND.forkTurnMin + STRAND.forkTurnSpan * random()) * (random() < 0.5 ? -1 : 1);
    const tilt: number = (random() - 0.5) * STRAND.forkTurnMin;
    const fx: number = frame.ax * 0.5 + local.ax * 0.5;
    const fy: number = frame.ay * 0.5 + local.ay * 0.5;
    const fz: number = frame.az * 0.5 + local.az * 0.5;
    const hx: number = fx * Math.cos(turn) + frame.sx * Math.sin(turn) + frame.ux * tilt;
    const hy: number = fy * Math.cos(turn) + frame.uy * tilt;
    const hz: number = fz * Math.cos(turn) + frame.sz * Math.sin(turn) + frame.uz * tilt;
    const norm: number = Math.max(1e-4, Math.hypot(hx, hy, hz));
    const reach: number = reachMax * (STRAND.forkLengthMin + (1 - STRAND.forkLengthMin) * random());
    const branch: Frame = frameOf(hx, hy, hz, BRANCH_FRAME);
    const drawn: boolean = fork < forks;
    const rootWeight: number = drawn ? (out.weights[root] ?? 0) * STRAND.forkWeight : 0;
    const rootAlong: number = root / (TRUNK_POINTS - 1);
    displace(FORK_POINTS, reach * STRAND.forkKink * Math.max(0.4, jitter), reach / (FORK_POINTS - 1), random);
    for (let point: number = 0; point < FORK_POINTS; point += 1) {
      const t: number = point / (FORK_POINTS - 1);
      const side: number = SIDE[point] ?? 0;
      const rise: number = RISE[point] ?? 0;
      const fade: number = 1 - t;
      put(out, base + point, rx + (hx / norm) * reach * t + branch.sx * side + branch.ux * rise, ry + (hy / norm) * reach * t + branch.uy * rise, rz + (hz / norm) * reach * t + branch.sz * side + branch.uz * rise, rootWeight * fade * fade, 0, rootAlong + (reach / length) * t);
    }
  }
  return forks;
}

export interface Dice {
  reset(seed: number): void;
  readonly next: () => number;
}

export function createDice(): Dice {
  let state: number = 1;
  return {
    reset(seed: number): void {
      state = (Math.floor(Math.abs(seed) * 2147483646) % 2147483646) + 1;
    },
    next: (): number => {
      state = (state * 16807) % 2147483647;
      return (state - 1) / 2147483646;
    },
  };
}

export function strandSpan(afterglow: number): number {
  return STRAND.lead + afterglow;
}

export function strandGrow(age: number): number {
  return Math.min(1, Math.max(0, age / STRAND.lead));
}

export function restrikeAge(afterglow: number): number {
  return STRAND.lead + STRAND.restrikeAt * afterglow;
}

export function strandLight(age: number, afterglow: number, restrike: boolean): number {
  if (!(age > 0) || age >= strandSpan(afterglow)) return 0;
  if (age < STRAND.lead) return STRAND.leaderLight;
  const since: number = (age - STRAND.lead) / afterglow;
  const strike: number = STRAND.afterimage + (1 - STRAND.afterimage) * Math.exp(-since / STRAND.strikeFall);
  const off: number = since - STRAND.restrikeAt;
  const again: number = restrike && off >= 0 ? STRAND.restrike * Math.exp(-off / STRAND.restrikeFall) : 0;
  return Math.min(1, strike + again) * (1 - smooth(since));
}
