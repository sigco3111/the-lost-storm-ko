import type { ChartPath, Content, SkillTreeNodeDef, SpecialtyDef } from '../../sim/content/types.ts';
import { heldSpecialty, specialtyOf } from '../../sim/specialty.ts';
import { createNameView } from './chart-label.ts';
import type { NameView } from './chart-label.ts';
import { specialtyLabels } from './chart-model.ts';
import type { ChartPoint, SpecialtyLabel } from './chart-model.ts';

export const TREE_SPECIALTY = {
  nameClass: 'chart-path-name specialty',
} as const;

export interface SpecialtyName {
  readonly id: string;
  readonly view: NameView;
}

function pathOf(content: Content, node: SkillTreeNodeDef): ChartPath | undefined {
  return content.chart.paths.find((entry: ChartPath): boolean => entry.id === node.path);
}

function specialtyFor(content: Content, node: SkillTreeNodeDef): SpecialtyDef | null {
  return node.specialty === null ? null : specialtyOf(content, node.specialty);
}

export function placeHome(content: Content, node: SkillTreeNodeDef): string {
  if (node.common !== null) return content.chart.common.name;
  const specialty: SpecialtyDef | null = specialtyFor(content, node);
  if (specialty !== null) return specialty.name;
  return pathOf(content, node)?.name ?? node.kind;
}

export function specialtyLine(content: Content, node: SkillTreeNodeDef): string | null {
  const path: ChartPath | undefined = pathOf(content, node);
  if (specialtyFor(content, node) === null || path === undefined) return null;
  return `${path.name}의 전공. 전체 트리에서 전공은 하나만 따를 수 있다.`;
}

export function createSpecialtyNames(content: Content, host: HTMLElement, place: (point: ChartPoint) => ChartPoint): SpecialtyName[] {
  return specialtyLabels(content).map((entry: SpecialtyLabel): SpecialtyName => ({ id: entry.specialty.id, view: createNameView(host, entry.specialty.name, entry.tint, place(entry.at), null, TREE_SPECIALTY.nameClass, false) }));
}

export function markSpecialtyNames(content: Content, names: readonly SpecialtyName[], allocated: readonly string[]): void {
  const chosen: string | null = heldSpecialty(content, allocated);
  for (const entry of names) {
    entry.view.mark('closed', chosen !== null && chosen !== entry.id);
    entry.view.mark('chosen', chosen === entry.id);
  }
}
