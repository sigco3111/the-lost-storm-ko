import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOST } from './host.ts';
import { HOST as FRAMED } from './host-framed.ts';

void test('the site and the open portals run on when hidden and leave desktop touch alone', (): void => {
  assert.deepEqual(HOST, { pauseWhenHidden: false, stillPage: false });
});

void test('a framed host pauses while its page is hidden and holds the page still on every device', (): void => {
  assert.deepEqual(FRAMED, { pauseWhenHidden: true, stillPage: true });
});
