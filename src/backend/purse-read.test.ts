import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content, createHarness, makeSave, synced } from '../../test/backend-support.ts';
import type { Harness } from '../../test/backend-support.ts';
import type { Backend } from './backend.ts';
import type { SaveFold } from './purse-read.ts';
import { TIMING } from './remote.ts';
import { emptyFold, NO_FOLD, readEntries, readEntry, readFold } from './purse-read.ts';

const ITEM = { id: 'itm_AAAAAAAAAAAAAAAAAAAAAA', base: 'rusted_blade', rarity: 'magic', level: 3, affixes: [] };

void test('a purse entry is read with its kind, signed gold and its item and direction together', (): void => {
  assert.deepEqual(readEntry(content, { id: 3, kind: 'buy', gold: -40, item: ITEM, direction: 'in' }), { id: 3, kind: 'buy', gold: -40, item: ITEM, direction: 'in' });
  assert.deepEqual(readEntry(content, { id: 4, kind: 'collect', gold: 90, item: null, direction: null }), { id: 4, kind: 'collect', gold: 90, item: null, direction: null });
  const bad: readonly unknown[] = [
    null,
    { id: 0, kind: 'buy', gold: 0, item: null, direction: null },
    { id: 1.5, kind: 'buy', gold: 0, item: null, direction: null },
    { id: 1, kind: 'steal', gold: 0, item: null, direction: null },
    { id: 1, kind: 'buy', gold: 0.5, item: null, direction: null },
    { id: 1, kind: 'buy', gold: 0, item: ITEM, direction: null },
    { id: 1, kind: 'buy', gold: 0, item: null, direction: 'in' },
    { id: 1, kind: 'buy', gold: 0, item: { ...ITEM, id: 'itm_bad' }, direction: 'in' },
    { id: 1, kind: 'buy', gold: 0, item: ITEM, direction: 'sideways' },
  ];
  for (const value of bad) assert.equal(readEntry(content, value), null);
});

void test('one unreadable entry rejects the whole list, so no entry is skipped past', (): void => {
  assert.deepEqual(readEntries(content, [{ id: 1, kind: 'list', gold: 0, item: ITEM, direction: 'out' }]), [{ id: 1, kind: 'list', gold: 0, item: ITEM, direction: 'out' }]);
  assert.equal(readEntries(content, [{ id: 1, kind: 'list', gold: 0, item: ITEM, direction: 'out' }, { id: 2 }]), null);
  assert.equal(readEntries(content, 'many'), null);
});

void test('a save answer without a fold, as from an older server, folds nothing', (): void => {
  assert.deepEqual(readFold(content, { save: null, revision: 1 }), NO_FOLD);
  assert.equal(emptyFold(readFold(content, null)), true);
  assert.deepEqual(readFold(content, { folded: [{ id: 2, kind: 'collect', gold: 5, item: null, direction: null }], stripped: [ITEM.id] }), { folded: [{ id: 2, kind: 'collect', gold: 5, item: null, direction: null }], stripped: [ITEM.id], unverified: [] });
  assert.deepEqual(readFold(content, { folded: [], stripped: [], unverified: [ITEM.id] }), { folded: [], stripped: [], unverified: [ITEM.id] });
  assert.equal(emptyFold(readFold(content, { unverified: [ITEM.id] })), false);
  assert.deepEqual(readFold(content, { unverified: ['nope'] }).unverified, []);
  assert.deepEqual(readFold(content, { folded: 'x', stripped: ['not a ledger id'] }), NO_FOLD);
});

const FOLDED_ITEM: string = 'itm_FFFFFFFFFFFFFFFFFFFFFF';
const CLEARED_ITEM: string = 'itm_EEEEEEEEEEEEEEEEEEEEEE';

void test('the entries a save answer folded and the ledger ids it stripped or cleared reach the game once', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 3);
  const heard: SaveFold[] = [];
  backend.onFold((fold: SaveFold): void => void heard.push(fold));
  harness.server.foldNext({ folded: [{ id: 4, kind: 'collect', gold: 30, item: null, direction: null }], stripped: [FOLDED_ITEM], unverified: [CLEARED_ITEM] });
  backend.save(makeSave(4, 0));
  await harness.timers.advance(TIMING.routinePushMs);
  backend.save(makeSave(5, 0));
  await harness.timers.advance(TIMING.routinePushMs);
  assert.deepEqual(heard, [{ folded: [{ id: 4, kind: 'collect', gold: 30, item: null, direction: null }], stripped: [FOLDED_ITEM], unverified: [CLEARED_ITEM] }]);
});

void test('a fold that arrives before the game listens is handed over when it does', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 3);
  harness.server.foldNext({ folded: [], stripped: [], unverified: [CLEARED_ITEM] });
  backend.save(makeSave(4, 0));
  await harness.timers.advance(TIMING.routinePushMs);
  const heard: SaveFold[] = [];
  backend.onFold((fold: SaveFold): void => void heard.push(fold));
  assert.deepEqual(heard, [{ folded: [], stripped: [], unverified: [CLEARED_ITEM] }]);
});

void test('an old server that sends no fold changes nothing in the game', async (): Promise<void> => {
  const harness: Harness = createHarness();
  const backend: Backend = await synced(harness, 3);
  const heard: SaveFold[] = [];
  backend.onFold((fold: SaveFold): void => void heard.push(fold));
  backend.save(makeSave(4, 0));
  await harness.timers.advance(1000);
  assert.deepEqual(heard, []);
});
