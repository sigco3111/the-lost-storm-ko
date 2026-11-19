import type { SkillTarget } from './chart-types.ts';
import { skillMod, skillTarget } from './parse-mods.ts';
import type { Fields } from './read.ts';
import { choice, colour, each, fields, fraction, nonNegative, numeric, positive, text } from './read.ts';
import type { EmpowerLook, PowerEffect, PowerTriggerDef } from './types.ts';
import { CAST_ORIGINS, MOD_OPS, POWER_TARGETS, POWER_TRIGGERS, STAT_IDS } from './types.ts';

function empowerLook(value: unknown, where: string): EmpowerLook | null {
  if (value === undefined || value === null) return null;
  const source: Fields = fields(value, where);
  return { color: colour(source, 'color', where), shade: fraction(source, 'shade', where) };
}

function powerEffect(value: unknown, where: string): PowerEffect {
  const source: Fields = fields(value, where);
  const type: PowerEffect['type'] = choice(source, 'type', ['cast', 'buff', 'empower', 'flask'] as const, where);
  switch (type) {
    case 'cast':
      return { type, skill: text(source, 'skill', where), at: choice(source, 'at', CAST_ORIGINS, where) };
    case 'buff':
      return { type, stat: choice(source, 'stat', STAT_IDS, where), op: choice(source, 'op', MOD_OPS, where), value: numeric(source, 'value', where), duration: positive(source, 'duration', where), stacks: positive(source, 'stacks', where) };
    case 'empower':
      return { type, skillMods: each(source['skillMods'], `${where}.skillMods`, skillMod), duration: positive(source, 'duration', where), look: empowerLook(source['look'], `${where}.look`) };
    case 'flask':
      return { type, charges: positive(source, 'charges', where) };
  }
  return { type: 'cast', skill: text(source, 'skill', where), at: 'target' };
}

function triggerSkill(value: unknown, where: string): SkillTarget | null {
  return value === undefined || value === null ? null : skillTarget(fields(value, where), where);
}

export function powerTrigger(value: unknown, where: string): PowerTriggerDef {
  const source: Fields = fields(value, where);
  return {
    on: choice(source, 'on', POWER_TRIGGERS, where),
    skill: triggerSkill(source['skill'], `${where}.skill`),
    target: source['target'] === undefined ? 'any' : choice(source, 'target', POWER_TARGETS, where),
    every: source['every'] === undefined ? 1 : positive(source, 'every', where),
    cooldown: source['cooldown'] === undefined ? 0 : nonNegative(source, 'cooldown', where),
    effect: powerEffect(source['effect'], `${where}.effect`),
  };
}
