import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lobbyReadout } from './lobby-fps.ts';

void test('the lobby shows the frame rate only while the lobby is open and the setting is on', (): void => {
  assert.equal(lobbyReadout(true, true, false).shown, true);
  assert.equal(lobbyReadout(true, true, true).shown, true);
  assert.equal(lobbyReadout(false, true, false).shown, false);
  assert.equal(lobbyReadout(true, false, false).shown, false);
  assert.equal(lobbyReadout(false, false, false).shown, false);
});

void test('frames under the veil of a swap or with the lobby closed are not counted', (): void => {
  assert.equal(lobbyReadout(true, true, false).view, 'shown');
  assert.equal(lobbyReadout(true, true, true).view, 'veiled');
  assert.equal(lobbyReadout(true, false, false).view, 'veiled');
  assert.equal(lobbyReadout(false, false, true).view, 'veiled');
});
