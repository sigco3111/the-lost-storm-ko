import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadContent } from '../../sim/content/content.ts';
import type { Content } from '../../sim/content/types.ts';
import { carriedPictures } from '../../sim/pictures.ts';
import type { Picture } from '../../sim/pictures.ts';
import { emptyEquipment } from '../../sim/items.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { ItemPictures, PictureStudio } from './item-pictures.ts';
import { createItemPictures } from './item-pictures.ts';

const content: Content = loadContent();

interface Fight {
  readonly pictures: ItemPictures;
  readonly painted: string[][];
  busy: boolean;
  turns(count: number): Promise<void>;
}

function item(base: string, uid: number): ItemInstance {
  return { uid, base, rarity: 'common', level: 1, affixes: [], ledger: null };
}

function fight(): Fight {
  const painted: string[][] = [];
  const waiting: (() => void)[] = [];
  const state: { busy: boolean } = { busy: true };
  const studio: PictureStudio = {
    paint(frame: string, pictures: readonly Picture[]): Promise<ReadonlyMap<string, string>> {
      painted.push(pictures.map((picture: Picture): string => picture.key));
      return Promise.resolve(new Map<string, string>(pictures.map((picture: Picture): [string, string] => [picture.key, `image:${frame}:${picture.key}`])));
    },
  };
  const pictures: ItemPictures = createItemPictures({
    content,
    studio,
    load: (): Promise<void> => Promise.resolve(),
    frame: (): string => 'man',
    schedule: (task: () => void): void => void waiting.push(task),
    busy: (): boolean => state.busy,
    painted: (): void => undefined,
    failed: (error: unknown): void => assert.fail(String(error)),
  });
  return {
    pictures,
    painted,
    get busy(): boolean {
      return state.busy;
    },
    set busy(value: boolean) {
      state.busy = value;
    },
    async turns(count: number): Promise<void> {
      if (count <= 0) return;
      for (const task of waiting.splice(0)) task();
      await new Promise<void>((resolve: () => void): void => void setImmediate(resolve));
      await this.turns(count - 1);
    },
  };
}

void test('a new item picked up in a fight is not painted until the fight is over', async (): Promise<void> => {
  const made: Fight = fight();
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: [item('hexwood_staff', 1)] }));
  await made.turns(20);
  assert.deepEqual(made.painted, []);
  made.busy = false;
  await made.turns(3);
  assert.deepEqual(made.painted, [['hex_staff']]);
});

void test('a picture the player is looking at is painted at once, even in a fight', async (): Promise<void> => {
  const made: Fight = fight();
  const staff: ItemInstance = item('hexwood_staff', 1);
  made.pictures.want(carriedPictures(content, { equipped: emptyEquipment(), inventory: [staff] }));
  await made.turns(5);
  assert.deepEqual(made.painted, []);
  assert.equal(made.pictures.image(staff), null);
  await made.turns(3);
  assert.deepEqual(made.painted, [['hex_staff']]);
  assert.equal(made.pictures.image(staff), 'image:man:hex_staff');
});
