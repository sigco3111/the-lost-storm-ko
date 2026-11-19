import type { Condition } from './types.ts';

export interface MapPlace {
  readonly zone: string;
  readonly x: number;
  readonly y: number;
  readonly label: string | null;
  readonly chain: string | null;
  readonly when: readonly Condition[];
}

export interface AtlasChain {
  readonly id: string;
  readonly tint: string;
}

export interface AtlasPoint {
  readonly x: number;
  readonly y: number;
}

export const ATLAS_FEATURE_KINDS = ['coast', 'ridge', 'river', 'forest', 'marsh'] as const;
export type AtlasFeatureKind = (typeof ATLAS_FEATURE_KINDS)[number];

export interface AtlasFeature {
  readonly kind: AtlasFeatureKind;
  readonly points: readonly AtlasPoint[];
}

export interface AtlasRoad {
  readonly from: string;
  readonly to: string;
  readonly via: readonly AtlasPoint[];
}

export interface AtlasLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly tilt: number;
}

export interface AtlasDef {
  readonly width: number;
  readonly height: number;
  readonly compass: AtlasPoint;
  readonly places: readonly MapPlace[];
  readonly chains: readonly AtlasChain[];
  readonly roads: readonly AtlasRoad[];
  readonly features: readonly AtlasFeature[];
  readonly labels: readonly AtlasLabel[];
}
