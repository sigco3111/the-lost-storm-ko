import type { GlowLit, SurfaceDef, SurfaceGlow, SurfaceHeat } from './prop-types.ts';
import type { Fields } from './read.ts';
import { choice, colour, fields, flag, nonNegative, nullableText, numeric, positive, share, text } from './read.ts';

const GLOW_LIT: readonly GlowLit[] = ['tint', 'map'];

function surfaceGlow(value: unknown, where: string): SurfaceGlow | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  return {
    color: colour(source, 'color', where),
    strength: positive(source, 'strength', where),
    cover: share(source, 'cover', where),
    cracks: share(source, 'cracks', where),
    scale: positive(source, 'scale', where),
    flow: nonNegative(source, 'flow', where),
    pulse: nonNegative(source, 'pulse', where),
    lit: source['lit'] === undefined ? 'tint' : choice(source, 'lit', GLOW_LIT, where),
  };
}

function surfaceHeat(value: unknown, where: string): SurfaceHeat | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  return { skill: text(source, 'skill', where), lifeShare: positive(source, 'lifeShare', where) };
}

export function surface(value: unknown, where: string): SurfaceDef {
  const source: Fields = fields(value, where);
  return {
    id: text(source, 'id', where),
    color: text(source, 'color', where),
    normal: nullableText(source, 'normal', where),
    orm: nullableText(source, 'orm', where),
    metres: positive(source, 'metres', where),
    tint: text(source, 'tint', where),
    roughness: numeric(source, 'roughness', where),
    metalness: numeric(source, 'metalness', where),
    normalScale: numeric(source, 'normalScale', where),
    spill: numeric(source, 'spill', where),
    pace: source['pace'] === undefined ? 1 : positive(source, 'pace', where),
    glow: surfaceGlow(source['glow'], `${where}.glow`),
    heat: surfaceHeat(source['heat'], `${where}.heat`),
    blocks: source['blocks'] === undefined ? false : flag(source, 'blocks', where),
  };
}
