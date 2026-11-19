import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { MomentDef, MomentEcho, MomentField } from '../content/moment-types.ts';
import type { Content, MonsterDef } from '../content/types.ts';
import type { RigDef } from '../content/rig-types.ts';
import type { Vec2 } from '../math.ts';
import { DEGREES_TO_RADIANS, distance } from '../math.ts';
import type { Crossing, TransitState, TransitWalker } from './moment-transit.ts';
import { createTransit, echoGait, TRANSIT_RULES, momentObstacles, pathGap, pointAlong, stepTransit, walkGait, walksAcross } from './moment-transit.ts';
import { must } from '../../test/support.ts';
import { echoesOf, FIELD, fieldWorld, momentLibrary, QUIET, RAID, standAt } from '../../test/moment-support.ts';
import { forceStrike } from './moments.ts';
import { stepWorld } from './step.ts';
import type { MomentState, World } from './types.ts';

const CONTENT: Content = loadContent();
const DT: number = 1 / 30;
const LONG = { seconds: 600, seeds: [1, 7, 4242, 90_001] } as const;
const EXACT: number = 1e-9;
const NEAR: number = 1e-6;
const STRAIGHT = { along: 2, share: 0.9 } as const;
const FAR = { x: 150, z: 150 } as const;
const WORLD_SPOT = { x: 40, z: 40 } as const;

function walking(): MomentDef[] {
  return [...CONTENT.moments.defs.values()].filter((def: MomentDef): boolean => def.echoes.some((echo): boolean => walksAcross(TRANSIT_RULES, echo)));
}

function transitOf(def: MomentDef, seed: number): TransitState {
  return must(createTransit(CONTENT, def, momentObstacles(CONTENT, def), seed), def.id);
}

function crossingsOver(state: TransitState, seconds: number): Map<number, Crossing[]> {
  const seen: Map<number, Crossing[]> = new Map<number, Crossing[]>();
  const note = (): void => {
    for (const walker of state.walkers) {
      const list: Crossing[] = seen.get(walker.echo) ?? [];
      if (list[list.length - 1] !== walker.crossing) list.push(walker.crossing);
      seen.set(walker.echo, list);
    }
  };
  note();
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) {
    stepTransit(state, DT);
    note();
  }
  return seen;
}

function trace(state: TransitState, seconds: number): string[] {
  const lines: string[] = [];
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) {
    stepTransit(state, DT);
    lines.push(state.walkers.map((walker: TransitWalker): string => `${walker.walking ? 1 : 0}:${walker.pos.x.toFixed(4)},${walker.pos.z.toFixed(4)}`).join('|'));
  }
  return lines;
}

function liveTransit(moment: MomentState): TransitState | null {
  return moment.transit;
}

function run(world: World, seconds: number): void {
  for (let elapsed: number = 0; elapsed < seconds; elapsed += DT) stepWorld(world, [], DT);
}

function struck(world: World, def: string): MomentState {
  standAt(world, FAR);
  const moment: MomentState = must(forceStrike(world, WORLD_SPOT, def), 'forced strike');
  run(world, world.content.moments.telegraph + DT * 2);
  return moment;
}

function quietField(): MomentField {
  return { ...FIELD, start: 0, max: 1, interval: { min: 1000, max: 1000 } };
}

void test('a moment where nobody turns sends its people posed in a walk across it, and a moment where someone turns sends nobody', (): void => {
  const calm: MomentDef = { ...RAID, id: 'test_calm', turnChance: 0, chest: null, echoes: RAID.echoes.map((echo: MomentEcho): MomentEcho => ({ ...echo, turns: false })) };
  const world: World = fieldWorld(quietField(), momentLibrary([QUIET, calm, RAID]));
  const moment: MomentState = struck(world, calm.id);
  assert.equal(liveTransit(moment), null);
  standAt(world, moment.pos);
  run(world, DT * 2);
  assert.equal(moment.phase, 'awake');
  assert.equal(world.monsters.length, 0);
  const transit: TransitState = must(liveTransit(moment), 'transit');
  assert.deepEqual(transit.walkers.map((walker: TransitWalker): number => walker.echo), [0, 1]);
  const before: Vec2[] = transit.walkers.map((walker: TransitWalker): Vec2 => ({ ...walker.pos }));
  run(world, 1);
  transit.walkers.forEach((walker: TransitWalker, index: number): void => {
    assert.ok(distance(walker.pos, must(before[index], 'before')) > 0.5, `walker ${index} stood still`);
  });
  const hostile: World = fieldWorld(quietField(), momentLibrary([QUIET, calm, RAID]));
  const raid: MomentState = struck(hostile, RAID.id);
  standAt(hostile, raid.pos);
  run(hostile, DT * 2);
  assert.equal(echoesOf(hostile, raid).length, 2);
  assert.equal(liveTransit(raid), null);
});

void test('some shipped moments have people posed in a walk, so a neutral one has people to walk across it', (): void => {
  assert.ok(walking().length > 0);
  assert.ok(walking().some((def: MomentDef): boolean => def.id === 'children_at_play'));
});

void test('a moment where nobody is posed in a walk has no one in transit', (): void => {
  const still: MomentDef = must(CONTENT.moments.defs.get('funeral'), 'funeral');
  assert.equal(createTransit(CONTENT, still, momentObstacles(CONTENT, still), 1), null);
});

void test('the walk is the rig\'s slowest gait', (): void => {
  const rig: RigDef = must(CONTENT.rigs.get('human_woman'), 'human_woman');
  const index: number = must(walkGait(rig), 'gait');
  assert.ok(rig.gaits.every((gait): boolean => gait.groundSpeed >= must(rig.gaits[index], 'walk').groundSpeed));
});

void test('the schedule is the same for the same seed and differs for another', (): void => {
  for (const def of walking()) {
    const first: string[] = trace(transitOf(def, 4242), 60);
    assert.deepEqual(trace(transitOf(def, 4242), 60), first, def.id);
    assert.notDeepEqual(trace(transitOf(def, 4243), 60), first, def.id);
  }
});

void test('a posed walker carries on from where it stood, facing the way it faced', (): void => {
  for (const def of walking()) {
    for (const walker of transitOf(def, 7).walkers) {
      const echo = must(def.echoes[walker.echo], 'echo');
      assert.ok(walker.walking, def.id);
      assert.ok(distance(walker.pos, { x: echo.x, z: echo.z }) < NEAR, def.id);
      const ahead: Vec2 = pointAlong(walker.crossing.path, 0.05);
      const facing: number = echo.facingDegrees * DEGREES_TO_RADIANS;
      assert.ok(Math.abs((ahead.x - echo.x) * Math.cos(facing) - (ahead.z - echo.z) * Math.sin(facing)) < 0.01, `${def.id} turns on its first step`);
    }
  }
});

void test('a posed walker heads out on a gentle line, not a curl: its first two metres carry it nearly two metres from where it stood', (): void => {
  for (const def of walking()) {
    for (const seed of LONG.seeds) {
      for (const walker of transitOf(def, seed).walkers) {
        const echo = must(def.echoes[walker.echo], 'echo');
        const along: number = Math.min(STRAIGHT.along, walker.crossing.path.length);
        assert.ok(distance(pointAlong(walker.crossing.path, along), { x: echo.x, z: echo.z }) >= along * STRAIGHT.share, `${def.id} echo ${walker.echo} curls`);
      }
    }
  }
});

void test('every crossing ends just past the rim, and after the first it also starts there', (): void => {
  for (const def of walking()) {
    const reach: number = def.radius + TRANSIT_RULES.margin;
    for (const seed of LONG.seeds) {
      for (const crossings of crossingsOver(transitOf(def, seed), LONG.seconds).values()) {
        for (const crossing of crossings) {
          const end: Vec2 = must(crossing.path.points[crossing.path.points.length - 1], 'end');
          assert.ok(Math.abs(Math.hypot(end.x, end.z) - reach) < NEAR, `${def.id} ends ${Math.hypot(end.x, end.z)} from the centre`);
          if (crossing.index === 0) continue;
          const start: Vec2 = must(crossing.path.points[0], 'start');
          assert.ok(Math.abs(Math.hypot(start.x, start.z) - reach) < NEAR, `${def.id} starts ${Math.hypot(start.x, start.z)} from the centre`);
        }
      }
    }
  }
});

void test('no path enters a prop or the chest, and a path that is not the first keeps its clearance too', (): void => {
  for (const def of walking()) {
    const obstacles = momentObstacles(CONTENT, def);
    assert.ok(obstacles.length > 0, def.id);
    for (const seed of LONG.seeds) {
      for (const crossings of crossingsOver(transitOf(def, seed), LONG.seconds).values()) {
        for (const crossing of crossings) {
          assert.ok(pathGap(crossing.path, obstacles, false) > 0, `${def.id} crossing ${crossing.index} walks into a footprint`);
          if (crossing.index > 0) assert.ok(pathGap(crossing.path, obstacles, true) >= 0, `${def.id} crossing ${crossing.index} brushes a prop`);
        }
      }
    }
  }
});

void test('a walker moves at its rig\'s stride speed times its scale times the clip rate, and covers exactly that ground', (): void => {
  const def: MomentDef = must(CONTENT.moments.defs.get('children_at_play'), 'children_at_play');
  const state: TransitState = transitOf(def, 7);
  for (const walker of state.walkers) {
    const echo = must(def.echoes[walker.echo], 'echo');
    const monster: MonsterDef = must(CONTENT.monsters.get(echo.monster), echo.monster);
    const rig: RigDef = must(CONTENT.rigs.get(echo.look?.rig ?? monster.rig), 'rig');
    const stride: number = must(rig.gaits[must(walkGait(rig), 'gait')], 'walk').groundSpeed * (echo.look?.scale ?? monster.scale);
    assert.ok(Math.abs(must(echoGait(CONTENT, echo), 'gait').stride - stride) < EXACT);
    assert.ok(Math.abs(walker.crossing.speed - stride * walker.crossing.rate) < EXACT);
    assert.ok(walker.crossing.rate >= TRANSIT_RULES.pace.min && walker.crossing.rate <= TRANSIT_RULES.pace.max);
  }
  const walker: TransitWalker = must(state.walkers[0], 'walker');
  const crossing: Crossing = walker.crossing;
  const before: number = 0.5;
  stepTransit(state, before);
  const from: Vec2 = { ...walker.pos };
  stepTransit(state, 1);
  assert.ok(walker.crossing === crossing && walker.walking);
  assert.ok(Math.abs(distance(from, walker.pos) - crossing.speed) < 0.01);
  assert.ok(Math.abs(crossing.leave - crossing.enter - crossing.path.length / crossing.speed) < EXACT);
});

void test('over a long run the bubble shows between none and all of its walkers, and is never empty of them for longer than the longest pause', (): void => {
  const longest: number = TRANSIT_RULES.pause.max;
  for (const def of walking()) {
    for (const seed of LONG.seeds) {
      const state: TransitState = transitOf(def, seed);
      let empty: number = 0;
      let worst: number = 0;
      let busiest: number = 0;
      for (let elapsed: number = 0; elapsed < LONG.seconds; elapsed += DT) {
        stepTransit(state, DT);
        const shown: number = state.walkers.filter((walker: TransitWalker): boolean => walker.walking).length;
        busiest = Math.max(busiest, shown);
        empty = shown === 0 ? empty + DT : 0;
        worst = Math.max(worst, empty);
      }
      assert.ok(busiest <= state.walkers.length, def.id);
      assert.ok(busiest >= 1, def.id);
      assert.ok(worst <= longest + DT, `${def.id} seed ${seed} stood empty for ${worst.toFixed(2)} s`);
    }
  }
});

void test('each walker stays inside the rim and its margin for the whole of every crossing', (): void => {
  for (const def of walking()) {
    const reach: number = def.radius + TRANSIT_RULES.margin;
    const state: TransitState = transitOf(def, 90_001);
    for (let elapsed: number = 0; elapsed < 120; elapsed += DT) {
      stepTransit(state, DT);
      for (const walker of state.walkers) if (walker.walking) assert.ok(Math.hypot(walker.pos.x, walker.pos.z) <= reach + NEAR, def.id);
    }
  }
});
