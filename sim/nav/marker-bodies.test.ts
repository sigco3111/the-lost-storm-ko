import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Place } from '../content/markers.ts';
import { zonePlaces } from '../content/markers.ts';
import type { Content, ZoneDef, ZoneWaypoint } from '../content/types.ts';
import type { ReadonlyVec2, Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import type { Blocker, NavGrid } from './grid.ts';
import { blockerGap, bodyGap, buildNavGrid, isWalkable, nearestWalkable } from './grid.ts';
import { markerBodies, zoneGrid } from './marker-bodies.ts';
import { inRegion, walkRegion } from './region.ts';
import type { WalkRegion } from './region.ts';

const content: Content = loadContent();
const waypointZones: ZoneDef[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.waypoint !== null);
const FLAGSTONE: ReadonlyVec2 = { x: 0, z: 1.45 };

function waypointPlace(zone: ZoneDef): Place {
  return must(zonePlaces(content, zone).find((place: Place): boolean => place.ref.type === 'waypoint'), `${zone.id} waypoint`);
}

function onModel(place: Place, point: ReadonlyVec2): Vec2 {
  return { x: place.x + point.x * Math.cos(place.yaw) + point.z * Math.sin(place.yaw), z: place.z - point.x * Math.sin(place.yaw) + point.z * Math.cos(place.yaw) };
}

function middle(outline: readonly ReadonlyVec2[]): Vec2 {
  return { x: outline.reduce((sum: number, point: ReadonlyVec2): number => sum + point.x, 0) / outline.length, z: outline.reduce((sum: number, point: ReadonlyVec2): number => sum + point.z, 0) / outline.length };
}

void test('the default waypoint names its monument as solid and has a measured footprint', (): void => {
  const kind = must(content.markers.kinds.get(content.markers.roles.waypoint), 'waypoint kind');
  assert.deepEqual(kind.solid, ['monument']);
  assert.ok(kind.footprints.length > 0);
});

void test('the hero cannot walk into the waypoint monument in any zone that has a waypoint', (): void => {
  assert.ok(waypointZones.length > 0);
  for (const zone of waypointZones) {
    const place: Place = waypointPlace(zone);
    const bodies: Blocker[] = markerBodies(content, zone);
    assert.equal(bodies.length, place.kind.footprints.length, zone.id);
    const grid: NavGrid = zoneGrid(content, zone);
    for (const outline of place.kind.footprints) {
      const inside: Vec2 = onModel(place, middle(outline));
      assert.equal(isWalkable(grid, inside.x, inside.z), false, `${zone.id}: the monument at ${inside.x},${inside.z} is walkable`);
      assert.ok(bodyGap(grid, inside.x, inside.z) < 0, `${zone.id}: the hero's body does not feel the monument at ${inside.x},${inside.z}, so he cannot slide along it`);
    }
  }
});

void test('the monument turns with the model it is drawn on', (): void => {
  const zone: ZoneDef = must(waypointZones[0], 'a waypoint zone');
  const place: Place = waypointPlace(zone);
  const body: Blocker = must(markerBodies(content, zone)[0], 'a body');
  const outline: readonly ReadonlyVec2[] = must(place.kind.footprints[0], 'an outline');
  const centre: Vec2 = onModel(place, middle(outline));
  assert.ok(blockerGap(body, centre.x, centre.z) < 0);
  assert.equal(place.yaw, (content.markers.cameraYawDegrees * Math.PI) / 180);
});

void test('the flagstone base in front of the monument stays walkable wherever the floor is', (): void => {
  let checked: number = 0;
  for (const zone of waypointZones) {
    const place: Place = waypointPlace(zone);
    const stone: Vec2 = onModel(place, FLAGSTONE);
    const plain: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
    if (!isWalkable(plain, stone.x, stone.z)) continue;
    checked += 1;
    assert.ok(isWalkable(zoneGrid(content, zone), stone.x, stone.z), `${zone.id}: the flagstone at ${stone.x},${stone.z} is blocked`);
  }
  assert.ok(checked > 0);
});

void test('the waypoint can be reached from wherever the hero arrives, standing beside its monument', (): void => {
  for (const zone of waypointZones) {
    const point: ZoneWaypoint = must(zone.waypoint, `${zone.id} waypoint`);
    const grid: NavGrid = zoneGrid(content, zone);
    for (const from of [zone.playerStart, ...zone.exits.map((exit): ReadonlyVec2 => exit.arrival)]) {
      const region: WalkRegion = walkRegion(grid, from);
      const beside: Vec2 | null = nearestWalkable(grid, point, point.radius, (at: Vec2): boolean => inRegion(region, at));
      assert.ok(beside !== null && distance(beside, point) <= point.radius, `${zone.id}: the waypoint cannot be reached from ${from.x},${from.z}`);
    }
  }
});

void test('a marker with no solid part stands in nobody\'s way', (): void => {
  const zone: ZoneDef = must(waypointZones[0], 'a waypoint zone');
  const point: ZoneWaypoint = must(zone.waypoint, 'waypoint');
  const open: ZoneDef = { ...zone, waypoint: { ...point, marker: 'waypoint' } };
  assert.deepEqual(must(content.markers.kinds.get('waypoint'), 'dais').solid, []);
  const stampedHere: boolean = zonePlaces(content, open).some((place: Place): boolean => place.kind.solid.length > 0 && distance(place, point) < 1e-9);
  assert.equal(stampedHere, false);
  const plain: NavGrid = buildNavGrid(open, content.props, content.surfaces, content.player.radius);
  assert.equal(isWalkable(zoneGrid(content, open), point.x, point.z), isWalkable(plain, point.x, point.z));
});
