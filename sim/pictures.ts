import type { Content, ItemBaseDef, ItemSlot } from './content/types.ts';
import { ITEM_SLOTS } from './content/types.ts';
import { baseOf } from './items.ts';
import { goodItem } from './world/trade.ts';
import type { ItemInstance, PlayerState } from './world/types.ts';

export type PictureSource =
  | { readonly kind: 'held'; readonly attachment: string }
  | { readonly kind: 'worn'; readonly piece: string }
  | { readonly kind: 'book'; readonly base: string }
  | { readonly kind: 'keepsake'; readonly model: string }
  | { readonly kind: 'none' };

export interface Picture {
  readonly key: string;
  readonly source: PictureSource;
}

export const PICTURE_BATCH: number = 6;

export function pictureSource(base: ItemBaseDef): PictureSource {
  if (base.visual !== null) return { kind: 'held', attachment: base.visual };
  const piece: string | undefined = base.wear[0];
  if (piece !== undefined) return { kind: 'worn', piece };
  if (base.book !== null) return { kind: 'book', base: base.id };
  if (base.keepsake !== null) return { kind: 'keepsake', model: base.keepsake };
  return { kind: 'none' };
}

export function pictureKey(source: PictureSource): string | null {
  let key: string | null = null;
  switch (source.kind) {
    case 'held':
      key = source.attachment;
      break;
    case 'worn':
      key = `worn:${source.piece}`;
      break;
    case 'book':
      key = `book:${source.base}`;
      break;
    case 'keepsake':
      key = `keepsake:${source.model}`;
      break;
    case 'none':
      break;
  }
  return key;
}

export function hasPicture(base: ItemBaseDef | null): boolean {
  return base !== null && pictureSource(base).kind !== 'none';
}

export function pictureOf(content: Content, item: ItemInstance): Picture | null {
  const base: ItemBaseDef | null = baseOf(content, item);
  if (base === null) return null;
  const source: PictureSource = pictureSource(base);
  const key: string | null = pictureKey(source);
  return key === null ? null : { key, source };
}

export function picturesOf(content: Content, items: readonly (ItemInstance | null)[]): Picture[] {
  const seen: Set<string> = new Set<string>();
  const found: Picture[] = [];
  for (const item of items) {
    if (item === null) continue;
    const picture: Picture | null = pictureOf(content, item);
    if (picture === null || seen.has(picture.key)) continue;
    seen.add(picture.key);
    found.push(picture);
  }
  return found;
}

export function carriedPictures(content: Content, player: Pick<PlayerState, 'inventory' | 'equipped'>): Picture[] {
  const worn: (ItemInstance | null)[] = ITEM_SLOTS.map((slot: ItemSlot): ItemInstance | null => player.equipped[slot]);
  return picturesOf(content, [...worn, ...player.inventory]);
}

export function goodsPictures(content: Content): Picture[] {
  return picturesOf(content, content.trade.goods.map((_good: unknown, index: number): ItemInstance | null => goodItem(content, index)));
}

export function nextBatch<T>(waiting: readonly T[], limit: number = PICTURE_BATCH): { readonly now: T[]; readonly later: T[] } {
  return { now: waiting.slice(0, limit), later: waiting.slice(limit) };
}
