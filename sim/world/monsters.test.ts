import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MotionSample, TestScene } from '../../test/motion-support.ts';
import { MOTION_DT, motionProblems, placedProp, sampleOf, sceneZone } from '../../test/motion-support.ts';
import { ARENA_CENTRE, ARENA_CONTENT, arena, place } from '../../test/arena-support.ts';
import { SCENE_BASE } from '../../test/road-support.ts';
import { must, worldIn } from '../../test/support.ts';
import { UNRANKED_CONTENT as content } from '../../test/unranked-support.ts';
import type { MonsterDef, ZoneDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { blockerGap, isWalkable, lineOfSight, lineWalkable, nearestWalkable, propOutlines, routedGrid } from '../nav/grid.ts';
import type { Blocker, NavGrid } from '../nav/grid.ts';
import { findPath } from '../nav/path.ts';
import { applyHit, offenceOf } from './combat.ts';
import { forceStrike } from './moments.ts';
import { spawnPackNear, spawnPacks } from './monsters.ts';
import { stepWorld } from './step.ts';
import type { Command, MonsterState, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';

const base: ZoneDef = SCENE_BASE;

const LIMITS = {
  turnRate: 12,
  engageSlack: 1.6,
  settleTime: 2,
  seconds: 10,
  paceEvery: 1.5,
  blockedSeconds: 3,
  pinnedRunTime: 0.15,
  flickerGap: 0.3,
  pressedStep: 0.01,
  callerClear: 3,
  stuckStand: 20,
  hiccupStride: 21,
} as const;

interface Scene extends TestScene {
  readonly name: string;
  readonly monsters: readonly Vec2[];
  readonly pace: readonly Vec2[];
}

interface Track {
  readonly monster: MonsterState;
  readonly samples: MotionSample[];
}

const OPEN: readonly string[] = ['.......', '.......', '.......', '.......', '.......', '.......', '.......'];
const CORNER: readonly string[] = ['......', '......', '......', '...   ', '...   ', '...   '];

const SCENES: readonly Scene[] = [
  { name: 'wall corner', tiles: CORNER, props: [], start: { x: 6, z: 20 }, monsters: [{ x: 20, z: 7 }], pace: [] },
  {
    name: 'zig-zag wall',
    tiles: ['..........', '..........', '......  ..', '.....  ...', '....  ....', '...  .....', '..  ......'],
    props: [],
    start: { x: 6, z: 14 },
    monsters: [{ x: 30, z: 22 }],
    pace: [],
  },
  { name: 'prop in the way', tiles: OPEN, props: [placedProp('mossy_pillar', 14, 14)], start: { x: 14, z: 6 }, monsters: [{ x: 14, z: 21 }], pace: [] },
  {
    name: 'doorway narrower than two actors',
    tiles: ['.......', '.......', '.......', '   .   ', '.......', '.......', '.......'],
    props: [placedProp('mossy_column', 13.2, 14)],
    start: { x: 14, z: 4 },
    monsters: [{ x: 10, z: 22 }, { x: 14, z: 23 }, { x: 18, z: 22 }],
    pace: [],
  },
  {
    name: 'crowd converging',
    tiles: OPEN,
    props: [],
    start: { x: 14, z: 14 },
    monsters: [0, 1, 2, 3, 4, 5, 6, 7].map((index: number): Vec2 => ({ x: 14 + Math.cos((index / 8) * Math.PI * 2) * 9, z: 14 + Math.sin((index / 8) * Math.PI * 2) * 9 })),
    pace: [],
  },
  { name: 'target pacing behind a wall edge', tiles: CORNER, props: [], start: { x: 6, z: 16 }, monsters: [{ x: 21, z: 9 }], pace: [{ x: 9, z: 15 }, { x: 4, z: 18 }] },
];

const KINDS: readonly string[] = ['mended', 'mender', 'stormcaller_rival', 'unfinished_colossus', 'unfinished_thrower'];

function spawn(world: World, kind: string, at: Vec2): MonsterState {
  world.zone = { ...world.zone, packs: [{ x: at.x, z: at.z, members: [{ monster: kind, count: 1, mods: [] }], when: [] }] };
  spawnPacks(world);
  const monster: MonsterState = must(world.monsters.at(-1), `${kind} spawned`);
  monster.pos = must(nearestWalkable(routedGrid(world.grid), at, 6), 'walkable spawn');
  monster.lastPos = { x: monster.pos.x, z: monster.pos.z };
  monster.spawnTime = 0;
  monster.aggro = true;
  return monster;
}

function build(scene: Scene, kind: string, seed: number = 7): World {
  const world: World = worldIn(content, content.world.start, seed);
  enterZone(world, { ...sceneZone(base, `test_${scene.name}`, scene), moments: null }, { type: 'start' });
  world.events = [];
  world.monsters = [];
  world.moments = [];
  for (const at of scene.monsters) spawn(world, kind, at);
  return world;
}

function run(scene: Scene, kind: string): { world: World; tracks: Track[] } {
  const world: World = build(scene, kind);
  const tracks: Track[] = world.monsters.map((monster: MonsterState): Track => ({ monster, samples: [] }));
  const steps: number = Math.round(LIMITS.seconds / MOTION_DT);
  const paceEvery: number = Math.round(LIMITS.paceEvery / MOTION_DT);
  for (let step: number = 0; step < steps; step += 1) {
    world.player.life = world.player.maxLife;
    for (const track of tracks) track.monster.life = track.monster.maxLife;
    const commands: Command[] = [];
    if (scene.pace.length > 0 && step % paceEvery === 0) commands.push({ type: 'move', dest: must(scene.pace[(step / paceEvery) % scene.pace.length], 'pace point'), held: false });
    const acting: boolean[] = tracks.map((track: Track): boolean => track.monster.action !== null);
    stepWorld(world, commands, MOTION_DT);
    tracks.forEach((track: Track, index: number): void => {
      track.samples.push(sampleOf(track.monster, acting[index] ?? false));
    });
  }
  return { world, tracks };
}

function longestReach(world: World, monster: MonsterState): number {
  const ids: string[] = [monster.def.skill, ...(monster.def.boss?.phases.flatMap((phase) => phase.skills.map((entry) => entry.skill)) ?? [])];
  return Math.max(...ids.map((id: string): number => must(world.content.skills.get(id), id).engageRange));
}

function settled(world: World, track: Track): boolean {
  const monster: MonsterState = track.monster;
  const tail: MotionSample[] = track.samples.slice(-Math.round(LIMITS.settleTime / MOTION_DT));
  const still: boolean = tail.every((entry: MotionSample): boolean => !entry.moving || !entry.free);
  const reach: number = distance(monster.pos, world.player.pos) - world.player.radius;
  const inRange: boolean = reach <= longestReach(world, monster) + LIMITS.engageSlack && lineOfSight(world.grid, monster.pos, world.player.pos);
  return inRange || still;
}

function answersTheStep(switches: readonly number[], index: number): boolean {
  const at: number | undefined = switches[index];
  return at !== undefined && at >= LIMITS.callerClear && at - LIMITS.callerClear < LIMITS.flickerGap && switches.findIndex((other: number): boolean => other >= LIMITS.callerClear) === index;
}

function retreating(monster: MonsterState): boolean {
  return monster.stance === 'retreat';
}

for (const scene of SCENES) {
  for (const kind of KINDS) {
    void test(`${kind} moves without jitter: ${scene.name}`, (): void => {
      const { world, tracks } = run(scene, kind);
      const problems: string[] = [];
      for (const track of tracks) {
        const label: string = `#${track.monster.id}`;
        if (!isWalkable(world.grid, track.monster.pos.x, track.monster.pos.z)) problems.push(`${label} left walkable ground`);
        problems.push(...motionProblems(label, track.samples, LIMITS.turnRate));
        if (scene.pace.length === 0 && scene.monsters.length === 1 && !settled(world, track)) problems.push(`${label} neither reached the target nor stopped`);
      }
      assert.deepEqual(problems, []);
    });
  }
}

function strideHiccups(scene: Scene, kind: string, seed: number): number {
  const world: World = build(scene, kind, seed);
  const shown: string[] = world.monsters.map((): string => '');
  for (let step: number = 0; step < Math.round(LIMITS.seconds / MOTION_DT); step += 1) {
    world.player.life = world.player.maxLife;
    for (const monster of world.monsters) monster.life = monster.maxLife;
    stepWorld(world, [], MOTION_DT);
    world.monsters.forEach((monster: MonsterState, index: number): void => {
      shown[index] = `${shown[index] ?? ''}${monster.action !== null ? 'x' : monster.motion === 'stride' ? 's' : '.'}`;
    });
  }
  let count: number = 0;
  for (const line of shown) {
    const runs: string[] = line.match(/s+|\.+|x+/g) ?? [];
    runs.forEach((stretch: string, index: number): void => {
      const before: string = runs[index - 1] ?? '';
      const after: string = runs[index + 1] ?? '';
      if (stretch.startsWith('s') && stretch.length < LIMITS.hiccupStride && before.startsWith('.') && before.length >= LIMITS.stuckStand && after !== '' && !after.startsWith('s')) count += 1;
    });
  }
  return count;
}

void test('a ranged monster blocked in a crowd stands until its next cast instead of a short run between rests', (): void => {
  const crowd: Scene = must(SCENES.find((scene: Scene): boolean => scene.name === 'crowd converging'), 'crowd scene');
  for (const kind of ['mender', 'unfinished_thrower']) {
    for (const seed of [1, 2, 3, 4, 5, 6]) assert.equal(strideHiccups(crowd, kind, seed), 0, `${kind} seed ${String(seed)}`);
  }
});

void test('a caster backed against a wall stops instead of running in place', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  enterZone(world, sceneZone(base, 'test_blocked', { tiles: OPEN, props: [], start: { x: 4, z: 14 } }), { type: 'start' });
  world.monsters = [];
  const caster: MonsterState = spawn(world, 'mender', { x: 1.2, z: 14 });
  caster.stance = 'retreat';
  const samples: MotionSample[] = [];
  let pressed: number = 0;
  for (let step: number = 0; step < Math.round(LIMITS.blockedSeconds / MOTION_DT); step += 1) {
    world.player.life = world.player.maxLife;
    caster.cooldowns = { [caster.def.skill]: LIMITS.blockedSeconds };
    const before: Vec2 = { x: caster.pos.x, z: caster.pos.z };
    stepWorld(world, [], MOTION_DT);
    samples.push(sampleOf(caster, false));
    if (retreating(caster) && distance(before, caster.pos) < LIMITS.pressedStep) pressed += 1;
  }
  assert.deepEqual(motionProblems('caster', samples, LIMITS.turnRate), []);
  assert.ok(pressed * MOTION_DT <= LIMITS.pinnedRunTime, `backed into the wall for ${(pressed * MOTION_DT).toFixed(2)} s`);
});

void test('a monster pinned against a prop stops its run within a tenth of a second', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  enterZone(world, sceneZone(base, 'test_pinned', { tiles: OPEN, props: [placedProp('mossy_pillar', 14, 14)], start: { x: 14, z: 3 } }), { type: 'start' });
  world.monsters = [];
  const thrall: MonsterState = spawn(world, 'mended', { x: 14, z: 16.2 });
  let blockedSteps: number = 0;
  let runningWhileBlocked: number = 0;
  for (let step: number = 0; step < Math.round(1 / MOTION_DT); step += 1) {
    thrall.path = [{ x: 14, z: 14 }];
    thrall.repathTimer = LIMITS.seconds;
    const before: Vec2 = { x: thrall.pos.x, z: thrall.pos.z };
    stepWorld(world, [], MOTION_DT);
    if (distance(before, thrall.pos) > 1e-4) continue;
    blockedSteps += 1;
    if (thrall.moving) runningWhileBlocked += 1;
  }
  assert.ok(blockedSteps > 0);
  assert.ok(runningWhileBlocked * MOTION_DT <= LIMITS.pinnedRunTime, `ran for ${(runningWhileBlocked * MOTION_DT).toFixed(2)} s while pinned`);
});

void test('a stalker circles the hero at its orbit range while its leap recovers, smoothly, then leaps in', (): void => {
  const world: World = arena(8);
  const ghoul: MonsterState = place(world, 'test_ghoul', { x: ARENA_CENTRE.x + 10, z: ARENA_CENTRE.z });
  const orbit: number = ghoul.def.behaviour.type === 'stalker' ? ghoul.def.behaviour.orbitRange : 0;
  const samples: MotionSample[] = [];
  const gaps: number[] = [];
  let swept: number = 0;
  let last: number = Math.atan2(ghoul.pos.x - ARENA_CENTRE.x, ghoul.pos.z - ARENA_CENTRE.z);
  for (let step: number = 0; step < Math.round(4 / MOTION_DT); step += 1) {
    world.player.pos = { ...ARENA_CENTRE };
    world.player.life = world.player.maxLife;
    ghoul.cooldowns = { test_pounce: 1 };
    const acting: boolean = ghoul.action !== null;
    stepWorld(world, [], MOTION_DT);
    samples.push(sampleOf(ghoul, acting));
    const angle: number = Math.atan2(ghoul.pos.x - ARENA_CENTRE.x, ghoul.pos.z - ARENA_CENTRE.z);
    swept += Math.abs(Math.atan2(Math.sin(angle - last), Math.cos(angle - last)));
    last = angle;
    if (step * MOTION_DT > 2) gaps.push(distance(ghoul.pos, ARENA_CENTRE));
  }
  assert.deepEqual(motionProblems('ghoul', samples, LIMITS.turnRate), []);
  assert.ok(swept > 1, `it went round the hero (${swept.toFixed(2)} rad)`);
  assert.ok(Math.min(...gaps) > orbit - 2 && Math.max(...gaps) < orbit + 2.5, `it kept to its ring (${Math.min(...gaps).toFixed(1)} to ${Math.max(...gaps).toFixed(1)})`);
  ghoul.cooldowns = {};
  let leapt: boolean = false;
  for (let step: number = 0; step < Math.round(1 / MOTION_DT) && !leapt; step += 1) {
    world.player.pos = { ...ARENA_CENTRE };
    leapt = stepWorld(world, [], MOTION_DT).some((event): boolean => event.type === 'skill_start' && event.actorId === ghoul.id);
  }
  assert.ok(leapt, 'it leaps once the leap is ready');
});

void test('a ranged monster backs off from a hero who closes in and holds once clear, without flickering between the two', (): void => {
  const world: World = arena(9);
  const caller: MonsterState = place(world, 'test_caller', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  const retreat: number = caller.def.behaviour.type === 'ranged' ? caller.def.behaviour.retreatRange : 0;
  const switches: number[] = [];
  let stance = caller.stance;
  let retreated: boolean = false;
  for (let step: number = 0; step < Math.round(6 / MOTION_DT); step += 1) {
    caller.cooldowns = { test_mark: 1 };
    world.player.life = world.player.maxLife;
    const wobble: number = Math.sin(step * MOTION_DT * 9) * 0.6;
    const toward: Vec2 = { x: caller.pos.x - ARENA_CENTRE.x, z: caller.pos.z - ARENA_CENTRE.z };
    const gap: number = Math.hypot(toward.x, toward.z);
    const wanted: number = step * MOTION_DT < LIMITS.callerClear ? retreat - 0.5 + wobble : retreat + 2 + wobble;
    world.player.pos = { x: caller.pos.x - (toward.x / gap) * wanted, z: caller.pos.z - (toward.z / gap) * wanted };
    stepWorld(world, [], MOTION_DT);
    if (caller.stance === 'retreat') retreated = true;
    if (caller.stance !== stance) switches.push(step * MOTION_DT);
    stance = caller.stance;
  }
  assert.ok(retreated, 'it backed off');
  const flickers: number[] = switches.filter((at: number, index: number): boolean => at > LIMITS.settleTime / 4 && index > 0 && !answersTheStep(switches, index) && at - (switches[index - 1] ?? 0) < LIMITS.flickerGap);
  assert.deepEqual(flickers, [], `stance changed at ${switches.map((at: number): string => at.toFixed(2)).join(', ')}`);
});

void test('a summoner calls its own kind to its side, aggroed, and never more than its limit', (): void => {
  const world: World = arena(10);
  const mother: MonsterState = place(world, 'mended', { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z }, ['test_brood']);
  const summon = must(mother.def.summon, 'summon');
  for (let step: number = 0; step < Math.round((summon.cooldown * 3 + 1) / MOTION_DT); step += 1) {
    world.player.life = world.player.maxLife;
    mother.life = mother.maxLife;
    stepWorld(world, [], MOTION_DT);
  }
  const called: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.summonerId === mother.id);
  assert.equal(called.length, summon.limit);
  for (const minion of called) {
    assert.equal(minion.def.id, mother.def.id);
    assert.deepEqual(minion.def.mods, []);
    assert.equal(minion.aggro, true);
  }
});

void test('a summoned minion never summons in turn, even when its kind can', (): void => {
  const world: World = arena(12);
  const breeder: MonsterState = place(world, 'test_breeder', { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z });
  const summon = must(breeder.def.summon, 'summon');
  for (let step: number = 0; step < Math.round((summon.cooldown * 6) / MOTION_DT); step += 1) {
    world.player.life = world.player.maxLife;
    for (const monster of world.monsters) monster.life = monster.maxLife;
    stepWorld(world, [], MOTION_DT);
  }
  assert.equal(world.monsters.length, 1 + summon.limit);
  assert.ok(world.monsters.every((monster: MonsterState): boolean => monster.summonerId === null || monster.summonerId === breeder.id));
});

const POCKET = {
  spacing: 8,
  wake: 3,
  knockSpeed: 14,
  knockSeconds: 1,
  knockFrom: 1.2,
  strandSeconds: 4,
  strandSpeed: 2.5,
  scan: 0.25,
  unseen: 2,
} as const;

function joined(grid: NavGrid, from: Vec2, to: Vec2): boolean {
  const goal: Vec2 | null = nearestWalkable(grid, to, 8);
  return goal !== null && (lineWalkable(grid, from, goal) || findPath(grid, from, goal).length > 0);
}

void test('every pack in every zone stands on a cell the pathfinder can route, joined to the hero', (): void => {
  for (const zone of content.zones.values()) {
    const world: World = worldIn(content, content.world.start, 2);
    const grid: NavGrid = routedGrid(world.grid);
    for (const monster of world.monsters) {
      assert.ok(isWalkable(grid, monster.pos.x, monster.pos.z), `${zone.id}: ${monster.def.id} spawned in a sealed pocket at (${monster.pos.x.toFixed(2)}, ${monster.pos.z.toFixed(2)})`);
      assert.ok(joined(grid, monster.pos, world.player.pos), `${zone.id}: ${monster.def.id} at (${monster.pos.x.toFixed(2)}, ${monster.pos.z.toFixed(2)}) has no route to the hero`);
    }
  }
});

void test('every echo a Hall moment wakes stands on a routed cell joined to the middle of its bubble', (): void => {
  const hall: ZoneDef = must(content.zones.get('hall_of_time'), 'hall');
  let checked: number = 0;
  for (const def of content.moments.defs.values()) {
    for (let x: number = POCKET.spacing; x < (hall.tiles[0]?.length ?? 0) * hall.cellSize; x += POCKET.spacing) {
      for (let z: number = POCKET.spacing; z < hall.tiles.length * hall.cellSize; z += POCKET.spacing) {
        const world: World = worldIn(content, content.world.start, 2);
        world.monsters = [];
        world.moments = [];
        world.wake = null;
        const grid: NavGrid = routedGrid(world.grid);
        if (!isWalkable(grid, x, z)) continue;
        const moment = forceStrike(world, { x, z }, def.id);
        if (moment === null) continue;
        world.player.pos = { x: moment.pos.x, z: moment.pos.z };
        for (let step: number = 0; step < Math.round(POCKET.wake / MOTION_DT) && moment.phase !== 'awake'; step += 1) stepWorld(world, [], MOTION_DT);
        stepWorld(world, [], MOTION_DT);
        for (const echo of world.monsters.filter((monster: MonsterState): boolean => monster.alive)) {
          checked += 1;
          assert.ok(isWalkable(grid, echo.pos.x, echo.pos.z), `${def.id} at (${x}, ${z}): an echo woke in a sealed pocket at (${echo.pos.x.toFixed(2)}, ${echo.pos.z.toFixed(2)})`);
          assert.ok(joined(grid, echo.pos, moment.pos), `${def.id} at (${x}, ${z}): an echo at (${echo.pos.x.toFixed(2)}, ${echo.pos.z.toFixed(2)}) has no route into its bubble`);
        }
      }
    }
  }
  assert.ok(checked > 0);
});

void test('knocking a monster hard into any Hall prop never leaves it in a sealed pocket', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  world.monsters = [];
  world.wake = null;
  const grid: NavGrid = routedGrid(world.grid);
  for (const placed of world.zone.props) {
    const def = content.props.get(placed.prop);
    if (def === undefined || placed.when.length > 0) continue;
    const outlines: Blocker[] = propOutlines(def, placed.x, placed.z, placed.rotationDegrees);
    if (outlines.length === 0) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2]] as const) {
      let along: number = 0;
      while (along < 12 && Math.min(...outlines.map((outline: Blocker): number => blockerGap(outline, placed.x + dx * along, placed.z + dz * along))) < POCKET.knockFrom) along += POCKET.scan;
      const from: Vec2 = { x: placed.x + dx * along, z: placed.z + dz * along };
      if (!isWalkable(grid, from.x, from.z)) continue;
      world.monsters = [];
      const monster: MonsterState = spawn(world, 'mended', from);
      monster.pos = { ...from };
      monster.aggro = false;
      monster.knock = { x: -dx * POCKET.knockSpeed, z: -dz * POCKET.knockSpeed };
      for (let step: number = 0; step < Math.round(POCKET.knockSeconds / MOTION_DT); step += 1) stepWorld(world, [], MOTION_DT);
      assert.ok(isWalkable(grid, monster.pos.x, monster.pos.z), `${placed.prop} at (${placed.x}, ${placed.z}): a knock from (${from.x.toFixed(2)}, ${from.z.toFixed(2)}) left a monster sealed in at (${monster.pos.x.toFixed(2)}, ${monster.pos.z.toFixed(2)})`);
    }
  }
});

void test('a monster that ends up in a sealed pocket glides out to the nearest routed cell within a few seconds, never jumping', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  world.monsters = [];
  world.wake = null;
  const grid: NavGrid = routedGrid(world.grid);
  const unseen: number = must(content.monsters.get('mended'), 'mended').aggroRadius + POCKET.unseen;
  let pocket: Vec2 | null = null;
  for (let x: number = 0; x < world.grid.columns * world.grid.cellSize && pocket === null; x += POCKET.scan) {
    for (let z: number = 0; z < world.grid.rows * world.grid.cellSize && pocket === null; z += POCKET.scan) {
      if (isWalkable(world.grid, x, z) && !isWalkable(grid, x, z) && distance(world.player.pos, { x, z }) > unseen) pocket = { x, z };
    }
  }
  const start: Vec2 = must(pocket, 'a spot open to the hero but not routed');
  const monster: MonsterState = spawn(world, 'mended', start);
  monster.pos = { ...start };
  monster.aggro = false;
  let previous: Vec2 = { ...monster.pos };
  for (let step: number = 0; step < Math.round(POCKET.strandSeconds / MOTION_DT); step += 1) {
    stepWorld(world, [], MOTION_DT);
    assert.ok(distance(previous, monster.pos) <= POCKET.strandSpeed * MOTION_DT + 1e-6, 'the stranded monster jumped');
    previous = { ...monster.pos };
  }
  assert.ok(isWalkable(grid, monster.pos.x, monster.pos.z), `it is still sealed in at (${monster.pos.x.toFixed(2)}, ${monster.pos.z.toFixed(2)})`);
});

const ROUND = {
  tallFrom: 1.5,
  gap: 3,
  bearings: 12,
  seconds: 3,
  heroSnap: 2,
  kinds: ['first_brute', 'unfinished_colossus'],
} as const;

void test('a monster chasing round any tall Hall prop or wall corner slides along it and never stops for a stuck rest', (): void => {
  const world: World = worldIn(content, content.world.start, 2);
  world.wake = null;
  world.moments = [];
  const stalls: string[] = [];
  for (const placed of world.zone.props) {
    const def = content.props.get(placed.prop);
    if (def === undefined || placed.when.length > 0 || def.height < ROUND.tallFrom) continue;
    for (const kind of ROUND.kinds) {
      for (let bearing: number = 0; bearing < ROUND.bearings; bearing += 1) {
        const angle: number = (bearing / ROUND.bearings) * Math.PI * 2;
        world.monsters = [];
        const hero: Vec2 | null = nearestWalkable(world.grid, { x: placed.x + Math.cos(angle) * ROUND.gap, z: placed.z + Math.sin(angle) * ROUND.gap }, ROUND.heroSnap);
        const from: Vec2 | null = nearestWalkable(routedGrid(world.grid), { x: placed.x - Math.cos(angle) * ROUND.gap, z: placed.z - Math.sin(angle) * ROUND.gap }, ROUND.heroSnap);
        if (hero === null || from === null) continue;
        world.player.pos = { ...hero };
        const chaser: MonsterState = spawn(world, kind, from);
        chaser.pos = { ...from };
        chaser.lastPos = { ...from };
        let rest: number = 0;
        for (let step: number = 0; step < Math.round(ROUND.seconds / MOTION_DT) && chaser.action === null; step += 1) {
          world.player.life = world.player.maxLife;
          world.player.pos = { ...hero };
          stepWorld(world, [], MOTION_DT);
          if (chaser.restTime > rest) stalls.push(`${kind} round ${placed.prop} (${placed.x}, ${placed.z}) at bearing ${bearing}, stopped at (${chaser.pos.x.toFixed(2)}, ${chaser.pos.z.toFixed(2)})`);
          rest = chaser.restTime;
        }
      }
    }
  }
  assert.deepEqual(stalls, []);
});

void test('a mending monster heals only once it has gone a few seconds without being hit', (): void => {
  const mended: MonsterDef = must(ARENA_CONTENT.monsters.get('mended'), 'mended');
  const world: World = arena(2, { ...ARENA_CONTENT, monsters: new Map<string, MonsterDef>([...ARENA_CONTENT.monsters, ['mended', { ...mended, regen: 0.05 }]]) });
  const monster: MonsterState = place(world, 'mended', { x: ARENA_CENTRE.x + 7, z: ARENA_CENTRE.z });
  monster.aggro = false;
  world.player.invulnerable = 100;
  const hurt: number = monster.maxLife / 2;
  monster.life = hurt;
  const wait = (seconds: number): void => {
    for (let step: number = 0; step < Math.round(seconds / MOTION_DT); step += 1) stepWorld(world, [], MOTION_DT);
  };
  wait(3);
  assert.equal(monster.life, hurt);
  wait(3);
  assert.ok(monster.life > hurt);
  const healed: number = monster.life;
  applyHit(world, { ...offenceOf(world.player), damageMin: 1, damageMax: 1, damagePercent: 0, critChance: 0 }, monster, must(ARENA_CONTENT.skills.get('cleave'), 'cleave'), { x: 1, z: 0 });
  const struck: number = monster.life;
  assert.ok(struck < healed);
  wait(3);
  assert.equal(monster.life, struck);
});

void test('a pack named by id spawns around a spot as one pack at the area level, and an unknown id or no count spawns nothing', (): void => {
  const world: World = arena(3);
  const spot: Vec2 = { x: ARENA_CENTRE.x + 6, z: ARENA_CENTRE.z };
  const pack: MonsterState[] = spawnPackNear(world, 'wolf', 4, spot);
  assert.equal(pack.length, 4);
  assert.equal(new Set(pack.map((monster: MonsterState): number => monster.packId)).size, 1);
  assert.equal(new Set(pack.map((monster: MonsterState): number => monster.id)).size, 4);
  assert.ok(pack.every((monster: MonsterState): boolean => monster.def.id === 'wolf' && distance(monster.pos, spot) < 4 && monster.level === world.player.level));
  assert.deepEqual(spawnPackNear(world, 'no_such_beast', 3, spot), []);
  assert.deepEqual(spawnPackNear(world, 'wolf', 0, spot), []);
});

void test('the spawn command puts a pack a few strides in front of the hero', (): void => {
  const world: World = arena(4);
  world.player.facing = 0;
  stepWorld(world, [{ type: 'spawn', monster: 'wolf', count: 3 }], MOTION_DT);
  const wolves: MonsterState[] = world.monsters.filter((monster: MonsterState): boolean => monster.def.id === 'wolf');
  assert.equal(wolves.length, 3);
  for (const wolf of wolves) assert.ok(wolf.pos.z > world.player.pos.z + 3, `a wolf at ${wolf.pos.z.toFixed(1)} is not ahead of the hero at ${world.player.pos.z.toFixed(1)}`);
});

void test('a wolf circles, then springs across the gap and lands a bite that knocks the hero back with a shake and a hit-stop', (): void => {
  const world: World = arena(9);
  const wolf: MonsterState = place(world, 'wolf', { x: ARENA_CENTRE.x + 10, z: ARENA_CENTRE.z });
  let sprang: Vec2 | null = null;
  let bitten: boolean = false;
  for (let step: number = 0; step < Math.round(8 / MOTION_DT) && !bitten; step += 1) {
    world.player.pos = { ...ARENA_CENTRE };
    world.player.life = world.player.maxLife;
    const events = stepWorld(world, [], MOTION_DT);
    for (const event of events) {
      if (event.type === 'skill_start' && event.actorId === wolf.id) sprang = { ...wolf.pos };
      if (event.type === 'damage' && event.sourceId === wolf.id && event.targetId === world.player.id) {
        bitten = true;
        assert.ok(event.skill.leap !== null && event.skill.knockback > 0 && event.skill.shake > 0 && event.skill.hitStop > 0 && event.skill.vfx.impact !== null);
      }
    }
  }
  assert.ok(sprang !== null, 'the wolf never sprang');
  assert.ok(bitten, 'the wolf never bit');
  assert.ok(distance(sprang, ARENA_CENTRE) > 3, `it sprang from ${distance(sprang, ARENA_CENTRE).toFixed(1)} m, too close to call it a charge`);
  assert.ok(distance(wolf.pos, ARENA_CENTRE) < 2.5, `it landed ${distance(wolf.pos, ARENA_CENTRE).toFixed(1)} m away`);
});

function widestGap(angles: readonly number[]): number {
  const sorted: number[] = angles.toSorted((a: number, b: number): number => a - b);
  const first: number = must(sorted[0], 'an angle');
  const last: number = must(sorted.at(-1), 'an angle');
  return Math.max(first + Math.PI * 2 - last, ...sorted.slice(1).map((angle: number, index: number): number => angle - must(sorted[index], 'previous angle')));
}

void test('a swarm that comes from one side spreads round the hero, bites from all sides, and keeps to its ring while its bites recover', (): void => {
  const world: World = arena(9);
  const rats: MonsterState[] = Array.from({ length: 6 }, (_: unknown, index: number): MonsterState => place(world, 'rat', { x: ARENA_CENTRE.x + 9, z: ARENA_CENTRE.z - 2.5 + index }));
  const ring: number = must(rats[0], 'a rat').def.behaviour.type === 'swarm' ? 2.2 : 0;
  const biters: Set<number> = new Set<number>();
  const gaps: number[] = [];
  for (let step: number = 0; step < Math.round(8 / MOTION_DT); step += 1) {
    world.player.pos = { ...ARENA_CENTRE };
    world.player.life = world.player.maxLife;
    for (const event of stepWorld(world, [], MOTION_DT)) if (event.type === 'damage' && event.targetId === world.player.id) biters.add(event.sourceId);
    if (step * MOTION_DT > 4) gaps.push(widestGap(rats.map((rat: MonsterState): number => Math.atan2(rat.pos.x - ARENA_CENTRE.x, rat.pos.z - ARENA_CENTRE.z))));
  }
  assert.ok(ring > 0, 'the rat swarms');
  assert.ok(biters.size >= 5, `only ${biters.size} of 6 rats bit`);
  const open: number = gaps.reduce((sum: number, gap: number): number => sum + gap, 0) / gaps.length;
  assert.ok(open < 3.2, `the swarm kept an open side of ${open.toFixed(2)} rad on average, as a line of chasers keeps about 5.8`);
  for (const rat of rats) assert.ok(distance(rat.pos, ARENA_CENTRE) < ring + 2.5, `a rat strayed ${distance(rat.pos, ARENA_CENTRE).toFixed(1)} m out`);
});

void test('a spider waits unseen until the hero comes close, springs with a telegraphed leap, then backs off to wait for its next spring', (): void => {
  const world: World = arena(9);
  const spider: MonsterState = place(world, 'spider', { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z });
  const spring: number = spider.def.behaviour.type === 'ambush' ? spider.def.behaviour.spring : 0;
  spider.aggro = false;
  const wait = (seconds: number, hero: Vec2): WorldEvent[] => {
    const seen: WorldEvent[] = [];
    for (let step: number = 0; step < Math.round(seconds / MOTION_DT); step += 1) {
      world.player.pos = { ...hero };
      world.player.life = world.player.maxLife;
      seen.push(...stepWorld(world, [], MOTION_DT));
    }
    return seen;
  };
  wait(2, ARENA_CENTRE);
  assert.ok(spring > 0, 'the spider lies in ambush');
  assert.equal(spider.aggro, false, 'the spider woke at 8 m, outside its spring');
  assert.ok(distance(spider.pos, { x: ARENA_CENTRE.x + 8, z: ARENA_CENTRE.z }) < 0.05, 'the spider crept while it waited');
  const close: Vec2 = { x: ARENA_CENTRE.x + 8 - spring + 0.5, z: ARENA_CENTRE.z };
  const sprang: WorldEvent[] = wait(2.5, close);
  const start: WorldEvent | undefined = sprang.find((event: WorldEvent): boolean => event.type === 'skill_start' && event.actorId === spider.id);
  assert.ok(start?.type === 'skill_start' && start.skill.leap !== null && start.windup >= 1, 'the spider never sprang with a wind-up the hero can read');
  assert.ok(sprang.some((event: WorldEvent): boolean => event.type === 'damage' && event.sourceId === spider.id), 'the leap never landed');
  let farthest: number = 0;
  let again: boolean = false;
  for (let step: number = 0; step < 8; step += 1) {
    again ||= wait(0.5, close).some((event: WorldEvent): boolean => event.type === 'skill_start' && event.actorId === spider.id);
    if (!again) farthest = Math.max(farthest, distance(spider.pos, close));
  }
  assert.ok(farthest > spring - 1.5, `while its leap recovered the spider came no farther than ${farthest.toFixed(1)} m instead of backing off`);
  assert.ok(again, 'the spider never sprang a second time');
});

interface Lunge {
  readonly struck: boolean;
  readonly crossed: number;
  readonly lane: boolean;
}

function lungeAt(dodge: number): Lunge {
  const world: World = arena(10);
  const crawler: MonsterState = place(world, 'crawler', { x: ARENA_CENTRE.x + 5, z: ARENA_CENTRE.z });
  const from: Vec2 = { ...crawler.pos };
  let hero: Vec2 = { ...ARENA_CENTRE };
  let struck: boolean = false;
  let lane: boolean = false;
  for (let step: number = 0; step < Math.round(3 / MOTION_DT) && !struck; step += 1) {
    world.player.pos = { ...hero };
    world.player.life = world.player.maxLife;
    for (const event of stepWorld(world, [], MOTION_DT)) {
      if (event.type === 'skill_start' && event.actorId === crawler.id) {
        lane = event.skill.leap?.lane === true && event.windup >= 1;
        hero = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z + dodge };
      }
      if (event.type === 'damage' && event.sourceId === crawler.id) struck = true;
    }
  }
  return { struck, crossed: distance(from, crawler.pos), lane };
}

void test('a crawler lunges down a telegraphed lane: a hero who stays in it is struck, a hero who steps out of it is not', (): void => {
  const stood: Lunge = lungeAt(0);
  assert.ok(stood.lane, 'the lunge never showed its lane with a readable wind-up');
  assert.ok(stood.struck, 'the lunge missed a hero who stood in its lane');
  assert.ok(stood.crossed > 2.5, `the crawler only crossed ${stood.crossed.toFixed(1)} m`);
  assert.equal(lungeAt(3).struck, false, 'the lunge struck a hero who stepped out of its lane');
});
