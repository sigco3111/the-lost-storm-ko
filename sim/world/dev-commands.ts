export interface SpawnCommand {
  readonly type: 'spawn';
  readonly monster: string;
  readonly count: number;
}

export interface BenchHero {
  readonly seed: number;
  readonly level: number;
  readonly weapon: string | null;
  readonly bar: readonly (string | null)[];
}

export interface BenchCommand {
  readonly type: 'bench';
  readonly hero: BenchHero;
}
