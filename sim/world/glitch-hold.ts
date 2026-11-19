import type { World } from './types.ts';

export function attacksHeld(world: World): boolean {
  const phase: string | null = world.scene?.phase ?? null;
  return world.time < world.glitch.holdUntil || phase === 'strike';
}
