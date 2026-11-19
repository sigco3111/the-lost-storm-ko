import type { World } from '../../sim/world/types.ts';
import type { LevelSpan } from '../../sim/world/spawn.ts';
import { levelSpan } from '../../sim/world/spawn.ts';

export function zoneLevelText(world: World): string | null {
  if (world.zone.kind !== 'wild') return null;
  const span: LevelSpan = levelSpan(world);
  return span.least === span.most ? `레벨 ${span.least}` : `레벨 ${span.least}–${span.most}`;
}
