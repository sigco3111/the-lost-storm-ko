import type { Content } from '../../sim/content/types.ts';
import { weaponGroup } from '../../sim/weapons.ts';
import type { ArmedWhere } from '../../sim/world/types.ts';

export interface ArmedLine {
  readonly title: string;
  readonly subtitle: string | null;
}

const PLACES: Readonly<Record<ArmedWhere | 'unknown', string>> = { bag: '가방에', ground: '발밑에', unknown: '그대에게' };

export function armedLine(content: Content, group: string, base: string, where: ArmedWhere | null): ArmedLine {
  const needs: string = weaponGroup(content, group)?.needs ?? '무기';
  return { title: `${needs.charAt(0).toUpperCase()}${needs.slice(1)} was laid ${where === null ? PLACES.unknown : PLACES[where]}`, subtitle: content.itemBases.get(base)?.name ?? null };
}
