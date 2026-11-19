import type { Content } from '../content/types.ts';
import type { RarityDef } from '../content/item-types.ts';
import type { Vec2 } from '../math.ts';
import type { Rng } from '../rng.ts';
import { fits as fitsIn } from '../stacks.ts';
import type { GroundItem, ItemInstance, PlayerState, World } from '../world/types.ts';
import { RL } from './contract.ts';

export interface PickupRule {
  readonly minRarity: number;
}

export const TAKE_ALL: PickupRule = { minRarity: 0 };

export function rarityIndex(content: Content, item: ItemInstance): number {
  return Math.max(0, content.rarities.findIndex((rarity: RarityDef): boolean => rarity.id === item.rarity));
}

export function rarityShare(content: Content, item: ItemInstance): number {
  return rarityIndex(content, item) / Math.max(1, content.rarities.length - 1);
}

export function ruleShare(content: Content, rule: PickupRule): number {
  return rule.minRarity / Math.max(1, content.rarities.length);
}

export function rollRule(content: Content, rng: Rng): PickupRule {
  return { minRarity: rng.int(0, content.rarities.length) };
}

export function fits(world: World, hero: PlayerState, ground: GroundItem): boolean {
  switch (ground.content.kind) {
    case 'gold':
      return true;
    case 'item':
      return fitsIn(world.content, hero.inventory, ground.content.item);
  }
  return false;
}

export function worth(content: Content, rule: PickupRule, ground: GroundItem): number {
  switch (ground.content.kind) {
    case 'gold':
      return 1;
    case 'item':
      return rarityIndex(content, ground.content.item) >= rule.minRarity ? 1 + rarityShare(content, ground.content.item) : 0;
  }
  return 0;
}

export function wanted(world: World, hero: PlayerState, rule: PickupRule, ground: GroundItem): boolean {
  return worth(world.content, rule, ground) > 0 && fits(world, hero, ground);
}

export function wantedLeft(world: World, hero: PlayerState, rule: PickupRule): boolean {
  return world.ground.some((ground: GroundItem): boolean => wanted(world, hero, rule, ground));
}

export function nearestWanted(world: World, hero: PlayerState, rule: PickupRule): GroundItem | null {
  const from: Vec2 = hero.pos;
  let best: GroundItem | null = null;
  let bestGap: number = RL.pickupReach;
  for (const ground of world.ground) {
    const reach: number = Math.hypot(ground.pos.x - from.x, ground.pos.z - from.z);
    if (reach > bestGap || !wanted(world, hero, rule, ground)) continue;
    best = ground;
    bestGap = reach;
  }
  return best;
}

export function bagFree(hero: PlayerState): number {
  const cells: readonly (ItemInstance | null)[] = hero.inventory;
  return cells.filter((cell: ItemInstance | null): boolean => cell === null).length / Math.max(1, cells.length);
}
