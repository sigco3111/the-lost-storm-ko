import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finishQuests, must, withoutGlitches } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef, ZoneWaypoint } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { Blocker } from '../nav/grid.ts';
import { blockerGap, isWalkable, nearestWalkable } from '../nav/grid.ts';
import { markerBodies } from '../nav/marker-bodies.ts';
import { createWorld } from './create.ts';
import { choicesOpen } from './death.ts';
import { stepWorld } from './step.ts';
import type { World } from './types.ts';
import { onWaypoint } from './waypoints.ts';
import { enterZone } from './zones.ts';

const content: Content = loadContent();
const waypointZones: ZoneDef[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.waypoint !== null);
const DT: number = 1 / 60;
const LIMIT: number = 20;
const BEHIND: number = 3.4;

function arrived(zone: ZoneDef): World {
  const world: World = withoutGlitches(finishQuests(createWorld(content, { seed: 5, save: null })));
  enterZone(world, zone, { type: 'waypoint' });
  world.monsters = [];
  world.events = [];
  return world;
}

function inside(bodies: readonly Blocker[], at: Vec2): boolean {
  return bodies.some((body: Blocker): boolean => blockerGap(body, at.x, at.z) < 0);
}

void test('a hero who arrives by waypoint stands on open ground beside the monument, on the waypoint', (): void => {
  for (const zone of waypointZones) {
    const world: World = arrived(zone);
    const at: Vec2 = world.player.pos;
    assert.ok(isWalkable(world.grid, at.x, at.z), `${zone.id}: the hero arrives inside the monument at ${at.x},${at.z}`);
    assert.ok(onWaypoint(world), `${zone.id}: the hero arrives off the waypoint`);
  }
});

void test('a hero who arrives through an exit stands exactly on its arrival spot', (): void => {
  for (const zone of waypointZones) {
    const exit = zone.exits[0];
    if (exit === undefined) continue;
    const world: World = withoutGlitches(finishQuests(createWorld(content, { seed: 5, save: null })));
    enterZone(world, zone, { type: 'exit', exit: exit.id });
    assert.deepEqual(world.player.pos, { x: exit.arrival.x, z: exit.arrival.z }, zone.id);
  }
});

void test('a hero sent to the waypoint from behind its monument walks around it and ends on the waypoint', (): void => {
  for (const zone of waypointZones) {
    const world: World = arrived(zone);
    const point: ZoneWaypoint = must(zone.waypoint, `${zone.id} waypoint`);
    const bodies: Blocker[] = markerBodies(content, zone);
    const yaw: number = (content.markers.cameraYawDegrees * Math.PI) / 180;
    const back: Vec2 | null = nearestWalkable(world.grid, { x: point.x - Math.sin(yaw) * BEHIND, z: point.z - Math.cos(yaw) * BEHIND }, BEHIND);
    if (back === null) continue;
    world.player.pos = back;
    assert.equal(onWaypoint(world), false, `${zone.id}: the spot behind the monument is already on the waypoint`);
    let reached: boolean = false;
    for (let step: number = 0; step < Math.round(LIMIT / DT) && !reached; step += 1) {
      stepWorld(world, step === 0 ? [{ type: 'move', held: false, dest: { x: point.x, z: point.z } }] : choicesOpen(world) ? [{ type: 'respawn', choice: 'checkpoint' }] : [], DT);
      assert.equal(inside(bodies, world.player.pos), false, `${zone.id}: the hero walked into the monument at ${world.player.pos.x},${world.player.pos.z}`);
      reached = onWaypoint(world);
    }
    assert.ok(reached, `${zone.id}: the hero never reached the waypoint from behind its monument`);
  }
});
