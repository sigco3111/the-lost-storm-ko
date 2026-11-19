import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import { distance } from '../math.ts';
import { stepWorld } from './step.ts';
import type { MonsterState, World } from './types.ts';

const DOORWAY = {
  zone: 'ledger_court',
  clock: 'count_clock_a',
  clockAt: { x: 18.82, z: 30.83 },
  start: { x: 19, z: 32 },
  goal: { x: 19, z: 26 },
  seconds: 2,
  dt: 1 / 60,
  arrived: 0.5,
} as const;

void test('a hero clicking past a Standing Clock in the Inner Hall doorway walks round it instead of stopping dead against it', (): void => {
  const world: World = worldIn(loadContent(), DOORWAY.zone, 7);
  const clock: MonsterState = must(world.monsters.find((monster: MonsterState): boolean => monster.def.id === DOORWAY.clock && monster.pos.z > DOORWAY.goal.z), 'the doorway clock');
  clock.pos = { x: DOORWAY.clockAt.x, z: DOORWAY.clockAt.z };
  world.player.pos = { x: DOORWAY.start.x, z: DOORWAY.start.z };
  stepWorld(world, [{ type: 'move', held: false, dest: DOORWAY.goal }], DOORWAY.dt);
  for (let tick: number = 0; tick < DOORWAY.seconds / DOORWAY.dt; tick += 1) stepWorld(world, [], DOORWAY.dt);
  assert.ok(distance(world.player.pos, DOORWAY.goal) < DOORWAY.arrived, `the hero stopped at ${world.player.pos.x.toFixed(2)},${world.player.pos.z.toFixed(2)}`);
  assert.deepEqual(clock.pos, DOORWAY.clockAt);
});
