import type { Content, DropLean, ItemBaseDef, RarityDef, WeaponGroup, ZoneDef } from '../../sim/content/types.ts';
import { groupOfKind } from '../../sim/weapons.ts';

export interface LegendaryPlaces {
  readonly family: readonly DropLean[];
  readonly weapon: readonly DropLean[];
  readonly boss: readonly DropLean[];
}

export function legendaryBases(content: Content): ItemBaseDef[] {
  return [...content.itemBases.values()].filter((base: ItemBaseDef): boolean => base.power !== null && base.dropWeight > 0);
}

export function familyPieces(content: Content, family: string): ItemBaseDef[] {
  return legendaryBases(content).filter((base: ItemBaseDef): boolean => base.power?.family === family);
}

export function legendary(content: Content, id: string): ItemBaseDef {
  const base: ItemBaseDef | undefined = content.itemBases.get(id);
  if (base?.power === null || base?.power === undefined || base.dropWeight <= 0) throw new Error(`${id} is not a legendary that drops`);
  return base;
}

function weaponGroupOf(content: Content, base: ItemBaseDef): WeaponGroup | null {
  return base.weaponKind === null ? null : groupOfKind(content, base.weaponKind);
}

export function placesFor(content: Content, base: ItemBaseDef): LegendaryPlaces {
  const family: string = base.power?.family ?? '';
  const group: string | null = weaponGroupOf(content, base)?.id ?? null;
  const leaning: DropLean[] = content.leans.filter((lean: DropLean): boolean => lean.share > 1);
  const byFamily: DropLean[] = leaning.filter((lean: DropLean): boolean => lean.families.includes(family));
  return {
    family: byFamily,
    weapon: leaning.filter((lean: DropLean): boolean => !byFamily.includes(lean) && group !== null && lean.weapons.includes(group)),
    boss: content.leans.filter((lean: DropLean): boolean => lean.legendary > 1),
  };
}

export function leanZones(content: Content, lean: DropLean): ZoneDef[] {
  return lean.zones.map((id: string): ZoneDef | undefined => content.zones.get(id)).filter((zone: ZoneDef | undefined): zone is ZoneDef => zone !== undefined);
}

export function leanWeapons(content: Content, lean: DropLean): WeaponGroup[] {
  return content.chart.weaponGroups.filter((group: WeaponGroup): boolean => lean.weapons.includes(group.id));
}

export function legendaryShare(content: Content, lean: DropLean | null, floor: string | null): number {
  const start: number = floor === null ? 0 : Math.max(0, content.rarities.findIndex((rarity: RarityDef): boolean => rarity.id === floor));
  const pool: readonly RarityDef[] = content.rarities.slice(start);
  const factor: number = lean?.legendary ?? 1;
  const weight = (rarity: RarityDef): number => (rarity.powers ? rarity.weight * factor : rarity.weight);
  const total: number = pool.reduce((sum: number, rarity: RarityDef): number => sum + weight(rarity), 0);
  const powered: number = pool.filter((rarity: RarityDef): boolean => rarity.powers).reduce((sum: number, rarity: RarityDef): number => sum + weight(rarity), 0);
  return total === 0 ? 0 : powered / total;
}
