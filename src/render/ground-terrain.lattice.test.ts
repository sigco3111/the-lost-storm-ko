import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { TerrainBlend } from '../../sim/content/terrain-types.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import { zoneColumns, zoneRows } from '../../sim/nav/layout.ts';
import { must } from '../../test/support.ts';
import { blendLattice, blendShare } from './ground-terrain.ts';

const content: Content = loadContent();
const SAMPLES = 400;
const EDGE_MARGIN = 6;

void test('a blend read through its lattice gives exactly the value the direct noise gives, inside the zone and just past its edge', (): void => {
  for (const id of ['under_hall', 'lava_depths']) {
    const zone: ZoneDef = must(content.zones.get(id), id);
    const width: number = zoneColumns(zone) * zone.cellSize;
    const depth: number = zoneRows(zone) * zone.cellSize;
    (zone.terrain?.blends ?? []).forEach((blend: TerrainBlend, salt: number): void => {
      const lattice = blendLattice(zone, blend, salt);
      if (lattice === null) return;
      for (let index: number = 0; index < SAMPLES; index += 1) {
        const x: number = ((index * 37.31) % (width + EDGE_MARGIN * 2)) - EDGE_MARGIN;
        const z: number = ((index * 91.77) % (depth + EDGE_MARGIN * 2)) - EDGE_MARGIN;
        assert.equal(blendShare(zone, blend, salt, x, z, lattice), blendShare(zone, blend, salt, x, z), `${id} ${blend.surface} at ${x.toFixed(2)}, ${z.toFixed(2)}`);
      }
    });
  }
});

void test('a blend with a fine scale reads the noise directly, because a lattice would cost more than it saves', (): void => {
  const zone: ZoneDef = must(content.zones.get('lava_depths'), 'lava_depths');
  const fine: TerrainBlend | undefined = zone.terrain?.blends.find((blend: TerrainBlend): boolean => blend.scale < 3);
  assert.ok(fine !== undefined);
  assert.equal(blendLattice(zone, fine, 0), null);
});
