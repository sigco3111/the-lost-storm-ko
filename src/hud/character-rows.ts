import type { CharacterSheet, Figure } from '../../sim/character-sheet.ts';
import type { StatId } from '../../sim/content/types.ts';
import { ARMOUR_HALF_POINT } from '../../sim/stats.ts';

export type Source = 'base' | 'gear' | 'tree' | 'total';

export interface SheetRow {
  readonly name: string;
  readonly note: string | null;
  readonly read: (sheet: CharacterSheet, source: Source) => readonly number[];
  readonly format: (values: readonly number[]) => string;
}

const whole = (values: readonly number[]): string => String(Math.round(values[0] ?? 0));
const tenths = (values: readonly number[]): string => (values[0] ?? 0).toFixed(1);
const perSecond = (values: readonly number[]): string => `${tenths(values)}/s`;
const percent = (values: readonly number[]): string => `${Math.round((values[0] ?? 0) * 100)}%`;
const bonus = (values: readonly number[]): string => `+${percent(values)}`;
const percentTenth = (values: readonly number[]): string => `${((values[0] ?? 0) * 100).toFixed(1)}%`;
const range = (values: readonly number[]): string => `${Math.round(values[0] ?? 0)}–${Math.round(values[1] ?? 0)}`;

function stat(sheet: CharacterSheet, id: StatId, source: Source): number {
  const figure: Figure = sheet.figures[id];
  return source === 'total' ? figure.total : figure[source];
}

function single(name: string, id: StatId, format: SheetRow['format']): SheetRow {
  return { name, note: null, read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, id, source)], format };
}

export const DEFENCE_ROWS: readonly SheetRow[] = [
  single('생명력', 'maxLife', whole),
  single('마나', 'maxMana', whole),
  single('생명력 재생', 'lifeRegen', perSecond),
  single('마나 재생', 'manaRegen', perSecond),
  single('방어력', 'armour', whole),
  {
    name: '피해 감소',
    note: `받는 모든 피해는 레벨과 무관하게 방어구 ÷ (방어구 + ${ARMOUR_HALF_POINT})만큼 줄어든다.`,
    read: (sheet: CharacterSheet, source: Source): readonly number[] => (source === 'total' ? [sheet.armourReduction] : [0]),
    format: percent,
  },
  {
    name: '폭풍 저항',
    note: '폭풍 피해를 상한까지 줄인다. 더 깊은 폭풍 단계에서는 일부가 깎인다.',
    read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, 'stormResist', source)],
    format: percent,
  },
  {
    name: '냉기 저항',
    note: '냉기 피해를 상한까지 줄인다. 더 깊은 폭풍 단계에서는 일부가 깎인다.',
    read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, 'frostResist', source)],
    format: percent,
  },
  single('이동 속도', 'moveSpeed', tenths),
];

export const OFFENCE_ROWS: readonly SheetRow[] = [
  {
    name: '무기 피해',
    note: null,
    read: (sheet: CharacterSheet, source: Source): readonly number[] => [stat(sheet, 'damageMin', source), stat(sheet, 'damageMax', source)],
    format: range,
  },
  single('피해 보너스', 'damagePercent', bonus),
  single('공격 속도', 'attackSpeed', percent),
  single('치명타 확률', 'critChance', percentTenth),
  single('치명타 피해', 'critMultiplier', percent),
  single('획득 골드', 'goldFind', percent),
];

export const SOURCES: readonly { readonly source: Source; readonly title: string }[] = [
  { source: 'base', title: '기본' },
  { source: 'gear', title: '장비' },
  { source: 'tree', title: '스킬 트리' },
];
