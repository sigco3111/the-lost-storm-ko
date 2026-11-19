import type { ZoneAmbience } from '../../sim/content/audio.ts';
import type { Fade } from './fade.ts';
import { fadeTo, heldAt, levelAt } from './fade.ts';
import type { StingerLocator } from './system.ts';

export const BEDS = {
  lobbyIn: 4,
  lobbyOut: 3,
  zoneIn: 3,
  zoneOut: 1.5,
  hush: 0.4,
  lobbyKey: 'lobby',
  zonePrefix: 'zone:',
} as const;

export type Bed = { readonly kind: 'lobby' } | { readonly kind: 'zone'; readonly zone: string };

export const LOBBY_BED: Bed = { kind: 'lobby' };

export interface BedStep {
  readonly key: string;
  readonly fade: Fade;
}

export interface BedEntry extends BedStep {
  readonly bed: Bed;
}

export interface BedChange {
  readonly leaving: BedStep | null;
  readonly entering: BedEntry | null;
}

export interface Beds {
  want(bed: Bed | null): BedChange | null;
  hush(): BedChange | null;
  unlock(): BedChange | null;
  level(key: string): number;
  readonly unlocked: boolean;
  readonly playing: string | null;
}

export function bedKey(bed: Bed): string {
  return bed.kind === 'lobby' ? BEDS.lobbyKey : `${BEDS.zonePrefix}${bed.zone}`;
}

function fadeInOf(bed: Bed): number {
  return bed.kind === 'lobby' ? BEDS.lobbyIn : BEDS.zoneIn;
}

function fadeOutOf(bed: Bed): number {
  return bed.kind === 'lobby' ? BEDS.lobbyOut : BEDS.zoneOut;
}

export function createBeds(clock: () => number): Beds {
  let wanted: Bed | null = null;
  let playing: Bed | null = null;
  let unlocked: boolean = false;
  const fades: Map<string, Fade> = new Map<string, Fade>();

  const move = (next: Bed | null, out: number | null): BedChange | null => {
    const now: number = clock();
    const before: Bed | null = playing;
    if (before !== null && next !== null && bedKey(before) === bedKey(next)) return null;
    if (before === null && next === null) return null;
    let leaving: BedStep | null = null;
    if (before !== null) {
      const key: string = bedKey(before);
      const fade: Fade = fadeTo(fades.get(key) ?? heldAt(1, now), now, 0, out ?? fadeOutOf(before));
      fades.set(key, fade);
      leaving = { key, fade };
    }
    let entering: BedEntry | null = null;
    if (next !== null) {
      const key: string = bedKey(next);
      const fade: Fade = fadeTo(heldAt(0, now), now, 1, fadeInOf(next));
      fades.set(key, fade);
      entering = { key, fade, bed: next };
    }
    playing = next;
    return { leaving, entering };
  };

  return {
    want(bed: Bed | null): BedChange | null {
      wanted = bed;
      if (!unlocked) return null;
      return move(bed, null);
    },
    hush(): BedChange | null {
      wanted = null;
      if (!unlocked) return null;
      return move(null, BEDS.hush);
    },
    unlock(): BedChange | null {
      if (unlocked) return null;
      unlocked = true;
      return move(wanted, null);
    },
    level(key: string): number {
      const fade: Fade | undefined = fades.get(key);
      return fade === undefined ? 0 : levelAt(fade, clock());
    },
    get unlocked(): boolean {
      return unlocked;
    },
    get playing(): string | null {
      return playing === null ? null : bedKey(playing);
    },
  };
}

export interface BedPlayer {
  startAmbience(zone: ZoneAmbience, locate: StingerLocator, fadeIn: number, fadeOut: number): void;
  stopAmbience(fadeOut: number): void;
}

function seconds(fade: Fade): number {
  return fade.end - fade.start;
}

export function playBedChange(player: BedPlayer, change: BedChange | null, ambienceOf: (bed: Bed) => ZoneAmbience | undefined, locate: StingerLocator): void {
  if (change === null) return;
  const fadeOut: number = change.leaving === null ? 0 : seconds(change.leaving.fade);
  const entering: BedEntry | null = change.entering;
  const ambience: ZoneAmbience | undefined = entering === null ? undefined : ambienceOf(entering.bed);
  if (entering === null || ambience === undefined) {
    player.stopAmbience(fadeOut);
    return;
  }
  player.startAmbience(ambience, locate, seconds(entering.fade), fadeOut);
}
