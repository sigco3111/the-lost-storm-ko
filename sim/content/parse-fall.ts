import type { ZoneFall } from './fall-types.ts';
import type { Fields } from './read.ts';
import { each, fields, numeric, positive, text } from './read.ts';

function zoneFall(value: unknown, where: string): ZoneFall {
  const source: Fields = fields(value, where);
  return {
    x: numeric(source, 'x', where),
    z: numeric(source, 'z', where),
    facingDegrees: numeric(source, 'facingDegrees', where),
    width: positive(source, 'width', where),
    surface: text(source, 'surface', where),
  };
}

export function zoneFalls(value: unknown, where: string): ZoneFall[] {
  if (value === undefined) return [];
  return each(value, where, zoneFall);
}
