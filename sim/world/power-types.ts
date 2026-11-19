import type { EmpowerLook, SkillMod, StatMod } from '../content/types.ts';

export interface BuffState {
  readonly key: string;
  readonly mod: StatMod;
  stacks: number;
  timeLeft: number;
}

export interface EmpowerState {
  readonly key: string;
  readonly skillMods: readonly SkillMod[];
  readonly look: EmpowerLook | null;
  timeLeft: number;
}

export interface PowerState {
  buffs: BuffState[];
  empowers: EmpowerState[];
  cooldowns: Record<string, number>;
  counts: Record<string, number>;
}
