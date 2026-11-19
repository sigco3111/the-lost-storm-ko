export type HeroHold = 'none' | 'presence' | 'cover';

export interface HeroGate {
  readonly hold: HeroHold;
  change(hold: HeroHold): void;
  take(): number | null;
  settle(turn: number): void;
}

const STRENGTH: Readonly<Record<HeroHold, number>> = { none: 0, presence: 1, cover: 2 };

export function holdFor(shown: number, gone: number, underCover: boolean): HeroHold {
  if (underCover) return 'cover';
  return shown <= gone ? 'presence' : 'none';
}

export function createHeroGate(): HeroGate {
  let hold: HeroHold = 'none';
  let turn: number = 0;
  let taken: number = 0;
  return {
    get hold(): HeroHold {
      return hold;
    },
    change(next: HeroHold): void {
      if (STRENGTH[next] > STRENGTH[hold]) hold = next;
      if (hold !== 'none') turn += 1;
    },
    take(): number | null {
      if (hold === 'none' || taken === turn) return null;
      taken = turn;
      return turn;
    },
    settle(done: number): void {
      if (done === turn) hold = 'none';
    },
  };
}
