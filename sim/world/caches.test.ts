import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn, zoneOf } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content, PropDef, ZoneDef, ZonePack, ZoneProp } from '../content/types.ts';
import type { Cache } from './caches.ts';
import { cacheAt, cacheLevel, cacheNear, cacheReach } from './caches.ts';
import { stepWorld } from './step.ts';
import type { GroundItem, World, WorldEvent } from './types.ts';
import { enterZone } from './zones.ts';

const shipped: Content = loadContent();
const town: string = shipped.world.town;
const DT: number = 1 / 60;
const base: PropDef = must(shipped.props.get('pot'), 'pot');
const urn: PropDef = { ...base, id: 'test_urn', cache: { goldMin: 10, goldMax: 10, itemChance: 0, opened: 'test_urn_broken' } };
const satchel: PropDef = { ...base, id: 'test_satchel', cache: { goldMin: 0, goldMax: 0, itemChance: 1, opened: null } };
const broken: PropDef = { ...base, id: 'test_urn_broken', cache: null };

function contentWith(...ids: readonly string[]): Content {
  const zone: ZoneDef = zoneOf(shipped, town);
  const start = zone.playerStart;
  const placed: ZoneProp[] = ids.map((prop: string, index: number): ZoneProp => ({ prop, x: start.x + 3, z: start.z + 3 * index, y: 0, rotationDegrees: 0, when: [] }));
  const props: Map<string, PropDef> = new Map<string, PropDef>([...shipped.props, [urn.id, urn], [satchel.id, satchel], [broken.id, broken]]);
  const zones: Map<string, ZoneDef> = new Map<string, ZoneDef>([...shipped.zones, [town, { ...zone, props: [...zone.props, ...placed] }]]);
  return { ...shipped, props, zones };
}

function firstCache(world: World): Cache {
  const found: Cache[] = world.zone.props.flatMap((_: unknown, index: number): Cache[] => {
    const cache: Cache | null = cacheAt(world, index);
    return cache === null ? [] : [cache];
  });
  return must(found[0], 'cache');
}

function useUntilOpened(world: World, cache: Cache): WorldEvent[] {
  const seen: WorldEvent[] = [];
  stepWorld(world, [{ type: 'use', prop: cache.index }], DT);
  seen.push(...world.events);
  for (let step: number = 0; step < 900 && !world.cachesOpened.includes(cache.index); step += 1) {
    stepWorld(world, [], DT);
    seen.push(...world.events);
  }
  return seen;
}

void test('using a cache walks the hero to it, spills its gold and leaves it open', (): void => {
  const world: World = worldIn(contentWith('test_urn'), town, 3);
  const cache: Cache = firstCache(world);
  assert.equal(cacheNear(world, cache.placed)?.index, cache.index);
  const seen: WorldEvent[] = useUntilOpened(world, cache);
  assert.ok(Math.hypot(world.player.pos.x - cache.placed.x, world.player.pos.z - cache.placed.z) <= cacheReach(world, cache));
  const opened: WorldEvent | undefined = seen.find((event: WorldEvent): boolean => event.type === 'cache_opened');
  assert.equal(opened?.type, 'cache_opened');
  const gold: GroundItem[] = world.ground.filter((ground: GroundItem): boolean => ground.content.kind === 'gold');
  assert.equal(gold.length, 1);
  assert.equal(cacheAt(world, cache.index), null);
  assert.equal(cacheNear(world, cache.placed), null);
  stepWorld(world, [{ type: 'use', prop: cache.index }], DT);
  assert.equal(world.events.some((event: WorldEvent): boolean => event.type === 'cache_opened'), false);
});

void test('a cache that always holds an item drops one through the loot roll', (): void => {
  const world: World = worldIn(contentWith('test_satchel'), town, 5);
  useUntilOpened(world, firstCache(world));
  assert.equal(world.ground.filter((ground: GroundItem): boolean => ground.content.kind === 'item').length, 1);
  assert.equal(world.ground.filter((ground: GroundItem): boolean => ground.content.kind === 'gold').length, 0);
});

void test('caches close again when the hero comes back into the zone', (): void => {
  const content: Content = contentWith('test_urn');
  const world: World = worldIn(content, town, 7);
  const cache: Cache = firstCache(world);
  useUntilOpened(world, cache);
  assert.equal(cacheAt(world, cache.index), null);
  enterZone(world, zoneOf(content, town), { type: 'start' });
  assert.equal(cacheAt(world, cache.index)?.index, cache.index);
});

void test('a cache pays at the level of the nearest pack', (): void => {
  const world: World = worldIn(contentWith('test_urn'), town, 9);
  const cache: Cache = firstCache(world);
  const near: ZonePack = { x: cache.placed.x + 2, z: cache.placed.z, members: [], when: [], level: 12 };
  const far: ZonePack = { x: cache.placed.x + 40, z: cache.placed.z, members: [], when: [], level: 3 };
  world.zone = { ...world.zone, packs: [far, near] };
  assert.equal(cacheLevel(world, cache.placed), 12);
  world.zone = { ...world.zone, packs: [] };
  assert.equal(cacheLevel(world, cache.placed), Math.max(world.zone.level, Math.min(world.zone.levelUpTo, world.player.level)));
});

void test('a cache that opens into a look names a prop that exists', (): void => {
  for (const def of shipped.props.values()) {
    const opened: string | null = def.cache?.opened ?? null;
    if (opened !== null) assert.ok(shipped.props.has(opened), `${def.id} opens into ${opened}`);
  }
});
