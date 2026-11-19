import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Content } from '../../sim/content/types.ts';
import { frameOf, wearKey } from '../../sim/wear.ts';
import type { CharacterNeeds, Look } from '../../sim/wear.ts';
import { heroRig } from '../../sim/hero.ts';
import { createBrowserTimers } from '../browser-timers.ts';
import { warnInConsole } from '../backend/console-log.ts';
import type { CharacterLibrary, Dresser, LoadedRig } from './character-loader.ts';
import { hasWear, loadNeeds } from './character-loader.ts';
import type { ItemPictures } from './item-pictures.ts';
import { createItemPictures } from './item-pictures.ts';
import { createThumbnailStudio } from './item-thumbnails.ts';
import type { ThumbnailStudio, Turntable } from './item-thumbnails.ts';

export const PICTURES = {
  startMs: 50,
} as const;

export interface ItemPicturesStart {
  readonly content: Content;
  readonly library: CharacterLibrary;
  readonly loader: GLTFLoader;
  readonly dresser: Dresser;
  readonly hero: () => string | null;
  readonly refresh: () => void;
  readonly busy: () => boolean;
}

export interface PortraitFigure {
  readonly rig: string;
  readonly look: Look;
  readonly key: string;
}

export interface Pictures {
  readonly items: ItemPictures;
  turntable(figure: PortraitFigure): Promise<Turntable | null>;
}

interface HeldTurntable {
  readonly key: string;
  readonly made: Promise<Turntable | null>;
}

export function figureNeeds(content: Content, figure: PortraitFigure): CharacterNeeds {
  const frame: string = frameOf(content, figure.rig);
  return { rigs: new Set<string>([figure.rig]), wearables: new Set<string>(figure.look.wearables.map((id: string): string => wearKey(frame, id))), attachments: new Set<string>(figure.look.held) };
}

export function startItemPictures(start: ItemPicturesStart): Pictures {
  const { content, library } = start;
  const studio: ThumbnailStudio = createThumbnailStudio(library, content.player.tint, createBrowserTimers());
  let held: HeldTurntable | null = null;
  const mount = async (figure: PortraitFigure): Promise<Turntable | null> => {
    await loadNeeds(start.loader, content, start.dresser, library, figureNeeds(content, figure));
    const rig: LoadedRig | undefined = library.rigs.get(figure.rig);
    if (rig === undefined || !hasWear(library, frameOf(content, figure.rig), figure.look.wearables, figure.look.held)) return null;
    return studio.turntable(rig, figure.look, { tint: content.player.tint, glow: content.player.color });
  };
  const items: ItemPictures = createItemPictures({
    content,
    studio,
    load: (needs: CharacterNeeds): Promise<void> => loadNeeds(start.loader, content, start.dresser, library, needs),
    frame: (): string => frameOf(content, heroRig(content, start.hero())),
    schedule: (task: () => void): void => void window.setTimeout(task, PICTURES.startMs),
    busy: start.busy,
    painted: start.refresh,
    failed: (error: unknown): void => warnInConsole(`An item picture failed: ${String(error)}`),
  });
  return {
    items,
    turntable(figure: PortraitFigure): Promise<Turntable | null> {
      if (held !== null && held.key === figure.key) return held.made;
      const before: HeldTurntable | null = held;
      if (before !== null) void before.made.then((table: Turntable | null): void => table?.dispose());
      const made: Promise<Turntable | null> = mount(figure).catch((error: unknown): null => {
        if (held?.key === figure.key) held = null;
        warnInConsole(`A portrait failed: ${String(error)}`);
        return null;
      });
      held = { key: figure.key, made };
      return made;
    },
  };
}
