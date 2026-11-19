export interface TerrainRough {
  readonly reach: number;
  readonly scale: number;
  readonly calm: readonly string[];
}

export interface TerrainBlend {
  readonly surface: string;
  readonly scale: number;
  readonly cover: number;
  readonly near: string | null;
  readonly reach: number;
}

export const CLIFF_SIDES = ['foot', 'rim'] as const;
export type CliffSide = (typeof CLIFF_SIDES)[number];

export interface CliffRule {
  readonly side: CliffSide;
  readonly step: number;
  readonly drop: number;
  readonly cover: number;
  readonly tuck: number;
}

export interface CliffSize {
  readonly least: number;
  readonly most: number;
}

export interface TerrainCliff extends CliffRule {
  readonly props: readonly string[];
  readonly size: CliffSize;
}

export interface ZoneTerrain {
  readonly rise: number;
  readonly groundStep: number;
  readonly levels: readonly string[];
  readonly cliff: string;
  readonly rough: TerrainRough | null;
  readonly blends: readonly TerrainBlend[];
  readonly cliffs: readonly TerrainCliff[];
}

export const TERRAIN_MARKS = {
  levels: '0123456789abcdefghijklmnopqrstuvwxyz',
  ramp: '/',
} as const;
