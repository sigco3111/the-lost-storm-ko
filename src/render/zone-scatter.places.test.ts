import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import { scatterStones, ZONE_SCATTER } from './zone-scatter.ts';
import type { ScatterStone } from './zone-scatter.ts';

const content: Content = loadContent();
const CAVE_ZONES: readonly string[] = ['under_hall', 'under_hall_2', 'under_hall_3', 'lava_depths', 'lava_depths_2', 'lava_depths_3'];

void test('scatter keeps clear of every checkpoint and waypoint, not only the exits', (): void => {
  for (const id of CAVE_ZONES) {
    const zone: ZoneDef | undefined = content.zones.get(id);
    assert.ok(zone !== undefined, id);
    const stones: ScatterStone[] = scatterStones(content, zone);
    assert.ok(stones.length > 0, id);
    for (const stone of stones) {
      for (const checkpoint of zone.checkpoints) assert.ok(Math.hypot(checkpoint.x - stone.x, checkpoint.z - stone.z) >= checkpoint.radius + ZONE_SCATTER.placeMargin, `${id}: ${stone.prop} on ${checkpoint.id}`);
      if (zone.waypoint !== null) assert.ok(Math.hypot(zone.waypoint.x - stone.x, zone.waypoint.z - stone.z) >= zone.waypoint.radius + ZONE_SCATTER.placeMargin, `${id}: ${stone.prop} on the waypoint`);
    }
  }
});

void test('the caves and the lava levels scatter puddles, moss, ash and crust patches as well as rubble', (): void => {
  const cave: ZoneDef | undefined = content.zones.get('under_hall');
  assert.ok(cave !== undefined);
  const caveProps: ReadonlySet<string> = new Set<string>(scatterStones(content, cave).map((stone: ScatterStone): string => stone.prop));
  const lavaProps: Set<string> = new Set<string>();
  for (const id of ['lava_depths', 'lava_depths_2', 'lava_depths_3']) {
    const lava: ZoneDef | undefined = content.zones.get(id);
    assert.ok(lava !== undefined, id);
    for (const stone of scatterStones(content, lava)) lavaProps.add(stone.prop);
  }
  for (const id of ['cave_puddle_a', 'cave_moss_a', 'cave_pebble_bed']) assert.ok(caveProps.has(id), id);
  for (const id of ['lava_ash_drift_a', 'lava_crust_patch', 'lava_chain_coil']) assert.ok(lavaProps.has(id), id);
});
