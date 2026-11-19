import type { Content, SkillTreeNodeDef, TreeNodeKind } from '../../sim/content/types.ts';
import type { ChartPath } from '../../sim/content/chart-types.ts';
import { placeLinks } from '../../sim/progression.ts';
import { armTip } from '../../sim/specialty.ts';
import { esc } from './html.ts';

export const PICTURE = {
  scale: 10,
  margin: 8,
  radius: { minor: 2.2, notable: 4, keystone: 5.6 },
  routeRadius: { minor: 3, notable: 5.2, keystone: 7 },
  labelGap: 6,
  labelSize: 7.5,
  labelWidth: 0.66,
  numberSize: 6.2,
  fallback: '#c9d3df',
} as const;

export interface PicturePoint {
  readonly x: number;
  readonly y: number;
}

function at(node: SkillTreeNodeDef): PicturePoint {
  return { x: node.column * PICTURE.scale, y: node.row * PICTURE.scale };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function tintOf(content: Content, node: SkillTreeNodeDef): string {
  if (node.common !== null) return content.chart.common.tint;
  return content.chart.paths.find((entry: ChartPath): boolean => entry.id === node.path)?.tint ?? PICTURE.fallback;
}

function radiusOf(kind: TreeNodeKind, onRoute: boolean): number {
  return onRoute ? PICTURE.routeRadius[kind] : PICTURE.radius[kind];
}

interface Label {
  readonly text: string;
  readonly tint: string;
  readonly x: number;
  readonly y: number;
}

function labelsOf(content: Content): Label[] {
  return content.chart.paths.flatMap((entry: ChartPath): Label[] => {
    const far: SkillTreeNodeDef | null = armTip(content, entry.id);
    if (far === null) return [];
    const point: PicturePoint = at(far);
    const length: number = Math.hypot(point.x, point.y);
    const push: number = length === 0 ? 0 : (radiusOf('keystone', true) + PICTURE.labelGap) / length;
    return [{ text: entry.name, tint: entry.tint, x: round(point.x * (1 + push)), y: round(point.y * (1 + push) + (point.y > 0 ? PICTURE.labelSize : 0)) }];
  });
}

function bounds(content: Content, labels: readonly Label[]): { readonly left: number; readonly top: number; readonly width: number; readonly height: number } {
  const points: PicturePoint[] = content.skillTree.map(at);
  for (const label of labels) {
    const half: number = (label.text.length * PICTURE.labelSize * PICTURE.labelWidth) / 2;
    points.push({ x: label.x - half, y: label.y - PICTURE.labelSize }, { x: label.x + half, y: label.y });
  }
  const xs: readonly number[] = points.map((point: PicturePoint): number => point.x);
  const ys: readonly number[] = points.map((point: PicturePoint): number => point.y);
  const left: number = Math.min(...xs) - PICTURE.margin;
  const top: number = Math.min(...ys) - PICTURE.margin;
  return { left: round(left), top: round(top), width: round(Math.max(...xs) + PICTURE.margin - left), height: round(Math.max(...ys) + PICTURE.margin - top) };
}

function linkKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function routeLinks(content: Content, order: readonly string[]): ReadonlySet<string> {
  const links: ReadonlyMap<string, readonly string[]> = placeLinks(content);
  const held: Set<string> = new Set<string>();
  const used: Set<string> = new Set<string>();
  for (const id of order) {
    const from: string | undefined = (links.get(id) ?? []).find((other: string): boolean => held.has(other));
    if (from !== undefined) used.add(linkKey(id, from));
    held.add(id);
  }
  return used;
}

export function treePicture(content: Content, order: readonly string[], title: string): string {
  const named: readonly Label[] = labelsOf(content);
  const box = bounds(content, named);
  const nodes: ReadonlyMap<string, SkillTreeNodeDef> = new Map<string, SkillTreeNodeDef>(content.skillTree.map((node: SkillTreeNodeDef): [string, SkillTreeNodeDef] => [node.id, node]));
  const taken: ReadonlyMap<string, number> = new Map<string, number>(order.map((id: string, index: number): [string, number] => [id, index + 1]));
  const used: ReadonlySet<string> = routeLinks(content, order);
  const drawn: Set<string> = new Set<string>();
  const lines: string[] = [];
  const routeLines: string[] = [];
  for (const [id, near] of placeLinks(content)) {
    for (const other of near) {
      const key: string = linkKey(id, other);
      const a: SkillTreeNodeDef | undefined = nodes.get(id);
      const b: SkillTreeNodeDef | undefined = nodes.get(other);
      if (drawn.has(key) || a === undefined || b === undefined) continue;
      drawn.add(key);
      const from: PicturePoint = at(a);
      const to: PicturePoint = at(b);
      const segment: string = `x1="${round(from.x)}" y1="${round(from.y)}" x2="${round(to.x)}" y2="${round(to.y)}"`;
      if (used.has(key)) routeLines.push(`<line class="route-link" ${segment} stroke="${esc(tintOf(content, b))}" />`);
      else lines.push(`<line class="link" ${segment} />`);
    }
  }
  const dots: string[] = content.skillTree.map((node: SkillTreeNodeDef): string => {
    const point: PicturePoint = at(node);
    const index: number | undefined = taken.get(node.id);
    const onRoute: boolean = index !== undefined;
    const fill: string = onRoute ? tintOf(content, node) : 'none';
    return `<circle class="place ${node.kind}${onRoute ? ' taken' : ''}" cx="${round(point.x)}" cy="${round(point.y)}" r="${radiusOf(node.kind, onRoute)}" fill="${esc(fill)}" stroke="${esc(tintOf(content, node))}"><title>${esc(node.name)}</title></circle>`;
  });
  const numbers: string[] = order.flatMap((id: string, index: number): string[] => {
    const node: SkillTreeNodeDef | undefined = nodes.get(id);
    if (node === undefined || node.kind === 'minor') return [];
    const point: PicturePoint = at(node);
    return [`<text class="number" x="${round(point.x)}" y="${round(point.y + PICTURE.numberSize * 0.36)}" font-size="${PICTURE.numberSize}">${index + 1}</text>`];
  });
  const labels: string[] = named.map((label: Label): string => `<text class="path-label" x="${label.x}" y="${label.y}" font-size="${PICTURE.labelSize}" fill="${esc(label.tint)}">${esc(label.text)}</text>`);
  return `<svg class="tree-picture" viewBox="${box.left} ${box.top} ${box.width} ${box.height}" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg">
<g class="links">${lines.join('')}</g>
<g class="route-links">${routeLines.join('')}</g>
<g class="places">${dots.join('')}</g>
<g class="numbers">${numbers.join('')}</g>
<g class="labels">${labels.join('')}</g>
</svg>`;
}
