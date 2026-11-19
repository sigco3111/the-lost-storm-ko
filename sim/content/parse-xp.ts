import type { Fields } from './read.ts';
import { ContentError, fields, positive } from './read.ts';
import type { XpAfter } from './xp-types.ts';

export function xpAfter(value: unknown, where: string): XpAfter | null {
  if (value === undefined) return null;
  const source: Fields = fields(value, where);
  const from: number = positive(source, 'from', where);
  if (!Number.isInteger(from)) throw new ContentError(`${where}.from`, 'expected a whole level');
  return { from, growth: positive(source, 'growth', where) };
}
