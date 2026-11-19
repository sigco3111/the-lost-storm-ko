import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../content/content.ts';
import type { Content, ZoneDef } from '../content/types.ts';
import { zoneOf, worldIn } from '../../test/support.ts';
import { buildNavGrid } from '../nav/grid.ts';
import { prepareZone, zonePrepared } from './zones.ts';
import type { World } from './types.ts';

const content: Content = loadContent();

void test('a zone prepared ahead of time is entered with the very grid it would have built on the spot', (): void => {
  const zone: ZoneDef = zoneOf(content, 'hideout');
  const fresh: Content = { ...content, props: new Map(content.props) };
  assert.equal(zonePrepared(fresh, zone), false);
  prepareZone(fresh, zone);
  assert.equal(zonePrepared(fresh, zone), true);
  const prepared = buildNavGrid(zone, fresh.props, fresh.surfaces, fresh.player.radius);
  const unprepared = buildNavGrid(zone, content.props, content.surfaces, content.player.radius);
  assert.deepEqual(prepared, unprepared);
});

void test('entering a prepared zone leaves its prepared grid untouched for the next visit', (): void => {
  const zone: ZoneDef = zoneOf(content, 'hall_of_time');
  prepareZone(content, zone);
  const world: World = worldIn(content, 'hall_of_time', 7);
  world.grid.walkable.fill(0);
  const again: World = worldIn(content, 'hall_of_time', 7);
  assert.ok(again.grid.walkable.some((cell: number): boolean => cell === 1));
});
