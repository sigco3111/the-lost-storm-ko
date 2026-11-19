import type { BatKind, LifeGroup } from './life-kinds.ts';
import type { Hero, Point3 } from './life-motion.ts';
import { chance, lifeCount, LIFE_MOTION } from './life-motion.ts';

export const BAT_COLONY = {
  stagger: 0.16,
  staggerJitter: 0.3,
  drop: 0.9,
  dropShare: 0.22,
  clear: 1.5,
  hangLow: 0.35,
  hangHigh: 0.15,
  flutter: 0.45,
  flutterTwist: 0.6,
  bend: 0.55,
  bendRate: 2.3,
  rise: 0.35,
  crossFrom: 0.5,
  firstCross: 0.35,
  seed: { colony: 31, bat: 7 },
} as const;

export interface Roost {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  level: number;
  calm: number;
}

export type BatMode = 'hanging' | 'flying';

export interface Bat {
  roost: number;
  readonly offset: Point3;
  readonly pos: Point3;
  readonly from: Point3;
  readonly to: Point3;
  mode: BatMode;
  along: number;
  span: number;
  delay: number;
  yaw: number;
  phase: number;
  flap: number;
  flutter: number;
  shuffle: number;
  cross: number;
  draws: number;
  readonly seed: number;
}

export type BatEvent = { readonly type: 'bats-disturbed'; readonly x: number; readonly y: number; readonly z: number; readonly count: number } | { readonly type: 'bat-flyby'; readonly x: number; readonly y: number; readonly z: number };

export interface Colony {
  readonly kind: BatKind;
  readonly roosts: Roost[];
  readonly bats: Bat[];
}

function draw(bat: Bat): number {
  bat.draws += 1;
  return chance(bat.seed, bat.draws);
}

function offsetIn(seed: number, salt: number, spread: number): Point3 {
  return {
    x: (chance(seed, salt) * 2 - 1) * spread,
    y: -BAT_COLONY.hangLow + chance(seed, salt + 1) * (BAT_COLONY.hangLow + BAT_COLONY.hangHigh),
    z: (chance(seed, salt + 2) * 2 - 1) * spread,
  };
}

export function createColony(kind: BatKind, groups: readonly LifeGroup[], density: number): Colony {
  const roosts: Roost[] = groups.map((group: LifeGroup): Roost => ({ x: group.x, z: group.z, y: group.y, level: Number.NaN, calm: 0 }));
  const bats: Bat[] = [];
  groups.forEach((group: LifeGroup, roost: number): void => {
    const count: number = lifeCount(group.count, density);
    for (let index: number = 0; index < count; index += 1) {
      const seed: number = (roost + 1) * BAT_COLONY.seed.colony + index * BAT_COLONY.seed.bat + 1;
      const offset: Point3 = offsetIn(seed, 1, group.spread);
      bats.push({
        roost,
        offset,
        pos: { x: group.x + offset.x, y: Number.NaN, z: group.z + offset.z },
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 0 },
        mode: 'hanging',
        along: 0,
        span: 1,
        delay: 0,
        yaw: chance(seed, 4) * Math.PI * 2,
        phase: chance(seed, 5) * Math.PI * 2,
        flap: 0,
        flutter: 0,
        shuffle: kind.shuffle * (BAT_COLONY.crossFrom + chance(seed, 6)),
        cross: 0,
        draws: LIFE_MOTION.seed.draws,
        seed,
      });
    }
  });
  for (const bat of bats) bat.cross = kind.cross * (BAT_COLONY.firstCross + chance(bat.seed, 7)) * bats.length;
  return { kind, roosts, bats };
}

function hang(colony: Colony, bat: Bat): void {
  const roost: Roost | undefined = colony.roosts[bat.roost];
  if (roost === undefined) return;
  bat.pos.x = roost.x + bat.offset.x;
  bat.pos.y = roost.level + bat.offset.y;
  bat.pos.z = roost.z + bat.offset.z;
}

export function settleRoosts(colony: Colony, floorAt: (x: number, z: number) => number): void {
  for (const roost of colony.roosts) if (Number.isNaN(roost.level)) roost.level = floorAt(roost.x, roost.z) + roost.y;
  for (const bat of colony.bats) if (bat.mode === 'hanging' && Number.isNaN(bat.pos.y)) hang(colony, bat);
}

function roostGap(roost: Roost, x: number, z: number): number {
  return Math.hypot(roost.x - x, roost.z - z);
}

export function refuge(colony: Colony, from: number, hero: Hero, pick: number): number {
  const home: Roost | undefined = colony.roosts[from];
  if (home === undefined) return from;
  const choices: number[] = colony.roosts.flatMap((roost: Roost, index: number): number[] => (index !== from && roostGap(roost, home.x, home.z) <= colony.kind.reach && roostGap(roost, hero.x, hero.z) > colony.kind.wake * BAT_COLONY.clear ? [index] : []));
  if (choices.length > 0) return choices[Math.min(choices.length - 1, Math.floor(pick * choices.length))] ?? from;
  let best: number = from;
  let bestGap: number = Number.POSITIVE_INFINITY;
  colony.roosts.forEach((roost: Roost, index: number): void => {
    const gap: number = roostGap(roost, home.x, home.z);
    if (index !== from && gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  });
  return best;
}

function launch(colony: Colony, bat: Bat, roost: number, delay: number): void {
  const target: Roost | undefined = colony.roosts[roost];
  if (target === undefined || Number.isNaN(target.level)) return;
  const offset: Point3 = offsetIn(bat.seed, bat.draws, Math.hypot(bat.offset.x, bat.offset.z) + BAT_COLONY.hangLow);
  bat.draws += 3;
  bat.offset.x = offset.x;
  bat.offset.y = offset.y;
  bat.offset.z = offset.z;
  bat.from.x = bat.pos.x;
  bat.from.y = bat.pos.y;
  bat.from.z = bat.pos.z;
  bat.to.x = target.x + offset.x;
  bat.to.y = target.level + offset.y;
  bat.to.z = target.z + offset.z;
  bat.span = Math.max(colony.kind.size, Math.hypot(bat.to.x - bat.from.x, bat.to.y - bat.from.y, bat.to.z - bat.from.z));
  bat.roost = roost;
  bat.along = 0;
  bat.delay = delay;
  bat.mode = 'flying';
}

function disturbed(colony: Colony, roost: Roost, hero: Hero, stirs: readonly Hero[]): boolean {
  if (roostGap(roost, hero.x, hero.z) < colony.kind.wake) return true;
  return stirs.some((stir: Hero): boolean => roostGap(roost, stir.x, stir.z) < colony.kind.stir);
}

function scatter(colony: Colony, index: number, roost: Roost, hero: Hero, events: BatEvent[]): void {
  const hanging: Bat[] = colony.bats.filter((bat: Bat): boolean => bat.roost === index && bat.mode === 'hanging');
  roost.calm = colony.kind.rest;
  const first: Bat | undefined = hanging[0];
  if (first === undefined) return;
  const leaving: number = Math.min(colony.kind.most, Math.max(1, Math.round(hanging.length * colony.kind.hop)));
  const goal: number = refuge(colony, index, hero, draw(first));
  if (goal === index) return;
  hanging.slice(0, leaving).forEach((bat: Bat, order: number): void => {
    launch(colony, bat, goal, order * BAT_COLONY.stagger + draw(bat) * BAT_COLONY.staggerJitter);
  });
  events.push({ type: 'bats-disturbed', x: roost.x, y: roost.level, z: roost.z, count: leaving });
}

function flyStep(colony: Colony, bat: Bat, time: number, dt: number): void {
  const kind: BatKind = colony.kind;
  if (bat.delay > 0) {
    bat.delay -= dt;
    bat.flap = BAT_COLONY.flutter;
    return;
  }
  bat.along = Math.min(1, bat.along + (kind.speed * dt) / bat.span);
  const t: number = bat.along;
  const envelope: number = Math.sin(Math.PI * t);
  const dx: number = bat.to.x - bat.from.x;
  const dz: number = bat.to.z - bat.from.z;
  const level: number = Math.max(kind.size, Math.hypot(dx, dz));
  const wave: number = time * kind.jitterRate + bat.seed;
  const weave: number = kind.jitter * envelope * (Math.sin(wave) + BAT_COLONY.bend * Math.sin(wave * BAT_COLONY.bendRate + bat.seed));
  const sink: number = BAT_COLONY.drop * Math.sin(Math.PI * Math.min(1, t / BAT_COLONY.dropShare));
  const lastX: number = bat.pos.x;
  const lastZ: number = bat.pos.z;
  bat.pos.x = bat.from.x + dx * t - (dz / level) * weave;
  bat.pos.z = bat.from.z + dz * t + (dx / level) * weave;
  const lifted: number = Math.min(1, t / BAT_COLONY.dropShare);
  bat.pos.y = bat.from.y + (bat.to.y - bat.from.y) * t + kind.arc * envelope * lifted * lifted - sink + kind.jitter * BAT_COLONY.rise * envelope * Math.sin(wave * BAT_COLONY.bendRate);
  if (Math.hypot(bat.pos.x - lastX, bat.pos.z - lastZ) > 0) bat.yaw = Math.atan2(bat.pos.x - lastX, bat.pos.z - lastZ);
  bat.flap = 1;
  if (t < 1) return;
  bat.mode = 'hanging';
  bat.flap = 0;
  bat.cross = kind.cross * (BAT_COLONY.crossFrom + draw(bat)) * colony.bats.length;
  hang(colony, bat);
}

function hangStep(colony: Colony, bat: Bat, hero: Hero, dt: number, events: BatEvent[]): void {
  const kind: BatKind = colony.kind;
  bat.shuffle -= dt;
  bat.flutter = Math.max(0, bat.flutter - dt);
  if (bat.shuffle <= 0) {
    bat.shuffle = kind.shuffle * (BAT_COLONY.crossFrom + draw(bat));
    bat.flutter = BAT_COLONY.flutter;
    bat.yaw += (draw(bat) * 2 - 1) * BAT_COLONY.flutterTwist;
  }
  bat.flap = bat.flutter > 0 ? BAT_COLONY.flutter : 0;
  bat.cross -= dt;
  if (bat.cross > 0) return;
  bat.cross = kind.cross * (BAT_COLONY.crossFrom + draw(bat)) * colony.bats.length;
  const goal: number = refuge(colony, bat.roost, hero, draw(bat));
  if (goal === bat.roost) return;
  launch(colony, bat, goal, 0);
  events.push({ type: 'bat-flyby', x: bat.pos.x, y: bat.pos.y, z: bat.pos.z });
}

export function stepColony(colony: Colony, hero: Hero, stirs: readonly Hero[], time: number, dt: number): BatEvent[] {
  const events: BatEvent[] = [];
  colony.roosts.forEach((roost: Roost, index: number): void => {
    roost.calm = Math.max(0, roost.calm - dt);
    if (roost.calm > 0 || Number.isNaN(roost.level)) return;
    if (disturbed(colony, roost, hero, stirs)) scatter(colony, index, roost, hero, events);
  });
  for (const bat of colony.bats) {
    if (Number.isNaN(bat.pos.y)) continue;
    if (bat.mode === 'flying') flyStep(colony, bat, time, dt);
    else hangStep(colony, bat, hero, dt, events);
    if (bat.flap > 0) bat.phase += colony.kind.flapRate * Math.PI * 2 * dt;
  }
  return events;
}
