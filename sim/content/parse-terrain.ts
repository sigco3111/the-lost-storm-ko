import type { Fields } from './read.ts';
import { choice, ContentError, each, fields, nonNegative, positive, share, text, textList } from './read.ts';
import type { CliffRule, CliffSize, TerrainBlend, TerrainCliff, TerrainRough, ZoneTerrain } from './terrain-types.ts';
import { CLIFF_SIDES } from './terrain-types.ts';
import type { TerrainBuild } from '../nav/terrain.ts';
import { buildTerrain } from '../nav/terrain.ts';

function terrainRough(value: unknown, where: string): TerrainRough | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { reach: nonNegative(source, 'reach', where), scale: positive(source, 'scale', where), calm: source['calm'] === undefined ? [] : textList(source, 'calm', where) };
}

function terrainBlend(value: unknown, where: string): TerrainBlend {
  const source: Fields = fields(value, where);
  const cover: number = nonNegative(source, 'cover', where);
  if (cover > 1) throw new ContentError(`${where}.cover`, 'a blend covers at most the whole ground');
  const near: string | null = source['near'] === undefined ? null : text(source, 'near', where);
  return { surface: text(source, 'surface', where), scale: positive(source, 'scale', where), cover, near, reach: near === null ? 0 : positive(source, 'reach', where) };
}

export function cliffRule(source: Fields, where: string): CliffRule {
  return { side: choice(source, 'side', CLIFF_SIDES, where), step: positive(source, 'step', where), drop: positive(source, 'drop', where), cover: share(source, 'cover', where), tuck: nonNegative(source, 'tuck', where) };
}

function cliffSize(value: unknown, where: string): CliffSize {
  const source: Fields = fields(value, where);
  const least: number = positive(source, 'least', where);
  const most: number = positive(source, 'most', where);
  if (most < least) throw new ContentError(where, 'most must be at least least');
  return { least, most };
}

function terrainCliff(value: unknown, where: string): TerrainCliff {
  const source: Fields = fields(value, where);
  const props: string[] = textList(source, 'props', where);
  if (props.length === 0) throw new ContentError(`${where}.props`, 'cliff rocks need at least one prop');
  return { ...cliffRule(source, where), props, size: cliffSize(source['size'], `${where}.size`) };
}

export function zoneTerrain(value: unknown, where: string, tiles: readonly string[], cellSize: number): ZoneTerrain | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  const terrain: ZoneTerrain = { rise: positive(source, 'rise', where), groundStep: positive(source, 'groundStep', where), levels: textList(source, 'levels', where), cliff: text(source, 'cliff', where), rough: terrainRough(source['rough'], `${where}.rough`), blends: source['blends'] === undefined ? [] : each(source['blends'], `${where}.blends`, terrainBlend), cliffs: source['cliffs'] === undefined ? [] : each(source['cliffs'], `${where}.cliffs`, terrainCliff) };
  const built: TerrainBuild = buildTerrain(terrain, tiles, cellSize);
  if (!built.ok) throw new ContentError(`${where}.levels`, built.problem);
  return terrain;
}
