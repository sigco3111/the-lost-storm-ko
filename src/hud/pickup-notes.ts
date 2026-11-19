import type { Content } from '../../sim/content/types.ts';
import { itemName } from '../../sim/items.ts';
import type { GroundItem } from '../../sim/world/types.ts';
import { promptText, use } from './prompts.ts';

export const PICKUP_NOTE = {
  bagClass: 'got-item',
  bagMs: 220,
} as const;

export function pickupLine(content: Content, ground: GroundItem): string | null {
  return ground.content.kind === 'item' ? `${itemName(content, ground.content.item)} 획득` : null;
}

export function findLabel(touch: boolean): string {
  return promptText(touch, use('줍기'));
}
