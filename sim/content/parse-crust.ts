import type { BodyCrust } from './combat-types.ts';
import type { Fields } from './read.ts';
import { ContentError, fields, nonNegative, positive, share } from './read.ts';

export const CRUST_LIMITS = {
  widestSeam: 0.4,
} as const;

export function bodyCrust(value: unknown, where: string): BodyCrust {
  const source: Fields = fields(value, where);
  const seam: number = share(source, 'seam', where);
  if (seam <= 0 || seam > CRUST_LIMITS.widestSeam) throw new ContentError(`${where}.seam`, `a seam is wider than nothing and at most ${CRUST_LIMITS.widestSeam} of a plate`);
  return { cells: positive(source, 'cells', where), seam, strength: positive(source, 'strength', where), rim: nonNegative(source, 'rim', where) };
}
