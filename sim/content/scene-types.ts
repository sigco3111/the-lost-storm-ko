import type { Condition } from './condition-types.ts';
import type { StoryFlags } from './story-types.ts';

export type WardSide = 'player' | 'monster';

export interface WardDef {
  readonly radius: number;
  readonly rise: number;
  readonly fall: number;
  readonly lifetime: number;
  readonly admits: readonly WardSide[];
  readonly stopsStrikes: boolean;
  readonly grace: number;
}

export interface SceneWard extends WardDef {
  readonly leave: number;
}

export interface SceneLead {
  readonly exit: string;
  readonly x: number;
  readonly z: number;
  readonly ahead: number;
  readonly walk: number;
  readonly run: number;
  readonly through: number | null;
  readonly waits: boolean;
}

export interface SceneDef {
  readonly id: string;
  readonly npc: string;
  readonly when: readonly Condition[];
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly moment: string;
  readonly fight: number;
  readonly arrive: number;
  readonly strike: string;
  readonly talk: string;
  readonly ward: SceneWard;
  readonly lead: SceneLead;
  readonly owes: StoryFlags;
  readonly sets: StoryFlags;
}
