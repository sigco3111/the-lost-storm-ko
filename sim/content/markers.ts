import type { Vec2 } from '../math.ts';
import type { ModelFootprint } from './footprints.ts';
import type { MarkerKind, MarkerLibrary, MarkerRole } from './marker-types.ts';
import { ContentError } from './read.ts';
import type { Content, ZoneDef, ZoneExit } from './types.ts';

export type PlaceRef = { readonly type: 'waypoint' } | { readonly type: 'exit'; readonly exit: string } | { readonly type: 'checkpoint'; readonly checkpoint: string };

export interface Place {
  readonly ref: PlaceRef;
  readonly role: MarkerRole;
  readonly kind: MarkerKind;
  readonly x: number;
  readonly z: number;
  readonly facing: Vec2 | null;
  readonly yaw: number;
}

export function exitRole(content: Content, zone: ZoneDef, exit: ZoneExit): MarkerRole {
  const target: ZoneDef | undefined = content.zones.get(exit.to);
  return target !== undefined && target.level > zone.level ? 'down' : 'up';
}

export function markerKind(content: Content, role: MarkerRole, named: string | null): MarkerKind | null {
  return content.markers.kinds.get(named ?? content.markers.roles[role]) ?? null;
}

export function markerFootprintKey(kind: MarkerKind): string {
  return `${kind.model}#${kind.solid.join('+')}`;
}

export function withMarkerFootprints(library: MarkerLibrary, footprints: ReadonlyMap<string, ModelFootprint>): MarkerLibrary {
  const kinds: Map<string, MarkerKind> = new Map<string, MarkerKind>();
  for (const [id, kind] of library.kinds) {
    if (kind.solid.length === 0) {
      kinds.set(id, kind);
      continue;
    }
    const measured: ModelFootprint | undefined = footprints.get(markerFootprintKey(kind));
    if (measured === undefined) throw new ContentError(`markers.${id}.solid`, `no footprint is measured under ${markerFootprintKey(kind)}; run node tools/prop-footprints.ts`);
    kinds.set(id, { ...kind, footprints: measured.outlines });
  }
  return { ...library, kinds };
}

export function placeYaw(library: MarkerLibrary, kind: MarkerKind, facing: Vec2 | null): number {
  return kind.facing === 'arrival' && facing !== null ? Math.atan2(facing.x, facing.z) : (library.cameraYawDegrees * Math.PI) / 180;
}

export function markerDressing(kind: MarkerKind, zone: ZoneDef): Readonly<Record<string, string>> {
  const dressed: Record<string, string> = { ...kind.surfaces };
  for (const [part, surface] of Object.entries(zone.markerSurfaces)) if (part in dressed) dressed[part] = surface;
  return dressed;
}

function towards(from: Vec2, to: Vec2): Vec2 | null {
  const dx: number = to.x - from.x;
  const dz: number = to.z - from.z;
  const length: number = Math.hypot(dx, dz);
  return length <= 0 ? null : { x: dx / length, z: dz / length };
}

export function zonePlaces(content: Content, zone: ZoneDef): Place[] {
  const places: Place[] = [];
  const add = (ref: PlaceRef, role: MarkerRole, named: string | null, x: number, z: number, facing: Vec2 | null): void => {
    const kind: MarkerKind | null = markerKind(content, role, named);
    if (kind !== null) places.push({ ref, role, kind, x, z, facing, yaw: placeYaw(content.markers, kind, facing) });
  };
  if (zone.waypoint !== null) add({ type: 'waypoint' }, 'waypoint', zone.waypoint.marker, zone.waypoint.x, zone.waypoint.z, null);
  for (const exit of zone.kind === 'void' ? [] : zone.exits) {
    if (exit.look === 'mist') continue;
    add({ type: 'exit', exit: exit.id }, exitRole(content, zone, exit), exit.marker, exit.x, exit.z, towards(exit, exit.arrival));
  }
  for (const checkpoint of zone.checkpoints) add({ type: 'checkpoint', checkpoint: checkpoint.id }, 'checkpoint', checkpoint.marker, checkpoint.x, checkpoint.z, null);
  return places;
}

export function placeKey(ref: PlaceRef): string {
  if (ref.type === 'waypoint') return 'waypoint';
  return ref.type === 'exit' ? `exit:${ref.exit}` : `checkpoint:${ref.checkpoint}`;
}

export function samePlace(a: PlaceRef | null, b: PlaceRef | null): boolean {
  return a === null || b === null ? a === b : placeKey(a) === placeKey(b);
}

export function zoneMarkerModels(content: Content, zone: ZoneDef): string[] {
  return zonePlaces(content, zone).map((place: Place): string => place.kind.model);
}

export function zoneMarkerSurfaces(content: Content, zone: ZoneDef): string[] {
  return zonePlaces(content, zone).flatMap((place: Place): string[] => Object.values(markerDressing(place.kind, zone)));
}

export function markerProblems(content: Content): string[] {
  const problems: string[] = [];
  for (const kind of content.markers.kinds.values()) {
    for (const surface of Object.values(kind.surfaces)) if (!content.surfaces.has(surface)) problems.push(`marker ${kind.id} dresses in unknown surface ${surface}`);
    for (const part of kind.glow) if (part in kind.surfaces) problems.push(`marker ${kind.id} both dresses and lights its ${part}`);
    for (const part of kind.solid) if (!(part in kind.surfaces)) problems.push(`marker ${kind.id} stands solid on ${part}, which is not one of its dressed parts`);
  }
  for (const zone of content.zones.values()) {
    for (const surface of Object.values(zone.markerSurfaces)) if (!content.surfaces.has(surface)) problems.push(`zone ${zone.id} dresses its markers in unknown surface ${surface}`);
    const named: { readonly at: string; readonly id: string | null }[] = [{ at: 'waypoint', id: zone.waypoint?.marker ?? null }, ...zone.exits.map((exit: ZoneExit): { readonly at: string; readonly id: string | null } => ({ at: `exit ${exit.id}`, id: exit.marker })), ...zone.checkpoints.map((point): { readonly at: string; readonly id: string | null } => ({ at: `checkpoint ${point.id}`, id: point.marker }))];
    for (const entry of named) if (entry.id !== null && !content.markers.kinds.has(entry.id)) problems.push(`zone ${zone.id} ${entry.at} names unknown marker kind ${entry.id}`);
  }
  return problems;
}
