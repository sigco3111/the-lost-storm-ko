import type { Content, ItemBaseDef, SkillTreeNodeDef, SkillVariant, WeaponGroup } from './content/types.ts';

export const SKILL_FORMS = {
  depth: 4,
} as const;

export interface SkillForms {
  readonly family: string | null;
  readonly steps: readonly (readonly string[])[];
}

function wornChanges(content: Content, group: WeaponGroup): readonly SkillVariant[] {
  return [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.weaponKind !== null && group.kinds.includes(base.weaponKind)).flatMap((base: ItemBaseDef): readonly SkillVariant[] => base.variants);
}

function treeChanges(content: Content): readonly SkillVariant[] {
  return content.skillTree.flatMap((node: SkillTreeNodeDef): readonly SkillVariant[] => node.variants);
}

function stepsFrom(skill: string, worn: readonly SkillVariant[], tree: readonly SkillVariant[]): string[][] {
  const steps: string[][] = [];
  const seen: Set<string> = new Set<string>([skill]);
  let current: readonly string[] = [skill];
  const first: SkillVariant | undefined = worn.find((entry: SkillVariant): boolean => entry.skill === skill);
  if (first !== undefined) {
    steps.push([first.becomes]);
    seen.add(first.becomes);
    current = [first.becomes];
  }
  for (let depth: number = 0; depth < SKILL_FORMS.depth; depth += 1) {
    const next: string[] = [];
    for (const entry of tree) {
      if (!current.includes(entry.skill) || seen.has(entry.becomes)) continue;
      seen.add(entry.becomes);
      next.push(entry.becomes);
    }
    if (next.length === 0) break;
    steps.push(next);
    current = next;
  }
  return steps;
}

function sameSteps(a: readonly (readonly string[])[], b: readonly (readonly string[])[]): boolean {
  return a.length === b.length && a.every((step: readonly string[], index: number): boolean => step.join('|') === (b[index] ?? []).join('|'));
}

export function skillForms(content: Content, skill: string): SkillForms[] {
  const tree: readonly SkillVariant[] = treeChanges(content);
  const loose: string[][] = stepsFrom(skill, [], tree);
  const families: SkillForms[] = content.chart.weaponGroups
    .map((group: WeaponGroup): SkillForms => ({ family: group.id, steps: stepsFrom(skill, wornChanges(content, group), tree) }))
    .filter((entry: SkillForms): boolean => entry.steps.length > 0 && !sameSteps(entry.steps, loose));
  return loose.length === 0 ? families : [{ family: null, steps: loose }, ...families];
}

export function formsText(content: Content, forms: SkillForms): string {
  const name = (id: string): string => content.skills.get(id)?.name ?? id;
  return forms.steps.map((step: readonly string[]): string => step.map(name).join(' or ')).join(', then ');
}
