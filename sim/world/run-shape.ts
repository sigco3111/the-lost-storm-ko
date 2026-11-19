import type { Content, MonsterDef } from '../content/types.ts';
import type { MonsterModDef } from '../content/combat-types.ts';
import type { Rng } from '../rng.ts';
import { modsNamed, withMods } from './elites.ts';
import type { RunShaping } from './run-state.ts';

export function filledBy(content: Content, rng: Rng, shaping: RunShaping | null, base: MonsterDef): MonsterDef {
  if (shaping === null || shaping.fill.length === 0 || base.boss !== null || base.rank !== null || shaping.fill.includes(base.id)) return base;
  const id: string | undefined = shaping.fill.length === 1 ? shaping.fill[0] : shaping.fill[rng.int(0, shaping.fill.length - 1)];
  const fill: MonsterDef | undefined = id === undefined ? undefined : content.monsters.get(id);
  return fill === undefined || fill.boss !== null ? base : fill;
}

export function grownCount(rng: Rng, shaping: RunShaping | null, count: number): number {
  if (shaping === null || shaping.grow <= 0 || count <= 0) return count;
  const more: number = count * shaping.grow;
  const whole: number = Math.floor(more);
  return count + whole + (rng.chance(more - whole) ? 1 : 0);
}

function shapeDef(content: Content, shaping: RunShaping, def: MonsterDef): MonsterDef {
  if (def.boss !== null) return def;
  const fresh: MonsterModDef[] = modsNamed(content.monsterMods, shaping.mods.filter((id: string): boolean => !def.mods.includes(id)));
  const modded: MonsterDef = withMods(def, fresh);
  if (shaping.life <= 0 && shaping.damage <= 0) return modded;
  return {
    ...modded,
    life: modded.life * (1 + shaping.life),
    damageMin: modded.damageMin * (1 + shaping.damage),
    damageMax: modded.damageMax * (1 + shaping.damage),
  };
}

export function shapeDefs(content: Content, shaping: RunShaping | null, defs: readonly MonsterDef[]): MonsterDef[] {
  if (shaping === null) return [...defs];
  return defs.map((def: MonsterDef): MonsterDef => shapeDef(content, shaping, def));
}
