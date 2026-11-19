import type { ChartPath, Content, SkillTreeNodeDef, SkillVariant, SpecialtyDef } from '../../sim/content/types.ts';
import { holdingTrunk, placeLinks, startingPlaces } from '../../sim/progression.ts';
import { armTip, farthestPlace, specialtyOf, specialtyPlaces } from '../../sim/specialty.ts';

export const CHART_MODEL = {
  labelReach: 1.13,
  specialtyReach: 1.6,
  minQuery: 2,
} as const;

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

export interface ChartBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface PathLabel {
  readonly path: ChartPath;
  readonly at: ChartPoint;
}

export interface SpecialtyLabel {
  readonly specialty: SpecialtyDef;
  readonly tint: string;
  readonly at: ChartPoint;
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9']+/).filter((word: string): boolean => word.length > 0);
}

function searchText(content: Content, node: SkillTreeNodeDef): string {
  const path: string = content.chart.paths.find((entry: ChartPath): boolean => entry.id === node.path)?.name ?? '';
  const varied: readonly string[] = node.variants.map((variant: SkillVariant): string => content.skills.get(variant.skill)?.name ?? '');
  const specialty: string = node.specialty === null ? '' : (specialtyOf(content, node.specialty)?.name ?? '');
  const common: string = node.common === null ? '' : content.chart.common.name;
  return [node.name, node.description, path, specialty, common, ...varied].join(' ').toLowerCase();
}

export function chartMatches(content: Content, query: string): ReadonlySet<string> | null {
  const wanted: readonly string[] = words(query);
  if (wanted.join('').length < CHART_MODEL.minQuery) return null;
  const found: Set<string> = new Set<string>();
  for (const node of content.skillTree) {
    const text: string = searchText(content, node);
    if (wanted.every((word: string): boolean => text.includes(word))) found.add(node.id);
  }
  return found;
}

export function chartBounds(nodes: readonly SkillTreeNodeDef[]): ChartBounds {
  const columns: readonly number[] = nodes.map((node: SkillTreeNodeDef): number => node.column);
  const rows: readonly number[] = nodes.map((node: SkillTreeNodeDef): number => node.row);
  if (columns.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
  return { left: Math.min(...columns), top: Math.min(...rows), right: Math.max(...columns), bottom: Math.max(...rows) };
}

export function chartFocus(content: Content, allocated: readonly string[]): ChartPoint {
  const taken: readonly SkillTreeNodeDef[] = content.skillTree.filter((node: SkillTreeNodeDef): boolean => allocated.includes(node.id));
  if (taken.length === 0) {
    const bounds: ChartBounds = chartBounds(content.skillTree);
    return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  }
  const sum: ChartPoint = taken.reduce((total: ChartPoint, node: SkillTreeNodeDef): ChartPoint => ({ x: total.x + node.column, y: total.y + node.row }), { x: 0, y: 0 });
  return { x: sum.x / taken.length, y: sum.y / taken.length };
}

export function pathLabels(content: Content): PathLabel[] {
  const labels: PathLabel[] = [];
  for (const path of content.chart.paths) {
    const far: SkillTreeNodeDef | null = armTip(content, path.id);
    if (far === null) continue;
    labels.push({ path, at: { x: far.column * CHART_MODEL.labelReach, y: far.row * CHART_MODEL.labelReach } });
  }
  return labels;
}

export function specialtyLabels(content: Content): SpecialtyLabel[] {
  const labels: SpecialtyLabel[] = [];
  for (const specialty of content.chart.specialties) {
    const far: SkillTreeNodeDef | null = farthestPlace(specialtyPlaces(content, specialty.id));
    if (far === null) continue;
    const length: number = Math.hypot(far.column, far.row);
    const push: number = length === 0 ? 0 : CHART_MODEL.specialtyReach / length;
    labels.push({ specialty, tint: pathTint(content, specialty.path), at: { x: far.column * (1 + push), y: far.row * (1 + push) } });
  }
  return labels;
}

export function pathTint(content: Content, pathId: string): string {
  return content.chart.paths.find((path: ChartPath): boolean => path.id === pathId)?.tint ?? '#8fd8ff';
}

export function placeTint(content: Content, node: SkillTreeNodeDef): string {
  return node.common === null ? pathTint(content, node.path) : content.chart.common.tint;
}

function walk(links: ReadonlyMap<string, readonly string[]>, starts: readonly string[], allocated: readonly string[], target: string): string[] {
  const cameFrom: Map<string, string | null> = new Map<string, string | null>(starts.map((id: string): [string, string | null] => [id, null]));
  const queue: string[] = [...starts];
  for (let index: number = 0; index < queue.length; index += 1) {
    const at: string | undefined = queue[index];
    if (at === undefined || at === target) break;
    for (const next of links.get(at) ?? []) {
      if (cameFrom.has(next)) continue;
      cameFrom.set(next, at);
      queue.push(next);
    }
  }
  if (!cameFrom.has(target)) return [];
  const route: string[] = [];
  let step: string | null = target;
  while (step !== null) {
    if (!allocated.includes(step)) route.unshift(step);
    step = cameFrom.get(step) ?? null;
  }
  return route;
}

export function chartRoute(content: Content, allocated: readonly string[], target: string): string[] {
  if (allocated.includes(target)) return [];
  const trunk: readonly string[] = holdingTrunk(content, allocated);
  return walk(placeLinks(content), trunk.length > 0 ? trunk : startingPlaces(content), allocated, target);
}

export function chartHere(content: Content, allocated: readonly string[]): string | null {
  for (let index: number = allocated.length - 1; index >= 0; index -= 1) {
    const id: string | undefined = allocated[index];
    if (id !== undefined && content.skillTree.some((node: SkillTreeNodeDef): boolean => node.id === id)) return id;
  }
  return null;
}
