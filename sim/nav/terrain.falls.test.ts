import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneFall } from '../content/types.ts';
import { floorAt, heightAt } from './terrain.ts';

const content: Content = loadContent();
const FALL_CHECK = { probe: 1.2, leastDrop: 0.4 } as const;

void test('every lava fall pours down a rim onto walkable floor', (): void => {
  let falls: number = 0;
  for (const zone of content.zones.values()) {
    for (const fall of zone.falls) {
      falls += 1;
      const yaw: number = (fall.facingDegrees * Math.PI) / 180;
      const dx: number = Math.sin(yaw) * FALL_CHECK.probe;
      const dz: number = Math.cos(yaw) * FALL_CHECK.probe;
      const label: string = `${zone.id} fall at ${fall.x},${fall.z}`;
      assert.ok(floorAt(zone, fall.x + dx, fall.z + dz), `${label} lands on floor`);
      assert.equal(floorAt(zone, fall.x - dx, fall.z - dz), false, `${label} starts on the rim`);
      assert.ok(heightAt(zone, fall.x - dx, fall.z - dz) - heightAt(zone, fall.x + dx, fall.z + dz) >= FALL_CHECK.leastDrop, `${label} drops`);
    }
  }
  assert.ok(falls > 0);
});

void test('every lava fall lands in molten lava', (): void => {
  for (const zone of content.zones.values()) {
    for (const fall of zone.falls) {
      const yaw: number = (fall.facingDegrees * Math.PI) / 180;
      const column: number = Math.floor((fall.x + Math.sin(yaw) * FALL_CHECK.probe) / zone.cellSize);
      const row: number = Math.floor((fall.z + Math.cos(yaw) * FALL_CHECK.probe) / zone.cellSize);
      const tile: string = zone.tiles[row]?.charAt(column) ?? '';
      assert.equal(zone.floors[tile], fall.surface, `${zone.id} fall at ${fall.x},${fall.z}`);
    }
  }
});

void test('a fall in the data reads as a zone fall', (): void => {
  const fall: ZoneFall | undefined = content.zones.get('lava_depths_2')?.falls[0];
  assert.equal(fall?.surface, 'molten');
});
