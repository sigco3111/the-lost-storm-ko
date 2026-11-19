import { distance } from '../math.ts';
import type { Vec2 } from '../math.ts';
import { addToInventory } from './character.ts';
import { removeGround } from './ground.ts';
import { countOf, placeIn } from '../stacks.ts';
import type { GroundItem, ItemInstance, PlayerState, World } from './types.ts';

export function pickUp(world: World, ground: GroundItem): void {
  const player: PlayerState = world.player;
  if (ground.content.kind === 'gold') {
    player.gold += ground.content.amount;
  } else if (!addToInventory(world, ground.content.item)) {
    takePart(world, ground, ground.content.item);
    return;
  }
  removeGround(world, ground.id);
  world.events.push({ type: 'pickup', ground });
  if (ground.content.kind === 'item') world.events.push({ type: 'character_changed' });
}

function takePart(world: World, ground: GroundItem, item: ItemInstance): void {
  world.events.push({ type: 'notice', reason: 'inventory_full' });
  const rest: ItemInstance | null = placeIn(world.content, world.player.inventory, item);
  if (rest === null || countOf(rest) === countOf(item)) return;
  ground.content = { kind: 'item', item: rest };
  world.events.push({ type: 'character_changed' });
}

export function aimedItem(world: World, at: Vec2): GroundItem | null {
  let best: GroundItem | null = null;
  let bestAway: number = world.content.player.pickupAim;
  for (const ground of world.ground) {
    const away: number = distance(ground.pos, at);
    if (away <= bestAway) {
      best = ground;
      bestAway = away;
    }
  }
  return best;
}
