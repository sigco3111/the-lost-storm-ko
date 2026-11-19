import type { MomentDef, MomentEcho } from '../content/moment-types.ts';
import type { Content, MonsterDef, PropDef } from '../content/types.ts';
import type { RigDef, RigGait } from '../content/rig-types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { DEGREES_TO_RADIANS, directionOf, facingOf } from '../math.ts';
import type { Blocker } from '../nav/grid.ts';
import { blockerGap, propBlockers } from '../nav/grid.ts';
import type { Rng } from '../rng.ts';
import { createRng } from '../rng.ts';

export const TRANSIT = {
  samples: 32,
  checkStep: 0.2,
  turnStep: 12 * DEGREES_TO_RADIANS,
  lead: 0.5,
  headingSpan: 0.3,
  seedMix: 0x9e3779b1,
  walkerMix: 0xc2b2ae35,
  crossingMix: 0x85ebca6b,
} as const;

export interface TransitSpan {
  readonly min: number;
  readonly max: number;
}

export interface TransitRules {
  readonly clips: readonly string[];
  readonly pause: TransitSpan;
  readonly pace: TransitSpan;
  readonly margin: number;
  readonly offset: number;
  readonly bend: number;
  readonly clearance: number;
  readonly chestClearance: number;
  readonly tries: number;
}

export const TRANSIT_RULES: TransitRules = {
  clips: ['run'],
  pause: { min: 1.5, max: 4 },
  pace: { min: 0.85, max: 1.1 },
  margin: 0.7,
  offset: 0.6,
  bend: 0.12,
  clearance: 0.55,
  chestClearance: 1,
  tries: 40,
};

export interface TransitObstacle {
  readonly blocker: Blocker;
  readonly clearance: number;
}

export interface TransitPath {
  readonly points: readonly Vec2[];
  readonly marks: readonly number[];
  readonly length: number;
}

export interface Crossing {
  readonly index: number;
  readonly path: TransitPath;
  readonly enter: number;
  readonly leave: number;
  readonly rate: number;
  readonly speed: number;
}

export interface TransitGait {
  readonly gait: number;
  readonly stride: number;
}

export interface TransitWalker extends TransitGait {
  readonly echo: number;
  crossing: Crossing;
  pos: Vec2;
  heading: number;
  walking: boolean;
}

export interface TransitState {
  readonly seed: number;
  readonly radius: number;
  readonly rules: TransitRules;
  readonly obstacles: readonly TransitObstacle[];
  time: number;
  readonly walkers: TransitWalker[];
}

interface Placed {
  readonly pos: Vec2;
  readonly heading: number;
}

const STILL_PATH: TransitPath = { points: [], marks: [], length: 0 };

export function walkGait(rig: RigDef): number | null {
  let slowest: number | null = null;
  rig.gaits.forEach((gait: RigGait, index: number): void => {
    const held: RigGait | undefined = slowest === null ? undefined : rig.gaits[slowest];
    if (held === undefined || gait.groundSpeed < held.groundSpeed) slowest = index;
  });
  return slowest;
}

export function echoGait(content: Content, echo: MomentEcho): TransitGait | null {
  const monster: MonsterDef | undefined = content.monsters.get(echo.monster);
  if (monster === undefined) return null;
  const rig: RigDef | undefined = content.rigs.get(echo.look?.rig ?? monster.rig);
  const gait: number | null = rig === undefined ? null : walkGait(rig);
  const chosen: RigGait | undefined = gait === null ? undefined : rig?.gaits[gait];
  if (gait === null || chosen === undefined) return null;
  return { gait, stride: chosen.groundSpeed * (echo.look?.scale ?? monster.scale) };
}

export function walksAcross(rules: TransitRules, echo: MomentEcho): boolean {
  return rules.clips.includes(echo.pose.clip);
}

function bezier(from: ReadonlyVec2, control: ReadonlyVec2, to: ReadonlyVec2): TransitPath {
  const points: Vec2[] = [];
  const marks: number[] = [];
  let length: number = 0;
  for (let step: number = 0; step <= TRANSIT.samples; step += 1) {
    const t: number = step / TRANSIT.samples;
    const a: number = (1 - t) * (1 - t);
    const b: number = 2 * (1 - t) * t;
    const c: number = t * t;
    const point: Vec2 = { x: a * from.x + b * control.x + c * to.x, z: a * from.z + b * control.z + c * to.z };
    const last: Vec2 | undefined = points[points.length - 1];
    if (last !== undefined) length += Math.hypot(point.x - last.x, point.z - last.z);
    points.push(point);
    marks.push(length);
  }
  return { points, marks, length };
}

export function pointAlong(path: TransitPath, along: number): Vec2 {
  const first: Vec2 | undefined = path.points[0];
  if (first === undefined) return { x: 0, z: 0 };
  const reach: number = Math.min(path.length, Math.max(0, along));
  for (let index: number = 1; index < path.points.length; index += 1) {
    const end: number = path.marks[index] ?? path.length;
    if (end < reach && index < path.points.length - 1) continue;
    const start: number = path.marks[index - 1] ?? 0;
    const a: Vec2 = path.points[index - 1] ?? first;
    const b: Vec2 = path.points[index] ?? a;
    const share: number = end > start ? (reach - start) / (end - start) : 0;
    return { x: a.x + (b.x - a.x) * share, z: a.z + (b.z - a.z) * share };
  }
  return { x: first.x, z: first.z };
}

function placeAlong(path: TransitPath, along: number): Placed {
  const pos: Vec2 = pointAlong(path, along);
  const behind: Vec2 = pointAlong(path, along - TRANSIT.headingSpan);
  const ahead: Vec2 = pointAlong(path, along + TRANSIT.headingSpan);
  return { pos, heading: facingOf({ x: ahead.x - behind.x, z: ahead.z - behind.z }) };
}

export function pathGap(path: TransitPath, obstacles: readonly TransitObstacle[], spare: boolean): number {
  let gap: number = Infinity;
  const steps: number = Math.max(1, Math.ceil(path.length / TRANSIT.checkStep));
  for (let step: number = 0; step <= steps; step += 1) {
    const point: Vec2 = pointAlong(path, (step / steps) * path.length);
    for (const obstacle of obstacles) gap = Math.min(gap, blockerGap(obstacle.blocker, point.x, point.z) - (spare ? obstacle.clearance : 0));
  }
  return gap;
}

function rim(angle: number, reach: number): Vec2 {
  return { x: Math.cos(angle) * reach, z: Math.sin(angle) * reach };
}

function within(rng: Rng, span: TransitSpan): number {
  return rng.range(span.min, span.max);
}

function rngFor(seed: number, echo: number, index: number): Rng {
  return createRng((seed ^ Math.imul(echo + 1, TRANSIT.walkerMix) ^ Math.imul(index + 1, TRANSIT.crossingMix)) >>> 0);
}

function timed(path: TransitPath, index: number, enter: number, rate: number, stride: number): Crossing {
  const speed: number = stride * rate;
  return { index, path, enter, leave: enter + path.length / speed, rate, speed };
}

export function firstCrossing(state: TransitState, gait: TransitGait, echo: MomentEcho, slot: number): Crossing {
  const rng: Rng = rngFor(state.seed, slot, 0);
  const rate: number = within(rng, state.rules.pace);
  const from: Vec2 = { x: echo.x, z: echo.z };
  const ahead: Vec2 = directionOf(echo.facingDegrees * DEGREES_TO_RADIANS);
  const reach: number = state.radius + state.rules.margin;
  const along: number = from.x * ahead.x + from.z * ahead.z;
  const out: number = -along + Math.sqrt(Math.max(0, along * along - (from.x * from.x + from.z * from.z - reach * reach)));
  const straight: number = Math.atan2(from.z + ahead.z * out, from.x + ahead.x * out);
  let best: TransitPath | null = null;
  let bestGap: number = -Infinity;
  for (let attempt: number = 0; attempt < state.rules.tries; attempt += 1) {
    const turn: number = (attempt % 2 === 1 ? 1 : -1) * Math.ceil(attempt / 2) * TRANSIT.turnStep;
    const to: Vec2 = rim(straight + turn, reach);
    const lead: number = Math.hypot(to.x - from.x, to.z - from.z) * TRANSIT.lead;
    const path: TransitPath = bezier(from, { x: from.x + ahead.x * lead, z: from.z + ahead.z * lead }, to);
    const gap: number = pathGap(path, state.obstacles, true);
    if (gap >= 0) return timed(path, 0, 0, rate, gait.stride);
    if (gap > bestGap) {
      best = path;
      bestGap = gap;
    }
  }
  return timed(best ?? STILL_PATH, 0, 0, rate, gait.stride);
}

export function nextCrossing(state: TransitState, gait: TransitGait, slot: number, previous: Crossing): Crossing {
  const index: number = previous.index + 1;
  const rng: Rng = rngFor(state.seed, slot, index);
  const enter: number = previous.leave + within(rng, state.rules.pause);
  const rate: number = within(rng, state.rules.pace);
  const reach: number = state.radius + state.rules.margin;
  const spread: number = Math.PI - 2 * Math.acos(state.rules.offset);
  for (let attempt: number = 0; attempt < state.rules.tries; attempt += 1) {
    const entry: number = rng.range(0, Math.PI * 2);
    const exit: number = entry + Math.PI + rng.range(-spread, spread);
    const from: Vec2 = rim(entry, reach);
    const to: Vec2 = rim(exit, reach);
    const span: number = Math.hypot(to.x - from.x, to.z - from.z);
    const bow: number = rng.range(-state.rules.bend, state.rules.bend) * state.radius;
    const control: Vec2 = { x: (from.x + to.x) / 2 - ((to.z - from.z) / span) * bow, z: (from.z + to.z) / 2 + ((to.x - from.x) / span) * bow };
    const path: TransitPath = bezier(from, control, to);
    if (pathGap(path, state.obstacles, true) >= 0) return timed(path, index, enter, rate, gait.stride);
  }
  return timed(STILL_PATH, index, enter, rate, gait.stride);
}

function place(walker: TransitWalker, time: number): void {
  const crossing: Crossing = walker.crossing;
  walker.walking = time >= crossing.enter && time < crossing.leave && crossing.path.length > 0;
  if (!walker.walking) return;
  const placed: Placed = placeAlong(crossing.path, (time - crossing.enter) * crossing.speed);
  walker.pos = placed.pos;
  walker.heading = placed.heading;
}

export function stepTransit(state: TransitState, dt: number): void {
  state.time += dt;
  for (const walker of state.walkers) {
    while (state.time >= walker.crossing.leave) walker.crossing = nextCrossing(state, walker, walker.echo, walker.crossing);
    place(walker, state.time);
  }
}

export function momentObstacles(content: Content, def: MomentDef): TransitObstacle[] {
  const rules: TransitRules = TRANSIT_RULES;
  const list: TransitObstacle[] = [];
  for (const placed of def.props) {
    const prop: PropDef | undefined = content.props.get(placed.prop);
    if (prop === undefined) continue;
    for (const blocker of propBlockers(prop, placed.x, placed.z, placed.rotationDegrees)) list.push({ blocker, clearance: rules.clearance });
  }
  const box: PropDef | undefined = content.props.get(content.moments.chest.prop);
  if (def.chest !== null && box !== undefined) for (const blocker of propBlockers(box, def.chest.x, def.chest.z, def.chest.rotationDegrees)) list.push({ blocker, clearance: rules.chestClearance });
  return list;
}

export function createTransit(content: Content, def: MomentDef, obstacles: readonly TransitObstacle[], seed: number): TransitState | null {
  const rules: TransitRules = TRANSIT_RULES;
  const state: TransitState = { seed, radius: def.radius, rules, obstacles, time: 0, walkers: [] };
  def.echoes.forEach((echo: MomentEcho, index: number): void => {
    if (!walksAcross(rules, echo)) return;
    const gait: TransitGait | null = echoGait(content, echo);
    if (gait === null) return;
    const crossing: Crossing = firstCrossing(state, gait, echo, index);
    const placed: Placed = crossing.path.length > 0 ? placeAlong(crossing.path, 0) : { pos: { x: echo.x, z: echo.z }, heading: echo.facingDegrees * DEGREES_TO_RADIANS };
    state.walkers.push({ ...gait, echo: index, crossing, pos: placed.pos, heading: placed.heading, walking: crossing.path.length > 0 });
  });
  return state.walkers.length === 0 ? null : state;
}

export function transitSeed(state: number, momentId: number): number {
  return (state ^ Math.imul(momentId + 1, TRANSIT.seedMix)) >>> 0;
}

export function walkerOf(state: TransitState | null, echo: number): TransitWalker | null {
  return state?.walkers.find((walker: TransitWalker): boolean => walker.echo === echo) ?? null;
}
