import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must, worldIn } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { RunReward } from '../../sim/content/run-table-types.ts';
import type { Content } from '../../sim/content/types.ts';
import type { World } from '../../sim/world/types.ts';
import { firstPick, rewardText, tableView, togglePin } from './run-table-model.ts';
import type { ConditionRow, TablePick, TableView } from './run-table-model.ts';

const content: Content = loadContent();
const NOTHING: RunReward = { xp: 0, gold: 0, items: 0, rarity: 0 };

function table(): World {
  const world: World = worldIn(content, content.world.town, 3);
  world.waypoints.push('under_hall');
  world.player.gold = 100000;
  world.service = { kind: 'descent', owner: 'descent_table', anchor: { x: 0, z: 0 } };
  return world;
}

void test('the reward line names a lean beside the gains, and alone when there are none', (): void => {
  assert.equal(rewardText(NOTHING), '');
  assert.equal(rewardText(NOTHING, 1), "+100% lean toward this level's gear");
  assert.equal(rewardText({ xp: 0.2, gold: 0.2, items: 0.2, rarity: 0.08 }, 0.5), "+20% experience, gold and items, 8% of drops at least magic, +50% lean toward this level's gear");
  assert.equal(rewardText({ xp: 0.2, gold: 0.2, items: 0.2, rarity: 0 }, 0), '+20% experience, gold and items');
});

void test('favoured spoils shows its lean on its row and in the total once pinned', (): void => {
  const world: World = table();
  const start: TablePick = firstPick(world);
  const plain: TableView = tableView(world, start);
  const row: ConditionRow = must(plain.conditions.find((entry: ConditionRow): boolean => entry.id === 'favoured'), 'favoured');
  assert.equal(row.reward, "+100% lean toward this level's gear");
  assert.equal(row.danger, 'No added danger');
  assert.equal(plain.reward, '');
  const pinned: TableView = tableView(world, togglePin(world, start, 'favoured'));
  assert.equal(pinned.reward, "+100% lean toward this level's gear");
});
