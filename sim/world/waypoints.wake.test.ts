import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneWaypoint } from '../content/types.ts';
import type { World } from './types.ts';
import { onWaypoint, stepWaypoints, wakeRadius } from './waypoints.ts';

const content: Content = loadContent();

function asleepAt(offset: number): World {
  const world: World = worldIn(content, 'under_hall', 3);
  const waypoint: ZoneWaypoint = must(world.zone.waypoint, 'caves waypoint');
  world.waypoints.splice(0, world.waypoints.length);
  world.respawn = { type: 'start' };
  world.player.pos = { x: waypoint.x + offset, z: waypoint.z };
  world.events = [];
  return world;
}

void test('a waypoint wakes when the hero walks near it, beyond the spot he must stand on to travel', (): void => {
  const probe: World = asleepAt(0);
  const waypoint: ZoneWaypoint = must(probe.zone.waypoint, 'caves waypoint');
  const reach: number = wakeRadius(probe, waypoint);
  assert.ok(reach > waypoint.radius + 1);
  const near: World = asleepAt((waypoint.radius + reach) / 2);
  assert.equal(onWaypoint(near), false);
  stepWaypoints(near);
  assert.deepEqual(near.waypoints, ['under_hall']);
  assert.deepEqual(near.events, [{ type: 'waypoint_unlocked', zone: 'under_hall' }]);
  assert.deepEqual(near.respawn, { type: 'start' });
});

void test('a waypoint stays asleep while the hero is still out of its reach, and wakes only once', (): void => {
  const far: World = asleepAt(5.5);
  stepWaypoints(far);
  assert.deepEqual(far.waypoints, []);
  assert.deepEqual(far.events, []);
  const near: World = asleepAt(2.5);
  stepWaypoints(near);
  stepWaypoints(near);
  assert.equal(near.events.length, 1);
});
