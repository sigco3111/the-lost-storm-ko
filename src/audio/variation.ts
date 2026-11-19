import type { PitchRange } from '../../sim/content/audio.ts';

export const VARIATION = {
  pitchCents: 70,
  volumeSpread: 0.12,
  centsPerOctave: 1200,
  recentBarred: 2,
} as const;

export interface VariantBag {
  next(sound: string, count: number): number;
}

function barredCount(count: number): number {
  return Math.min(VARIATION.recentBarred, count - 1);
}

function isBarred(index: number, recent: readonly number[], from: number): boolean {
  for (let at: number = from; at < recent.length; at += 1) {
    if (recent[at] === index) return true;
  }
  return false;
}

export function pickVariant(count: number, recent: readonly number[], random: () => number): number {
  if (count <= 1) return 0;
  const from: number = Math.max(0, recent.length - barredCount(count));
  let open: number = 0;
  for (let index: number = 0; index < count; index += 1) {
    if (!isBarred(index, recent, from)) open += 1;
  }
  const wanted: number = Math.min(open - 1, Math.floor(random() * open));
  let seen: number = 0;
  for (let index: number = 0; index < count; index += 1) {
    if (isBarred(index, recent, from)) continue;
    if (seen === wanted) return index;
    seen += 1;
  }
  return 0;
}

export function createVariantBag(random: () => number): VariantBag {
  const recent: Map<string, number[]> = new Map<string, number[]>();
  return {
    next(sound: string, count: number): number {
      let history: number[] | undefined = recent.get(sound);
      if (history === undefined) {
        history = [];
        recent.set(sound, history);
      }
      let kept: number = 0;
      for (const index of history) {
        if (index < count) {
          history[kept] = index;
          kept += 1;
        }
      }
      history.length = kept;
      const variant: number = pickVariant(count, history, random);
      history.push(variant);
      while (history.length > VARIATION.recentBarred) history.shift();
      return variant;
    },
  };
}

export function pitchRate(random: () => number, range: PitchRange | null = null): number {
  if (range !== null) return range.min + random() * (range.max - range.min);
  const cents: number = (random() * 2 - 1) * VARIATION.pitchCents;
  return 2 ** (cents / VARIATION.centsPerOctave);
}

export function volumeScale(random: () => number, jitter: number | null = null): number {
  return 1 + (random() * 2 - 1) * (jitter ?? VARIATION.volumeSpread);
}

export function delayBetween(minimum: number, maximum: number, random: () => number): number {
  return minimum + random() * (maximum - minimum);
}
