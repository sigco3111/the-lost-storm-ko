import type { Content } from '../sim/content/types.ts';
import type { Bar } from '../sim/skill-book.ts';
import type { ActionDef, ResolvedKeys, Shipped, SlotDefault } from './settings/bindings.ts';
import { actionTable, BINDING, isSkillAction, keyLabel, resolveKeys, slotName } from './settings/bindings.ts';

export interface TitleNames {
  readonly flasks: readonly string[];
  readonly skills: readonly (string | null)[];
}

export interface TitleKeyRow {
  readonly keys: string;
  readonly does: string;
}

export const TITLE_KEYS = {
  primary: { keys: '좌클릭', does: '이동, 공격, 줍기' },
  inPlace: { keys: 'Shift + 좌클릭', does: '제자리 공격' },
  primaryByKeys: { keys: '좌클릭', does: '공격, 줍기' },
  moves: '이동',
  movesJoiner: ' ',
  zoom: { keys: '마우스 휠', does: '확대/축소' },
  panelsPerRow: 3,
  or: ' 또는 ',
  joiner: ' · ',
  listClass: 'title-keys-desk',
  reboundClass: 'rebound',
  mouse: { [BINDING.leftMouse]: '좌클릭', [BINDING.rightMouse]: '우클릭', mouse_middle: '휠클릭' } as Readonly<Record<string, string>>,
} as const;

export function skillSlots(content: Content): readonly SlotDefault[] {
  return content.player.skillBar.map((entry, slot: number): SlotDefault => ({ name: slotName(slot), bindings: entry.bindings }));
}

function nameOfSkill(content: Content, skill: string | null): string | null {
  return skill === null ? null : (content.skills.get(skill)?.name ?? null);
}

export function titleNames(content: Content, bar: Bar): TitleNames {
  return {
    flasks: content.flasks.map((flask): string => flask.name),
    skills: content.player.skillBar.map((_entry, slot: number): string | null => nameOfSkill(content, bar[slot] ?? null)),
  };
}

export function shippedKeys(content: Content, ladder: boolean): Shipped {
  return { flasks: content.flasks.length, ladder };
}

export function defaultKeys(content: Content, ladder: boolean): ResolvedKeys {
  return resolveKeys(actionTable(skillSlots(content), shippedKeys(content, ladder)), {});
}

function keyName(code: string): string {
  return TITLE_KEYS.mouse[code] ?? keyLabel(code);
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function keysOf(keys: ResolvedKeys, def: ActionDef, joiner: string): string {
  return [...new Set<string>(keys.bindingsOf(def.id).map(keyName))].join(joiner);
}

function labelOf(def: ActionDef): string {
  return def.label;
}

function joined(keys: ResolvedKeys, defs: readonly ActionDef[], label: (def: ActionDef, index: number) => string): TitleKeyRow | null {
  const bound: readonly ActionDef[] = defs.filter((def: ActionDef): boolean => keys.bindingsOf(def.id).length > 0);
  if (bound.length === 0) return null;
  return { keys: capital(bound.map((def: ActionDef): string => keysOf(keys, def, TITLE_KEYS.or)).join(TITLE_KEYS.joiner)), does: bound.map(label).join(TITLE_KEYS.joiner) };
}

function slotIndex(def: ActionDef, skills: readonly ActionDef[]): number {
  return skills.indexOf(def) + 1;
}

export function titleKeyRows(keys: ResolvedKeys, names: TitleNames): readonly TitleKeyRow[] {
  const skills: readonly ActionDef[] = keys.table.filter((def: ActionDef): boolean => isSkillAction(def.id) && def.id !== 'primary');
  const skillName = (def: ActionDef): string => names.skills[slotIndex(def, skills)] ?? def.label;
  const named: readonly ActionDef[] = skills.filter((def: ActionDef): boolean => names.skills[slotIndex(def, skills)] !== null && names.skills[slotIndex(def, skills)] !== undefined);
  const skillRows: readonly TitleKeyRow[] = named.flatMap((def: ActionDef): readonly TitleKeyRow[] => {
    const row: TitleKeyRow | null = joined(keys, [def], skillName);
    return row === null ? [] : [row];
  });
  const flasks: readonly ActionDef[] = keys.table.filter((def: ActionDef): boolean => def.group === '약병');
  const panels: readonly ActionDef[] = keys.table.filter((def: ActionDef): boolean => def.group === '패널');
  const system: readonly ActionDef[] = keys.table.filter((def: ActionDef): boolean => def.group === '시스템');
  const flaskRow: TitleKeyRow | null = joined(keys, flasks, (def: ActionDef): string => names.flasks[flasks.indexOf(def)] ?? def.label);
  const bound: readonly ActionDef[] = panels.filter((def: ActionDef): boolean => keys.bindingsOf(def.id).length > 0);
  const panelRows: readonly (TitleKeyRow | null)[] = Array.from({ length: Math.ceil(bound.length / TITLE_KEYS.panelsPerRow) }, (_unused: unknown, row: number): TitleKeyRow | null => joined(keys, bound.slice(row * TITLE_KEYS.panelsPerRow, (row + 1) * TITLE_KEYS.panelsPerRow), labelOf));
  const grouped: readonly (TitleKeyRow | null)[] = [flaskRow, ...panelRows, joined(keys, system, labelOf)];
  const moveKeys: readonly string[] = keys.table.filter((def: ActionDef): boolean => def.group === '이동').flatMap((def: ActionDef): readonly string[] => keys.bindingsOf(def.id).slice(0, 1).map(keyName));
  const lead: readonly TitleKeyRow[] = moveKeys.length === 0 ? [TITLE_KEYS.primary, TITLE_KEYS.inPlace] : [{ keys: moveKeys.join(TITLE_KEYS.movesJoiner), does: TITLE_KEYS.moves }, TITLE_KEYS.primaryByKeys, TITLE_KEYS.inPlace];
  return [...lead, ...skillRows, ...grouped.filter((row: TitleKeyRow | null): row is TitleKeyRow => row !== null), TITLE_KEYS.zoom];
}

function escaped(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function titleKeysHtml(rows: readonly TitleKeyRow[]): string {
  return rows.map((row: TitleKeyRow): string => `<div><dt>${escaped(row.keys)}</dt><dd>${escaped(row.does)}</dd></div>`).join('');
}

export function showTitleKeys(list: Element | null, rows: readonly TitleKeyRow[]): void {
  if (list === null) return;
  const markup: string = titleKeysHtml(rows);
  if (list.innerHTML === markup) return;
  list.innerHTML = markup;
  list.classList.add(TITLE_KEYS.reboundClass);
}
