export interface XpGap {
  readonly band: number;
  readonly widenEvery: number;
  readonly soft: number;
  readonly power: number;
  readonly floor: number;
  readonly above: boolean;
}

export interface XpAfter {
  readonly from: number;
  readonly growth: number;
}

export interface XpCurve {
  readonly base: number;
  readonly growth: number;
  readonly after: XpAfter | null;
  readonly maxLevel: number;
  readonly gap: XpGap;
}

export interface XpReduction {
  readonly side: 'below' | 'above';
  readonly share: number;
}
