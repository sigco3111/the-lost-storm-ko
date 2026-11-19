import type { Content } from '../../sim/content/types.ts';
import { nextBatch, pictureOf } from '../../sim/pictures.ts';
import type { Picture } from '../../sim/pictures.ts';
import type { CharacterNeeds } from '../../sim/wear.ts';
import { wearKey } from '../../sim/wear.ts';
import type { ItemInstance } from '../../sim/world/types.ts';
import type { ItemThumbnails } from './item-thumbnails.ts';

export interface PictureStudio {
  paint(frame: string, pictures: readonly Picture[]): Promise<ItemThumbnails>;
}

export interface ItemPicturesDeps {
  readonly content: Content;
  readonly studio: PictureStudio;
  readonly load: (needs: CharacterNeeds) => Promise<void>;
  readonly frame: () => string;
  readonly schedule: (task: () => void) => void;
  readonly busy: () => boolean;
  readonly painted: () => void;
  readonly failed: (error: unknown) => void;
}

export interface ItemPictures {
  image(item: ItemInstance): string | null;
  imageOn(frame: string, item: ItemInstance): string | null;
  want(pictures: readonly Picture[]): void;
  settled(): Promise<void>;
}

interface Queued {
  readonly frame: string;
  readonly picture: Picture;
}

export function pictureCacheKey(frame: string, picture: Picture): string {
  return picture.source.kind === 'worn' ? `${frame}|${picture.key}` : picture.key;
}

export function pictureNeeds(frame: string, pictures: readonly Picture[]): CharacterNeeds {
  const wearables: Set<string> = new Set<string>();
  const attachments: Set<string> = new Set<string>();
  for (const { source } of pictures) {
    if (source.kind === 'worn') wearables.add(wearKey(frame, source.piece));
    if (source.kind === 'held') attachments.add(source.attachment);
  }
  return { rigs: new Set<string>(), wearables, attachments };
}

export function createItemPictures(deps: ItemPicturesDeps): ItemPictures {
  const images: Map<string, string> = new Map<string, string>();
  const known: Set<string> = new Set<string>();
  const shown: Set<string> = new Set<string>();
  const urgent: Queued[] = [];
  const lazy: Queued[] = [];
  let working: Promise<void> | null = null;

  const take = (): Queued[] => {
    const source: Queued[] = urgent.length > 0 ? urgent : lazy;
    const head: Queued | undefined = source[0];
    if (head === undefined) return [];
    const chosen: Queued[] = nextBatch(source.filter((entry: Queued): boolean => entry.frame === head.frame)).now;
    for (const entry of chosen) source.splice(source.indexOf(entry), 1);
    return chosen;
  };

  const looked = (entry: Queued): boolean => shown.has(pictureCacheKey(entry.frame, entry.picture));
  const turn = (): Promise<void> => new Promise<void>((resolve: () => void): void => deps.schedule(resolve));
  const waitForCalm = async (): Promise<void> => {
    await turn();
    if (deps.busy() && !urgent.some(looked) && !lazy.some(looked)) await waitForCalm();
  };

  const round = async (): Promise<void> => {
    if (urgent.length + lazy.length === 0) return;
    await waitForCalm();
    const batch: Queued[] = take();
    const frame: string | undefined = batch[0]?.frame;
    if (frame === undefined) return;
    const pictures: Picture[] = batch.map((entry: Queued): Picture => entry.picture);
    try {
      await deps.load(pictureNeeds(frame, pictures));
      const made: ItemThumbnails = await deps.studio.paint(frame, pictures);
      for (const picture of pictures) {
        const url: string | undefined = made.get(picture.key);
        if (url === undefined) deps.failed(new Error(`No picture was made for ${picture.key}`));
        else images.set(pictureCacheKey(frame, picture), url);
      }
    } catch (error: unknown) {
      deps.failed(error);
    }
    deps.painted();
    return round();
  };

  const run = async (): Promise<void> => {
    try {
      await round();
    } catch (error: unknown) {
      deps.failed(error);
    }
    working = null;
    if (urgent.length + lazy.length > 0) start();
  };

  const start = (): void => {
    if (working !== null) return;
    working = run();
  };

  const enqueue = (frame: string, picture: Picture, into: Queued[]): void => {
    const key: string = pictureCacheKey(frame, picture);
    if (known.has(key)) {
      const waiting: number = lazy.findIndex((entry: Queued): boolean => entry.frame === frame && entry.picture.key === picture.key);
      if (into === urgent && waiting >= 0) urgent.push(...lazy.splice(waiting, 1));
      return;
    }
    known.add(key);
    into.push({ frame, picture });
  };

  const imageOn = (frame: string, item: ItemInstance): string | null => {
    const picture: Picture | null = pictureOf(deps.content, item);
    if (picture === null) return null;
    const key: string = pictureCacheKey(frame, picture);
    const found: string | undefined = images.get(key);
    if (found !== undefined) return found;
    shown.add(key);
    if (!known.has(key)) enqueue(frame, picture, lazy);
    start();
    return null;
  };

  return {
    image(item: ItemInstance): string | null {
      return imageOn(deps.frame(), item);
    },
    imageOn,
    want(pictures: readonly Picture[]): void {
      const frame: string = deps.frame();
      for (const picture of pictures) enqueue(frame, picture, urgent);
      if (urgent.length > 0) start();
    },
    settled(): Promise<void> {
      return working ?? Promise.resolve();
    },
  };
}
