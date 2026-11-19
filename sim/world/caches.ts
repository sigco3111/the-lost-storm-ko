import type { PropCache, PropDef, ZonePack, ZoneProp } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import { distance } from '../math.ts';
import { allHold } from './conditions.ts';
import { dropOnGround } from './ground.ts';
import { rollDrop } from './loot.ts';
import { monsterLevel, packLevel } from './spawn.ts';
import type { ItemInstance, World } from './types.ts';

export const CACHES = {
  pick: 0.9,
} as const;

export interface Cache {
  readonly index: number;
  readonly placed: ZoneProp;
  readonly def: PropDef;
  readonly cache: PropCache;
}

export function cacheAt(world: World, index: number): Cache | null {
  const placed: ZoneProp | undefined = world.zone.props[index];
  if (placed === undefined || world.cachesOpened.includes(index)) return null;
  const def: PropDef | undefined = world.content.props.get(placed.prop);
  if (def === undefined || def.cache === null || !allHold(world, placed.when)) return null;
  return { index, placed, def, cache: def.cache };
}

export function cacheNear(world: World, point: Vec2): Cache | null {
  for (let index: number = 0; index < world.zone.props.length; index += 1) {
    const cache: Cache | null = cacheAt(world, index);
    if (cache !== null && distance(point, cache.placed) <= Math.max(cache.def.blockRadius, CACHES.pick) + world.content.player.radius) return cache;
  }
  return null;
}

export function cacheReach(world: World, cache: Cache): number {
  return world.content.trade.reach + cache.def.blockRadius;
}

export function cacheLevel(world: World, at: Vec2): number {
  let best: ZonePack | null = null;
  for (const pack of world.zone.packs) if (best === null || distance(pack, at) < distance(best, at)) best = pack;
  return best === null ? monsterLevel(world) : packLevel(world, best);
}

export function openCache(world: World, cache: Cache): void {
  if (world.cachesOpened.includes(cache.index)) return;
  const at: Vec2 = { x: cache.placed.x, z: cache.placed.z };
  const level: number = cacheLevel(world, at);
  const scale: number = (1 + world.content.world.scaling.xpPerLevel * (level - 1)) * (1 + world.player.stats.goldFind);
  const gold: number = Math.round(world.rng.int(cache.cache.goldMin, cache.cache.goldMax) * scale);
  world.cachesOpened.push(cache.index);
  if (gold > 0) dropOnGround(world, at, { kind: 'gold', amount: gold });
  if (world.rng.chance(cache.cache.itemChance)) {
    const item: ItemInstance | null = rollDrop(world, level, null, { kind: 'cache', prop: cache.def.id, zone: world.zone.id });
    if (item !== null) dropOnGround(world, at, { kind: 'item', item });
  }
  world.events.push({ type: 'cache_opened', prop: cache.index, pos: at, gold });
}
