import type { Content, SkillTreeNodeDef, SpecialtyDef } from './content/types.ts';

export function specialtyOf(content: Content, id: string): SpecialtyDef | null {
  return content.chart.specialties.find((entry: SpecialtyDef): boolean => entry.id === id) ?? null;
}

export function heldSpecialty(content: Content, allocated: readonly string[]): string | null {
  const taken: ReadonlySet<string> = new Set<string>(allocated);
  for (const node of content.skillTree) if (node.specialty !== null && taken.has(node.id)) return node.specialty;
  return null;
}

export function closingSpecialty(content: Content, allocated: readonly string[], node: SkillTreeNodeDef): SpecialtyDef | null {
  if (node.specialty === null) return null;
  const held: string | null = heldSpecialty(content, allocated);
  if (held === null || held === node.specialty) return null;
  return specialtyOf(content, held);
}

export function specialtyClosed(content: Content, allocated: readonly string[], node: SkillTreeNodeDef): boolean {
  return closingSpecialty(content, allocated, node) !== null;
}

export function specialtyPlaces(content: Content, id: string): SkillTreeNodeDef[] {
  return content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.specialty === id);
}

export function withOneSpecialty(content: Content, allocated: readonly string[]): string[] {
  let chosen: string | null = null;
  return allocated.filter((id: string): boolean => {
    const specialty: string | null = content.skillTree.find((node: SkillTreeNodeDef): boolean => node.id === id)?.specialty ?? null;
    if (specialty === null) return true;
    chosen ??= specialty;
    return specialty === chosen;
  });
}

export function armPlaces(content: Content, path: string): SkillTreeNodeDef[] {
  return content.skillTree.filter((node: SkillTreeNodeDef): boolean => node.path === path && node.specialty === null && node.common === null);
}

export function opensSpecialty(content: Content, node: SkillTreeNodeDef): boolean {
  return node.specialty === null && content.skillTree.some((other: SkillTreeNodeDef): boolean => other.specialty !== null && other.requires.includes(node.id));
}

export function armBody(content: Content, path: string): SkillTreeNodeDef[] {
  return armPlaces(content, path).filter((node: SkillTreeNodeDef): boolean => !opensSpecialty(content, node));
}

export function armTip(content: Content, path: string): SkillTreeNodeDef | null {
  return farthestPlace(armBody(content, path));
}

export function farthestPlace(places: readonly SkillTreeNodeDef[]): SkillTreeNodeDef | null {
  let best: SkillTreeNodeDef | null = null;
  for (const node of places) if (best === null || Math.hypot(node.column, node.row) > Math.hypot(best.column, best.row)) best = node;
  return best;
}
