import type { StoryFlags } from './content/story-types.ts';
import type { Content, ItemBaseDef, SkillTreeNodeDef, WeaponGroup } from './content/types.ts';
import { generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { groupOfKind } from './weapons.ts';
import type { ArmedWhere, ItemInstance } from './world/types.ts';

const ARMING: { readonly flagPrefix: string; readonly toldPrefix: string; readonly told: string } = { flagPrefix: 'armed_', toldPrefix: 'told_armed_', told: 'yes' };


export interface Holding {
  readonly level: number;
  readonly allocated: readonly string[];
  readonly owned: readonly (ItemInstance | null)[];
  readonly flags: StoryFlags;
  readonly nextItemUid: number;
  readonly room: number;
}

export interface Armed {
  readonly laid: readonly ItemInstance[];
  readonly flags: StoryFlags;
  readonly nextItemUid: number;
}

export function armedFlag(group: string): string {
  return `${ARMING.flagPrefix}${group}`;
}

export function armedWhere(value: string | undefined): ArmedWhere | null {
  return value === 'bag' || value === 'ground' ? value : null;
}

export function toldFlag(group: string): string {
  return `${ARMING.toldPrefix}${group}`;
}

export function toldValue(): string {
  return ARMING.told;
}

function ownedGroups(content: Content, owned: readonly (ItemInstance | null)[]): Set<string> {
  const groups: Set<string> = new Set<string>();
  for (const item of owned) {
    const base: ItemBaseDef | undefined = item === null ? undefined : content.itemBases.get(item.base);
    const group: WeaponGroup | null = base === undefined || base.weaponKind === null ? null : groupOfKind(content, base.weaponKind);
    if (group !== null) groups.add(group.id);
  }
  return groups;
}

export function armOnce(content: Content, holding: Holding): Armed {
  const wanted: ReadonlySet<string> = new Set<string>(content.skillTree.filter((node: SkillTreeNodeDef): boolean => holding.allocated.includes(node.id)).flatMap((node: SkillTreeNodeDef): string[] => (node.weapon === null ? [] : [node.weapon])));
  const owned: ReadonlySet<string> = ownedGroups(content, holding.owned);
  const common: string | null = content.rarities[0]?.id ?? null;
  const laid: ItemInstance[] = [];
  const flags: Record<string, string> = { ...holding.flags };
  let uid: number = holding.nextItemUid;
  for (const group of content.chart.weaponGroups) {
    const flag: string = armedFlag(group.id);
    if (!wanted.has(group.id) || owned.has(group.id) || flags[flag] !== undefined) continue;
    const item: ItemInstance | null = generateItem(content, createRng(uid), uid, holding.level, group.starter, common);
    if (item === null) continue;
    const where: ArmedWhere = laid.length < holding.room ? 'bag' : 'ground';
    laid.push(item);
    uid += 1;
    flags[flag] = where;
  }
  return { laid, flags, nextItemUid: uid };
}
