import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemBase } from './parse-items.ts';

const charm = { id: 'odd_charm', name: 'Odd Charm', slot: 'charm', material: null, icon: 'charm', dropWeight: 1, minLevel: 1, visual: null, wear: [], implicit: [] };

void test('a base with no ground entry lies as the generic for its slot, and a ground entry is read as written', (): void => {
  assert.equal(itemBase(charm, 'charm').ground.model, 'pouch');
  assert.equal(itemBase({ ...charm, slot: 'chest', material: 'cloth' }, 'shirt').ground.model, 'bundle');
  const laid = itemBase({ ...charm, ground: { model: 'worn', keep: 'left', scale: 1.4, flatten: 0.4, pitch: -90, roll: 0, yawJitter: 30 } }, 'laid');
  assert.deepEqual(laid.ground, { model: 'worn', keep: 'left', scale: 1.4, flatten: 0.4, pitch: -90, roll: 0, yawJitter: 30 });
  assert.throws(() => itemBase({ ...charm, ground: { model: 'square', scale: 1, pitch: 0, roll: 0, yawJitter: 0 } }, 'square'));
});

void test('a weapon needs one of the known weapon kinds and nothing else may have one', (): void => {
  const sword = { ...charm, id: 'odd_sword', slot: 'weapon', icon: 'sword' };
  assert.equal(itemBase({ ...sword, weaponKind: 'blade' }, 'sword').weaponKind, 'blade');
  assert.equal(itemBase(charm, 'charm').weaponKind, null);
  assert.throws(() => itemBase(sword, 'sword'), /weaponKind/);
  assert.throws(() => itemBase({ ...sword, weaponKind: 'wand' }, 'sword'), /weaponKind/);
  assert.throws(() => itemBase({ ...charm, weaponKind: 'blade' }, 'charm'), /weaponKind/);
});
