import type { Fields } from '../../sim/content/read.ts';
import { ContentError, byId, choice, colour, each, fields, nonNegative, numeric, positive, text } from '../../sim/content/read.ts';

export const LIFE_FORMS = ['bird', 'crawler', 'moth', 'bat'] as const;
export type LifeForm = (typeof LIFE_FORMS)[number];

export const LIFE_FRAMES = ['zone', 'shore'] as const;
export type LifeFrame = (typeof LIFE_FRAMES)[number];

export const FLOCK_HABITS = ['perch', 'circle'] as const;
export type FlockHabit = (typeof FLOCK_HABITS)[number];

export interface BirdKind {
  readonly form: 'bird';
  readonly id: string;
  readonly size: number;
  readonly colour: string;
  readonly flee: number;
  readonly speed: number;
  readonly circleRadius: number;
  readonly circleHeight: number;
  readonly circleSpeed: number;
  readonly settle: number;
  readonly flapRate: number;
}

export interface CrawlerKind {
  readonly form: 'crawler';
  readonly id: string;
  readonly size: number;
  readonly colour: string;
  readonly flee: number;
  readonly speed: number;
  readonly amble: number;
  readonly roam: number;
  readonly pause: number;
  readonly legs: number;
  readonly stride: number;
}

export interface MothKind {
  readonly form: 'moth';
  readonly id: string;
  readonly size: number;
  readonly colour: string;
  readonly roam: number;
  readonly height: number;
  readonly speed: number;
  readonly flapRate: number;
}

export interface BatKind {
  readonly form: 'bat';
  readonly id: string;
  readonly size: number;
  readonly colour: string;
  readonly membrane: string;
  readonly glow: number;
  readonly beat: number;
  readonly bob: number;
  readonly wake: number;
  readonly stir: number;
  readonly speed: number;
  readonly flapRate: number;
  readonly jitter: number;
  readonly jitterRate: number;
  readonly arc: number;
  readonly hop: number;
  readonly most: number;
  readonly cross: number;
  readonly reach: number;
  readonly shuffle: number;
  readonly rest: number;
}

export type LifeKind = BirdKind | CrawlerKind | MothKind | BatKind;

export interface LifeGroup {
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly count: number;
  readonly spread: number;
  readonly habit: FlockHabit;
}

export interface LifePlace {
  readonly zone: string;
  readonly frame: LifeFrame;
  readonly groups: readonly LifeGroup[];
}

export interface LifeRules {
  readonly kinds: ReadonlyMap<string, LifeKind>;
  readonly places: readonly LifePlace[];
}

function optional(source: Fields, key: string, fallback: number, where: string): number {
  return source[key] === undefined ? fallback : numeric(source, key, where);
}

function readKind(value: unknown, where: string): LifeKind {
  const source: Fields = fields(value, where);
  const form: LifeForm = choice(source, 'form', LIFE_FORMS, where);
  const id: string = text(source, 'id', where);
  const size: number = positive(source, 'size', where);
  const shade: string = colour(source, 'colour', where);
  switch (form) {
    case 'bird':
      return { form, id, size, colour: shade, flee: positive(source, 'flee', where), speed: positive(source, 'speed', where), circleRadius: positive(source, 'circleRadius', where), circleHeight: positive(source, 'circleHeight', where), circleSpeed: positive(source, 'circleSpeed', where), settle: nonNegative(source, 'settle', where), flapRate: positive(source, 'flapRate', where) };
    case 'crawler':
      return { form, id, size, colour: shade, flee: positive(source, 'flee', where), speed: positive(source, 'speed', where), amble: positive(source, 'amble', where), roam: positive(source, 'roam', where), pause: nonNegative(source, 'pause', where), legs: positive(source, 'legs', where), stride: positive(source, 'stride', where) };
    case 'bat':
      return { form, id, size, colour: shade, membrane: colour(source, 'membrane', where), glow: nonNegative(source, 'glow', where), beat: positive(source, 'beat', where), bob: nonNegative(source, 'bob', where), wake: positive(source, 'wake', where), stir: positive(source, 'stir', where), speed: positive(source, 'speed', where), flapRate: positive(source, 'flapRate', where), jitter: nonNegative(source, 'jitter', where), jitterRate: positive(source, 'jitterRate', where), arc: nonNegative(source, 'arc', where), hop: positive(source, 'hop', where), most: positive(source, 'most', where), cross: positive(source, 'cross', where), reach: positive(source, 'reach', where), shuffle: positive(source, 'shuffle', where), rest: nonNegative(source, 'rest', where) };
    case 'moth':
      break;
  }
  return { form, id, size, colour: shade, roam: positive(source, 'roam', where), height: nonNegative(source, 'height', where), speed: positive(source, 'speed', where), flapRate: positive(source, 'flapRate', where) };
}

function readGroup(value: unknown, where: string): LifeGroup {
  const source: Fields = fields(value, where);
  const count: number = positive(source, 'count', where);
  if (!Number.isInteger(count)) throw new ContentError(`${where}.count`, 'expected a whole number');
  return {
    kind: text(source, 'kind', where),
    x: numeric(source, 'x', where),
    y: optional(source, 'y', 0, where),
    z: numeric(source, 'z', where),
    count,
    spread: optional(source, 'spread', 0, where),
    habit: source['habit'] === undefined ? 'perch' : choice(source, 'habit', FLOCK_HABITS, where),
  };
}

function readPlace(value: unknown, where: string): LifePlace {
  const source: Fields = fields(value, where);
  return { zone: text(source, 'zone', where), frame: choice(source, 'frame', LIFE_FRAMES, where), groups: each(source['groups'], `${where}.groups`, readGroup) };
}

export function readLife(value: unknown): LifeRules {
  const where: string = 'life';
  const source: Fields = fields(value, where);
  const kinds: Map<string, LifeKind> = byId(each(source['kinds'], `${where}.kinds`, readKind), `${where}.kinds`);
  const places: LifePlace[] = each(source['places'], `${where}.places`, readPlace);
  for (const place of places) {
    for (const group of place.groups) if (!kinds.has(group.kind)) throw new ContentError(`${where}.places.${place.zone}`, `unknown kind ${group.kind}`);
  }
  return { kinds, places };
}

export function placesFor(rules: LifeRules, zone: string, frame: LifeFrame): readonly LifeGroup[] {
  return rules.places.filter((place: LifePlace): boolean => place.zone === zone && place.frame === frame).flatMap((place: LifePlace): readonly LifeGroup[] => place.groups);
}
