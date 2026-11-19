import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { roadWorld, roadZone } from '../../test/road-support.ts';
import { loadContent } from '../content/content.ts';
import type { Vec2 } from '../math.ts';
import { separateActors } from './movement.ts';
import { spawnPackNear, spawnPacks } from './monsters.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World } from './types.ts';

const CLUMP = {
  zone: 'ledger_hall',
  monster: 'timekeeper_rank',
  count: 7,
  spawn: { x: 99, z: 46 },
  hero: { x: 110, z: 67 },
  seconds: 12,
  dt: 1 / 60,
  far: 12,
  mostFar: 1,
} as const;

void test('a striding body that only brushes a neighbour at a slant keeps its step and sheds just the part that pressed in', (): void => {
  const world: World = roadWorld(roadZone({ tiles: ['wwwwwwww', 'wwwwwwww', 'wwwwwwww', 'wwwwwwww'] }));
  world.zone = { ...world.zone, packs: [{ x: 10, z: 8, members: [{ monster: 'mended', count: 2, mods: [] }], when: [] }] };
  spawnPacks(world);
  const walker: MonsterState = must(world.monsters[0], 'walker');
  const neighbour: MonsterState = must(world.monsters[1], 'neighbour');
  const touching: number = walker.radius + neighbour.radius - 0.05;
  walker.pos = { x: 10, z: 8 };
  neighbour.pos = { x: 10 - touching, z: 8.15 };
  world.player.pos = { x: 30, z: 8 };
  walker.motion = 'stride';
  neighbour.motion = 'stride';
  const step: Vec2 = { x: 0, z: 0.1 };
  separateActors(world, 1 / 60, new Map([[walker, step], [neighbour, { x: 0, z: 0 }]]));
  assert.ok(walker.pos.z > 8 - step.z / 4, `the walker kept most of his step past the neighbour: ${walker.pos.z.toFixed(3)}`);
  assert.ok(walker.pos.x >= 10, `the walker only ever sheds away from the neighbour: ${walker.pos.x.toFixed(3)}`);
});

void test('a pack spawned in a clump against a Columned Hall wall untangles and reaches the hero instead of locking in place', (): void => {
  const world: World = worldIn(loadContent(), CLUMP.zone, 7);
  for (const monster of world.monsters) monster.alive = false;
  world.player.maxLife = 1e6;
  const pack: MonsterState[] = spawnPackNear(world, CLUMP.monster, CLUMP.count, CLUMP.spawn);
  for (const monster of pack) monster.aggro = true;
  for (let tick: number = 0; tick < CLUMP.seconds / CLUMP.dt; tick += 1) {
    world.player.life = world.player.maxLife;
    world.player.pos = { x: CLUMP.hero.x, z: CLUMP.hero.z };
    stepWorld(world, [], CLUMP.dt);
  }
  const stuck: MonsterState[] = pack.filter((monster: MonsterState): boolean => Math.hypot(monster.pos.x - CLUMP.hero.x, monster.pos.z - CLUMP.hero.z) > CLUMP.far);
  assert.ok(stuck.length <= CLUMP.mostFar, `${stuck.length} of ${CLUMP.count} still stand where they spawned: ${stuck.map((monster: MonsterState): string => `${monster.pos.x.toFixed(1)},${monster.pos.z.toFixed(1)}`).join(' ')}`);
});
