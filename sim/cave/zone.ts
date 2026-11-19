import type { Fields } from '../content/read.ts';
import { fields } from '../content/read.ts';
import type { Condition } from '../content/condition-types.ts';
import type { Vec2 } from '../math.ts';
import type { CaveLayout, CavePack } from './generate.ts';
import type { CaveKit } from './kit.ts';

export const CAVE_ZONE = {
  exitRadius: 2.2,
  checkpointRadius: 2.5,
  waypointRadius: 1.8,
} as const;

export interface CaveDoor {
  readonly id: string;
  readonly to: string;
  readonly toExit: string;
  readonly requires: readonly Condition[];
  readonly lockedHint: string;
  readonly hiddenWhenLocked: boolean;
}

export interface CaveNaming {
  readonly id: string;
  readonly name: string;
  readonly up: CaveDoor;
  readonly down: CaveDoor | null;
}

function rounded(point: Vec2): Vec2 {
  return { x: Math.round(point.x * 10) / 10, z: Math.round(point.z * 10) / 10 };
}

export function packRecord(pack: CavePack): Record<string, unknown> {
  const base: Record<string, unknown> = { x: pack.x, z: pack.z, members: pack.members.map((member): Record<string, unknown> => ({ monster: member.monster, count: member.count })), level: pack.level };
  const waiting: Record<string, unknown> = pack.waits === null ? base : { ...base, waits: { near: pack.waits } };
  return pack.rank === null ? waiting : { ...waiting, rank: pack.rank };
}

function exitRecord(door: CaveDoor, at: Vec2, arrival: Vec2): Record<string, unknown> {
  return { id: door.id, ...rounded(at), radius: CAVE_ZONE.exitRadius, to: door.to, toExit: door.toExit, arrival: rounded(arrival), requires: door.requires, lockedHint: door.lockedHint, hiddenWhenLocked: door.hiddenWhenLocked };
}

export function caveZoneRecord(layout: CaveLayout, naming: CaveNaming, kit: CaveKit): Record<string, unknown> {
  const terrain: Fields = fields(kit.zone['terrain'], `kit ${kit.id}.zone.terrain`);
  const levels: readonly number[] = layout.packs.map((pack: CavePack): number => pack.level);
  return {
    kind: 'wild',
    ranks: true,
    ...kit.zone,
    id: naming.id,
    name: naming.name,
    level: Math.min(...levels),
    levelUpTo: Math.max(...levels),
    cellSize: layout.cellSize,
    floorHeight: 0,
    tiles: layout.tiles,
    terrain: { ...terrain, levels: layout.levels },
    playerStart: rounded(layout.start),
    props: layout.props,
    tunnels: [],
    falls: [],
    packs: layout.packs.map(packRecord),
    exits: [exitRecord(naming.up, layout.entrance, layout.start), ...(naming.down === null ? [] : [exitRecord(naming.down, layout.descent, layout.descentArrival)])],
    checkpoints: layout.checkpoints.map((point: Vec2, at: number): Record<string, unknown> => ({ id: `${naming.id}_c${at + 1}`, ...rounded(point), radius: CAVE_ZONE.checkpointRadius })),
    waypoint: { ...rounded(layout.waypoint), radius: CAVE_ZONE.waypointRadius },
    deathReturn: null,
    npcs: [],
  };
}
