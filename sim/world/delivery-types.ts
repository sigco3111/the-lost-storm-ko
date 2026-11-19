import type { SkillDef } from '../content/types.ts';
import type { Vec2 } from '../math.ts';
import type { Team } from './types.ts';

export interface ProjectileState {
  readonly id: number;
  readonly ownerId: number;
  readonly from: Vec2;
  readonly team: Team;
  readonly faction: string | null;
  readonly skill: SkillDef;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly damagePercent: number;
  readonly critChance: number;
  readonly critMultiplier: number;
  pos: Vec2;
  readonly direction: Vec2;
  distanceLeft: number;
  pierceLeft: number;
  readonly hitIds: number[];
}

export interface HazardState {
  readonly id: number;
  readonly ownerId: number;
  readonly from: Vec2;
  readonly team: Team;
  readonly faction: string | null;
  readonly skill: SkillDef;
  readonly pos: Vec2;
  readonly radius: number;
  readonly delay: number;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly damagePercent: number;
  readonly critChance: number;
  readonly critMultiplier: number;
  timeLeft: number;
}

export interface QueuedShot {
  readonly projectile: ProjectileState;
  timeLeft: number;
}
