import type { Content, EmpoweredMod, ItemBaseDef, SkillDef, SkillEmpowerment, SkillTreeNodeDef, StatId, StatMod, WeaponGroup, WeaponKind } from './content/types.ts';
import type { Equipment } from './world/types.ts';

export function groupOfKind(content: Content, kind: WeaponKind): WeaponGroup | null {
  return content.chart.weaponGroups.find((group: WeaponGroup): boolean => group.kinds.includes(kind)) ?? null;
}

export function weaponGroup(content: Content, id: string): WeaponGroup | null {
  return content.chart.weaponGroups.find((group: WeaponGroup): boolean => group.id === id) ?? null;
}

export function heldGroup(content: Content, equipped: Equipment): string | null {
  const held = equipped.weapon;
  if (held === null) return null;
  const base: ItemBaseDef | undefined = content.itemBases.get(held.base);
  if (base === undefined || base.weaponKind === null) return null;
  return groupOfKind(content, base.weaponKind)?.id ?? null;
}

export const ANY_WEAPON: string = '*';

export function empoweredBy(skill: SkillDef, base: SkillDef): SkillEmpowerment | null {
  return skill.empowered ?? base.empowered;
}

export function empoweredMods(empowerment: SkillEmpowerment | null, held: string | null): readonly EmpoweredMod[] {
  if (empowerment === null) return [];
  return held === ANY_WEAPON || held === empowerment.weapon ? empowerment.mods : [];
}

export const WEAPON_DAMAGE_STATS: ReadonlySet<StatId> = new Set<StatId>(['damagePercent', 'damageMin', 'damageMax', 'critChance', 'critMultiplier', 'attackSpeed']);

export function placeLive(node: SkillTreeNodeDef, held: string | null): boolean {
  return held === ANY_WEAPON || node.weapon === null || node.weapon === held;
}

export function liveStatMod(mod: StatMod): boolean {
  return !WEAPON_DAMAGE_STATS.has(mod.stat);
}

export function placeBound(node: SkillTreeNodeDef): boolean {
  return node.weapon !== null && node.statMods.some((mod: StatMod): boolean => !liveStatMod(mod));
}

export function heldPlace(node: SkillTreeNodeDef, held: string | null): SkillTreeNodeDef {
  if (placeLive(node, held)) return node;
  return { ...node, statMods: node.statMods.filter(liveStatMod) };
}
