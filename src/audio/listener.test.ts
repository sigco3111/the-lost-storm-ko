import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arena, ARENA_CENTRE } from '../../test/arena-support.ts';
import { must } from '../../test/support.ts';
import type { Vec2 } from '../../sim/math.ts';
import type { World } from '../../sim/world/types.ts';
import type { Listener } from './listener.ts';
import { locateNear } from './listener.ts';
import type { Placement } from './mix.ts';
import type { StingerLocator } from './system.ts';

function ventedArena(): World {
  const world: World = arena(1);
  const tile: string = must(Object.keys(world.zone.floors)[0], 'floor tile');
  world.zone = { ...world.zone, floors: { ...world.zone.floors, [tile]: 'vent_bed' } };
  world.monsters = [];
  return world;
}

void test('a sound tied to a surface is placed at the nearest cell of it, measured from where the hero stands now', (): void => {
  const world: World = ventedArena();
  const heard: Vec2[] = [];
  const listener: Listener = (position: Vec2): Placement | null => {
    heard.push(position);
    return { gain: 1, pan: 0 };
  };
  const locate: StingerLocator = locateNear(listener, (): World => world);
  world.player.pos = { x: ARENA_CENTRE.x, z: ARENA_CENTRE.z };
  assert.deepEqual(locate({ surfaces: ['vent_bed'], reach: 10 }), { gain: 1, pan: 0 });
  const first: Vec2 = must(heard[0], 'first place');
  assert.ok(Math.hypot(first.x - ARENA_CENTRE.x, first.z - ARENA_CENTRE.z) <= world.zone.cellSize);
  assert.equal(locate({ surfaces: ['lava_bed'], reach: 10 }), null);
  assert.equal(heard.length, 1);
});
