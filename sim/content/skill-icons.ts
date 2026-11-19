import type { Content, SkillDef } from './types.ts';

export function barSkills(content: Content): ReadonlySet<string> {
  const ids: Set<string> = new Set<string>();
  for (const unlock of content.player.skillBook) ids.add(unlock.skill);
  for (const binding of content.player.skillBar) if (binding.skill !== null) ids.add(binding.skill);
  for (const node of content.skillTree) {
    if (node.unlock !== null) ids.add(node.unlock);
    for (const variant of node.variants) ids.add(variant.becomes);
  }
  for (const base of content.itemBases.values()) for (const variant of base.variants) ids.add(variant.becomes);
  return ids;
}

export function changeRoots(content: Content, skill: string): ReadonlySet<string> {
  const parents: Map<string, string[]> = new Map<string, string[]>();
  for (const node of content.skillTree) for (const variant of node.variants) parents.set(variant.becomes, [...(parents.get(variant.becomes) ?? []), variant.skill]);
  const roots: Set<string> = new Set<string>();
  const seen: Set<string> = new Set<string>();
  const pending: string[] = [skill];
  for (let id: string | undefined = pending.pop(); id !== undefined; id = pending.pop()) {
    if (seen.has(id)) continue;
    seen.add(id);
    const above: readonly string[] = parents.get(id) ?? [];
    if (above.length === 0) roots.add(id);
    else pending.push(...above);
  }
  return roots;
}

function sameBase(content: Content, one: string, other: string): boolean {
  const roots: ReadonlySet<string> = changeRoots(content, one);
  return [...changeRoots(content, other)].some((root: string): boolean => roots.has(root));
}

export function sharedBarIcons(content: Content): string[] {
  const skills: SkillDef[] = [...barSkills(content)].map((id: string): SkillDef | undefined => content.skills.get(id)).filter((skill: SkillDef | undefined): skill is SkillDef => skill !== undefined).toSorted((one: SkillDef, other: SkillDef): number => one.id.localeCompare(other.id));
  const problems: string[] = [];
  for (const [index, one] of skills.entries()) for (const other of skills.slice(index + 1)) {
    if (one.icon === other.icon && !sameBase(content, one.id, other.id)) problems.push(`skills ${one.id} and ${other.id} can both sit on the bar but share the icon ${one.icon}`);
  }
  return problems;
}
