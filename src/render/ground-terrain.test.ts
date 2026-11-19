import assert from 'node:assert/strict';
import test from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import type { TerrainCell } from '../../sim/nav/terrain.ts';
import type { NavGrid } from '../../sim/nav/grid.ts';
import { buildNavGrid, isWalkable } from '../../sim/nav/grid.ts';
import { floorAt, rampAt, terrainCell } from '../../sim/nav/terrain.ts';
import type { Batch } from './ground.ts';
import { buildTerrainGround, drawnGround } from './ground-terrain.ts';
import type { GroundLayer } from './ground-terrain.ts';
import { liftAt } from './terrain-lift.ts';

const SWEEP = { stride: 3.1, settle: 0.001 } as const;

const OVERHANG = { stride: 0.1, knee: 0.5, inside: 1e-9 } as const;

void test('in every raised zone the drawn floor never stands above the floor actors are drawn on, so no foot sinks into it', (): void => {
  const zones: ZoneDef[] = [...loadContent().zones.values()].filter((zone: ZoneDef): boolean => zone.terrain !== null);
  assert.ok(zones.some((zone: ZoneDef): boolean => zone.id === 'under_hall_2'));
  for (const zone of zones) {
    let checked: number = 0;
    for (let x: number = SWEEP.stride / 2; x < (zone.tiles[0]?.length ?? 0) * zone.cellSize; x += SWEEP.stride) {
      for (let z: number = SWEEP.stride / 2; z < zone.tiles.length * zone.cellSize; z += SWEEP.stride) {
        if (!floorAt(zone, x, z)) continue;
        const cell: TerrainCell = terrainCell(zone, x, z);
        const above: number = drawnGround(zone, x, z) - liftAt(zone, x, z);
        assert.ok(above <= SWEEP.settle, `${zone.id} at ${x.toFixed(1)},${z.toFixed(1)}${rampAt(zone, cell.column, cell.row) ? ' on a ramp' : ''}: the drawn floor is ${above.toFixed(3)} m above the feet`);
        checked += 1;
      }
    }
    assert.ok(checked > 0, zone.id);
  }
});

function emptyBatch(): Batch {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

interface Corner {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function cornerOf(batch: Batch, at: number | undefined): Corner {
  const index: number = (at ?? 0) * 3;
  return { x: batch.positions[index] ?? 0, y: batch.positions[index + 1] ?? 0, z: batch.positions[index + 2] ?? 0 };
}

function heightOver(a: Corner, b: Corner, c: Corner, x: number, z: number): number | null {
  const area: number = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  if (Math.abs(area) < OVERHANG.inside) return null;
  const wa: number = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / area;
  const wb: number = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / area;
  const wc: number = 1 - wa - wb;
  if (wa < -OVERHANG.inside || wb < -OVERHANG.inside || wc < -OVERHANG.inside) return null;
  return wa * a.y + wb * b.y + wc * c.y;
}

void test('in every raised zone no drawn rock stands over a spot the hero can walk to, so no cliff hides or roofs the floor', (): void => {
  const content: Content = loadContent();
  const zones: ZoneDef[] = [...content.zones.values()].filter((zone: ZoneDef): boolean => zone.terrain !== null);
  assert.ok(zones.some((zone: ZoneDef): boolean => zone.id === 'under_hall_2'));
  for (const zone of zones) {
    const batch: Batch = emptyBatch();
    buildTerrainGround(zone, { batchFor: (_surface: string, layer: GroundLayer): Batch => (layer === 'solid' ? batch : emptyBatch()) });
    const grid: NavGrid = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
    let steep: number = 0;
    for (let at: number = 0; at < batch.indices.length; at += 3) {
      const a: Corner = cornerOf(batch, batch.indices[at]);
      const b: Corner = cornerOf(batch, batch.indices[at + 1]);
      const c: Corner = cornerOf(batch, batch.indices[at + 2]);
      if (Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) <= OVERHANG.knee) continue;
      steep += 1;
      for (let x: number = Math.ceil(Math.min(a.x, b.x, c.x) / OVERHANG.stride) * OVERHANG.stride; x <= Math.max(a.x, b.x, c.x); x += OVERHANG.stride) {
        for (let z: number = Math.ceil(Math.min(a.z, b.z, c.z) / OVERHANG.stride) * OVERHANG.stride; z <= Math.max(a.z, b.z, c.z); z += OVERHANG.stride) {
          const rock: number | null = heightOver(a, b, c, x, z);
          if (rock === null || !isWalkable(grid, x, z)) continue;
          const above: number = rock - liftAt(zone, x, z);
          assert.ok(above <= OVERHANG.knee, `${zone.id} at ${x.toFixed(2)},${z.toFixed(2)}: drawn rock stands ${above.toFixed(2)} m over walkable floor`);
        }
      }
    }
    assert.ok(steep > 0, zone.id);
  }
});
