import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channelShare, samePortal } from './portal-view.ts';

void test('the channel glow grows from nothing to full over the channel and never past it', (): void => {
  assert.equal(channelShare(1.2, 1.2), 0);
  assert.equal(channelShare(0.6, 1.2), 0.5);
  assert.equal(channelShare(0, 1.2), 1);
  assert.equal(channelShare(-0.1, 1.2), 1);
  assert.equal(channelShare(1, 0), 0);
});

void test('a drawn portal is kept only while the same end stands in the same place', (): void => {
  const drawn = { zone: 'under_hall', pos: { x: 3, z: 4 } };
  assert.equal(samePortal(drawn, { kind: 'out', zone: 'under_hall', pos: { x: 3, z: 4 }, reach: 1.6 }), true);
  assert.equal(samePortal(drawn, { kind: 'out', zone: 'under_hall', pos: { x: 5, z: 4 }, reach: 1.6 }), false);
  assert.equal(samePortal(drawn, { kind: 'home', zone: 'hideout', pos: { x: 3, z: 4 }, reach: 1.6 }), false);
  assert.equal(samePortal(drawn, null), false);
});
