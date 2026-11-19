import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../test/support.ts';
import { loadContent } from './content/content.ts';
import type { Content, ItemBaseDef } from './content/types.ts';
import { emptyEquipment } from './items.ts';
import { carriedPictures, goodsPictures, hasPicture, nextBatch, pictureKey, pictureSource, picturesOf, PICTURE_BATCH } from './pictures.ts';
import type { Picture } from './pictures.ts';
import type { ItemInstance } from './world/types.ts';

const loaded: Content = loadContent();
const plain: ItemBaseDef = { ...must(loaded.itemBases.get('gale_charm'), 'gale_charm'), id: 'plain_charm', wear: [] };
const content: Content = { ...loaded, itemBases: new Map<string, ItemBaseDef>([...loaded.itemBases, [plain.id, plain]]) };

function base(id: string): ItemBaseDef {
  return must(content.itemBases.get(id), id);
}

function item(id: string, uid: number): ItemInstance {
  return { uid, base: id, rarity: 'common', level: 1, affixes: [], ledger: null };
}

void test('a weapon is pictured from its held model, a garment from its first worn piece, the journal from its book', (): void => {
  assert.deepEqual(pictureSource(base('stormsteel_sword')), { kind: 'held', attachment: 'sword_1h' });
  assert.deepEqual(pictureSource(base('warden_jerkin')), { kind: 'worn', piece: 'warden_jerkin' });
  assert.deepEqual(pictureSource(base('worn_journal')), { kind: 'book', base: 'worn_journal' });
});

void test('a base with no model and no book has no picture, so its tile may show its symbol at once', (): void => {
  assert.equal(pictureSource(base('plain_charm')).kind, 'none');
  assert.equal(hasPicture(base('plain_charm')), false);
  assert.equal(hasPicture(base('worn_journal')), true);
  assert.equal(hasPicture(null), false);
});

void test('every picture has its own key, and the keys of different kinds never collide', (): void => {
  const keys: string[] = [...content.itemBases.values()].flatMap((entry: ItemBaseDef): string[] => {
    const key: string | null = pictureKey(pictureSource(entry));
    return key === null ? [] : [key];
  });
  assert.ok(keys.length > 40);
  assert.equal(pictureKey({ kind: 'worn', piece: 'x' }), 'worn:x');
  assert.equal(pictureKey({ kind: 'book', base: 'x' }), 'book:x');
  assert.equal(pictureKey({ kind: 'none' }), null);
});

void test('what the hero wears comes before what the pack holds, each picture once', (): void => {
  const equipped = emptyEquipment();
  equipped.chest = item('warden_jerkin', 1);
  equipped.weapon = item('stormsteel_sword', 2);
  const inventory: (ItemInstance | null)[] = [item('worn_journal', 3), null, item('warden_jerkin', 4), item('plain_charm', 5), item('hexwood_staff', 6)];
  const keys: string[] = carriedPictures(content, { equipped, inventory }).map((picture: Picture): string => picture.key);
  assert.deepEqual(keys.slice(0, 2).toSorted(), ['sword_1h', 'worn:warden_jerkin']);
  assert.deepEqual(keys.slice(2), ['book:worn_journal', 'hex_staff']);
});

void test('items with no picture and empty slots are left out', (): void => {
  assert.deepEqual(picturesOf(content, [null, item('plain_charm', 1), null]), []);
});

void test('the pictures wait in batches so each round is small', (): void => {
  const waiting: Picture[] = Array.from({ length: PICTURE_BATCH + 3 }, (_: unknown, index: number): Picture => ({ key: `k${index}`, source: { kind: 'none' } }));
  const split = nextBatch(waiting);
  assert.equal(split.now.length, PICTURE_BATCH);
  assert.equal(split.later.length, 3);
  assert.deepEqual(nextBatch([]).now, []);
  assert.equal(nextBatch(waiting, 2).now.length, 2);
});

void test('a base that names a keepsake is pictured from that model, and the trader goods are pictured before the panel opens', (): void => {
  assert.deepEqual(pictureSource(base('folded_hour')), { kind: 'keepsake', model: 'thread_ring' });
  assert.equal(pictureKey({ kind: 'keepsake', model: 'thread_ring' }), 'keepsake:thread_ring');
  assert.deepEqual(goodsPictures(content).map((picture: Picture): string => picture.key), ['keepsake:thread_ring']);
});
