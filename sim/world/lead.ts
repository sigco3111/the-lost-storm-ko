import type { ReadonlyVec2, Vec2 } from '../math.ts';
import type { Actor } from './types.ts';

function alongPath(from: ReadonlyVec2, path: readonly ReadonlyVec2[], reach: number): Vec2 {
  let at: Vec2 = { x: from.x, z: from.z };
  let left: number = reach;
  for (const point of path) {
    const gap: number = Math.hypot(point.x - at.x, point.z - at.z);
    if (gap >= left) return { x: at.x + ((point.x - at.x) / gap) * left, z: at.z + ((point.z - at.z) / gap) * left };
    left -= gap;
    at = { x: point.x, z: point.z };
  }
  return at;
}

export function ledAim(foe: Actor, lead: number): Vec2 {
  if (lead <= 0 || foe.kind !== 'player' || !foe.moving || foe.path.length === 0) return { x: foe.pos.x, z: foe.pos.z };
  return alongPath(foe.pos, foe.path, foe.stats.moveSpeed * foe.tempo * lead);
}
