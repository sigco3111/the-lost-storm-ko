import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNavGrid, paceAt } from '../nav/grid.ts';
import type { NavGrid } from '../nav/grid.ts';
import { loadContent } from '../content/content.ts';
import type { Content, SurfaceDef, ZoneDef } from '../content/types.ts';
import { must } from '../../test/support.ts';
import { pathLength, aroundPath, evenGround } from './stick.ts';

const content: Content = loadContent();
const floor: SurfaceDef = must(content.surfaces.get('scorched_stone'), 'scorched_stone');
const mire: SurfaceDef = { ...floor, id: 'test_mire', pace: 0.3 };
const SURFACES: ReadonlyMap<string, SurfaceDef> = new Map<string, SurfaceDef>([[floor.id, floor], [mire.id, mire]]);
const ROWS: readonly string[] = ['ssssssssss', 'ssssssssss', 'sssssmmmmm', 's####mmmmm', 's####mmmmm', 'sssssmmmmm', 'ssssssssss', 'ssssssssss'];

function mireZone(): ZoneDef {
  const base: ZoneDef = must(content.zones.get('lava_depths_2'), 'lava_depths_2');
  return { ...base, tiles: [...ROWS], floors: { s: floor.id, m: mire.id }, props: [], terrain: null, outside: null, walls: null };
}

void test('the even view of the ground keeps every walkable cell and walks all of it at full pace', (): void => {
  const grid: NavGrid = buildNavGrid(mireZone(), content.props, SURFACES, content.player.radius);
  const even: NavGrid = evenGround(grid);
  assert.equal(even.walkable, grid.walkable);
  assert.ok(paceAt(grid, 13, 7) < 1);
  assert.equal(paceAt(even, 13, 7), 1);
  assert.equal(evenGround(grid).pace, even.pace);
});

void test('held into a block, the way round goes the short way through slow ground rather than a long way round dry', (): void => {
  const grid: NavGrid = buildNavGrid(mireZone(), content.props, SURFACES, content.player.radius);
  const from = { x: 9, z: 1 };
  const past = { x: 9, z: 13 };
  const round = must(aroundPath(grid, from, past), 'a way round');
  assert.equal(paceAt(grid, 13, 3), 1);
  assert.ok(paceAt(grid, 13, 7) < 1);
  assert.ok(pathLength(from, round) <= 14, `went ${pathLength(from, round).toFixed(1)} m`);
});
