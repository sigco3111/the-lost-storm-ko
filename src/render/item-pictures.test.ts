import assert from 'node:assert/strict';
import { test } from 'node:test';
import { must } from '../../test/support.ts';
import { loadContent } from '../../sim/content/content.ts';
import type { Content, ItemBaseDef } from '../../sim/content/types.ts';
import { carriedPictures, PICTURE_BATCH } from '../../sim/pictures.ts';
import type { Picture } from '../../sim/pictures.ts';
import type { CharacterNeeds } from '../../sim/wear.ts';
import { emptyEquipment } from '../../sim/items.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { ItemPictures, PictureStudio } from './item-pictures.ts';
import { createItemPictures, pictureCacheKey, pictureNeeds } from './item-pictures.ts';

const loaded: Content = loadContent();
const plain: ItemBaseDef = { ...must(loaded.itemBases.get('gale_charm'), 'gale_charm'), id: 'plain_charm', wear: [] };
const content: Content = { ...loaded, itemBases: new Map<string, ItemBaseDef>([...loaded.itemBases, [plain.id, plain]]) };

interface Rig {
  readonly pictures: ItemPictures;
  readonly paints: { readonly frame: string; readonly keys: readonly string[] }[];
  readonly loads: CharacterNeeds[];
  readonly refreshes: number[];
  readonly failures: unknown[];
  frame: string;
  breakLoad: boolean;
}

function item(base: string, uid: number): ItemInstance {
  return { uid, base, rarity: 'common', level: 1, affixes: [], ledger: null };
}

function rig(): Rig {
  const paints: { frame: string; keys: string[] }[] = [];
  const loads: CharacterNeeds[] = [];
  const refreshes: number[] = [];
  const failures: unknown[] = [];
  const state: { frame: string; breakLoad: boolean } = { frame: 'man', breakLoad: false };
  const studio: PictureStudio = {
    paint(frame: string, pictures: readonly Picture[]): Promise<ReadonlyMap<string, string>> {
      paints.push({ frame, keys: pictures.map((picture: Picture): string => picture.key) });
      return Promise.resolve(new Map<string, string>(pictures.map((picture: Picture): [string, string] => [picture.key, `image:${frame}:${picture.key}`])));
    },
  };
  const pictures: ItemPictures = createItemPictures({
    content,
    studio,
    load: (needs: CharacterNeeds): Promise<void> => {
      loads.push(needs);
      return state.breakLoad ? Promise.reject(new Error('offline')) : Promise.resolve();
    },
    frame: (): string => state.frame,
    schedule: (task: () => void): void => task(),
    busy: (): boolean => false,
    painted: (): void => void refreshes.push(refreshes.length),
    failed: (error: unknown): void => void failures.push(error),
  });
  return {
    pictures,
    paints,
    loads,
    refreshes,
    failures,
    get frame(): string {
      return state.frame;
    },
    set frame(value: string) {
      state.frame = value;
    },
    get breakLoad(): boolean {
      return state.breakLoad;
    },
    set breakLoad(value: boolean) {
      state.breakLoad = value;
    },
  };
}

const CARRIED: readonly string[] = ['stormsteel_sword', 'hexwood_staff', 'hand_crossbow', 'tempest_greatsword', 'warden_jerkin', 'warden_gloves', 'warden_boots', 'worn_journal'];

function carried(): ItemInstance[] {
  return CARRIED.map((base: string, index: number): ItemInstance => item(base, index + 1));
}

void test('what the hero carries is painted before anything asks for it, in small rounds', async (): Promise<void> => {
  const made: Rig = rig();
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: carried() }));
  await made.pictures.settled();
  assert.deepEqual(made.paints.map((paint): number => paint.keys.length), [PICTURE_BATCH, CARRIED.length - PICTURE_BATCH]);
  assert.equal(made.refreshes.length, 2);
  for (const entry of carried()) assert.notEqual(made.pictures.image(entry), null, entry.base);
});

void test('a round loads the models it needs before it paints', async (): Promise<void> => {
  const made: Rig = rig();
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: [item('warden_jerkin', 1), item('hexwood_staff', 2), item('worn_journal', 3)] }));
  await made.pictures.settled();
  assert.equal(made.loads.length, 1);
  assert.deepEqual([...(made.loads[0]?.wearables ?? [])], ['man/warden_jerkin']);
  assert.deepEqual([...(made.loads[0]?.attachments ?? [])], ['hex_staff']);
});

void test('a picture is never made twice', async (): Promise<void> => {
  const made: Rig = rig();
  const pack: ItemInstance[] = carried();
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: pack }));
  await made.pictures.settled();
  const painted: number = made.paints.length;
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: [...pack, item('warden_jerkin', 99)] }));
  await made.pictures.settled();
  assert.equal(made.paints.length, painted);
});

void test('an item nobody asked for yet is queued by looking at it, shows no picture, then gets one', async (): Promise<void> => {
  const made: Rig = rig();
  const sword: ItemInstance = item('stormsteel_sword', 1);
  assert.equal(made.pictures.image(sword), null);
  await made.pictures.settled();
  assert.equal(made.pictures.image(sword), 'image:man:sword_1h');
  assert.equal(made.refreshes.length, 1);
});

void test('a base with no picture is never queued', async (): Promise<void> => {
  const made: Rig = rig();
  assert.equal(made.pictures.image(item('plain_charm', 1)), null);
  await made.pictures.settled();
  assert.deepEqual(made.paints, []);
});

void test('what the hero carries goes ahead of what was only looked at', async (): Promise<void> => {
  const made: Rig = rig();
  made.pictures.image(item('hexwood_staff', 1));
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: [item('stormsteel_sword', 2)] }));
  await made.pictures.settled();
  assert.deepEqual(made.paints.map((paint): readonly string[] => paint.keys), [['sword_1h'], ['hex_staff']]);
});

void test('worn pieces are made again for another hero, held models and the book are not', async (): Promise<void> => {
  const made: Rig = rig();
  const pack: ItemInstance[] = [item('warden_jerkin', 1), item('stormsteel_sword', 2), item('worn_journal', 3)];
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: pack }));
  await made.pictures.settled();
  made.frame = 'woman';
  assert.equal(made.pictures.image(pack[0] ?? item('warden_jerkin', 1)), null);
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: pack }));
  await made.pictures.settled();
  assert.deepEqual(made.paints.map((paint): string => `${paint.frame}:${paint.keys.join(',')}`), ['man:worn:warden_jerkin,sword_1h,book:worn_journal', 'woman:worn:warden_jerkin']);
  assert.equal(made.pictures.image(pack[0] ?? item('warden_jerkin', 1)), 'image:woman:worn:warden_jerkin');
});

void test('a round that cannot load is reported and the rest still get their pictures', async (): Promise<void> => {
  const made: Rig = rig();
  made.breakLoad = true;
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: [item('stormsteel_sword', 1)] }));
  await made.pictures.settled();
  assert.equal(made.failures.length, 1);
  made.breakLoad = false;
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: [item('hexwood_staff', 2)] }));
  await made.pictures.settled();
  assert.equal(made.pictures.image(item('hexwood_staff', 2)), 'image:man:hex_staff');
});

void test('the cache key keeps the hero for worn pieces only', (): void => {
  assert.equal(pictureCacheKey('man', { key: 'worn:x', source: { kind: 'worn', piece: 'x' } }), 'man|worn:x');
  assert.equal(pictureCacheKey('man', { key: 'sword_1h', source: { kind: 'held', attachment: 'sword_1h' } }), 'sword_1h');
  assert.deepEqual([...pictureNeeds('man', []).wearables], []);
});
