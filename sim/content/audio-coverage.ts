import type { AudioDef, CueTable } from './audio.ts';
import type { AreaDelivery } from './shape-types.ts';
import type { Content, ItemBaseDef, SkillDef, SkillTreeNodeDef, SkillVariant } from './types.ts';

export const LASTING_AREA = { minDuration: 2, category: 'lasting' } as const;

function variantsOf(content: Content): readonly SkillVariant[] {
  const fromTree: readonly SkillVariant[] = content.skillTree.flatMap((node: SkillTreeNodeDef): readonly SkillVariant[] => node.variants);
  const fromItems: readonly SkillVariant[] = [...content.itemBases.values()].flatMap((base: ItemBaseDef): readonly SkillVariant[] => base.variants.concat(base.power?.variants ?? []));
  return [...fromTree, ...fromItems];
}

function rootsOf(variants: readonly SkillVariant[], form: string, seen: ReadonlySet<string> = new Set<string>()): readonly string[] {
  const parents: readonly string[] = variants.filter((entry: SkillVariant): boolean => entry.becomes === form && !seen.has(entry.skill)).map((entry: SkillVariant): string => entry.skill);
  if (parents.length === 0) return [form];
  return parents.flatMap((parent: string): readonly string[] => rootsOf(variants, parent, new Set<string>([...seen, form])));
}

function starts(audio: AudioDef): readonly CueTable[] {
  return [audio.skillStart, audio.skillImpact, audio.projectileSpawn, audio.areaStart, audio.brand];
}

function areaOf(skill: SkillDef): AreaDelivery | null {
  return skill.delivery.type === 'area' ? skill.delivery : null;
}

function heard(tables: readonly CueTable[], keys: readonly string[]): boolean {
  return tables.some((table: CueTable): boolean => keys.some((key: string): boolean => (table.get(key)?.length ?? 0) > 0));
}

export function soundProblems(content: Content, audio: AudioDef): readonly string[] {
  const variants: readonly SkillVariant[] = variantsOf(content);
  const problems: string[] = [];
  for (const skill of content.skills.values()) {
    if (audio.silent.has(skill.form)) continue;
    const keys: readonly string[] = [skill.form, ...rootsOf(variants, skill.form)];
    if (!heard(starts(audio), keys)) problems.push(`${skill.form} has no sound when it starts`);
    const area: AreaDelivery | null = areaOf(skill);
    if (area === null) continue;
    if (area.duration >= LASTING_AREA.minDuration && area.pulse > 0 && !heard([audio.areaPulse], keys)) problems.push(`${skill.form} stands for ${area.duration} s and pulses every ${area.pulse} s but has no sound while it stands`);
    if (skill.category === LASTING_AREA.category && !heard([audio.areaEnd], keys)) problems.push(`${skill.form} is a lasting area but has no sound when it ends`);
  }
  for (const id of audio.silent.keys()) {
    if (!content.skills.has(id)) problems.push(`${id} is listed as silent but is not a skill`);
    else if (heard(starts(audio), [id])) problems.push(`${id} is listed as silent but has a start sound`);
  }
  return problems;
}
