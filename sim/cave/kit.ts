import type { Fields } from '../content/read.ts';
import { ContentError, each, fields, nonNegative, numeric, positive, share, text, textList } from '../content/read.ts';

export interface KitLetters {
  readonly themes: readonly string[];
  readonly passage: string;
  readonly pond: string;
  readonly shore: string;
}

export type KitForm = 'blob' | 'rect';

export type KitRowSide = 'long' | 'aisle';

export interface KitRow {
  readonly prop: string;
  readonly step: number;
  readonly inset: number;
  readonly sides: readonly KitRowSide[];
}

export interface KitShape {
  readonly form: KitForm;
  readonly radiusLeast: number;
  readonly radiusMost: number;
  readonly alcoves: number;
  readonly pondChance: number;
}

export interface KitWalls {
  readonly band: number;
  readonly back: number;
  readonly side: number;
  readonly front: number;
}

export interface KitStairs {
  readonly prop: string;
  readonly y: number;
}

export interface KitPiece {
  readonly prop: string;
  readonly dx: number;
  readonly dz: number;
  readonly turn: number;
}

export interface KitMember {
  readonly monster: string;
  readonly count: number;
}

export interface KitFamily {
  readonly members: readonly KitMember[];
  readonly waits: number | null;
}

export interface KitDensity {
  readonly props: number;
  readonly caches: number;
}

export interface CaveKit {
  readonly id: string;
  readonly letters: KitLetters;
  readonly shape: KitShape;
  readonly walls: KitWalls;
  readonly stairs: KitStairs;
  readonly clusters: readonly (readonly KitPiece[])[];
  readonly rows: readonly KitRow[];
  readonly caches: readonly string[];
  readonly density: KitDensity;
  readonly families: readonly KitFamily[];
  readonly zone: Fields;
}

function letter(source: Fields, key: string, where: string): string {
  const value: string = text(source, key, where);
  if (value.length !== 1 || value === ' ') throw new ContentError(`${where}.${key}`, 'a tile letter is one character and not a space');
  return value;
}

function kitLetters(value: unknown, where: string): KitLetters {
  const source: Fields = fields(value, where);
  const themes: string[] = textList(source, 'themes', where);
  if (themes.length === 0 || themes.some((theme: string): boolean => theme.length !== 1 || theme === ' ')) throw new ContentError(`${where}.themes`, 'list at least one one-character tile letter');
  return { themes, passage: letter(source, 'passage', where), pond: letter(source, 'pond', where), shore: letter(source, 'shore', where) };
}

function kitShape(value: unknown, where: string): KitShape {
  const source: Fields = fields(value, where);
  const radiusLeast: number = positive(source, 'radiusLeast', where);
  const radiusMost: number = positive(source, 'radiusMost', where);
  if (radiusMost < radiusLeast) throw new ContentError(`${where}.radiusMost`, 'must be at least radiusLeast');
  return { form: kitForm(source['form'], `${where}.form`), radiusLeast, radiusMost, alcoves: nonNegative(source, 'alcoves', where), pondChance: share(source, 'pondChance', where) };
}

function kitForm(value: unknown, where: string): KitForm {
  switch (value) {
    case undefined:
    case 'blob':
      return 'blob';
    case 'rect':
      return 'rect';
    default:
      throw new ContentError(where, 'expected "blob" or "rect"');
  }
}

function kitRowSide(value: unknown, where: string): KitRowSide {
  switch (value) {
    case 'long':
      return 'long';
    case 'aisle':
      return 'aisle';
    default:
      throw new ContentError(where, 'expected "long" or "aisle"');
  }
}

function kitRow(value: unknown, where: string): KitRow {
  const source: Fields = fields(value, where);
  const sides: KitRowSide[] = each(source['sides'], `${where}.sides`, kitRowSide);
  if (sides.length === 0) throw new ContentError(`${where}.sides`, 'a row stands along at least one side');
  return { prop: text(source, 'prop', where), step: positive(source, 'step', where), inset: nonNegative(source, 'inset', where), sides };
}

function kitWalls(value: unknown, where: string): KitWalls {
  const source: Fields = fields(value, where);
  return { band: positive(source, 'band', where), back: nonNegative(source, 'back', where), side: nonNegative(source, 'side', where), front: nonNegative(source, 'front', where) };
}

function kitPiece(value: unknown, where: string): KitPiece {
  const source: Fields = fields(value, where);
  return { prop: text(source, 'prop', where), dx: numeric(source, 'dx', where), dz: numeric(source, 'dz', where), turn: numeric(source, 'turn', where) };
}

function kitCluster(value: unknown, where: string): KitPiece[] {
  const pieces: KitPiece[] = each(value, where, kitPiece);
  if (pieces.length === 0) throw new ContentError(where, 'a cluster holds at least one prop');
  return pieces;
}

function kitMember(value: unknown, where: string): KitMember {
  const source: Fields = fields(value, where);
  return { monster: text(source, 'monster', where), count: positive(source, 'count', where) };
}

function kitFamily(value: unknown, where: string): KitFamily {
  const source: Fields = fields(value, where);
  const members: KitMember[] = each(source['members'], `${where}.members`, kitMember);
  if (members.length === 0) throw new ContentError(`${where}.members`, 'a family has at least one member');
  return { members, waits: source['waits'] === undefined || source['waits'] === null ? null : positive(source, 'waits', where) };
}

function kitDensity(value: unknown, where: string): KitDensity {
  const source: Fields = fields(value, where);
  return { props: nonNegative(source, 'props', where), caches: nonNegative(source, 'caches', where) };
}

export function readKit(value: unknown, where: string): CaveKit {
  const source: Fields = fields(value, where);
  const zone: Fields = fields(source['zone'], `${where}.zone`);
  const floors: Fields = fields(zone['floors'], `${where}.zone.floors`);
  const letters: KitLetters = kitLetters(source['letters'], `${where}.letters`);
  for (const used of [...letters.themes, letters.passage, letters.pond, letters.shore]) if (floors[used] === undefined) throw new ContentError(`${where}.letters`, `"${used}" is not one of the kit's floors`);
  if (fields(zone['terrain'], `${where}.zone.terrain`)['levels'] !== undefined) throw new ContentError(`${where}.zone.terrain.levels`, 'the generator writes the levels');
  const families: KitFamily[] = each(source['families'], `${where}.families`, kitFamily);
  if (families.length === 0) throw new ContentError(`${where}.families`, 'a kit needs at least one monster family');
  const clusters: KitPiece[][] = each(source['clusters'], `${where}.clusters`, kitCluster);
  const stairs: Fields = fields(source['stairs'], `${where}.stairs`);
  const shape: KitShape = kitShape(source['shape'], `${where}.shape`);
  const rows: KitRow[] = source['rows'] === undefined ? [] : each(source['rows'], `${where}.rows`, kitRow);
  if (rows.length > 0 && shape.form !== 'rect') throw new ContentError(`${where}.rows`, 'rows stand along the straight walls of rect rooms; set shape.form to "rect"');
  return {
    id: text(source, 'id', where),
    letters,
    shape,
    walls: kitWalls(source['walls'], `${where}.walls`),
    stairs: { prop: text(stairs, 'prop', `${where}.stairs`), y: numeric(stairs, 'y', `${where}.stairs`) },
    clusters,
    rows,
    caches: textList(source, 'caches', where),
    density: kitDensity(source['density'], `${where}.density`),
    families,
    zone,
  };
}
