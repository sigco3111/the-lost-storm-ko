import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ZoneDef } from '../../sim/content/types.ts';
import type { TerrainSight } from './terrain-sight.ts';
import { cameraEye, clickFloor, createTerrainSight, drawsTerrain } from './terrain-sight.ts';
import type { FloorTest } from './terrain-lift.ts';
import { liftAt } from './terrain-lift.ts';

const content: Content = loadContent();

function caves(): ZoneDef {
  const zone: ZoneDef | undefined = content.zones.get('under_hall');
  assert.ok(zone !== undefined);
  return zone;
}

void test('a sight line over open floor is clear, and one into a rock shelf is blocked unless the cutaway clears that crossing', (): void => {
  const zone: ZoneDef = caves();
  const sight: TerrainSight | null = createTerrainSight(zone);
  assert.ok(sight !== null);
  const start = zone.playerStart;
  const eye = cameraEye(zone, start.x, start.z);
  const target = { x: start.x, y: liftAt(zone, start.x, start.z) + 1.3, z: start.z };
  assert.equal(sight.blocks(eye, target, null), false);
  const low = { x: target.x, y: target.y - 60, z: target.z };
  assert.equal(sight.blocks(eye, low, null), true);
  assert.equal(sight.blocks(eye, low, (): boolean => true), false);
});

void test('a zone drawn without a terrain heightfield has no terrain sight', (): void => {
  for (const zone of content.zones.values()) assert.equal(createTerrainSight(zone) === null, !drawsTerrain(zone));
});

void test('a click on the drawn step between a cave ramp and the terrace above it counts as floor, and the rock over the cave wall does not', (): void => {
  const zone: ZoneDef = caves();
  const floor: FloorTest = clickFloor(zone);
  const sight: TerrainSight | null = createTerrainSight(zone);
  assert.ok(sight !== null);
  const stepX: number = 72;
  const stepZ: number = 133.7;
  const stepY: number | null = sight.drawnHeight(stepX, stepZ);
  assert.ok(stepY !== null && stepY - liftAt(zone, stepX, stepZ) > 0.5, `the step is drawn ${stepY} over a floor at ${liftAt(zone, stepX, stepZ)}`);
  assert.equal(floor(stepX, stepY, stepZ), true);
  assert.equal(floor(stepX, stepY + 3, stepZ), false);
});
