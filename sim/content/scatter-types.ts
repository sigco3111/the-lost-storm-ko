import type { CliffRule } from './terrain-types.ts';

export interface ScatterSize {
  readonly least: number;
  readonly most: number;
}

export interface OpenScatter {
  readonly type: 'open';
  readonly props: readonly string[];
  readonly count: number;
  readonly clump: number;
  readonly spread: number;
  readonly size: ScatterSize;
  readonly clear: number;
}

export interface AroundScatter {
  readonly type: 'around';
  readonly props: readonly string[];
  readonly anchors: readonly string[];
  readonly each: number;
  readonly spread: number;
  readonly size: ScatterSize;
}

export interface CliffScatter extends CliffRule {
  readonly type: 'cliff';
  readonly props: readonly string[];
  readonly size: ScatterSize;
}

export type ZoneScatter = OpenScatter | AroundScatter | CliffScatter;

export const SCATTER_TYPES = ['open', 'around', 'cliff'] as const;
