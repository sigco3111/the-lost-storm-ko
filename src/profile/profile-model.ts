import type { Content, ItemSlot } from '../../sim/content/types.ts';
import { ITEM_SLOTS } from '../../sim/content/types.ts';
import { heroOf, heroRig } from '../../sim/hero.ts';
import { heroBase, lookOf, wornBasesOf } from '../../sim/wear.ts';
import type { Look } from '../../sim/wear.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { CharacterProfile, ProfileBuild, WornItem } from '../backend/api.ts';

export const PROFILE_MODEL: { readonly firstUid: number; readonly separator: string } = { firstUid: -1_000_000, separator: ' · ' };

export interface ProfileSlot {
  readonly slot: ItemSlot;
  readonly item: ItemInstance | null;
}

export interface ProfileFigure {
  readonly rig: string;
  readonly look: Look;
  readonly key: string;
}

export function profileSlots(profile: CharacterProfile, batch: number): readonly ProfileSlot[] {
  return ITEM_SLOTS.map((slot: ItemSlot, index: number): ProfileSlot => {
    const worn: WornItem | undefined = profile.worn.find((entry: WornItem): boolean => entry.slot === slot);
    return { slot, item: worn === undefined ? null : { uid: PROFILE_MODEL.firstUid - batch * ITEM_SLOTS.length - index, base: worn.base, rarity: worn.rarity, level: worn.level, affixes: worn.affixes, ledger: null } };
  });
}

export function profileHeadline(content: Content, profile: CharacterProfile): string {
  const parts: string[] = [`레벨 ${String(profile.level)}`, heroOf(content, profile.hero).name];
  if (profile.furthest !== '') parts.push(profile.furthest);
  return parts.join(PROFILE_MODEL.separator);
}

export function buildSkills(content: Content, build: ProfileBuild | null): readonly string[] {
  if (build === null) return [];
  const names: string[] = [];
  for (const id of build.bar) {
    const name: string | undefined = id === null ? undefined : content.skills.get(id)?.name;
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return names;
}

export function placesText(places: number): string {
  return places === 1 ? '스킬 트리 포인트 1 사용' : `스킬 트리 포인트 ${String(places)}개 사용`;
}

export function profileFigure(content: Content, profile: CharacterProfile): ProfileFigure {
  const rig: string = heroRig(content, profile.hero);
  const worn: Record<string, string> = {};
  for (const entry of profile.worn) worn[entry.slot] = entry.base;
  const look: Look = lookOf(content, rig, heroBase(content, rig), wornBasesOf(worn));
  return { rig, look, key: `${rig}#${look.wearables.join('|')}#${look.held.join('|')}` };
}
