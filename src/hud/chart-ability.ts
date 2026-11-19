import type { Content, SkillCategory, SkillDef, SkillTreeNodeDef } from '../../sim/content/types.ts';
import { placeLearned } from '../../sim/skill-book.ts';

export const CATEGORY_NAMES: Readonly<Record<SkillCategory, string>> = {
  none: '',
  area: '범위',
  single: '단일 대상',
  chain: '연쇄',
  charged: '충전',
  mark: '표',
  movement: '이동',
  defence: '방어',
  channel: '집중',
  lasting: '지속',
  melee: '근접',
  root: '속박',
  revive: '부활',
};

export interface AbilityCard {
  readonly skill: SkillDef;
  readonly tags: string;
  readonly cost: string;
  readonly slot: number | null;
}

export function damageWord(skill: SkillDef): string {
  const weapon: boolean = skill.damage.weaponPercent > 0;
  const storm: boolean = skill.damage.flatMax > 0;
  if (weapon && storm) return '무기·폭풍 피해';
  if (weapon) return '무기 피해';
  if (storm) return '폭풍 피해';
  return '피해 없음';
}

function seconds(value: number): string {
  return `${Number(value.toFixed(1))}s`;
}

export function costWords(skill: SkillDef): string {
  const mana: string = skill.manaCost > 0 ? `마나 ${skill.manaCost}` : '마나 없음';
  return skill.cooldown > 0 ? `마나 ${mana} · 재사용 ${seconds(skill.cooldown)}` : mana;
}

export function abilityCard(content: Content, node: SkillTreeNodeDef, bar: readonly (string | null)[]): AbilityCard | null {
  const skill: SkillDef | undefined = node.unlock === null ? undefined : content.skills.get(node.unlock);
  if (skill === undefined) return null;
  const slot: number = placeLearned(content, bar, skill.id).indexOf(skill.id);
  const tags: string = [CATEGORY_NAMES[skill.category], damageWord(skill)].filter((word: string): boolean => word.length > 0).join(' · ');
  return { skill, tags, cost: costWords(skill), slot: slot < 0 ? null : slot };
}
