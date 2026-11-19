import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProfileDoor } from './profile-door.ts';
import type { ProfileDoor } from './profile-door.ts';

void test('a name picked before the panel is ready opens once it is, and later picks open at once', (): void => {
  const door: ProfileDoor = createProfileDoor();
  const opened: string[] = [];
  door.open('Ash');
  door.open('Wren');
  assert.equal(opened.length, 0);
  door.bind((name: string): void => {
    opened.push(name);
  });
  assert.deepEqual(opened, ['Wren']);
  door.open('Moss');
  assert.deepEqual(opened, ['Wren', 'Moss']);
});
