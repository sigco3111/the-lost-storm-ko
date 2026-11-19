import raw from '../../data/lobby-sets.json' with { type: 'json' };
import type { Fields } from '../../sim/content/read.ts';
import { byId, choice, colour, ContentError, each, fields, nullableText, numeric, positive, share, text } from '../../sim/content/read.ts';
import type { Mound } from './lobby-ground.ts';

export const SKYLINE_KINDS = ['block', 'broken', 'tower', 'ruin', 'spire', 'gable', 'wall', 'hill', 'cliff'] as const;
export type SkylineKind = (typeof SKYLINE_KINDS)[number];

export interface SetPiece {
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly yawDegrees: number;
  readonly pitchDegrees: number;
  readonly rollDegrees: number;
  readonly size: number;
  readonly sink: number;
  readonly mound: boolean;
  readonly swayDegrees: number;
  readonly skirt: boolean;
}

export interface SkylinePiece {
  readonly kind: SkylineKind;
  readonly angleDegrees: number;
  readonly width: number;
  readonly height: number;
  readonly lit: number;
}

export interface Skyline {
  readonly radius: number;
  readonly sink: number;
  readonly color: string;
  readonly pieces: readonly SkylinePiece[];
}

export interface Rubble {
  readonly prop: string;
  readonly count: number;
  readonly sizeMin: number;
  readonly sizeMax: number;
  readonly from: number;
  readonly to: number;
  readonly minRadius: number;
}

export interface Skirt {
  readonly height: number;
  readonly contact: number;
  readonly darken: number;
  readonly hue: number;
  readonly rubble: Rubble | null;
}

export interface Flash {
  readonly everyMin: number;
  readonly everyMax: number;
  readonly strength: number;
}

export interface Roost {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly size: number;
}

export interface Glow {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly size: number;
  readonly color: string;
  readonly strength: number;
}

export interface Lamp {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: string;
  readonly intensity: number;
  readonly distance: number;
  readonly flicker: number;
}

export interface LobbySet {
  readonly id: string;
  readonly ground: string;
  readonly stone: string | null;
  readonly shadows: boolean;
  readonly shade: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly haze: number;
  readonly pieces: readonly SetPiece[];
  readonly skylines: readonly Skyline[];
  readonly skirt: Skirt | null;
  readonly flash: Flash | null;
  readonly roosts: readonly Roost[];
  readonly glows: readonly Glow[];
  readonly lamps: readonly Lamp[];
}

export interface LobbySets {
  readonly chosen: string;
  readonly zones: ReadonlyMap<string, string>;
  readonly sets: ReadonlyMap<string, LobbySet>;
}

export const LOBBY_SET_PICK = { query: 'lobby-set', skylineColor: '#05070b' } as const;

function optional(source: Fields, key: string, fallback: number, where: string): number {
  return source[key] === undefined ? fallback : numeric(source, key, where);
}

function readPiece(value: unknown, where: string): SetPiece {
  const source: Fields = fields(value, where);
  return {
    prop: text(source, 'prop', where),
    x: numeric(source, 'x', where),
    z: numeric(source, 'z', where),
    y: optional(source, 'y', 0, where),
    yawDegrees: optional(source, 'yaw', 0, where),
    pitchDegrees: optional(source, 'pitch', 0, where),
    rollDegrees: optional(source, 'roll', 0, where),
    size: source['size'] === undefined ? 1 : positive(source, 'size', where),
    sink: optional(source, 'sink', 0, where),
    mound: source['mound'] === true,
    swayDegrees: optional(source, 'sway', 0, where),
    skirt: source['skirt'] !== false,
  };
}

function readSkylinePiece(value: unknown, where: string): SkylinePiece {
  const source: Fields = fields(value, where);
  return { kind: choice(source, 'kind', SKYLINE_KINDS, where), angleDegrees: numeric(source, 'angle', where), width: positive(source, 'width', where), height: positive(source, 'height', where), lit: optional(source, 'lit', 0, where) };
}

function readSkyline(value: unknown, where: string): Skyline {
  const source: Fields = fields(value, where);
  return { radius: positive(source, 'radius', where), sink: optional(source, 'sink', 0, where), color: source['color'] === undefined ? LOBBY_SET_PICK.skylineColor : colour(source, 'color', where), pieces: each(source['pieces'], `${where} pieces`, readSkylinePiece) };
}

function readRubble(value: unknown, where: string): Rubble | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  const rubble: Rubble = {
    prop: text(source, 'prop', where),
    count: positive(source, 'count', where),
    sizeMin: positive(source, 'sizeMin', where),
    sizeMax: positive(source, 'sizeMax', where),
    from: positive(source, 'from', where),
    to: positive(source, 'to', where),
    minRadius: positive(source, 'minRadius', where),
  };
  if (rubble.sizeMax < rubble.sizeMin || rubble.to < rubble.from) throw new ContentError(where, 'a rubble range runs backwards');
  return rubble;
}

function readSkirt(value: unknown, where: string): Skirt | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  return { height: positive(source, 'height', where), contact: positive(source, 'contact', where), darken: share(source, 'darken', where), hue: share(source, 'hue', where), rubble: readRubble(source['rubble'], `${where} rubble`) };
}

function readFlash(value: unknown, where: string): Flash | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  const flash: Flash = { everyMin: positive(source, 'everyMin', where), everyMax: positive(source, 'everyMax', where), strength: share(source, 'strength', where) };
  if (flash.everyMax < flash.everyMin) throw new ContentError(where, 'everyMax is below everyMin');
  return flash;
}

function readRoost(value: unknown, where: string): Roost {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), y: numeric(source, 'y', where), z: numeric(source, 'z', where), size: positive(source, 'size', where) };
}

function readGlow(value: unknown, where: string): Glow {
  const source: Fields = fields(value, where);
  return { x: numeric(source, 'x', where), y: numeric(source, 'y', where), z: numeric(source, 'z', where), size: positive(source, 'size', where), color: colour(source, 'color', where), strength: share(source, 'strength', where) };
}

function readLamp(value: unknown, where: string): Lamp {
  const source: Fields = fields(value, where);
  return {
    x: numeric(source, 'x', where),
    y: numeric(source, 'y', where),
    z: numeric(source, 'z', where),
    color: colour(source, 'color', where),
    intensity: positive(source, 'intensity', where),
    distance: positive(source, 'distance', where),
    flicker: source['flicker'] === undefined ? 0 : share(source, 'flicker', where),
  };
}

function readSet(value: unknown, where: string): LobbySet {
  const source: Fields = fields(value, where);
  const id: string = text(source, 'id', where);
  const at: string = `${where} ${id}`;
  const set: LobbySet = {
    id,
    ground: text(source, 'ground', at),
    stone: nullableText(source, 'stone', at),
    shadows: source['shadows'] === true,
    shade: positive(source, 'shade', at),
    fogNear: positive(source, 'fogNear', at),
    fogFar: positive(source, 'fogFar', at),
    haze: share(source, 'haze', at),
    pieces: each(source['pieces'], `${at} pieces`, readPiece),
    skylines: source['skylines'] === undefined ? [] : each(source['skylines'], `${at} skylines`, readSkyline),
    skirt: readSkirt(source['skirt'], `${at} skirt`),
    flash: readFlash(source['flash'], `${at} flash`),
    roosts: source['roosts'] === undefined ? [] : each(source['roosts'], `${at} roosts`, readRoost),
    glows: source['glows'] === undefined ? [] : each(source['glows'], `${at} glows`, readGlow),
    lamps: source['lamps'] === undefined ? [] : each(source['lamps'], `${at} lamps`, readLamp),
  };
  if (set.fogFar <= set.fogNear) throw new ContentError(at, 'fogFar is not beyond fogNear');
  return set;
}

export function readLobbySets(value: unknown): LobbySets {
  const where: string = 'lobby sets';
  const source: Fields = fields(value, where);
  const sets: Map<string, LobbySet> = byId(each(source['sets'], `${where} sets`, readSet), where);
  const chosen: string = text(source, 'chosen', where);
  if (!sets.has(chosen)) throw new ContentError(where, `the chosen set ${chosen} is not listed`);
  const zoneSource: Fields = source['zones'] === undefined ? {} : fields(source['zones'], `${where} zones`);
  const zones: Map<string, string> = new Map<string, string>(Object.keys(zoneSource).map((zone: string): [string, string] => [zone, text(zoneSource, zone, `${where} zones`)]));
  for (const [zone, id] of zones) if (!sets.has(id)) throw new ContentError(`${where} zones`, `${zone} names the unlisted set ${id}`);
  return { chosen, zones, sets };
}

export const LOBBY_SETS: LobbySets = readLobbySets(raw);

export function setMounds(set: LobbySet): readonly Mound[] {
  return set.pieces.filter((piece: SetPiece): boolean => piece.mound).map((piece: SetPiece): Mound => ({ x: piece.x, z: piece.z, size: piece.size }));
}

export function pickSet(sets: LobbySets, search: string, lastZone: string | null = null): LobbySet {
  const asked: string | null = new URLSearchParams(search).get(LOBBY_SET_PICK.query) ?? (lastZone === null ? null : (sets.zones.get(lastZone) ?? null));
  const fallback: LobbySet | undefined = sets.sets.get(sets.chosen);
  if (fallback === undefined) throw new ContentError('lobby sets', `the chosen set ${sets.chosen} is not listed`);
  return (asked === null ? undefined : sets.sets.get(asked)) ?? fallback;
}
