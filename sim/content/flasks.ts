import type { Fields } from './read.ts';
import { byId, ContentError, choice, each, fields, nonNegative, numeric, positive, share, text } from './read.ts';

export const FLASK_RESOURCES = ['life', 'mana'] as const;
export type FlaskResource = (typeof FLASK_RESOURCES)[number];

export interface FlaskTier {
  readonly level: number;
  readonly price: number;
  readonly amount: number;
  readonly share: number;
  readonly duration: number;
  readonly maxCharges: number;
  readonly chargesPerKill: number;
}

export interface FlaskDef {
  readonly id: string;
  readonly name: string;
  readonly resource: FlaskResource;
  readonly amount: number;
  readonly share: number;
  readonly duration: number;
  readonly cooldown: number;
  readonly maxCharges: number;
  readonly chargesPerUse: number;
  readonly chargesPerKill: number;
  readonly tiers: readonly FlaskTier[];
}

function whole(value: number, key: string, where: string): number {
  if (!Number.isInteger(value)) throw new ContentError(`${where}.${key}`, 'expected a whole number');
  return value;
}

function tier(value: unknown, where: string): FlaskTier {
  const source: Fields = fields(value, where);
  return {
    level: whole(positive(source, 'level', where), 'level', where),
    price: whole(positive(source, 'price', where), 'price', where),
    amount: nonNegative(source, 'amount', where),
    share: share(source, 'share', where),
    duration: positive(source, 'duration', where),
    maxCharges: whole(positive(source, 'maxCharges', where), 'maxCharges', where),
    chargesPerKill: whole(nonNegative(source, 'chargesPerKill', where), 'chargesPerKill', where),
  };
}

type TierField = 'amount' | 'share' | 'maxCharges' | 'chargesPerKill' | 'price' | 'level';

const RISING: readonly TierField[] = ['level', 'price', 'amount', 'share'];
const KEPT: readonly TierField[] = ['maxCharges', 'chargesPerKill'];

function readTiers(value: unknown, where: string, base: Pick<FlaskTier, 'amount' | 'share' | 'duration' | 'maxCharges' | 'chargesPerKill'>, chargesPerUse: number): FlaskTier[] {
  const list: FlaskTier[] = value === undefined ? [] : each(value, where, tier);
  let before: FlaskTier = { ...base, level: 0, price: 0 };
  for (const [index, next] of list.entries()) {
    const at: string = `${where}[${index}]`;
    for (const key of RISING) if (next[key] <= before[key]) throw new ContentError(`${at}.${key}`, 'expected more than the tier before');
    for (const key of KEPT) if (next[key] < before[key]) throw new ContentError(`${at}.${key}`, 'expected at least the tier before');
    if (next.duration > before.duration) throw new ContentError(`${at}.duration`, 'expected at most the tier before');
    if (next.maxCharges < chargesPerUse) throw new ContentError(`${at}.maxCharges`, 'expected at least chargesPerUse');
    before = next;
  }
  return list;
}

function flask(value: unknown, where: string): FlaskDef {
  const source: Fields = fields(value, where);
  const maxCharges: number = positive(source, 'maxCharges', where);
  const chargesPerUse: number = positive(source, 'chargesPerUse', where);
  const chargesPerKill: number = numeric(source, 'chargesPerKill', where);
  for (const [key, charges] of Object.entries({ maxCharges, chargesPerUse, chargesPerKill })) {
    if (!Number.isInteger(charges)) throw new ContentError(`${where}.${key}`, 'expected a whole number');
  }
  const cooldown: number = numeric(source, 'cooldown', where);
  if (chargesPerUse > maxCharges) throw new ContentError(`${where}.chargesPerUse`, 'expected at most maxCharges');
  if (chargesPerKill < 0) throw new ContentError(`${where}.chargesPerKill`, 'expected zero or more');
  if (cooldown < 0) throw new ContentError(`${where}.cooldown`, 'expected zero or more');
  const amount: number = nonNegative(source, 'amount', where);
  const part: number = share(source, 'share', where);
  if (amount === 0 && part === 0) throw new ContentError(`${where}.amount`, 'expected an amount or a share above zero');
  const duration: number = positive(source, 'duration', where);
  return {
    id: text(source, 'id', where),
    name: text(source, 'name', where),
    resource: choice(source, 'resource', FLASK_RESOURCES, where),
    amount,
    share: part,
    duration,
    cooldown,
    maxCharges,
    chargesPerUse,
    chargesPerKill,
    tiers: readTiers(source['tiers'], `${where}.tiers`, { amount, share: part, duration, maxCharges, chargesPerKill }, chargesPerUse),
  };
}

export function parseFlasks(value: unknown, where: string): FlaskDef[] {
  const list: FlaskDef[] = each(value, where, flask);
  byId(list, where);
  return list;
}
