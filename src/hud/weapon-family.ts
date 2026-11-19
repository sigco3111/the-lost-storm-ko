import type { ChartPath, Content, ItemBaseDef, SkillDef, SkillEmpowerment, SkillTreeNodeDef, WeaponGroup } from '../../sim/content/types.ts';
import { describeEmpoweredMod } from '../../sim/stat-text.ts';
import { groupOfKind, placeBound, weaponGroup } from '../../sim/weapons.ts';
import { el, label } from './dom.ts';
import { iconSvg } from './icons.ts';

export function baseFamily(content: Content, base: ItemBaseDef | null): WeaponGroup | null {
  return base === null || base.weaponKind === null ? null : groupOfKind(content, base.weaponKind);
}

export function placeFamily(content: Content, node: SkillTreeNodeDef): WeaponGroup | null {
  return node.weapon === null || !placeBound(node) ? null : weaponGroup(content, node.weapon);
}

export const ANY_WEAPON_LINE: string = '모든 무기에 사용 가능';

export function strongerLine(content: Content, empowerment: SkillEmpowerment | null): string | null {
  if (empowerment === null) return null;
  const group: WeaponGroup | null = weaponGroup(content, empowerment.weapon);
  return group === null ? null : `${group.needs} 사용 시 강화: ${empowerment.mods.map(describeEmpoweredMod).join(', ')}`;
}

function placeSkills(content: Content, node: SkillTreeNodeDef): SkillDef[] {
  const ids: readonly string[] = [...(node.unlock === null ? [] : [node.unlock]), ...node.variants.map((variant): string => variant.becomes)];
  return ids.flatMap((id: string): SkillDef[] => {
    const skill: SkillDef | undefined = content.skills.get(id);
    return skill === undefined ? [] : [skill];
  });
}

export function placeWeaponLine(content: Content, node: SkillTreeNodeDef): string {
  const empowerment: SkillEmpowerment | null = placeSkills(content, node).find((skill: SkillDef): boolean => skill.empowered !== null)?.empowered ?? null;
  const group: WeaponGroup | null = empowerment === null ? null : weaponGroup(content, empowerment.weapon);
  return group === null ? ANY_WEAPON_LINE : `${ANY_WEAPON_LINE} · ${group.needs} 사용 시 강화`;
}

export function familyArm(content: Content, group: WeaponGroup): string {
  return content.chart.paths.find((path: ChartPath): boolean => path.id === group.path)?.name ?? group.path;
}

export function familyLine(content: Content, group: WeaponGroup): string {
  return `${group.name} · ${familyArm(content, group)} 스킬 강화`;
}

export function needLine(group: WeaponGroup): string {
  return `필요 ${group.needs}: ${group.holds}`;
}

export function pathFamily(content: Content, path: string): WeaponGroup | null {
  return content.chart.weaponGroups.find((group: WeaponGroup): boolean => group.path === path) ?? null;
}

export function familyMark(group: WeaponGroup, className: string, parent: HTMLElement | null): HTMLSpanElement {
  const mark: HTMLSpanElement = el('span', `family-mark ${className}`, parent);
  mark.innerHTML = iconSvg(group.icon);
  return mark;
}

export function familyRow(group: WeaponGroup, className: string, text: string, parent: HTMLElement | null): HTMLDivElement {
  const row: HTMLDivElement = el('div', `family-row ${className}`, parent);
  familyMark(group, 'family-row-mark', row);
  label('family-row-text', text, row);
  return row;
}
