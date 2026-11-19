import type { Content, SkillTreeNodeDef, StatMod, WeaponGroup } from '../../sim/content/types.ts';
import { itemName } from '../../sim/items.ts';
import { describeExactMod } from '../../sim/stat-text.ts';
import { heldGroup, liveStatMod, placeLive, weaponGroup } from '../../sim/weapons.ts';
import type { Equipment, ItemInstance } from '../../sim/world/types.ts';

export interface PlaceOff {
  readonly lines: readonly string[];
  readonly need: string;
  readonly holding: string;
}

export function holdingLine(content: Content, equipped: Equipment): string {
  const weapon: ItemInstance | null = equipped.weapon;
  if (weapon === null) return '손에 든 것이 없다.';
  const group: WeaponGroup | null = weaponGroup(content, heldGroup(content, equipped) ?? '');
  return group === null ? `보유: ${itemName(content, weapon)}` : `보유한 ${group.needs}: ${itemName(content, weapon)}`;
}

export function placeOff(content: Content, node: SkillTreeNodeDef, equipped: Equipment): PlaceOff | null {
  const group: WeaponGroup | null = node.weapon === null ? null : weaponGroup(content, node.weapon);
  if (group === null || placeLive(node, heldGroup(content, equipped))) return null;
  const lines: string[] = node.statMods.filter((mod: StatMod): boolean => !liveStatMod(mod)).map(describeExactMod);
  if (lines.length === 0) return null;
  return { lines, need: `비활성: ${group.needs} 필요`, holding: holdingLine(content, equipped) };
}
