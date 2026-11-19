import type { PropLight } from './prop-types.ts';
import { PROP_LIGHT_FORMS } from './prop-types.ts';
import type { Fields } from './read.ts';
import { choice, colour, fields, nonNegative, numeric, positive } from './read.ts';

export function propLight(value: unknown, where: string): PropLight | null {
  if (value === null || value === undefined) return null;
  const source: Fields = fields(value, where);
  const color: string = colour(source, 'color', where);
  const intensity: number = nonNegative(source, 'intensity', where);
  const distance: number = positive(source, 'distance', where);
  const height: number = numeric(source, 'height', where);
  const decay: number = nonNegative(source, 'decay', where);
  const form: PropLight['form'] = choice(source, 'form', PROP_LIGHT_FORMS, where);
  switch (form) {
    case 'flame':
      return { form, color, intensity, distance, height, decay, reach: numeric(source, 'reach', where), lift: nonNegative(source, 'lift', where) };
    case 'glow':
      break;
  }
  return { form: 'glow', color, intensity, distance, height, decay };
}
