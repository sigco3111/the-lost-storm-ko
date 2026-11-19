import { sameSide } from './heroes.ts';
import type { Actor, World } from './types.ts';

export function dealtScale(world: World, actor: Actor): number {
  let scale: number = 1;
  for (const area of world.areas) {
    const delivery = area.skill.delivery;
    if (delivery.type !== 'area' || delivery.weaken <= 0 || sameSide(world, area.offence, actor)) continue;
    if (Math.hypot(actor.pos.x - area.pos.x, actor.pos.z - area.pos.z) > delivery.radius + actor.radius) continue;
    scale = Math.min(scale, 1 - delivery.weaken);
  }
  return scale;
}
