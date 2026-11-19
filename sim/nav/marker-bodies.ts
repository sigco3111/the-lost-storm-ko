import type { Place } from '../content/markers.ts';
import { zonePlaces } from '../content/markers.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import type { Blocker, NavGrid } from './grid.ts';
import { buildNavGrid, outlineBlockers, withBodies } from './grid.ts';

export function markerBodies(content: Content, zone: ZoneDef): Blocker[] {
  return zonePlaces(content, zone).flatMap((place: Place): Blocker[] => outlineBlockers(place.kind.footprints, place.x, place.z, place.yaw));
}

export function zoneGrid(content: Content, zone: ZoneDef): NavGrid {
  return withBodies(buildNavGrid(zone, content.props, content.surfaces, content.player.radius), markerBodies(content, zone));
}
