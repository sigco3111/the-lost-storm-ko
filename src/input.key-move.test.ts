import assert from 'node:assert/strict';
import test from 'node:test';
import { worldIn } from '../test/support.ts';
import type { World } from '../sim/world/types.ts';
import { KEY_MOVE_HINT } from './key-move-hint.ts';
import { clickOn, DT, floorAhead, inputContent as content, rig } from '../test/input-support.ts';
import type { Rig } from '../test/input-support.ts';

function idle(setup: Rig, seconds: number): void {
  for (let left: number = seconds; left > 0; left -= DT) setup.input.collect(DT);
}

void test('with Movement on Keys, two presses on open ground show the line that says how the hero moves', (): void => {
  const world: World = worldIn(content, 'hideout', 3);
  const setup: Rig = rig(world);
  setup.settings.setMovement('keys');
  clickOn(setup, floorAhead(world));
  assert.deepEqual(setup.keyMoveLines, []);
  idle(setup, 1);
  clickOn(setup, floorAhead(world));
  assert.equal(setup.keyMoveLines.length, 1);
  idle(setup, 1);
  clickOn(setup, floorAhead(world));
  clickOn(setup, floorAhead(world));
  assert.equal(setup.keyMoveLines.length, 1);
  idle(setup, KEY_MOVE_HINT.quietSeconds);
  clickOn(setup, floorAhead(world));
  clickOn(setup, floorAhead(world));
  assert.equal(setup.keyMoveLines.length, 2);
});

void test('in click mode the same presses walk and show nothing', (): void => {
  const world: World = worldIn(content, 'hideout', 3);
  const setup: Rig = rig(world);
  clickOn(setup, floorAhead(world));
  clickOn(setup, floorAhead(world));
  assert.deepEqual(setup.keyMoveLines, []);
});
