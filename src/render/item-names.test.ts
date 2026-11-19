import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FlagStore, ItemNames, KeyPress } from './item-names.ts';
import { createItemNames } from './item-names.ts';

interface Probe {
  readonly names: ItemNames;
  readonly saved: () => boolean;
  readonly changes: boolean[];
}

function probe(codes: readonly string[] = ['AltLeft', 'AltRight'], start: boolean = false): Probe {
  let saved: boolean = start;
  const store: FlagStore = {
    read: (): boolean => saved,
    write: (on: boolean): void => {
      saved = on;
    },
  };
  const names: ItemNames = createItemNames((): readonly string[] => codes, store);
  const changes: boolean[] = [];
  names.subscribe((shown: boolean): void => {
    changes.push(shown);
  });
  return { names, saved: (): boolean => saved, changes };
}

function press(phase: KeyPress['phase'], code: string, altKey: boolean, editable: boolean = false): KeyPress {
  return { phase, code, altKey, editable };
}

void test('holding Alt shows every name and releasing it hides them', (): void => {
  const { names, changes } = probe();
  assert.equal(names.shown(), false);
  assert.equal(names.key(press('keydown', 'AltLeft', true)), true);
  assert.equal(names.shown(), true);
  assert.equal(names.key(press('keyup', 'AltLeft', false)), true);
  assert.equal(names.shown(), false);
  assert.deepEqual(changes, [true, false]);
});

void test('Alt held with another key keeps the browser from acting on the pair', (): void => {
  const { names } = probe();
  names.key(press('keydown', 'AltLeft', true));
  assert.equal(names.key(press('keydown', 'KeyF', true)), true);
  assert.equal(names.key(press('keydown', 'KeyF', false)), false);
});

void test('both Alt keys must be up before the names go', (): void => {
  const { names } = probe();
  names.key(press('keydown', 'AltLeft', true));
  names.key(press('keydown', 'AltRight', true));
  names.key(press('keyup', 'AltLeft', true));
  assert.equal(names.shown(), true);
  names.key(press('keyup', 'AltRight', false));
  assert.equal(names.shown(), false);
});

void test('losing focus while Alt is down hides the names', (): void => {
  const { names } = probe();
  names.key(press('keydown', 'AltLeft', true));
  names.lose();
  assert.equal(names.shown(), false);
});

void test('a mouse move without Alt clears a hold whose key-up was missed', (): void => {
  const { names } = probe();
  names.key(press('keydown', 'AltLeft', true));
  names.pointer(false);
  assert.equal(names.shown(), false);
  names.pointer(true);
  assert.equal(names.shown(), true);
});

void test('typing in a text field never shows names or blocks the key', (): void => {
  const { names } = probe();
  assert.equal(names.key(press('keydown', 'AltLeft', true, true)), false);
  assert.equal(names.shown(), false);
  assert.equal(names.key(press('keydown', 'KeyL', true, true)), false);
});

void test('a key-up in a text field still ends a hold', (): void => {
  const { names } = probe();
  names.key(press('keydown', 'AltLeft', true));
  names.key(press('keyup', 'AltLeft', false, true));
  assert.equal(names.shown(), false);
});

void test('a rebound key shows names and leaves Alt and the mouse alone', (): void => {
  const { names } = probe(['KeyZ']);
  assert.equal(names.key(press('keydown', 'AltLeft', true)), false);
  assert.equal(names.shown(), false);
  names.key(press('keydown', 'KeyZ', false));
  assert.equal(names.shown(), true);
  names.pointer(false);
  assert.equal(names.shown(), true);
  names.key(press('keyup', 'KeyZ', false));
  assert.equal(names.shown(), false);
});

void test('the toggle keeps names on through a key release and is remembered', (): void => {
  const { names, saved } = probe();
  names.setToggled(true);
  assert.equal(saved(), true);
  names.key(press('keydown', 'AltLeft', true));
  names.key(press('keyup', 'AltLeft', false));
  names.lose();
  assert.equal(names.shown(), true);
  names.setToggled(false);
  assert.equal(saved(), false);
  assert.equal(names.shown(), false);
});

void test('a toggle remembered for the session starts on', (): void => {
  const { names } = probe(['AltLeft'], true);
  assert.equal(names.toggled(), true);
  assert.equal(names.shown(), true);
});
