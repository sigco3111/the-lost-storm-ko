import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { TerrainBlend } from '../../sim/content/terrain-types.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import type { Batch } from './ground.ts';
import type { Field, GroundLayer, SurfaceFringe } from './ground-terrain.ts';
import { blendShare, buildTerrainGround, fringeAt, GROUND_TERRAIN, sampleField, surfaceFringes, surfaceReach } from './ground-terrain.ts';

const content: Content = loadContent();

function zoneOf(id: string): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get(id);
  if (zone === undefined) throw new Error(`missing ${id}`);
  return zone;
}

function spillOf(surface: string): number {
  return content.surfaces.get(surface)?.spill ?? 0;
}

function emptyBatch(): Batch {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

const lavaZone: ZoneDef = zoneOf('lava_depths_2');
const lavaField: Field = sampleField(lavaZone);

void test('the reach to a surface is zero on its own ground samples, one step beside them and capped far away', (): void => {
  const reach: Float32Array = surfaceReach(lavaField, 'cooled_crust', GROUND_TERRAIN.fringeReach);
  let beside: number = 0;
  for (let at: number = 0; at < reach.length; at += 1) {
    if (lavaField.surfaces[at] === 'cooled_crust') assert.equal(reach[at], 0);
    else if (lavaField.surfaces[at + 1] === 'cooled_crust' && lavaField.surfaces[at] !== '') {
      assert.equal(reach[at], GROUND_TERRAIN.step);
      beside += 1;
    }
    assert.ok((reach[at] ?? 0) <= GROUND_TERRAIN.fringeReach);
  }
  assert.ok(beside > 0);
});

void test('only surfaces that spread onto a neighbour get a reach field', (): void => {
  const fringes: Set<string> = new Set<string>(surfaceFringes(lavaField, spillOf).map((fringe: SurfaceFringe): string => fringe.surface));
  assert.ok(fringes.has('scorched_stone'));
  assert.ok(!fringes.has('basalt'));
});

void test('a fringe is whole where its surface is drawn on the warped ground, so it meets the solid seam and not the tile line', (): void => {
  const fringe: Map<string, Batch> = new Map<string, Batch>();
  const fringeFor = (surface: string): Batch => {
    const known: Batch | undefined = fringe.get(surface);
    if (known !== undefined) return known;
    const made: Batch = emptyBatch();
    fringe.set(surface, made);
    return made;
  };
  buildTerrainGround(lavaZone, { batchFor: (surface: string, layer: GroundLayer): Batch => (layer === 'fringe' ? fringeFor(surface) : emptyBatch()) }, spillOf);
  assert.ok(fringe.size > 0);
  assert.ok(!fringe.has('lava'));
  let checked: number = 0;
  for (const [surface, batch] of fringe) {
    for (let vertex: number = 0; vertex < batch.positions.length / 3; vertex += 1) {
      const column: number = Math.round((batch.positions[vertex * 3] ?? 0) / GROUND_TERRAIN.step);
      const row: number = Math.round((batch.positions[vertex * 3 + 2] ?? 0) / GROUND_TERRAIN.step);
      if (lavaField.surfaces[row * lavaField.columns + column] !== surface) continue;
      assert.equal(batch.colors[vertex * 4 + 3], 1, `${surface} at ${column},${row}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0);
});

void test('a fringe fades by noise, so equal reach does not give an equal edge', (): void => {
  const shares: number[] = Array.from({ length: 24 }, (_: unknown, step: number): number => fringeAt(GROUND_TERRAIN.fringeReach / 2, step * 0.7, 3.1));
  assert.ok(Math.max(...shares) - Math.min(...shares) > 0.2, shares.map((share: number): string => share.toFixed(2)).join(' '));
  assert.equal(fringeAt(0, 4.2, 9.9), 1);
  assert.equal(fringeAt(GROUND_TERRAIN.fringeReach * 2, 4.2, 9.9), 0);
});

void test('a blend gathered around a tile mark fades along a wandering shore, not along the tile edge', (): void => {
  const terrain = lavaZone.terrain;
  if (terrain === null) throw new Error('lava_depths_2 has no terrain');
  const salt: number = terrain.blends.findIndex((blend: TerrainBlend): boolean => blend.surface === 'lava');
  const lava: TerrainBlend | undefined = terrain.blends[salt];
  if (lava === undefined || lava.near === null) throw new Error('no lava gathered by a mark');
  const loose: TerrainBlend = { ...lava, near: null };
  const row: number = lavaZone.tiles.findIndex((line: string): boolean => line.includes(`${lava.near}`));
  const line: string = lavaZone.tiles[row] ?? '';
  const first: number = line.indexOf(lava.near);
  const last: number = line.lastIndexOf(lava.near);
  const outside: number = row * lavaZone.cellSize - lava.reach / 2;
  const shore: number[] = [];
  for (let x: number = first * lavaZone.cellSize + 0.25; x < (last + 1) * lavaZone.cellSize; x += 0.5) {
    const mask: number = blendShare(lavaZone, loose, salt, x, outside);
    if (mask > 0.05) shore.push(blendShare(lavaZone, lava, salt, x, outside) / mask);
  }
  assert.ok(shore.length > 4);
  assert.ok(Math.max(...shore) - Math.min(...shore) > 0.2, shore.map((share: number): string => share.toFixed(2)).join(' '));
});
