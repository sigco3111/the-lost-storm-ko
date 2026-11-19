import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClickFacts } from './click-reading.ts';
import type { GroundClick, KeyMoveHintState } from './key-move-hint.ts';
import { KEY_MOVE_HINT, NO_KEY_MOVE_HINT, noteGroundClick, walksByClick } from './key-move-hint.ts';

const GROUND: ClickFacts = { fresh: true, player: false, dialogue: false, ground: true, target: false, shift: false, person: 'none', item: false, chest: false, station: false, portal: false, heldExit: false, exit: false, travelling: false, keys: true, armed: true };

function click(at: number, change: Partial<GroundClick> = {}): GroundClick {
  return { at, movement: 'keys', touch: false, moveKeyHeld: false, facts: GROUND, ...change };
}

function run(clicks: readonly GroundClick[], from: KeyMoveHintState = NO_KEY_MOVE_HINT): readonly boolean[] {
  let state: KeyMoveHintState = from;
  return clicks.map((next: GroundClick): boolean => {
    const step = noteGroundClick(state, next);
    state = step.state;
    return step.show;
  });
}

void test('a ground press that would walk in click mode counts, whatever keys mode makes of it', (): void => {
  assert.equal(walksByClick(GROUND), true);
  assert.equal(walksByClick({ ...GROUND, fresh: false }), false);
  assert.equal(walksByClick({ ...GROUND, target: true }), false);
  assert.equal(walksByClick({ ...GROUND, person: 'body' }), false);
  assert.equal(walksByClick({ ...GROUND, item: true }), false);
  assert.equal(walksByClick({ ...GROUND, exit: true }), false);
  assert.equal(walksByClick({ ...GROUND, shift: true }), false);
  assert.equal(walksByClick({ ...GROUND, ground: false }), false);
});

void test('two ground presses close together in keys mode show the line once', (): void => {
  assert.deepEqual(run([click(10), click(12)]), [false, true]);
  assert.deepEqual(run([click(10), click(10 + KEY_MOVE_HINT.windowSeconds + 0.5)]), [false, false]);
  assert.deepEqual(run([click(10), click(11), click(12), click(13)]), [false, true, false, false]);
});

void test('the line rests a minute before it can show again', (): void => {
  const quiet: number = KEY_MOVE_HINT.quietSeconds;
  assert.deepEqual(run([click(0), click(1), click(20), click(21), click(1 + quiet), click(2 + quiet)]), [false, true, false, false, false, true]);
  assert.deepEqual(run([click(0), click(1), click(quiet + 2), click(quiet + 3)]), [false, true, false, true]);
});

void test('never in click mode, never on touch, and a held move key means the player knows', (): void => {
  assert.deepEqual(run([click(0, { movement: 'click' }), click(1, { movement: 'click' })]), [false, false]);
  assert.deepEqual(run([click(0, { touch: true }), click(1, { touch: true })]), [false, false]);
  assert.deepEqual(run([click(0, { moveKeyHeld: true }), click(1, { moveKeyHeld: true })]), [false, false]);
  assert.deepEqual(run([click(0), click(1, { moveKeyHeld: true }), click(2)]), [false, false, false]);
});

void test('presses on a monster, a person or an exit neither count nor clear the count', (): void => {
  assert.deepEqual(run([click(0), click(1, { facts: { ...GROUND, target: true } }), click(2)]), [false, false, true]);
  assert.deepEqual(run([click(0, { facts: { ...GROUND, exit: true } }), click(1, { facts: { ...GROUND, person: 'body' } })]), [false, false]);
});
