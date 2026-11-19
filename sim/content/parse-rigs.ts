import type { RigActionClip, RigClips, RigPrivateClip, RigContact, RigDef, RigSocket, RigStanceClips, Triple } from './types.ts';
import type { Fields } from './read.ts';
import { colour, ContentError, each, fields, nullableText, numeric, positive, text, textList } from './read.ts';
import { rigGaits } from './parse-gaits.ts';

export const RIG_DEFAULTS = { skin: '#ffffff' } as const;

function impactOf(entry: Fields, where: string): number {
  const impactFraction: number = numeric(entry, 'impactFraction', where);
  if (impactFraction < 0 || impactFraction >= 1) throw new ContentError(`${where}.impactFraction`, 'expected a number from 0 up to, but not including, 1');
  return impactFraction;
}

function privateClip(value: unknown, where: string): RigPrivateClip | null {
  if (value === undefined) return null;
  const entry: Fields = fields(value, where);
  return { clip: text(entry, 'clip', where), impactFraction: impactOf(entry, where) };
}

function actionClips(value: unknown, where: string): Record<string, RigActionClip> {
  const actionFields: Fields = fields(value, where);
  const actions: Record<string, RigActionClip> = {};
  for (const key of Object.keys(actionFields)) {
    const entry: Fields = fields(actionFields[key], `${where}.${key}`);
    actions[key] = { clip: text(entry, 'clip', `${where}.${key}`), impactFraction: impactOf(entry, `${where}.${key}`), private: privateClip(entry['private'], `${where}.${key}.private`) };
  }
  return actions;
}

function stanceClips(value: unknown, where: string): RigStanceClips {
  const source: Fields = fields(value, where);
  return { idle: text(source, 'idle', where), actions: actionClips(source['actions'], `${where}.actions`) };
}

function unarmedClips(value: unknown, where: string): RigStanceClips | null {
  return value === undefined || value === null ? null : stanceClips(value, where);
}

function stanceSets(value: unknown, where: string): Record<string, RigStanceClips> {
  const stances: Record<string, RigStanceClips> = {};
  if (value === undefined) return stances;
  const source: Fields = fields(value, where);
  for (const key of Object.keys(source)) stances[key] = stanceClips(source[key], `${where}.${key}`);
  return stances;
}

function rigClips(value: unknown, where: string): RigClips {
  const source: Fields = fields(value, where);
  const actions: Record<string, RigActionClip> = actionClips(source['actions'], `${where}.actions`);
  const hit: string[] = source['hit'] === undefined ? [] : textList(source, 'hit', where);
  const death: string[] = source['death'] === undefined ? [] : textList(source, 'death', where);
  return { idle: text(source, 'idle', where), run: text(source, 'run', where), hit, death, rise: source['rise'] === undefined ? null : nullableText(source, 'rise', where), actions, unarmed: unarmedClips(source['unarmed'], `${where}.unarmed`), stances: stanceSets(source['stances'], `${where}.stances`) };
}

function triple(source: Fields, key: string, where: string): Triple {
  const values: number[] = each(source[key], `${where}.${key}`, (entry: unknown, entryWhere: string): number => {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) throw new ContentError(entryWhere, 'expected a number');
    return entry;
  });
  const [x, y, z] = values;
  if (values.length !== 3 || x === undefined || y === undefined || z === undefined) throw new ContentError(`${where}.${key}`, 'expected three numbers');
  return [x, y, z];
}

function rigSocket(value: unknown, where: string): RigSocket {
  const source: Fields = fields(value, where);
  return { bone: text(source, 'bone', where), position: triple(source, 'position', where), rotationDegrees: triple(source, 'rotationDegrees', where), scale: numeric(source, 'scale', where) };
}

function rigContact(value: unknown, where: string): RigContact {
  const source: Fields = fields(value, where);
  return { bone: text(source, 'bone', where), radius: positive(source, 'radius', where) };
}

function lift(source: Fields, where: string): number {
  const metres: number = numeric(source, 'lift', where);
  if (metres < 0) throw new ContentError(`${where}.lift`, 'expected a height of zero or more');
  return metres;
}

export function rig(value: unknown, where: string): RigDef {
  const source: Fields = fields(value, where);
  const socketFields: Fields = fields(source['sockets'], `${where}.sockets`);
  const sockets: Record<string, RigSocket> = {};
  for (const key of Object.keys(socketFields)) sockets[key] = rigSocket(socketFields[key], `${where}.sockets.${key}`);
  const partFields: Fields = fields(source['bodyParts'], `${where}.bodyParts`);
  const bodyParts: Record<string, readonly string[]> = {};
  for (const key of Object.keys(partFields)) bodyParts[key] = textList(partFields, key, `${where}.bodyParts`);
  return {
    id: text(source, 'id', where),
    url: text(source, 'url', where),
    clipFolder: text(source, 'clipFolder', where),
    frame: source['frame'] === undefined ? '' : text(source, 'frame', where),
    scale: numeric(source, 'scale', where),
    yawOffsetDegrees: numeric(source, 'yawOffsetDegrees', where),
    height: numeric(source, 'height', where),
    rootMotionBone: nullableText(source, 'rootMotionBone', where),
    gaits: rigGaits(source['gaits'], `${where}.gaits`),
    idleRate: source['idleRate'] === undefined ? 1 : numeric(source, 'idleRate', where),
    clips: rigClips(source['clips'], `${where}.clips`),
    sockets,
    hiddenNodes: textList(source, 'hiddenNodes', where),
    bodyParts,
    base: source['base'] === undefined ? [] : textList(source, 'base', where),
    contacts: source['contacts'] === undefined ? [] : each(source['contacts'], `${where}.contacts`, rigContact),
    lift: source['lift'] === undefined ? 0 : lift(source, where),
    skin: source['skin'] === undefined ? RIG_DEFAULTS.skin : colour(source, 'skin', where),
  };
}
