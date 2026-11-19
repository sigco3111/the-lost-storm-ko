import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content } from './content/types.ts';
import { generateItem } from './items.ts';
import { createRng } from './rng.ts';
import { armedFlag, armOnce } from './save-arm.ts';
import type { Armed, Holding } from './save-arm.ts';
import { parseSaveText, toSave } from './save.ts';
import type { SaveData } from './save.ts';
import { createWorld } from './world/create.ts';
import type { ItemInstance, World } from './world/types.ts';

const content: Content = loadContent();

function made(base: string, uid: number): ItemInstance {
  return must(generateItem(content, createRng(uid), uid, 13, base, 'common'), base);
}

function holding(allocated: readonly string[], owned: readonly (ItemInstance | null)[], flags: Readonly<Record<string, string>>): Holding {
  return { level: 13, allocated, owned, flags, nextItemUid: 50, room: 1 };
}

void test('a holding with staff places and no staff is laid the staff group starter at its level, once', (): void => {
  const armed: Armed = armOnce(content, holding(['storm_storm_bolt'], [made('warden_shortsword', 1), null], {}));
  assert.equal(armed.laid.length, 1);
  const staff: ItemInstance = must(armed.laid[0], 'staff');
  assert.equal(staff.base, 'driftwood_staff');
  assert.equal(staff.level, 13);
  assert.equal(staff.uid, 50);
  assert.equal(armed.nextItemUid, 51);
  assert.equal(armed.flags[armedFlag('staff')], 'bag');
  assert.equal(armOnce(content, holding(['storm_storm_bolt'], [], armed.flags)).laid.length, 0);
});

void test('a starter laid with no room in the bag is marked as lying on the ground', (): void => {
  const armed: Armed = armOnce(content, { ...holding(['storm_storm_bolt'], [], {}), room: 0 });
  assert.equal(armed.flags[armedFlag('staff')], 'ground');
});

void test('a holding that owns a weapon of the group, or has no place that names one, is laid nothing', (): void => {
  assert.equal(armOnce(content, holding(['storm_storm_bolt'], [made('driftwood_staff', 2)], {})).laid.length, 0);
  assert.equal(armOnce(content, holding([], [made('warden_shortsword', 3)], {})).laid.length, 0);
});

function stormcaller(): World {
  const world: World = createWorld(content, { seed: 3, save: null });
  world.player.level = 13;
  world.player.allocated = ['storm_storm_bolt'];
  world.player.equipped.weapon = made('warden_shortsword', 4);
  world.player.inventory = world.player.inventory.map((): ItemInstance | null => null);
  world.stash = world.stash.map((): ItemInstance | null => null);
  world.nextItemUid = 60;
  return world;
}

function reload(world: World): World {
  const save: SaveData = must(parseSaveText(content, JSON.stringify(toSave(world))), 'save');
  return createWorld(content, { seed: 3, save });
}

function staves(world: World): number {
  return world.player.inventory.filter((item: ItemInstance | null): boolean => item?.base === 'driftwood_staff').length;
}

void test('a Stormcaller saved with a sword in hand loads with a staff in the bag, and a second load lays no other', (): void => {
  const once: World = reload(stormcaller());
  assert.equal(staves(once), 1);
  assert.equal(once.flags[armedFlag('staff')], 'bag');
  assert.equal(must(once.player.equipped.weapon, 'sword').base, 'warden_shortsword');
  once.player.inventory = once.player.inventory.map((): ItemInstance | null => null);
  assert.equal(staves(reload(once)), 0);
});
