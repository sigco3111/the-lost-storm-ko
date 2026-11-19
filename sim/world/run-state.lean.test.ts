import assert from 'node:assert/strict';
import { test } from 'node:test';
import { worldIn } from '../../test/support.ts';
import { loadContent } from '../content/content.ts';
import type { Content } from '../content/types.ts';
import { leanBoostOf, runLeanBoost } from './run-state.ts';
import { setOut } from './run-table.ts';
import type { World } from './types.ts';

const content: Content = loadContent();
const CAVE: string = 'under_hall';
const FAVOURED: string = 'favoured';
const TWICE: number = 2;

function atTable(): World {
  const world: World = worldIn(content, content.world.town, 4);
  world.waypoints.push(CAVE);
  world.visited.push(CAVE);
  world.player.gold = 100000;
  world.service = { kind: 'descent', owner: 'descent_table', anchor: { x: 0, z: 0 } };
  return world;
}

void test('favoured spoils leans a run twice as hard', (): void => {
  assert.equal(leanBoostOf(content, [{ condition: FAVOURED, pick: null }]), TWICE);
  assert.equal(leanBoostOf(content, []), 1);
});

void test('a run set out with favoured spoils leans its drops while it runs, and a plain run does not', (): void => {
  const favoured: World = atTable();
  setOut(favoured, { zone: CAVE, pins: [{ condition: FAVOURED, pick: null }] });
  assert.equal(favoured.zone.id, CAVE);
  assert.equal(runLeanBoost(favoured), TWICE);
  const plain: World = atTable();
  setOut(plain, { zone: CAVE, pins: [] });
  assert.equal(runLeanBoost(plain), 1);
});
