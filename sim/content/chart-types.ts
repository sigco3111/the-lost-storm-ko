export type SkillTarget = { readonly type: 'skill'; readonly skill: string } | { readonly type: 'group'; readonly group: string };

export interface SkillVariant {
  readonly skill: string;
  readonly becomes: string;
}

export interface ChartPath {
  readonly id: string;
  readonly name: string;
  readonly tint: string;
  readonly description: string;
}

export interface ChartGroup {
  readonly id: string;
  readonly name: string;
  readonly skills: readonly string[];
}

export interface ChartRespec {
  readonly goldPerPoint: number;
  readonly goldPerLevel: number;
}

import type { Condition } from './condition-types.ts';
import type { WeaponKind } from './item-types.ts';
import type { StatMod } from './types.ts';

export interface WeaponGroup {
  readonly id: string;
  readonly name: string;
  readonly kinds: readonly WeaponKind[];
  readonly starter: string;
  readonly needs: string;
  readonly icon: string;
  readonly holds: string;
  readonly path: string;
}

export interface PointGrant {
  readonly id: string;
  readonly when: readonly Condition[];
  readonly points: number;
}

export interface CommonPlace {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly statMods: readonly StatMod[];
}

export interface ChartCommon {
  readonly name: string;
  readonly tint: string;
  readonly places: readonly CommonPlace[];
}

export interface SpecialtyDef {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly description: string;
}

export interface ChartRetired {
  readonly places: ReadonlyMap<string, string>;
  readonly skills: ReadonlyMap<string, string>;
}

export interface ChartDef {
  readonly title: string;
  readonly pointsPerLevel: number;
  readonly revision: number;
  readonly respec: ChartRespec;
  readonly paths: readonly ChartPath[];
  readonly groups: readonly ChartGroup[];
  readonly weaponGroups: readonly WeaponGroup[];
  readonly grants: readonly PointGrant[];
  readonly twist: number;
  readonly retired: ChartRetired;
  readonly common: ChartCommon;
  readonly specialties: readonly SpecialtyDef[];
}
